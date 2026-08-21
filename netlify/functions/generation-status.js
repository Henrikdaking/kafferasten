import { getStore } from "@netlify/blobs";

export default async () => {
  try {

    const store =
      getStore(
        "kafferasten-news"
      );


    const status =
      await store.get(
        "_diagnostics/generation-status",
        {
          type:
            "json",
          consistency:
            "strong"
        }
      );


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


    const lock =
      await store.get(
        "_locks/generate-news",
        {
          type:
            "json",
          consistency:
            "strong"
        }
      );


    return new Response(
      JSON.stringify(
        {
          success:
            true,

          generation:
            status ||
            {
              message:
                "Ingen diagnostik finns ännu."
            },

          currentLatest: latest
            ? {
                id:
                  latest.id ||
                  null,

                createdAt:
                  latest.createdAt ||
                  null,

                generatedAt:
                  latest.generatedAt ||
                  null,

                title:
                  latest.article
                    ?.title ||
                  null,

                category:
                  latest.article
                    ?.category ||
                  null
              }
            : null,

          activeLock:
            lock ||
            null
        },
        null,
        2
      ),
      {
        status:
          200,

        headers: {
          "Content-Type":
            "application/json; charset=utf-8",

          "Cache-Control":
            "no-store"
        }
      }
    );


  } catch (error) {

    return new Response(
      JSON.stringify(
        {
          success:
            false,

          error:
            "Kunde inte läsa diagnostiken.",

          details:
            error.message
        },
        null,
        2
      ),
      {
        status:
          500,

        headers: {
          "Content-Type":
            "application/json; charset=utf-8",

          "Cache-Control":
            "no-store"
        }
      }
    );
  }
};
