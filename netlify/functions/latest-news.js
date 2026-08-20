import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const store = getStore("kafferasten-news");

    const latest = await store.get("latest", {
      type: "json",
      consistency: "strong"
    });

    if (!latest) {
      return new Response(
        JSON.stringify(
          {
            success: false,
            error: "Ingen sparad artikel finns ännu."
          },
          null,
          2
        ),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    return new Response(
      JSON.stringify(
        {
          success: true,
          latest
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",

          // Lite cache är bra här eftersom artikeln
          // ändå bara byts två gånger per arbetsdag.
          "Cache-Control": "public, max-age=60, s-maxage=60"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          success: false,
          error: "Kunde inte läsa senaste artikeln.",
          details: error.message
        },
        null,
        2
      ),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }
};
