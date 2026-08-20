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
    // STEG 1: FÖRSTA RESEARCHEN
    // =========================================================

    const firstResearch = await callOpenAI({
      apiKey: OPENAI_API_KEY,
      body: {
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

        tool_choice: "required",

        input: `
Du är researchredaktör för Kafferasten.se.

Svensk tid just nu:
${nowInSweden}

Hitta EN aktuell och fikavänlig nyhet.

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
- saker som får folk att säga "Har ni hört?"

Undvik:
- krig
- dödsfall
- tragedier
- grova brott
- katastrofer
- tung partipolitik
- allvarliga sjukdomar
- rena börsnyheter

Aktualitet:
- helst senaste 24 timmarna
- max 72 timmar gammalt

Sök inte bredare än nödvändigt.
Välj snabbt den bästa kandidaten.

Skriv mycket kort:

VINNARE:
[ämnet]

FAKTA:
- 3 till 5 verifierade fakta

VARFÖR FIKA:
- en kort mening

Använd källhänvisningar i svaret.
`
      }
    });

    if (!firstResearch.ok) {
      return jsonResponse({
        success: false,
        stage: "research-1",
        statusFromOpenAI: firstResearch.status,
        error: firstResearch.data.error || firstResearch.data
      });
    }

    const firstTextPart = getOutputTextPart(firstResearch.data);
    const firstResearchText = firstTextPart?.text || "";

    let collectedSources = extractCitedSources(firstTextPart);

    // =========================================================
    // STEG 2: OM VI BARA HAR EN DOMÄN,
    // GÖR EN RIKTAD ANDRA KÄLLSÖKNING
    // =========================================================

    let secondResearchUsage = null;
    let secondResearchText = null;

    if (countUniqueDomains(collectedSources) < 2) {
      const secondResearch = await callOpenAI({
        apiKey: OPENAI_API_KEY,
        body: {
          model: "gpt-5.6-luna",

          reasoning: {
            effort: "none"
          },

          max_tool_calls: 2,

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

          tool_choice: "required",

          input: `
Du är faktakontrollant för Kafferasten.se.

Vi har redan valt denna nyhet:

${firstResearchText}

Ditt enda uppdrag är nu att hitta MINST EN YTTERLIGARE
oberoende och trovärdig källa som bekräftar samma centrala nyhet.

Viktigt:
- den nya källan ska helst vara från en ANNAN domän än den redan citerade
- använd inte Reddit
- använd inte en startsida
- använd en faktisk artikel eller officiell sida
- hitta inte en annan nyhet
- hitta inte på fakta
- om nyheten inte går att bekräfta, säg det tydligt

Svara mycket kort:

BEKRÄFTELSE:
- vad den andra källan bekräftar

Använd källhänvisning.
`
        }
      });

      secondResearchUsage = secondResearch.data?.usage || null;

      if (secondResearch.ok) {
        const secondTextPart = getOutputTextPart(secondResearch.data);
        secondResearchText = secondTextPart?.text || "";

        collectedSources = [
          ...collectedSources,
          ...extractCitedSources(secondTextPart)
        ];
      }
    }

    const uniqueSources = dedupeSources(collectedSources);

    // Kräv två olika domäner
    const distinctDomainSources = getDistinctDomainSources(uniqueSources);

    if (distinctDomainSources.length < 2) {
      return jsonResponse({
        success: false,
        stage: "source-check",
        error: "Nyheten kunde inte verifieras med två oberoende källor.",
        researchText: firstResearchText,
        secondResearchText,
        sources: distinctDomainSources,
        usage: {
          research1: firstResearch.data.usage || null,
          research2: secondResearchUsage,
          totalTokens:
            (firstResearch.data.usage?.total_tokens || 0) +
            (secondResearchUsage?.total_tokens || 0)
        }
      });
    }

    const selectedSources = distinctDomainSources.slice(0, 3);

    // =========================================================
    // STEG 3: SKRIV ARTIKELN
    // INGEN WEBBSÖKNING HÄR
    // =========================================================

    const writing = await callOpenAI({
      apiKey: OPENAI_API_KEY,
      body: {
        model: "gpt-5.6-luna",

        reasoning: {
          effort: "none"
        },

        input: `
Du är skribent på Kafferasten.se.

Skriv en färdig artikel ENBART utifrån researchen och källorna nedan.

RESEARCH 1:
${firstResearchText}

${secondResearchText ? `RESEARCH 2:\n${secondResearchText}\n` : ""}

KÄLLOR:
${selectedSources
  .map((source, index) => `${index + 1}. ${source.title} – ${source.url}`)
  .join("\n")}

Regler:
- använd bara verifierade fakta från researchen
- hitta aldrig på citat, siffror, datum eller detaljer
- skriv enkelt så att en 20-åring förstår
- lättsam, kvick och fikavänlig ton
- inte stel nyhetsbyråtext
- rubriken ska vara kort och lockande
- 2 till 3 korta brödtextstycken
- gör ämnet lätt att börja prata om på jobbet
- pollfrågan ska ha exakt två tydliga alternativ
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
      }
    });

    if (!writing.ok) {
      return jsonResponse({
        success: false,
        stage: "writing",
        statusFromOpenAI: writing.status,
        error: writing.data.error || writing.data,
        sources: selectedSources
      });
    }

    const writingTextPart = getOutputTextPart(writing.data);

    let article;

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
        research1: firstResearch.data.usage || null,
        research2: secondResearchUsage,
        writing: writing.data.usage || null,

        totalTokens:
          (firstResearch.data.usage?.total_tokens || 0) +
          (secondResearchUsage?.total_tokens || 0) +
          (writing.data.usage?.total_tokens || 0)
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


// =========================================================
// HJÄLPFUNKTIONER
// =========================================================

async function callOpenAI({ apiKey, body }) {
  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}


function getOutputTextPart(data) {
  const message = data.output?.find(
    item => item.type === "message"
  );

  return message?.content?.find(
    item => item.type === "output_text"
  );
}


function extractCitedSources(textPart) {
  return (
    textPart?.annotations
      ?.filter(annotation => annotation.type === "url_citation")
      ?.map(annotation => ({
        title: annotation.title || "Källa",
        url: annotation.url
      }))
      ?.filter(source => source.url) || []
  );
}


function dedupeSources(sources) {
  return sources.filter(
    (source, index, array) =>
      index === array.findIndex(item => item.url === source.url)
  );
}


function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}


function countUniqueDomains(sources) {
  return new Set(
    sources
      .map(source => getDomain(source.url))
      .filter(Boolean)
  ).size;
}


function getDistinctDomainSources(sources) {
  const seenDomains = new Set();
  const result = [];

  for (const source of sources) {
    const domain = getDomain(source.url);

    if (!domain || seenDomains.has(domain)) {
      continue;
    }

    seenDomains.add(domain);
    result.push(source);
  }

  return result;
}


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
