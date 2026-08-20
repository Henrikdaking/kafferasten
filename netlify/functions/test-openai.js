export default async () => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY saknas i Netlify" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
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
          effort: "none"
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

        include: [
          "web_search_call.action.sources"
        ],

        tool_choice: "auto",

        input: `
Du är chefredaktör för Kafferasten.se.

Svensk tid just nu:
${nowInSweden}

UPPDRAG:
Sök på webben efter några få aktuella svenska nyheter eller nyheter
som är tydligt relevanta för människor i Sverige.

Välj sedan EN enda vinnare som är bäst att prata om vid en svensk
arbetsplats på fikarasten.

NYHETEN SKA:
- helst vara aktuell de senaste 24 timmarna
- maximalt vara 72 timmar gammal
- vara lätt att förstå utan förkunskaper
- väcka nyfikenhet, igenkänning eller åsikter
- gärna få någon att säga "Har ni hört...?"
- vara kul, intressant, oväntad, lättsam eller lagom skvallrig

PRIORITERA:
- nöje
- TV och streaming
- populärkultur
- arbetsliv
- vardagsfenomen
- teknik
- konsumentnyheter
- udda eller roliga riktiga nyheter
- bred sport
- snackisar som många svenskar kan ha en åsikt om

UNDVIK:
- krig
- dödsfall
- tragedier
- grova brott
- katastrofer
- tung partipolitik
- allvarliga sjukdomar
- rena börsnyheter
- gamla nyheter som framställs som nya

KÄLLKRAV:
- nyheten måste vara verklig
- fakta ska verifieras med webbsökningen
- välj helst ett ämne som stöds av minst två trovärdiga källor
- använd faktiska artiklar, inte bara en mediesajt som startsida
- hitta aldrig på citat, siffror, personer eller händelser
- om ämnet inte går att verifiera: välj en annan nyhet

TON:
- enkelt
- kort
- modernt
- fikavänligt
- inte stel nyhetsbyråtext
`,

        text: {
          format: {
            type: "json_schema",
            name: "kafferasten_article",
            strict: true,

            schema: {
              type: "object",
              additionalProperties: false,

              properties: {
                title: {
                  type: "string"
                },

                category: {
                  type: "string",
                  enum: [
                    "Nöje",
                    "TV & streaming",
                    "Arbetsliv",
                    "Teknik",
                    "Sport",
                    "Vardag",
                    "Udda"
                  ]
                },

                summary: {
                  type: "string"
                },

                paragraphs: {
                  type: "array",
                  minItems: 2,
                  maxItems: 3,
                  items: {
                    type: "string"
                  }
                },

                whyTalkAboutIt: {
                  type: "array",
                  minItems: 2,
                  maxItems: 3,
                  items: {
                    type: "string"
                  }
                },

                pollQuestion: {
                  type: "string"
                },

                pollOptions: {
                  type: "array",
                  minItems: 2,
                  maxItems: 2,
                  items: {
                    type: "string"
                  }
                }
              },

              required: [
                "title",
                "category",
                "summary",
                "paragraphs",
                "whyTalkAboutIt",
                "pollQuestion",
                "pollOptions"
              ]
            }
          }
        }
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
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    const message = data.output?.find(
      item => item.type === "message"
    );

    const outputText = message?.content?.find(
      item => item.type === "output_text"
    );

    let article = null;

    try {
      article = JSON.parse(outputText?.text || "");
    } catch (_) {
      article = null;
    }

    const collectedSources = [];

    for (const item of data.output || []) {
      if (item.type === "web_search_call") {
        const webSources = item.action?.sources || [];

        for (const source of webSources) {
          if (source.url) {
            collectedSources.push({
              title: source.title || source.url,
              url: source.url
            });
          }
        }
      }
    }

    const uniqueSources = collectedSources.filter(
      (source, index, array) =>
        index === array.findIndex(
          item => item.url === source.url
        )
    );

    return new Response(
      JSON.stringify(
        {
          success: true,
          generatedAt: nowInSweden,
          article,
          sources: uniqueSources,
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
