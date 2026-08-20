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

  const nowInSweden = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    dateStyle: "full",
    timeStyle: "short"
  }).format(new Date());

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",

        reasoning: {
          effort: "low"
        },

        tools: [
          {
            type: "web_search",
            search_context_size: "low",
            user_location: {
              type: "approximate",
              country: "SE",
              timezone: "Europe/Stockholm"
            }
          }
        ],

        input: `
Du är redaktionen för Kafferasten.se.

TID I SVERIGE:
${nowInSweden}

UPPDRAG:
Sök på webben och hitta flera aktuella svenska nyheter.
Välj sedan EN vinnare som är bäst att prata om på en svensk arbetsplats
vid fikarasten klockan 09 eller 15.

NYHETEN SKA:
- helst vara från de senaste 24 timmarna
- vara lätt att förstå utan förkunskaper
- väcka åsikter, igenkänning eller nyfikenhet
- vara positiv, underhållande, oväntad eller lagom skvallrig
- kännas som något kollegor faktiskt skulle säga "har ni hört...?" om

PRIORITERA:
- nöje, TV, streaming och populärkultur
- arbetsliv och vardagsfenomen
- teknik och konsumentnyheter
- märkliga eller roliga riktiga nyheter
- bred sport
- svenska snackisar
- fenomen som många svenskar kan ha en åsikt om

UNDVIK:
- krig
- dödsfall
- tragedier
- grova brott
- katastrofer
- tung partipolitik
- allvarliga sjukdomar
- rena börsnyheter
- gamla nyheter som presenteras som nya

KÄLLKRAV:
- nyheten måste vara verklig
- använd minst två trovärdiga källor om möjligt
- länkar ska gå till den faktiska artikeln, inte startsidan
- hitta aldrig på citat, personer, siffror eller händelser
- om uppgifterna inte går att verifiera: välj en annan nyhet

TON:
Skriv enkelt, snabbt och fikavänligt.
Inte som en traditionell nyhetsbyrå.
`
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify(
          {
            success: false,
            statusFromOpenAI: response.status,
            error: data.error || data
          },
          null,
          2
        ),
        {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        }
      );
    }

    const message = data.output?.find(item => item.type === "message");

    const outputText = message?.content?.find(
      item => item.type === "output_text"
    );

    const rawText = outputText?.text || "";

    const sources =
      outputText?.annotations
        ?.filter(annotation => annotation.type === "url_citation")
        ?.map(annotation => ({
          title: annotation.title || "Källa",
          url: annotation.url
        }))
        ?.filter(
          (source, index, array) =>
            index === array.findIndex(item => item.url === source.url)
        ) || [];

    // Be OpenAI-svaret att bli JSON-liknande data på ett enkelt sätt.
    // Om modellen inte returnerar ren JSON visar vi råtexten så vi kan felsöka.
    let article = null;

    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        article = JSON.parse(jsonMatch[0]);
      }
    } catch (_) {
      article = null;
    }

    return new Response(
      JSON.stringify(
        {
          success: true,
          generatedAt: nowInSweden,
          article: article,
          rawText: article ? null : rawText,
          sources,
          usage: data.usage || null
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
          error: "Testredaktionen kraschade",
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
