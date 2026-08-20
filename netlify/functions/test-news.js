const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async () => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY saknas i Netlify" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }

  const nowInSweden = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  const prompt = `
Du är redaktionen för Kafferasten.se.

NUVARANDE TID I SVERIGE:
${nowInSweden}

Hitta med Google Search den bästa aktuella snackisen för en svensk kafferast.

Prioritera:
- underhållning, TV, streaming och populärkultur
- arbetsliv och vardagsfenomen
- teknik och konsumentnyheter
- märkliga, roliga eller oväntade riktiga nyheter
- sport när ämnet är brett och samtalsvänligt
- svenska trender som många kan ha en åsikt om

Undvik:
- krig
- dödsfall och tragedier
- grova brott
- katastrofer
- tung partipolitik
- börsrapporter
- allvarliga sjukdomar

Prioritera sådant som hänt de senaste 24 timmarna.
Du får gå upp till 72 timmar tillbaka om ämnet är exceptionellt bra.

Nyheten måste vara verklig.
Använd minst två trovärdiga webbkällor när det är möjligt.
Använd de faktiska artiklarna, inte mediernas startsidor.
Hitta aldrig på citat, siffror, personer eller händelser.

Välj EN vinnare.

Returnera ENBART giltig JSON:

{
  "title": "kort och lockande svensk rubrik",
  "category": "Nöje, Arbetsliv, Teknik, Sport, Vardag eller Udda",
  "summary": "2-3 meningar som snabbt förklarar vad som hänt",
  "paragraphs": [
    "första korta stycket",
    "andra korta stycket",
    "tredje korta stycket"
  ],
  "whyTalkAboutIt": [
    "kort punkt 1",
    "kort punkt 2",
    "kort punkt 3"
  ],
  "pollQuestion": "en enkel fråga som folk kan diskutera",
  "pollOptions": [
    "alternativ 1",
    "alternativ 2"
  ]
}
`;

  const diagnostics = [];

  async function callGemini(attempt) {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          tools: [
            {
              google_search: {},
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
          },
        }),
      }
    );

    const data = await response.json();

    diagnostics.push({
      attempt,
      status: response.status,
      ok: response.ok,
    });

    return { response, data };
  }

  try {
    let result = await callGemini(1);

    if (
      !result.response.ok &&
      (result.response.status === 429 ||
        result.response.status === 503)
    ) {
      await sleep(2000);
      result = await callGemini(2);
    }

    if (!result.response.ok) {
      return new Response(
        JSON.stringify(
          {
            success: false,
            error: "Gemini misslyckades efter två försök",
            diagnostics,
            details: result.data,
          },
          null,
          2
        ),
        {
          status: result.response.status,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        }
      );
    }

    const candidate = result.data.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text;

    if (!rawText) {
      return new Response(
        JSON.stringify(
          {
            success: false,
            error: "Gemini svarade men skickade ingen artikel",
            diagnostics,
            details: result.data,
          },
          null,
          2
        ),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        }
      );
    }

    let article;

    try {
      article = JSON.parse(rawText);
    } catch {
      return new Response(
        JSON.stringify(
          {
            success: false,
            error: "Artikelns JSON kunde inte läsas",
            diagnostics,
            rawText,
          },
          null,
          2
        ),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        }
      );
    }

    const groundingChunks =
      candidate?.groundingMetadata?.groundingChunks || [];

    const sources = groundingChunks
      .filter((chunk) => chunk.web?.uri)
      .map((chunk) => ({
        name: chunk.web.title || "Källa",
        url: chunk.web.uri,
      }))
      .filter(
        (source, index, array) =>
          index === array.findIndex((item) => item.url === source.url)
      );

    return new Response(
      JSON.stringify(
        {
          success: true,
          generatedAt: nowInSweden,
          diagnostics,
          article,
          sources,
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          success: false,
          error: "Något gick fel i testredaktionen",
          diagnostics,
          details: error.message,
        },
        null,
        2
      ),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  }
};
