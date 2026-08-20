export default async () => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY saknas i Netlify" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }
    );
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        tools: [
          {
            type: "web_search_preview",
            search_context_size: "medium"
          }
        ],
        input: `
Du är nyhetsredaktör för Kafferasten.se.

Använd webbsökning och hitta EN aktuell svensk nyhet från de senaste 24 timmarna
som är perfekt att prata om på en svensk arbetsplats vid fikarasten.

Prioritera:
- nöje, TV och streaming
- arbetsliv och vardagsfenomen
- teknik och konsumentnyheter
- märkliga, roliga eller oväntade nyheter
- sport om ämnet är brett och lätt att diskutera
- gärna något lite skvallrigt eller överraskande

Undvik:
- krig
- dödsfall och tragedier
- grova brott
- katastrofer
- tung partipolitik
- allvarliga sjukdomar

Välj EN vinnare.

Svara på svenska med:
1. Rubrik
2. Kort sammanfattning
3. Varför den passar på fikarasten

Använd riktiga och aktuella webbkällor.
`
      })
    });

    const data = await response.json();

    const message = data.output?.find(item => item.type === "message");
    const outputText = message?.content?.find(
      item => item.type === "output_text"
    );

    const sources =
      outputText?.annotations
        ?.filter(annotation => annotation.type === "url_citation")
        ?.map(annotation => ({
          title: annotation.title,
          url: annotation.url
        })) || [];

    return new Response(
      JSON.stringify(
        {
          statusFromOpenAI: response.status,
          ok: response.ok,
          text: outputText?.text || null,
          sources,
          usage: data.usage || null,
          error: data.error || null
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
          error: "Netlify-funktionen fick ett undantag",
          message: error.message
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
