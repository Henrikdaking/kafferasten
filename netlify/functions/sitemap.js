import { getStore } from "@netlify/blobs";

const STORE_NAME =
  "kafferasten-news";


export default async () => {

  try {

    const store =
      getStore(
        STORE_NAME
      );


    /* =========================================
       DAGENS ARTIKEL
    ========================================= */

    const latest =
      await store.get(
        "latest",
        {
          type: "json",
          consistency: "strong"
        }
      );


    /* =========================================
       HELA ARKIVET
       Hämtar även framtida sidor om arkivet växer.
    ========================================= */

    const archiveItems =
      [];


    let cursor;


    do {

      const listing =
        await store.list({
          prefix:
            "archive/",

          ...(cursor
            ? { cursor }
            : {})
        });


      for (
        const blob
        of listing.blobs || []
      ) {

        try {

          const item =
            await store.get(
              blob.key,
              {
                type: "json",
                consistency: "strong"
              }
            );


          if (
            item?.id &&
            item?.article
          ) {

            archiveItems.push(
              item
            );
          }


        } catch (error) {

          console.warn(
            "Kunde inte läsa:",
            blob.key,
            error.message
          );
        }
      }


      cursor =
        listing.cursor ||
        null;


    } while (cursor);


    /* =========================================
       SLÅ IHOP + TA BORT DUBLETTER
    ========================================= */

    const articles =
      [];


    const seen =
      new Set();


    if (
      latest?.id &&
      latest?.article
    ) {

      articles.push(
        latest
      );


      seen.add(
        latest.id
      );
    }


    for (
      const item
      of archiveItems
    ) {

      if (
        seen.has(
          item.id
        )
      ) {

        continue;
      }


      seen.add(
        item.id
      );


      articles.push(
        item
      );
    }


    articles.sort(
      (a, b) =>
        new Date(
          b.createdAt || 0
        )
        -
        new Date(
          a.createdAt || 0
        )
    );


    /* =========================================
       FASTA SIDOR
    ========================================= */

    const staticUrls = [

      {
        loc:
          "https://kafferasten.se/",

        changefreq:
          "daily",

        priority:
          "1.0"
      },

      {
        loc:
          "https://kafferasten.se/arkiv",

        changefreq:
          "daily",

        priority:
          "0.8"
      },

      {
        loc:
          "https://kafferasten.se/om.html",

        changefreq:
          "monthly",

        priority:
          "0.6"
      }
    ];


    const staticXml =
      staticUrls
        .map(
          item => `
  <url>
    <loc>${escapeXml(item.loc)}</loc>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`
        )
        .join("");


    /* =========================================
       ALLA SNACKISAR
    ========================================= */

    const articleXml =
      articles
        .map(
          item => {

            const url =
              getArticleUrl(
                item
              );


            const lastmod =
              formatLastModified(
                item.createdAt
              );


            return `
  <url>
    <loc>${escapeXml(url)}</loc>${
      lastmod
        ? `
    <lastmod>${lastmod}</lastmod>`
        : ""
    }
    <changefreq>never</changefreq>
    <priority>0.7</priority>
  </url>`;
          }
        )
        .join("");


    const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticXml}
${articleXml}
</urlset>`;


    return new Response(
      xml,
      {
        status: 200,

        headers: {

          "Content-Type":
            "application/xml; charset=utf-8",

          "Cache-Control":
            "public, max-age=300, s-maxage=300"
        }
      }
    );


  } catch (error) {

    console.error(
      "Sitemap kraschade:",
      error
    );


    return new Response(
      "Sitemap kunde inte skapas.",
      {
        status: 500,

        headers: {
          "Content-Type":
            "text/plain; charset=utf-8"
        }
      }
    );
  }
};


export const config = {

  path:
    "/sitemap.xml",

  method:
    "GET"
};


/* =========================================================
   ARTIKEL-URL
========================================================= */


function getArticleUrl(
  item
) {

  return (
    "https://kafferasten.se/snackis/"
    +
    item.id
    +
    "-"
    +
    createSlug(
      item.article?.title
    )
  );
}


/* =========================================================
   SLUG
========================================================= */


function createSlug(
  value
) {

  const slug =
    String(
      value ||
      "snackis"
    )

      .toLowerCase()

      .normalize(
        "NFD"
      )

      .replace(
        /[\u0300-\u036f]/g,
        ""
      )

      .replace(
        /å/g,
        "a"
      )

      .replace(
        /ä/g,
        "a"
      )

      .replace(
        /ö/g,
        "o"
      )

      .replace(
        /[^a-z0-9]+/g,
        "-"
      )

      .replace(
        /^-+|-+$/g,
        ""
      )

      .replace(
        /-{2,}/g,
        "-"
      )

      .slice(
        0,
        80
      )

      .replace(
        /-+$/g,
        ""
      );


  return slug ||
    "snackis";
}


/* =========================================================
   DATUM
========================================================= */


function formatLastModified(
  value
) {

  if (!value) {
    return "";
  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "";
  }


  return date
    .toISOString()
    .slice(
      0,
      10
    );
}


/* =========================================================
   XML-SÄKERHET
========================================================= */


function escapeXml(
  value
) {

  return String(
    value ||
    ""
  )

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&apos;"
    );
}
