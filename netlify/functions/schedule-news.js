export default async (request) => {
  try {
    // Vilken tid är det i Sverige just nu?
    const stockholmParts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Stockholm",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(new Date());

    const hour = Number(
      stockholmParts.find(part => part.type === "hour")?.value
    );

    const minute = Number(
      stockholmParts.find(part => part.type === "minute")?.value
    );

    // Vi vill bara publicera kl 07 eller 13 svensk tid.
    const shouldGenerate =
      minute === 0 &&
      (hour === 7 || hour === 13);

    if (!shouldGenerate) {
      console.log(
        `Ingen publicering nu. Svensk tid: ${hour}:${String(minute).padStart(2, "0")}`
      );

      return new Response(null, {
        status: 204
      });
    }

    // Hitta samma domän som scheduled-funktionen körs på.
    const url = new URL(
      "/.netlify/functions/generate-news-background",
      request.url
    );

    const response = await fetch(url, {
      method: "POST"
    });

    console.log(
      `Generate-news startad. Status: ${response.status}. Svensk tid: ${hour}:${String(minute).padStart(2, "0")}`
    );

    return new Response(null, {
      status: 204
    });

  } catch (error) {
    console.error(
      "Kunde inte starta generate-news:",
      error
    );

    return new Response(null, {
      status: 500
    });
  }
};


// Kör varje heltimme.
// Funktionen själv avgör om svensk tid är 07.00 eller 13.00.
export const config = {
  schedule: "0 * * * 1-5"
};
