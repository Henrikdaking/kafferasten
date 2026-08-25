import { getStore } from "@netlify/blobs";

const STORE_NAME = "kafferasten-news";


export default async () => {

  try {

    const store =
      getStore(
        STORE_NAME
      );


    /* =========================================
       HÄMTA DAGENS ARTIKEL
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
       HÄMTA HELA ARKIVET
    ========================================= */

    const listing =
      await store.list({
        prefix: "archive/"
      });


    const archiveItems = [];


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
          "Kunde inte läsa arkivpost:",
          blob.key,
          error.message
        );
      }
    }


    /* =========================================
       SLÅ IHOP + TA BORT DUBLETTER
    ========================================= */

    const allArticles = [];


    if (
      latest?.id &&
      latest?.article
    ) {

      allArticles.push(
        latest
      );
    }


    for (
      const item
      of archiveItems
    ) {

      if (
        allArticles.some(
          existing =>
            existing.id === item.id
        )
      ) {

        continue;
      }


      allArticles.push(
        item
      );
    }


    allArticles.sort(
      (a, b) =>
        new Date(
          b.createdAt || 0
        ) -
        new Date(
          a.createdAt || 0
        )
    );


    return htmlResponse(
      renderArchivePage(
        allArticles
      )
    );


  } catch (error) {

    console.error(
      "Arkivsidan kraschade:",
      error
    );


    return new Response(
      renderErrorPage(),
      {
        status: 500,
        headers: {
          "Content-Type":
            "text/html; charset=utf-8",

          "Cache-Control":
            "no-store"
        }
      }
    );
  }
};


export const config = {

  path:
    "/arkiv",

  method:
    "GET"
};


/* =========================================================
   HTML
========================================================= */


function renderArchivePage(
  articles
) {

  const articleCards =
    articles.length
      ? articles
          .map(
            renderArticleCard
          )
          .join("")
      : `
        <div class="empty">
          ☕ Arkivet är tomt än så länge.
        </div>
      `;


  const itemList =
    articles
      .slice(
        0,
        100
      )
      .map(
        (
          item,
          index
        ) => ({
          "@type":
            "ListItem",

          position:
            index + 1,

          url:
            getAbsoluteArticleUrl(
              item
            ),

          name:
            cleanText(
              item.article?.title
            )
        })
      );


  const jsonLd = {

    "@context":
      "https://schema.org",

    "@type":
      "CollectionPage",

    name:
      "Snackisarkivet – Kafferasten.se",

    url:
      "https://kafferasten.se/arkiv",

    description:
      "Alla tidigare snackisar och samtalsämnen från Kafferasten.se.",

    inLanguage:
      "sv-SE",

    mainEntity: {

      "@type":
        "ItemList",

      numberOfItems:
        articles.length,

      itemListElement:
        itemList
    }
  };


  return `<!DOCTYPE html>

<html lang="sv">

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <meta
    name="theme-color"
    content="#2D1A17"
  >


  <title>
    Snackisarkivet – tidigare fikanyheter | Kafferasten.se
  </title>


  <meta
    name="description"
    content="Bläddra bland tidigare snackisar från Kafferasten.se – aktuella, roliga och oväntade samtalsämnen från fikabordet."
  >


  <meta
    name="robots"
    content="index, follow, max-image-preview:large"
  >


  <link
    rel="canonical"
    href="https://kafferasten.se/arkiv"
  >


  <meta
    property="og:type"
    content="website"
  >


  <meta
    property="og:locale"
    content="sv_SE"
  >


  <meta
    property="og:site_name"
    content="Kafferasten.se"
  >


  <meta
    property="og:url"
    content="https://kafferasten.se/arkiv"
  >


  <meta
    property="og:title"
    content="Snackisarkivet | Kafferasten.se"
  >


  <meta
    property="og:description"
    content="Alla gamla snackisar finns kvar. Hitta något att prata om till nästa fika."
  >


  <meta
    name="twitter:card"
    content="summary"
  >


  <meta
    name="twitter:title"
    content="Snackisarkivet | Kafferasten.se"
  >


  <meta
    name="twitter:description"
    content="Tidigare snackisar och samtalsämnen från Kafferasten.se."
  >


  <link
    rel="icon"
    type="image/svg+xml"
    href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%232D1A17'/%3E%3Ctext x='32' y='45' text-anchor='middle' font-size='38'%3E%E2%98%95%3C/text%3E%3C/svg%3E"
  >


  <script type="application/ld+json">
    ${safeJson(jsonLd)}
  </script>


  <style>

    :root {

      --bg:
        #F8F4EE;

      --card:
        #FFFFFF;

      --brown:
        #2D1A17;

      --orange:
        #C86D3B;

      --orange-dark:
        #A85528;

      --text:
        #2C221E;

      --muted:
        #74635B;

      --border:
        #E2D7CD;

      --soft:
        #EFE4D8;

      --shadow:
        0 10px 30px
        rgba(
          45,
          26,
          23,
          0.055
        );
    }


    * {
      box-sizing:
        border-box;
    }


    body {

      margin: 0;

      color:
        var(--text);

      background-color:
        var(--bg);

      background-image:
        radial-gradient(
          #E2D7CD 0.7px,
          transparent 0.7px
        );

      background-size:
        16px 16px;

      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Roboto,
        Helvetica,
        Arial,
        sans-serif;

      line-height:
        1.6;
    }


    header {

      padding:
        2rem 1rem
        1.75rem;

      text-align:
        center;

      color:
        white;

      background:
        linear-gradient(
          145deg,
          #281714,
          #3B211C
        );

      border-bottom:
        4px solid
        var(--orange);
    }


    .brand {

      color:
        white;

      font-size:
        2.1rem;

      font-weight:
        900;

      letter-spacing:
        -0.8px;

      text-decoration:
        none;
    }


    header p {

      margin:
        0.45rem 0 0;

      color:
        #E4D7CF;

      font-size:
        0.92rem;
    }


    main {

      width:
        min(
          930px,
          calc(
            100% - 2rem
          )
        );

      margin:
        1.8rem auto
        3rem;
    }


    .intro {

      margin-bottom:
        1rem;

      padding:
        1.6rem;

      background:
        rgba(
          255,
          255,
          255,
          0.97
        );

      border:
        1px solid
        var(--border);

      border-radius:
        20px;

      box-shadow:
        var(--shadow);
    }


    .eyebrow {

      color:
        var(--orange);

      font-size:
        0.72rem;

      font-weight:
        850;

      letter-spacing:
        0.6px;

      text-transform:
        uppercase;
    }


    h1 {

      margin:
        0.3rem 0
        0.7rem;

      color:
        var(--brown);

      font-family:
        Georgia,
        "Times New Roman",
        serif;

      font-size:
        2.25rem;

      line-height:
        1.1;
    }


    .intro p {

      max-width:
        700px;

      margin:
        0;

      color:
        var(--muted);

      font-size:
        0.95rem;
    }


    .archive-count {

      margin-top:
        0.8rem;

      color:
        var(--brown);

      font-size:
        0.8rem;

      font-weight:
        800;
    }


    .archive-grid {

      display:
        grid;

      grid-template-columns:
        repeat(
          2,
          minmax(
            0,
            1fr
          )
        );

      gap:
        1rem;
    }


    .article-card {

      overflow:
        hidden;

      background:
        rgba(
          255,
          255,
          255,
          0.97
        );

      border:
        1px solid
        var(--border);

      border-radius:
        18px;

      box-shadow:
        var(--shadow);
    }


    .article-image-link {

      display:
        block;

      overflow:
        hidden;

      background:
        var(--soft);

      aspect-ratio:
        16 / 9;
    }


    .article-image {

      display:
        block;

      width:
        100%;

      height:
        100%;

      object-fit:
        cover;

      transition:
        transform 0.25s ease;
    }


    .article-card:hover
    .article-image {

      transform:
        scale(1.025);
    }


    .image-fallback {

      display:
        grid;

      width:
        100%;

      height:
        100%;

      place-items:
        center;

      font-size:
        3.5rem;
    }


    .article-copy {

      padding:
        1.1rem;
    }


    .article-meta {

      margin-bottom:
        0.35rem;

      color:
        var(--orange);

      font-size:
        0.69rem;

      font-weight:
        850;

      letter-spacing:
        0.35px;

      text-transform:
        uppercase;
    }


    h2 {

      margin:
        0 0
        0.5rem;

      font-family:
        Georgia,
        "Times New Roman",
        serif;

      font-size:
        1.25rem;

      line-height:
        1.25;
    }


    h2 a {

      color:
        var(--brown);

      text-decoration:
        none;
    }


    h2 a:hover {

      color:
        var(--orange);
    }


    .summary {

      margin:
        0;

      color:
        #493B35;

      font-size:
        0.87rem;

      line-height:
        1.55;
    }


    .byline {

      margin-top:
        0.65rem;

      color:
        var(--muted);

      font-size:
        0.72rem;
    }


    .read-link {

      display:
        inline-block;

      margin-top:
        0.8rem;

      color:
        var(--orange);

      font-size:
        0.8rem;

      font-weight:
        850;

      text-decoration:
        none;
    }


    .read-link:hover {

      color:
        var(--orange-dark);

      text-decoration:
        underline;
    }


    .back {

      display:
        inline-flex;

      margin-top:
        1.4rem;

      padding:
        0.72rem 1rem;

      color:
        white;

      background:
        var(--orange);

      border-radius:
        11px;

      font-weight:
        800;

      text-decoration:
        none;
    }


    .back:hover {

      background:
        var(--orange-dark);
    }


    .empty {

      padding:
        2rem;

      text-align:
        center;

      background:
        white;

      border:
        1px solid
        var(--border);

      border-radius:
        18px;
    }


    footer {

      padding:
        2rem 1rem;

      color:
        var(--muted);

      text-align:
        center;

      border-top:
        1px solid
        var(--border);

      font-size:
        0.8rem;
    }


    footer a {

      color:
        var(--brown);

      font-weight:
        750;

      text-decoration:
        none;
    }


    @media (
      max-width: 700px
    ) {

      header {

        padding:
          1.5rem 1rem
          1.35rem;
      }


      .brand {

        font-size:
          1.8rem;
      }


      main {

        width:
          calc(
            100% - 1.4rem
          );

        margin-top:
          0.85rem;
      }


      .intro {

        padding:
          1.15rem;

        border-radius:
          17px;
      }


      h1 {

        font-size:
          1.75rem;
      }


      .archive-grid {

        grid-template-columns:
          1fr;

        gap:
          0.8rem;
      }
    }


    @media (
      prefers-reduced-motion:
        reduce
    ) {

      * {

        transition:
          none !important;
      }
    }

  </style>

</head>


<body>


<header>

  <a
    href="/"
    class="brand"
  >
    ☕ Kafferasten.se
  </a>


  <p>
    Alla snackisar lämnar inte fikabordet.
  </p>

</header>


<main>


  <section class="intro">

    <div class="eyebrow">
      Snackisarkivet
    </div>


    <h1>
      Alla våra tidigare snackisar
    </h1>


    <p>
      Missade du ett fika? Här samlar vi gamla,
      roliga, udda och aktuella samtalsämnen från
      Kafferasten. De senaste ligger överst.
    </p>


    <div class="archive-count">
      ☕ ${articles.length}
      ${
        articles.length === 1
          ? "snackis"
          : "snackisar"
      }
      i kaffearkivet
    </div>

  </section>


  <section
    class="archive-grid"
    aria-label="Tidigare snackisar"
  >

    ${articleCards}

  </section>


  <a
    href="/"
    class="back"
  >
    ☕ Till dagens snackis
  </a>


</main>


<footer>

  <a href="/">
    Kafferasten.se
  </a>

  ·

  <a href="/om.html">
    Om Kafferasten
  </a>

</footer>


</body>

</html>`;
}


/* =========================================================
   KORT
========================================================= */


function renderArticleCard(
  item
) {

  const article =
    item.article || {};


  const title =
    cleanText(
      article.title ||
      "Tidigare snackis"
    );


  const summary =
    cleanText(
      article.summary ||
      ""
    );


  const category =
    cleanText(
      article.category ||
      "Snackis"
    );


  const byline =
    cleanText(
      item.byline ||
      article.byline ||
      ""
    );


  const url =
    getArticleUrl(
      item
    );


  const imageUrl =
    safeUrl(
      item.heroImage?.smallUrl ||
      item.heroImage?.url
    );


  const alt =
    cleanText(
      item.heroImage?.alt ||
      article.imageAlt ||
      title
    );


  const imageHtml =
    imageUrl
      ? `
        <a
          class="article-image-link"
          href="${escapeAttribute(url)}"
        >

          <img
            class="article-image"
            src="${escapeAttribute(imageUrl)}"
            alt="${escapeAttribute(alt)}"
            loading="lazy"
          >

        </a>
      `
      : `
        <a
          class="article-image-link"
          href="${escapeAttribute(url)}"
          aria-label="${escapeAttribute(title)}"
        >

          <div class="image-fallback">
            ☕
          </div>

        </a>
      `;


  return `

    <article class="article-card">

      ${imageHtml}


      <div class="article-copy">

        <div class="article-meta">

          ${escapeHtml(category)}

          ·

          ${escapeHtml(
            formatDate(
              item.createdAt
            )
          )}

        </div>


        <h2>

          <a
            href="${escapeAttribute(url)}"
          >
            ${escapeHtml(title)}
          </a>

        </h2>


        ${
          summary
            ? `
              <p class="summary">
                ${escapeHtml(summary)}
              </p>
            `
            : ""
        }


        ${
          byline
            ? `
              <div class="byline">
                Serverad av ${escapeHtml(byline)}
              </div>
            `
            : ""
        }


        <a
          class="read-link"
          href="${escapeAttribute(url)}"
        >
          Läs snackisen →
        </a>

      </div>

    </article>
  `;
}


/* =========================================================
   URL
========================================================= */


function getArticleUrl(
  item
) {

  return (
    "/snackis/"
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


function getAbsoluteArticleUrl(
  item
) {

  return (
    "https://kafferasten.se"
    +
    getArticleUrl(
      item
    )
  );
}


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
   HJÄLPARE
========================================================= */


function cleanText(
  value
) {

  return String(
    value ||
    ""
  )

    .replace(
      /[\uE000-\uF8FF]/g,
      ""
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();
}


function safeUrl(
  value
) {

  try {

    const url =
      new URL(
        value
      );


    if (
      url.protocol === "https:"
      ||
      url.protocol === "http:"
    ) {

      return url.toString();
    }


    return null;


  } catch {

    return null;
  }
}


function formatDate(
  value
) {

  try {

    return new Intl.DateTimeFormat(
      "sv-SE",
      {
        timeZone:
          "Europe/Stockholm",

        day:
          "numeric",

        month:
          "long",

        year:
          "numeric"
      }
    )
      .format(
        new Date(
          value
        )
      );


  } catch {

    return "";
  }
}


function safeJson(
  value
) {

  return JSON
    .stringify(
      value
    )
    .replace(
      /</g,
      "\\u003c"
    );
}


function escapeHtml(
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
      "&#039;"
    );
}


function escapeAttribute(
  value
) {

  return escapeHtml(
    value
  );
}


/* =========================================================
   FEL
========================================================= */


function renderErrorPage() {

  return `<!DOCTYPE html>

<html lang="sv">

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <meta
    name="robots"
    content="noindex"
  >

  <title>
    Arkivet tog kaffepaus | Kafferasten.se
  </title>

</head>


<body
  style="
    margin:0;
    padding:3rem 1rem;
    background:#F8F4EE;
    color:#2D1A17;
    font-family:Arial,sans-serif;
    text-align:center;
  "
>

  <h1>
    ☕ Arkivet tog kaffepaus
  </h1>

  <p>
    Försök igen om en liten stund.
  </p>

  <a href="/">
    Till dagens snackis
  </a>

</body>

</html>`;
}


/* =========================================================
   RESPONSE
========================================================= */


function htmlResponse(
  html
) {

  return new Response(
    html,
    {
      status: 200,

      headers: {

        "Content-Type":
          "text/html; charset=utf-8",

        "Cache-Control":
          "public, max-age=300, s-maxage=300"
      }
    }
  );
}
