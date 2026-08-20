export default async () => {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    return jsonResponse(
      {
        success: false,
        error: "OPENAI_API_KEY saknas i Netlify"
      },
      500
    );
  }

  const nowInSweden = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    dateStyle: "full",
    timeStyle: "short"
  }).format(new Date());

  try {
    // =========================================================
    // STEG 1: RESEARCH
    // Hitta EN fikavänlig nyhet och 2-3 relevanta källor.
    // =========================================================

    const researchResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },

        body: JSON.stringify({
          model: "gpt-5.6-luna",

          reasoning: {
            effort: "none"
          },

          max_tool_calls: 3,

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
Du är researchredaktör för Kafferasten.se.

Svensk tid just nu:
${nowInSweden}

Ditt enda jobb är att hitta EN riktigt bra aktuell snackis
för en svensk arbetsplats.

Sök inte brett i onödan.
Titta på några få kandidater och välj snabbt den bästa.

Prioritera:
- nöje
- TV och streaming
- populärkultur
- arbetsliv
- vardagsfenomen
- teknik
- konsumentnyheter
- udda eller roliga nyheter
- bred sport
- sådant som får folk att säga "Har ni hört?"

Undvik:
- krig
- dödsfall
- tragedier
- grova brott
- katastrofer
- tung partipolitik
- allvarliga sjukdomar
- rena börsnyheter

AKTUALITET:
Helst senaste 24 timmarna.
Maximalt 72 timmar gammalt.

KÄLLKRAV:
Välj bara ett ämne som kan verifieras.
Använd 2 eller 3 relevanta trovärdiga källor om möjligt.
Citera endast källor som faktiskt stöder den VALDA nyheten.
Använd inte Reddit som huvudkälla.
Använd helst redaktionella medier, officiella källor eller etablerade branschkällor.

Skriv sedan en MYCKET KORT researchrapport:

VINNARE:
[ämnet]

FAKTA:
- 3 till 5 verifierade fakta

VARFÖR FIKA:
- en kort mening

Använd källhänvisningar i svaret.
`
        })
      }
    );

    const researchData = await researchResponse.json();

    if (!researchResponse.ok) {
      return jsonResponse({
        success: false,
        stage: "research",
        statusFromOpenAI: researchResponse.status,
        error: researchData.error || researchData
      });
    }

    const researchMessage = researchData.output?.find(
      item => item.type === "message"
    );

    const researchTextPart = researchMessage?.content?.find(
      item => item.type === "output_text"
    );

    const researchText = researchTextPart?.text || "";

    // Vi tar bara de källor som modellen faktiskt citerade
    // i den valda researchrapporten.
    const citedSources =
      researchTextPart?.annotations
        ?.filter(annotation => annotation.type === "url_citation")
        ?.map(annotation => ({
          title: annotation.title || "Källa",
          url: annotation.url
        }))
        ?.filter(
          (source, index, array) =>
            source.url &&
            index === array.findIndex(item => item.url === source.url)
        ) || [];

    // Hård säkerhetsregel:
    // ingen färdig artikel utan minst två källor.
    if (citedSources.length < 2) {
      return jsonResponse({
        success: false,
        stage: "research",
        error: "Researchen hittade färre än två relevanta källor.",
        researchText,
        sources: citedSources,
        researchUsage: researchData.usage || null
      });
    }

    // Max tre källor vidare till skrivfasen.
    const selectedSources = citedSources.slice(0, 3);

    // =========================================================
    // STEG 2: SKRIV ARTIKEL
    // Ingen webbsökning här. Bara researchen ovan.
    // =========================================================

    const writingResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },

        body: JSON.stringify({
          model: "gpt-5.6-luna",

          reasoning: {
            effort: "none"
          },

          input: `
Du är skribent på Kafferasten.se.

Skriv EN färdig fikavänlig artikel enbart utifrån researchen nedan.

RESEARCH:
${researchText}

KÄLLOR:
${selectedSources
  .map((source, index) => `${index + 1}. ${source.title} – ${source.url}`)
  .join("\n")}

REGLER:
- använd bara fakta som finns i researchen
- hitta aldrig på citat, siffror eller detaljer
- skriv enkelt så att en 20-åring förstår
- lättsam och nyfiken ton
- inte kvällstidningsöverdriven
- rubriken ska vara kort och lockande
- 2 eller 3 korta brödtextstycken
- gör ämnet lätt att börja prata om på jobbet
- pollfrågan ska ha exakt två tydliga svarsalternativ
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
      }
    );

    const writingData = await writingResponse.json();

    if (!writingResponse.ok) {
      return jsonResponse({
        success: false,
        stage: "writing",
        statusFromOpenAI: writingResponse.status,
        error: writingData.error || writingData,
        sources: selectedSources
      });
    }

    const writingMessage = writingData.output?.find(
      item => item.type === "message"
    );

    const writingTextPart = writingMessage?.content?.find(
      item => item.type === "output_text"
    );

    let article = null;

    try {
      article = JSON.parse(writingTextPart?.text || "");
    } catch {
      return jsonResponse({
        success: false,
        stage: "writing",
        error: "Den färdiga artikeln kunde inte läsas som JSON.",
        rawText: writingTextPart?.text || null,
        sources: selectedSources
      });
    }

    return jsonResponse({
      success: true,
      generatedAt: nowInSweden,

      article,

      sources: selectedSources,

      usage: {
        research: researchData.usage || null,
        writing: writingData.usage || null,
        totalTokens:
          (researchData.usage?.total_tokens || 0) +
          (writingData.usage?.total_tokens || 0)
      }
    });

  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: "Testredaktionen kraschade",
        details: error.message
      },
      500
    );
  }
};

function jsonResponse(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
