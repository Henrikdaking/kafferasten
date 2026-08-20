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

        tool_choice: "auto",

        input: `
Du är chefredaktör för Kafferasten.se.

Svensk tid just nu:
${nowInSweden}

Hitta några få aktuella nyheter från Sverige eller nyheter som är
tydligt relevanta för svenskar.

Välj sedan EN enda vinnare som är bäst att prata om vid en svensk fikarast.

Prioritera:
- nöje
- TV och streaming
- populärkultur
- arbetsliv
- vardagsfenomen
- teknik
- konsumentnyheter
- udda eller roliga riktiga nyheter
- bred sport
- saker som får folk att säga "har ni hört?"

Nyheten ska helst vara publicerad eller aktuell de senaste 24 timmarna.
Gå maximalt 72 timmar tillbaka.

Undvik:
- krig
- tragedier
- dödsfall
- grova brott
- katastrofer
- tung partipolitik
- allvarliga sjukdomar
- rena börsnyheter

Viktigt:
- välj inte en nyhet bara för att den är stor
- välj den som har bäst fikapotential
- verifiera fakta via webben
- hitta aldrig på uppgifter
- använd riktiga artiklar som källor
- håll texten kort och lättläst
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

    const sources =
      outputText?.annotations
        ?.filter(annotation => annotation.type === "url_citation")
        ?.map(annotation => ({
          title: annotation.title || "Källa",
          url: annotation.url
        }))
        ?.filter(
          (source, index, array) =>
            index === array.findIndex(
              item => item.url === source.url
            )
        ) || [];

    return new Response(
      JSON.stringify(
        {
          success: true,
          generatedAt: nowInSweden,
          article,
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
