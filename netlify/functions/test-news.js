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

Ditt jobb är att använda Google Search och hitta den bästa AKTUELLA snackisen
för en svensk kafferast.

Kafferasten.se publicerar ett ämne inför svenska arbetsplatsers fika kl 09 och 15.

VAD ÄR EN BRA KAFFERASTEN-NYHET?

Prioritera:
- underhållning, TV, streaming och populärkultur
- arbetsliv och vardagsfenomen
- teknik eller konsumentnyheter som många kan relatera till
- märkliga, roliga eller oväntade riktiga nyheter
- sport när ämnet är brett och samtalsvänligt
- svenska trender och sådant många svenskar kan ha en åsikt om
- gärna något lite skvallrigt, överraskande eller diskussionsvänligt

Undvik:
- krig
- dödsfall och tragedier
- grova brott
- katastrofer
- tung partipolitik
- börsrapporter och svår ekonominyhetsrapportering
- allvarliga sjukdomar
- gamla nyheter som presenteras som nya

AKTUALITET:
Prioritera sådant som hänt eller blivit omskrivet de senaste 24 timmarna.
Du får gå upp till 72 timmar tillbaka om ämnet är exceptionellt bra.

KÄLLOR:
Nyheten måste vara verklig.
Använd minst två trovärdiga webbkällor när det är möjligt.
Hitta de faktiska artiklarna – inte bara mediernas startsidor.
Hitta aldrig på citat, siffror, personer eller händelser.

ARBETSSÄTT:
Sök brett efter flera kandidater.
Bedöm dem utifrån aktualitet, fikavänlighet, igenkänning och diskussionspotential.
Välj sedan EN vinnare.

Returnera ENBART giltig JSON i exakt denna struktur:

{
  "title": "kort och lockande svensk rubrik",
  "category": "till exempel Nöje, Arbetsliv, Teknik eller Udda",
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
  "pollQuestion": "en enkel fråga som folk faktiskt kan diskutera vid fikabordet",
  "pollOptions": [
    "alternativ 1",
    "alternativ 2"
  ]
}
`;

  try {
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

    if (!response.ok) {
      return new Response(
        JSON.stringify(
          {
            error: "Gemini-anropet misslyckades",
            details: data,
          },
          null,
          2
        ),
        {
          status: response.status,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }

    const candidate = data.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text;

    if (!rawText) {
      return new Response(
        JSON.stringify(
          {
            error: "Gemini skickade ingen artikel",
            details: data,
          },
          null,
          2
        ),
        {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" },
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
            error: "Artikeln kom tillbaka men JSON kunde inte läsas",
            rawText,
          },
          null,
          2
        ),
        {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" },
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

    const result = {
      success: true,
      generatedAt: nowInSweden,
      article,
      sources,
    };

    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          error: "Något gick fel i testredaktionen",
          details: error.message,
        },
        null,
        2
      ),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
};
