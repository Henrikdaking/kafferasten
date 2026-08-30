import { getStore } from "@netlify/blobs";

const STORE_NAME = "kafferasten-news";


export default async (request, context) => {

  try {

    const routeValue =
      String(
        context.params?.slug || ""
      );


    const match =
      routeValue.match(
        /^(\d{14})(?:-(.+))?$/
      );


    if (!match) {

      return htmlResponse(
        renderNotFound(),
        404
      );
    }


    const articleId =
      match[1];


    const store =
      getStore(
        STORE_NAME
      );


    let news =
      await store.get(
        "latest",
        {
          type: "json",
          consistency: "strong"
        }
      );


    if (
      !news ||
      news.id !== articleId
    ) {

      news =
        await store.get(
          `archive/${articleId}`,
          {
            type: "json",
            consistency: "strong"
          }
        );
    }


    if (
      !news ||
      !news.article
    ) {

      return htmlResponse(
        renderNotFound(),
        404
      );
    }


    const canonicalSlug =
      createSlug(
        news.article.title
      );


    const canonicalPath =
      `${news.id}-${canonicalSlug}`;


    if (
      routeValue !== canonicalPath
    ) {

      return new Response(
        null,
        {
          status: 301,
          headers: {
            Location:
              `/snackis/${canonicalPath}`
          }
        }
      );
    }


    return htmlResponse(
      renderArticlePage(
        news
      ),
      200
    );


  } catch (error) {

    console.error(
      "Snackis-sidan kraschade:",
      error
    );


    return htmlResponse(
      renderError(),
      500
    );
  }
};


export const config = {

  path:
    "/snackis/:slug",

  method:
    "GET"
};


/* =========================================================
   ARTIKELSIDA
========================================================= */


function renderArticlePage(
  news
) {

  const article =
    news.article || {};


  const title =
    cleanText(
      article.title ||
      "Dagens snackis"
    );


  const summary =
    cleanText(
      article.summary ||
      "En snackis från Kafferasten.se."
    );


  const category =
    cleanText(
      article.category ||
      "Dagens snackis"
    );


  const byline =
    cleanText(
      news.byline ||
      article.byline ||
      "Kafferasten"
    );


  const articleUrl =
    `https://kafferasten.se/snackis/${news.id}-${createSlug(title)}`;


  const imageUrl =
    safeUrl(
      news.heroImage?.url
    );


  const imageAlt =
    cleanText(
      news.heroImage?.alt ||
      article.imageAlt ||
      title
    );


  const paragraphs =
    safeArray(
      article.paragraphs
    )
      .map(cleanText)
      .filter(Boolean);


  const why =
    safeArray(
      article.whyTalkAboutIt
    )
      .map(cleanText)
      .filter(Boolean);


  const sources =
    safeArray(
      news.sources
    )
      .map(
        source => ({
          title:
            cleanText(
              source?.title ||
              "Källa"
            ),

          url:
            safeUrl(
              source?.url
            )
        })
      )
      .filter(
        source =>
          source.url
      )
      .slice(
        0,
        3
      );


  const publishedDate =
    safeIsoDate(
      news.createdAt
    );


  /* =====================================================
     NEWSARTICLE
  ===================================================== */


  const articleJsonLd = {

    "@context":
      "https://schema.org",

    "@type":
      "NewsArticle",

    headline:
      title,

    description:
      summary,

    datePublished:
      publishedDate,

    dateModified:
      publishedDate,

    inLanguage:
      "sv-SE",

    mainEntityOfPage: {

      "@type":
        "WebPage",

      "@id":
        articleUrl
    },

    publisher: {

      "@type":
        "Organization",

      name:
        "Kafferasten.se",

      url:
        "https://kafferasten.se/"
    },

    author: {

      "@type":
        "Person",

      name:
        byline,

      url:
        "https://kafferasten.se/om.html"
    }
  };


  if (imageUrl) {

    articleJsonLd.image = [
      imageUrl
    ];
  }


  /* =====================================================
     BREADCRUMBS
  ===================================================== */


  const breadcrumbJsonLd = {

    "@context":
      "https://schema.org",

    "@type":
      "BreadcrumbList",

    itemListElement: [

      {

        "@type":
          "ListItem",

        position:
          1,

        name:
          "Kafferasten.se",

        item:
          "https://kafferasten.se/"
      },

      {

        "@type":
          "ListItem",

        position:
          2,

        name:
          "Snackisarkivet",

        item:
          "https://kafferasten.se/arkiv"
      },

      {

        "@type":
          "ListItem",

        position:
          3,

        name:
          title,

        item:
          articleUrl
      }
    ]
  };


  const heroHtml =
    imageUrl
      ? `
        <figure class="hero">

          <img
            src="${escapeAttribute(imageUrl)}"
            alt="${escapeAttribute(imageAlt)}"
          >

          ${renderPhotoCredit(
            news.heroImage
          )}

        </figure>
      `
      : "";


  const paragraphsHtml =
    paragraphs
      .map(
        paragraph =>
          `<p>${escapeHtml(paragraph)}</p>`
      )
      .join("");


  const whyHtml =
    why.length
      ? `
        <section class="why-box">

          <strong>
            ☕ Därför passar den på fikat
          </strong>

          <ul>

            ${why
              .map(
                item =>
                  `<li>${escapeHtml(item)}</li>`
              )
              .join("")}

          </ul>

        </section>
      `
      : "";


  const sourcesHtml =
    sources.length
      ? `
        <div class="sources">

          <strong>
            🔎 Dagens scoop hittade vi hos:
          </strong>

          <span>

            ${sources
              .map(
                source =>
                  `<a href="${escapeAttribute(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceName(source))}</a>`
              )
              .join(" · ")}

          </span>

        </div>
      `
      : "";


  const publishedLabel =
    formatSwedishDate(
      news.createdAt
    );


  return `<!DOCTYPE html>

<html lang="sv">

<head>

  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-PTWMQ0C4GB"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-PTWMQ0C4GB');
  </script>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <meta
    name="theme-color"
    content="#2D1A17"
  >

  <title>${escapeHtml(title)} | Kafferasten.se</title>

  <meta
    name="description"
    content="${escapeAttribute(summary)}"
  >

  <meta
    name="robots"
    content="index, follow, max-image-preview:large, max-snippet:-1"
  >

  <link
    rel="canonical"
    href="${escapeAttribute(articleUrl)}"
  >


  <!-- OPEN GRAPH -->

  <meta
    property="og:type"
    content="article"
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
    content="${escapeAttribute(articleUrl)}"
  >

  <meta
    property="og:title"
    content="${escapeAttribute(title)}"
  >

  <meta
    property="og:description"
    content="${escapeAttribute(summary)}"
  >


  ${imageUrl
    ? `
      <meta
        property="og:image"
        content="${escapeAttribute(imageUrl)}"
      >

      <meta
        property="og:image:alt"
        content="${escapeAttribute(imageAlt)}"
      >

      <meta
        property="og:image:width"
        content="1200"
      >

      <meta
        property="og:image:height"
        content="627"
      >
    `
    : ""
  }


  <meta
    property="article:published_time"
    content="${escapeAttribute(publishedDate)}"
  >

  <meta
    property="article:section"
    content="${escapeAttribute(category)}"
  >


  <!-- TWITTER / X -->

  <meta
    name="twitter:card"
    content="${imageUrl ? "summary_large_image" : "summary"}"
  >

  <meta
    name="twitter:title"
    content="${escapeAttribute(title)}"
  >

  <meta
    name="twitter:description"
    content="${escapeAttribute(summary)}"
  >


  ${imageUrl
    ? `
      <meta
        name="twitter:image"
        content="${escapeAttribute(imageUrl)}"
      >
    `
    : ""
  }


  <link
    rel="icon"
    type="image/svg+xml"
    href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%232D1A17'/%3E%3Ctext x='32' y='45' text-anchor='middle' font-size='38'%3E%E2%98%95%3C/text%3E%3C/svg%3E"
  >


  <!-- STRUCTURED DATA: ARTICLE -->

  <script type="application/ld+json">
    ${safeJson(
      articleJsonLd
    )}
  </script>


  <!-- STRUCTURED DATA: BREADCRUMBS -->

  <script type="application/ld+json">
    ${safeJson(
      breadcrumbJsonLd
    )}
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

      --highlight:
        #EFE4D8;
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
        1.65;
    }


    header {

      padding:
        1.8rem 1rem
        1.55rem;

      color:
        white;

      text-align:
        center;

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

      text-decoration:
        none;

      font-size:
        2.05rem;

      font-weight:
        900;

      letter-spacing:
        -0.8px;
    }


    header p {

      margin:
        0.4rem 0 0;

      color:
        #E4D7CF;

      font-size:
        0.9rem;
    }


    main {

      width:
        min(
          760px,
          calc(
            100% - 2rem
          )
        );

      margin:
        1.7rem auto
        2.8rem;
    }


    article {

      padding:
        2rem;

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
        0 10px 30px
        rgba(
          45,
          26,
          23,
          0.055
        );
    }


    /* =====================================================
       BREADCRUMBS
    ===================================================== */


    .breadcrumbs {

      display:
        flex;

      align-items:
        center;

      flex-wrap:
        wrap;

      gap:
        0.35rem;

      margin:
        0 0 1.1rem;

      color:
        var(--muted);

      font-size:
        0.74rem;
    }


    .breadcrumbs a {

      color:
        var(--orange);

      font-weight:
        750;

      text-decoration:
        none;
    }


    .breadcrumbs a:hover {

      color:
        var(--orange-dark);

      text-decoration:
        underline;
    }


    .breadcrumb-separator {

      color:
        #B9A79D;
    }


    .breadcrumb-current {

      overflow:
        hidden;

      max-width:
        300px;

      text-overflow:
        ellipsis;

      white-space:
        nowrap;
    }


    .tag {

      display:
        inline-block;

      margin-bottom:
        0.9rem;

      padding:
        0.3rem 0.75rem;

      color:
        white;

      background:
        var(--orange);

      border-radius:
        999px;

      font-size:
        0.72rem;

      font-weight:
        850;

      text-transform:
        uppercase;

      letter-spacing:
        0.4px;
    }


    h1 {

      margin:
        0 0 1rem;

      color:
        var(--brown);

      font-family:
        Georgia,
        "Times New Roman",
        serif;

      font-size:
        2.35rem;

      line-height:
        1.1;

      letter-spacing:
        -0.7px;
    }


    .article-meta {

      margin-bottom:
        1.25rem;

      color:
        var(--muted);

      font-size:
        0.78rem;
    }


    .hero {

      margin:
        0 0 1.5rem;
    }


    .hero img {

      display:
        block;

      width:
        100%;

      max-height:
        430px;

      object-fit:
        cover;

      border-radius:
        15px;
    }


    .photo-credit {

      margin-top:
        0.3rem;

      color:
        var(--muted);

      text-align:
        right;

      font-size:
        0.68rem;
    }


    .photo-credit a {

      color:
        inherit;
    }


    .summary {

      margin:
        0 0 1.5rem;

      padding:
        1rem 1.15rem;

      background:
        linear-gradient(
          135deg,
          #FBF7F2,
          #F3EAE1
        );

      border-left:
        4px solid
        var(--orange);

      border-radius:
        0 14px 14px 0;

      font-size:
        1rem;
    }


    .body-copy p {

      margin:
        0 0 1.3rem;

      font-family:
        Georgia,
        "Times New Roman",
        serif;

      font-size:
        1.07rem;

      line-height:
        1.72;
    }


    .why-box {

      margin:
        1.6rem 0;

      padding:
        1.15rem 1.2rem;

      background:
        var(--highlight);

      border-radius:
        14px;
    }


    .why-box strong {

      color:
        var(--brown);
    }


    .why-box ul {

      margin:
        0.55rem 0 0;

      padding-left:
        1.3rem;
    }


    .byline {

      margin-top:
        1.4rem;

      padding-top:
        1rem;

      border-top:
        1px solid
        var(--border);

      color:
        var(--muted);

      font-size:
        0.82rem;
    }


    .byline strong {

      color:
        var(--brown);
    }


    .sources {

      display:
        flex;

      gap:
        0.4rem;

      flex-wrap:
        wrap;

      margin-top:
        0.8rem;

      padding-top:
        0.75rem;

      border-top:
        1px dashed
        var(--border);

      color:
        var(--muted);

      font-size:
        0.76rem;
    }


    .sources strong {

      color:
        var(--brown);
    }


    .sources a {

      color:
        var(--orange);

      font-weight:
        750;

      text-decoration:
        none;
    }


    .sources a:hover {

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


    footer {

      padding:
        2rem 1rem;

      border-top:
        1px solid
        var(--border);

      color:
        var(--muted);

      text-align:
        center;

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
      max-width: 650px
    ) {

      main {

        width:
          calc(
            100% - 1.4rem
          );

        margin-top:
          0.85rem;
      }


      article {

        padding:
          1.15rem;

        border-radius:
          17px;
      }


      h1 {

        font-size:
          1.75rem;
      }


      .body-copy p {

        font-size:
          0.98rem;

        line-height:
          1.65;
      }


      .brand {

        font-size:
          1.75rem;
      }


      .breadcrumb-current {

        max-width:
          180px;
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
    Något att prata om när kaffet är klart.
  </p>

</header>


<main>

  <article>


    <nav
      class="breadcrumbs"
      aria-label="Brödsmulor"
    >

      <a href="/">
        Kafferasten
      </a>

      <span
        class="breadcrumb-separator"
        aria-hidden="true"
      >
        ›
      </span>

      <a href="/arkiv">
        Snackisarkivet
      </a>

      <span
        class="breadcrumb-separator"
        aria-hidden="true"
      >
        ›
      </span>

      <span class="breadcrumb-current">
        ${escapeHtml(title)}
      </span>

    </nav>


    <span class="tag">
      ${escapeHtml(category)}
    </span>


    <h1>
      ${escapeHtml(title)}
    </h1>


    <div class="article-meta">

      ${escapeHtml(
        [
          publishedLabel,
          byline
        ]
          .filter(Boolean)
          .join(" · ")
      )}

    </div>


    ${heroHtml}


    <div class="summary">

      <strong>
        ⚡ Snabböversikt
      </strong>

      <div>
        ${escapeHtml(summary)}
      </div>

    </div>


    <div class="body-copy">

      ${paragraphsHtml}

    </div>


    ${whyHtml}


    <div class="byline">

      Dagens snackis är serverad av

      <strong>
        ${escapeHtml(byline)}
      </strong>

    </div>


    ${sourcesHtml}


    <a
      href="/"
      class="back"
    >
      ☕ Till dagens snackis
    </a>

  </article>

</main>


<footer>

  <a href="/">
    Kafferasten.se
  </a>

  ·

  <a href="/arkiv">
    Snackisarkivet
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
   FOTO
========================================================= */


function renderPhotoCredit(
  photo
) {

  if (
    photo?.provider !== "pexels"
    ||
    !photo.photographerName
  ) {

    return "";
  }


  const photographerUrl =
    safeUrl(
      photo.photoUrl ||
      photo.photographerUrl
    )
    ||
    "https://www.pexels.com/";


  return `
    <figcaption class="photo-credit">

      Foto:

      <a
        href="${escapeAttribute(photographerUrl)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${escapeHtml(photo.photographerName)}
      </a>

      /

      <a
        href="https://www.pexels.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Pexels
      </a>

    </figcaption>
  `;
}


/* =========================================================
   KÄLLOR
========================================================= */


function sourceName(
  source
) {

  try {

    const hostname =
      new URL(
        source.url
      )
        .hostname
        .toLowerCase()
        .replace(
          /^www\./,
          ""
        );


    const known = {

      "svt.se":
        "SVT",

      "sverigesradio.se":
        "Sveriges Radio",

      "sr.se":
        "Sveriges Radio",

      "tv4.se":
        "TV4",

      "reuters.com":
        "Reuters",

      "apnews.com":
        "AP",

      "bbc.com":
        "BBC",

      "bbc.co.uk":
        "BBC",

      "dn.se":
        "Dagens Nyheter",

      "svd.se":
        "Svenska Dagbladet",

      "aftonbladet.se":
        "Aftonbladet",

      "expressen.se":
        "Expressen",

      "people.com":
        "People",

      "variety.com":
        "Variety"
    };


    return (
      known[
        hostname
      ]
      ||
      hostname
    );


  } catch {

    return (
      source.title ||
      "Källa"
    );
  }
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
   HJÄLPARE
========================================================= */


function safeArray(
  value
) {

  return Array.isArray(
    value
  )
    ? value
    : [];
}


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


function safeIsoDate(
  value
) {

  const date =
    new Date(
      value ||
      Date.now()
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return new Date()
      .toISOString();
  }


  return date
    .toISOString();
}


function formatSwedishDate(
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
   404 / FEL
========================================================= */


function renderNotFound() {

  return simplePage(
    "Snackisen hittades inte",
    "Den här kaffekoppen verkar ha blivit bortplockad från bordet."
  );
}


function renderError() {

  return simplePage(
    "Något gick snett",
    "Kaffet är varmt, men just den här snackisen gick inte att servera."
  );
}


function simplePage(
  title,
  text
) {

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
    ${escapeHtml(title)} | Kafferasten.se
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
    ☕ ${escapeHtml(title)}
  </h1>

  <p>
    ${escapeHtml(text)}
  </p>

  <p>
    <a
      href="/"
      style="color:#C86D3B;font-weight:700;"
    >
      Till Kafferasten.se
    </a>
  </p>

</body>

</html>`;
}


/* =========================================================
   RESPONSE
========================================================= */


function htmlResponse(
  html,
  status
) {

  return new Response(
    html,
    {
      status,

      headers: {

        "Content-Type":
          "text/html; charset=utf-8",

        "Cache-Control":
          status === 200
            ? "public, max-age=300, s-maxage=300"
            : "no-store"
      }
    }
  );
}
