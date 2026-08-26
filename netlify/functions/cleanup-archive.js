import { getStore } from "@netlify/blobs";


const STORE_NAME =
  "kafferasten-news";


const TARGET_TITLE =
  "Sista säsongen av Outer Banks är här";


export default async () => {

  try {

    const store =
      getStore(
        STORE_NAME
      );


    const listing =
      await store.list({
        prefix:
          "archive/"
      });


    const deleted = [];


    for (
      const blob
      of listing.blobs || []
    ) {

      const article =
        await store.get(
          blob.key,
          {
            type:
              "json",

            consistency:
              "strong"
          }
        );


      const title =
        article?.article?.title ||
        "";


      if (
        normalizeTitle(title) !==
        normalizeTitle(TARGET_TITLE)
      ) {

        continue;
      }


      await store.delete(
        blob.key
      );


      deleted.push({
        key:
          blob.key,

        id:
          article?.id ||
          null,

        title
      });
    }


    return new Response(
      JSON.stringify(
        {
          success:
            true,

          targetTitle:
            TARGET_TITLE,

          deletedCount:
            deleted.length,

          deleted
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
      "Cleanup-fel:",
      error
    );


    return new Response(
      JSON.stringify(
        {
          success:
            false,

          error:
            "Cleanup misslyckades."
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


function normalizeTitle(
  value
) {

  return String(
    value ||
    ""
  )
    .trim()
    .toLowerCase()

    .replace(
      /[“”„]/g,
      "\""
    )

    .replace(
      /[’‘]/g,
      "'"
    )

    .replace(
      /[–—]/g,
      "-"
    )

    .replace(
      /\s+/g,
      " "
    );
}
