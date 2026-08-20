import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const store = getStore("kafferasten-news");

    const testArticle = {
      title: "Kafferasten testar lagring ☕",
      summary: "Om du ser detta fungerar Netlify Blobs.",
      createdAt: new Date().toISOString()
    };

    // Spara ett testobjekt
    await store.setJSON("test", testArticle);

    // Läs tillbaka samma objekt direkt
    const savedArticle = await store.get("test", {
      type: "json",
      consistency: "strong"
    });

    return new Response(
      JSON.stringify(
        {
          success: true,
          message: "Netlify Blobs fungerar!",
          savedArticle
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          success: false,
          error: "Kunde inte skriva/läsa Netlify Blobs",
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
