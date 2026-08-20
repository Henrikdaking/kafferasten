export default async () => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY saknas" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
Använd Google Search.

Hitta EN aktuell svensk nyhet från de senaste 24 timmarna
som passar bra att prata om på en kafferast.

Prioritera:
- nöje
- TV och streaming
- arbetsliv
- teknik
- märkliga eller roliga nyheter
- sport om ämnet är brett och lätt att diskutera

Undvik:
- krig
- tragedier
- grova brott
- tung partipolitik

Svara kort på svenska med:
1. Rubrik
2. Två meningars sammanfattning
3. Varför den passar vid fikabordet
`
                }
              ]
            }
          ],
          tools: [
            {
              google_search: {}
            }
          ]
        })
      }
    );

    const data = await response.json();

    const candidate = data.candidates?.[0];

    const text =
      candidate?.content?.parts
        ?.filter(part => part.text)
        ?.map(part => part.text)
        ?.join("\n") || null;

    const groundingChunks =
      candidate?.groundingMetadata?.groundingChunks || [];

    const sources = groundingChunks
      .filter(chunk => chunk.web?.uri)
      .map(chunk => ({
        title: chunk.web.title || "Källa",
        url: chunk.web.uri
      }));

    return new Response(
      JSON.stringify(
        {
          statusFromGemini: response.status,
          ok: response.ok,
          text,
          sources,
          rawGroundingMetadata: candidate?.groundingMetadata || null
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          error: "Netlify-funktionen fick ett undantag",
          message: error.message
        },
        null,
        2
      ),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
