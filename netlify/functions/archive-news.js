import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const store = getStore("kafferasten-news");

    const { blobs } = await store.list({
      prefix: "archive/"
    });

    // Senaste först
    const sorted = blobs
      .sort((a, b) => b.key.localeCompare(a.key))
      .slice(0, 10);

    const articles = [];

    for (const blob of sorted) {
      const item = await store.get(blob.key, {
        type: "json",
        consistency: "strong"
      });

      if (item) {
        articles.push(item);
      }
    }

    return new Response(
      JSON.stringify(
        {
          success: true,
          count: articles.length,
          articles
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=60, s-maxage=60"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          success: false,
          error: "Kunde inte läsa arkivet.",
          details: error.message
        },
        null,
        2
      ),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );
  }
};
