import { getStore } from "@netlify/blobs";


const STORE_NAME =
  "kafferasten-news";


const TITLES_TO_DELETE = [
  "Curlingen får dubbelpetningsdetektor – Oskar Eriksson tycker att hjälpen kommer sent",
  "Christian metalband stämmer Netflix över namnet ”KPop Demon Hunters”",
  "Surströmmingspremiären 2026 är här – dags att tycka till",
  "Let’s Dance är tillbaka – höstens tv-start blir tät",
  "Streamingpubliken får en ny Outer Banks-säsong – och finalen väcker reaktioner",
  "Outer Banks är tillbaka – säsong 5 blir seriens sista",
  "Sista säsongen av Outer Banks finns nu på Netflix",
  "”Outer Banks” är tillbaka – hela sista säsongen finns på Netflix",
  "Apple kan vara på väg att sätta kameror i AirPods",
  "Outer Banks är tillbaka – och nu ska allt avgöras",
  "Kamera i AirPods – Apples nästa integritetspryl?",
  "”Outer Banks” är tillbaka – med femte och sista säsongen",
  "Dansande robotar bakom börsrusning på 629 procent",
  "Oasis återförening blir dokumentär",
  "Uppäten av en val",
  "Ny trailer för Laikas Wildwood",
  "Snowfall-spinoffen får trailer",
  "Första trailern till VisionQuest är här",
  "Dane Cooks familjedrama blir dokumentär",
  "Sista Outer Banks-säsongen är här",
  "Sid Baker är tillbaka i Slow Horses",
  "Outer Banks är tillbaka för sista gången"
];


export default async () => {

  const store =
    getStore(
      STORE_NAME
    );


  try {

    const wantedTitles =
      new Set(
        TITLES_TO_DELETE.map(
          normalizeTitle
        )
      );


    const listing =
      await store.list({
        prefix:
          "archive/"
      });


    const deleted = [];

    const notDeleted = [];


    for (
      const blob
      of listing.blobs || []
    ) {

      try {

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
          !wantedTitles.has(
            normalizeTitle(
              title
            )
          )
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


      } catch (error) {

        notDeleted.push({
          key:
            blob.key,

          error:
            error.message
        });
      }
    }


    return new Response(
      JSON.stringify(
        {
          success:
            true,

          requested:
            TITLES_TO_DELETE.length,

          deletedCount:
            deleted.length,

          deleted,

          errors:
            notDeleted
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
      "Arkivstädningen misslyckades:",
      error
    );


    return new Response(
      JSON.stringify(
        {
          success:
            false,

          error:
            "Arkivstädningen misslyckades."
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


export const config = {
  schedule:
    "@monthly"
};
