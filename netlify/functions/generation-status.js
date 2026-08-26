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
          type: "json",
          consistency: "strong"
        }
      );


    const latest =
      await store.get(
        "latest",
        {
          type: "json",
          consistency: "strong"
        }
      );


    const lock =
      await store.get(
        "_locks/generate-news",
        {
          type: "json",
          consistency: "strong"
        }
      );


    const publicGeneration =
      status
        ? {
            status:
              status.status ||
              null,

            stage:
              status.stage ||
              null,

            message:
              status.message ||
              null,

            updatedAt:
              status.updatedAt ||
              null,

            finishedAt:
              status.finishedAt ||
              null,

            swedishTime:
              status.swedishTime ||
              null
          }
        : {
            message:
              "Ingen diagnostik finns ännu."
          };


    return new Response(
      JSON.stringify(
        {
          success:
            true,

          generation:
            publicGeneration,

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
            Boolean(lock)
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

    console.error(
      "Kunde inte läsa generation-status:",
      error
    );


    return new Response(
      JSON.stringify(
        {
          success:
            false,

          error:
            "Kunde inte läsa diagnostiken."
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
