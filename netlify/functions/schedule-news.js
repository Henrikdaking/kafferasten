export default async (request) => {
  try {
    const CRON_SECRET =
      process.env.KAFFERASTEN_CRON_SECRET;

    if (!CRON_SECRET) {
      console.error(
        "KAFFERASTEN_CRON_SECRET saknas."
      );

      return new Response(
        null,
        {
          status: 500
        }
      );
    }

    const stockholmParts =
      new Intl.DateTimeFormat(
        "sv-SE",
        {
          timeZone:
            "Europe/Stockholm",

          hour:
            "2-digit",

          minute:
            "2-digit",

          hour12:
            false
        }
      )
        .formatToParts(
          new Date()
        );

    const hour =
      Number(
        stockholmParts
          .find(
            part =>
              part.type ===
              "hour"
          )
          ?.value
      );

    const minute =
      Number(
        stockholmParts
          .find(
            part =>
              part.type ===
              "minute"
          )
          ?.value
      );

    // Bara 07.00 och 13.00 svensk tid.
    //
    // Funktionen körs varje hel timme på vardagar
    // men startar generatorn endast vid dessa två tider.
    //
    // Själva artikeln kan bli färdig några minuter senare.

const shouldGenerate =
  minute === 0 &&
  (
    hour === 7 ||
    hour === 13
  );

    if (!shouldGenerate) {
      console.log(
        `Ingen publicering nu. Svensk tid: ${hour}:${String(minute).padStart(2, "0")}`
      );

      return new Response(
        null,
        {
          status: 204
        }
      );
    }

    const generateUrl =
      new URL(
        "/.netlify/functions/generate-news-background",
        request.url
      );

    const response =
      await fetch(
        generateUrl,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${CRON_SECRET}`
          }
        }
      );

    console.log(
      `Generate-news startad. Status ${response.status}. Svensk tid ${hour}:${String(minute).padStart(2, "0")}`
    );

    return new Response(
      null,
      {
        status: 204
      }
    );

  } catch (error) {
    console.error(
      "Schemaläggningen misslyckades:",
      error
    );

    return new Response(
      null,
      {
        status: 500
      }
    );
  }
};

export const config = {
  schedule:
    "0 * * * 1-5"
};
