exports.handler = async () => {
  try {
    const { getStore } =
      await import("@netlify/blobs");

    const store =
      getStore(
        "kafferasten-news"
      );

    const TARGET_TITLE =
      "Sista säsongen av Outer Banks är här";

    const normalize =
      value =>
        String(value || "")
          .trim()
          .toLowerCase()
          .replace(/[“”„]/g, "\"")
          .replace(/[’‘]/g, "'")
          .replace(/[–—]/g, "-")
          .replace(/\s+/g, " ");

    const listing =
      await store.list({
        prefix: "archive/"
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
            type: "json",
            consistency: "strong"
          }
        );

      const title =
        article?.article?.title ||
        "";

      if (
        normalize(title) !==
        normalize(TARGET_TITLE)
      ) {
        continue;
      }

      await store.delete(
        blob.key
      );

      deleted.push({
        key: blob.key,
        id: article?.id || null,
        title
      });
    }

    return {
      statusCode: 200,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store"
      },

      body:
        JSON.stringify(
          {
            success: true,
            deletedCount:
              deleted.length,
            deleted
          },
          null,
          2
        )
    };

  } catch (error) {
    console.error(
      "Cleanup-fel:",
      error
    );

    return {
      statusCode: 500,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8"
      },

      body:
        JSON.stringify(
          {
            success: false,
            error:
              "Cleanup misslyckades."
          },
          null,
          2
        )
    };
  }
};
