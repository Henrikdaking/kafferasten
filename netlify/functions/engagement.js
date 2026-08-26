import { getStore } from "@netlify/blobs";
import { createHmac } from "node:crypto";


const STORE_NAME =
  "kafferasten-news";

const MAX_COMMENTS =
  10;

const MAX_NAME_LENGTH =
  50;

const MAX_COMMENT_LENGTH =
  500;

const MAX_BODY_LENGTH =
  6000;

const RATE_LIMIT_WINDOW_MS =
  60 * 1000;

const RATE_LIMIT_MAX_POSTS =
  10;


/* =========================================================
   HUVUDFUNKTION
========================================================= */

export default async (request) => {

  const store =
    getStore(
      STORE_NAME
    );


  try {

    const url =
      new URL(
        request.url
      );


    const method =
      request.method
        .toUpperCase();


    /* =====================================================
       GET – HÄMTA FIKARUMMET
    ===================================================== */

    if (
      method === "GET"
    ) {

      const articleId =
        sanitizeArticleId(
          url.searchParams.get(
            "articleId"
          )
        );


      if (!articleId) {

        return jsonResponse(
          {
            success: false,
            error:
              "articleId saknas."
          },
          400
        );
      }


      const engagement =
        await readEngagement(
          store,
          articleId
        );


      return jsonResponse(
        {
          success: true,
          engagement
        }
      );
    }


    /* =====================================================
       POST – SPARA INTERAKTION
    ===================================================== */

    if (
      method === "POST"
    ) {

      let body;


      try {

        const rawBody =
          await request.text();


        if (
          rawBody.length >
          MAX_BODY_LENGTH
        ) {

          return jsonResponse(
            {
              success: false,
              error:
                "För stor begäran."
            },
            413
          );
        }


        body =
          JSON.parse(
            rawBody
          );

      } catch {

        return jsonResponse(
          {
            success: false,
            error:
              "Ogiltig JSON."
          },
          400
        );
      }


      const articleId =
        sanitizeArticleId(
          body.articleId
        );


      const action =
        String(
          body.action ||
          ""
        )
          .trim()
          .toLowerCase();


      if (!articleId) {

        return jsonResponse(
          {
            success: false,
            error:
              "articleId saknas."
          },
          400
        );
      }


      if (
        ![
          "thumb",
          "poll",
          "comment"
        ].includes(
          action
        )
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Ogiltig action."
          },
          400
        );
      }


      /* ===================================================
         TILLÅT BARA DAGENS AKTUELLA SNACKIS
      =================================================== */

      const latest =
        await store.get(
          "latest",
          {
            type:
              "json",

            consistency:
              "strong"
          }
        );


      if (
        !latest?.id ||
        latest.id !==
          articleId
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "Interaktioner är bara öppna för dagens aktuella snackis."
          },
          409
        );
      }


      /* ===================================================
         ANONYM BESÖKARNYCKEL
      =================================================== */

      const visitorKey =
        createVisitorKey(
          request
        );


      /* ===================================================
         LÅS ARTIKELN
      =================================================== */

      const result =
        await withArticleLock({
          store,
          articleId,

          task:
            async () => {

              /* ===========================================
                 TRAFIKSKYDD
              =========================================== */

              await enforceRateLimit({
                store,
                visitorKey
              });


              const current =
                await readEngagement(
                  store,
                  articleId
                );


              /* ===========================================
                 TUMME
              =========================================== */

              if (
                action === "thumb"
              ) {

                const value =
                  String(
                    body.value ||
                    ""
                  )
                    .trim()
                    .toLowerCase();


                if (
                  ![
                    "up",
                    "down"
                  ].includes(
                    value
                  )
                ) {

                  throw new PublicError(
                    "Ogiltig röst.",
                    400
                  );
                }


                if (
                  value === "up"
                ) {

                  current.thumbs.up +=
                    1;

                } else {

                  current.thumbs.down +=
                    1;
                }
              }


              /* ===========================================
                 OMRÖSTNING
              =========================================== */

              if (
                action === "poll"
              ) {

                const option =
                  Number(
                    body.option
                  );


                if (
                  option !== 0 &&
                  option !== 1
                ) {

                  throw new PublicError(
                    "Ogiltigt svarsalternativ.",
                    400
                  );
                }


                current.poll[
                  option
                ] += 1;
              }


              /* ===========================================
                 KOMMENTAR
              =========================================== */

              if (
                action === "comment"
              ) {

                const name =
                  sanitizePlainText(
                    body.name,
                    MAX_NAME_LENGTH
                  )
                  ||
                  "Anonym kollega";


                const text =
                  sanitizePlainText(
                    body.text,
                    MAX_COMMENT_LENGTH
                  );


                if (!text) {

                  throw new PublicError(
                    "Kommentaren är tom.",
                    400
                  );
                }


                current.comments.unshift(
                  {
                    id:
                      createCommentId(),

                    name,

                    text,

                    createdAt:
                      new Date()
                        .toISOString()
                  }
                );


                current.comments =
                  current.comments.slice(
                    0,
                    MAX_COMMENTS
                  );
              }


              current.updatedAt =
                new Date()
                  .toISOString();


              await store.setJSON(
                engagementKey(
                  articleId
                ),
                current
              );


              return current;
            }
        });


      return jsonResponse(
        {
          success: true,
          engagement:
            result
        }
      );
    }


    return jsonResponse(
      {
        success: false,
        error:
          "Metoden stöds inte."
      },
      405
    );


  } catch (error) {

    if (
      error instanceof
      PublicError
    ) {

      return jsonResponse(
        {
          success: false,
          error:
            error.message
        },
        error.status
      );
    }


    console.error(
      "Engagement-fel:",
      error
    );


    return jsonResponse(
      {
        success: false,
        error:
          "Fikarummet kunde inte uppdateras."
      },
      500
    );
  }
};


/* =========================================================
   DATA
========================================================= */

function emptyEngagement(
  articleId
) {

  return {

    articleId,

    thumbs: {
      up: 0,
      down: 0
    },

    poll: [
      0,
      0
    ],

    comments: [],

    updatedAt:
      null
  };
}


async function readEngagement(
  store,
  articleId
) {

  const saved =
    await store.get(
      engagementKey(
        articleId
      ),
      {
        type:
          "json",

        consistency:
          "strong"
      }
    );


  if (!saved) {

    return emptyEngagement(
      articleId
    );
  }


  return {

    articleId,

    thumbs: {

      up:
        safeNumber(
          saved.thumbs?.up
        ),

      down:
        safeNumber(
          saved.thumbs?.down
        )
    },

    poll: [

      safeNumber(
        saved.poll?.[0]
      ),

      safeNumber(
        saved.poll?.[1]
      )
    ],

    comments:
      Array.isArray(
        saved.comments
      )
        ? saved.comments
            .slice(
              0,
              MAX_COMMENTS
            )
        : [],

    updatedAt:
      saved.updatedAt ||
      null
  };
}


function engagementKey(
  articleId
) {

  return (
    "engagement/"
    +
    articleId
  );
}


/* =========================================================
   TRAFIKSKYDD
========================================================= */

async function enforceRateLimit({
  store,
  visitorKey
}) {

  const key =
    `_rate-limit/engagement-${visitorKey}`;


  const now =
    Date.now();


  const saved =
    await store.get(
      key,
      {
        type:
          "json",

        consistency:
          "strong"
      }
    );


  const windowStartedAt =
    Number(
      saved?.windowStartedAt ||
      0
    );


  const count =
    safeNumber(
      saved?.count
    );


  const sameWindow =
    windowStartedAt > 0 &&
    now - windowStartedAt <
      RATE_LIMIT_WINDOW_MS;


  if (
    sameWindow &&
    count >=
      RATE_LIMIT_MAX_POSTS
  ) {

    throw new PublicError(
      "Lite väl mycket kaffe på en gång. Vänta en minut och försök igen.",
      429
    );
  }


  await store.setJSON(
    key,
    {
      windowStartedAt:
        sameWindow
          ? windowStartedAt
          : now,

      count:
        sameWindow
          ? count + 1
          : 1,

      updatedAt:
        new Date()
          .toISOString()
    }
  );
}


/* =========================================================
   ANONYM BESÖKARNYCKEL
========================================================= */

function createVisitorKey(
  request
) {

  const clientAddress =
    getClientAddress(
      request
    );


  const secret =
    process.env
      .KAFFERASTEN_CRON_SECRET
    ||
    "kafferasten-rate-limit";


  return createHmac(
    "sha256",
    secret
  )
    .update(
      clientAddress
    )
    .digest(
      "hex"
    )
    .slice(
      0,
      32
    );
}


function getClientAddress(
  request
) {

  const netlifyIp =
    request.headers.get(
      "x-nf-client-connection-ip"
    );


  if (netlifyIp) {

    return netlifyIp
      .trim();
  }


  const forwarded =
    request.headers.get(
      "x-forwarded-for"
    );


  if (forwarded) {

    return forwarded
      .split(",")[0]
      .trim();
  }


  return "unknown";
}


/* =========================================================
   LÅS – SKYDD MOT SAMTIDIGA RÖSTER
========================================================= */

async function withArticleLock({
  store,
  articleId,
  task
}) {

  const lockKey =
    `_locks/engagement-${articleId}`;


  const token =
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;


  const timeoutAt =
    Date.now() +
    5000;


  while (
    Date.now() <
    timeoutAt
  ) {

    const existing =
      await store.get(
        lockKey,
        {
          type:
            "json",

          consistency:
            "strong"
        }
      );


    if (
      existing?.startedAt
    ) {

      const age =
        Date.now()
        -
        new Date(
          existing.startedAt
        )
          .getTime();


      if (
        Number.isFinite(
          age
        )
        &&
        age >
          8000
      ) {

        await store.delete(
          lockKey
        );
      }
    }


    const lockResult =
      await store.setJSON(
        lockKey,
        {
          token,

          startedAt:
            new Date()
              .toISOString()
        },
        {
          onlyIfNew:
            true
        }
      );


    if (
      lockResult.modified
    ) {

      try {

        return await task();

      } finally {

        try {

          const current =
            await store.get(
              lockKey,
              {
                type:
                  "json",

                consistency:
                  "strong"
              }
            );


          if (
            current?.token ===
            token
          ) {

            await store.delete(
              lockKey
            );
          }

        } catch {

          // Låt aldrig upplåsningen krascha svaret.
        }
      }
    }


    await sleep(
      120
    );
  }


  throw new PublicError(
    "Fikarummet är extra populärt just nu. Försök igen om en sekund.",
    409
  );
}


/* =========================================================
   HJÄLPFUNKTIONER
========================================================= */

class PublicError
  extends Error {

  constructor(
    message,
    status
  ) {

    super(
      message
    );

    this.status =
      status;
  }
}


function sanitizeArticleId(
  value
) {

  const text =
    String(
      value ||
      ""
    )
      .trim();


  if (
    !/^[a-zA-Z0-9_-]{4,80}$/.test(
      text
    )
  ) {

    return null;
  }


  return text;
}


function sanitizePlainText(
  value,
  maxLength
) {

  return String(
    value ||
    ""
  )

    .replace(
      /[\u0000-\u001F\u007F]/g,
      " "
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim()

    .slice(
      0,
      maxLength
    );
}


function safeNumber(
  value
) {

  const number =
    Number(
      value
    );


  if (
    !Number.isFinite(
      number
    )
    ||
    number < 0
  ) {

    return 0;
  }


  return Math.floor(
    number
  );
}


function createCommentId() {

  return (
    Date.now()
      .toString(36)
    +
    "-"
    +
    Math.random()
      .toString(36)
      .slice(2, 8)
  );
}


function sleep(
  milliseconds
) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}


function jsonResponse(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,

      headers: {

        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store"
      }
    }
  );
}
