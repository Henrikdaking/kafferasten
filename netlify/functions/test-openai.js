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

  const now = new Date();

  const nowInSweden = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    dateStyle: "full",
    timeStyle: "short"
  }).format(now);

  try {
    let totalUsage = {
      research1: null,
      freshnessCheck1: null,
      research2: null,
      freshnessCheck2: null,
      writing: null
    };

    // Vi provar max två kandidater.
    for (let candidateAttempt = 1; candidateAttempt <= 2; candidateAttempt++) {
      // =====================================================
      // STEG 1: HITTA EN KANDIDAT
      // =====================================================

      const research = await callOpenAI({
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

Hitta EN aktuell snackis som passar en svensk fikarast.

Det här är kandidatförsök ${candidateAttempt} av 2.

VIKTIGT:
Nyheten måste ha en verklig NY TRIGGER som inträffat eller publicerats
de senaste 72 timmarna.

Det räcker alltså INTE att ämnet är populärt.
Något nytt måste faktiskt ha hänt.

Exempel på giltig trigger:
- premiär idag eller igår
- nytt besked
- ny deltagarlista
- ny trailer
- nytt rekord
- ny viral trend
- ny undersökning
- ny lansering
- ny oväntad händelse

Ogiltigt:
- gammal premiär
- gammal intervju
- gammalt rykte
- äldre nyhet som råkar vara intressant

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

Om detta är kandidatförsök 2:
Välj INTE samma ämne som du nyss valde.

Svara mycket kort:

VINNARE:
[ämnet]

FÄRSK TRIGGER:
[exakt vad som hände nyligen]

TRIGGERDATUM:
[YYYY-MM-DD]

FAKTA:
- 3 till 5 verifierade fakta

VARFÖR FIKA:
- en kort mening

Använd källhänvisningar.
`
        }
      });

      if (!research.ok) {
        return jsonResponse({
          success: false,
          stage: `research-${candidateAttempt}`,
          statusFromOpenAI: research.status,
          error: research.data.error || research.data
        });
      }

      const researchTextPart = getOutputTextPart(research.data);
      const researchText = researchTextPart?.text || "";
      const researchSources = extractCitedSources(researchTextPart);

      if (candidateAttempt === 1) {
        totalUsage.research1 = research.data.usage || null;
      } else {
        totalUsage.research2 = research.data.usage || null;
      }

      // =====================================================
      // STEG 2: KONTROLLERA AKTUALITET + HITTA ANDRA KÄLLAN
      // =====================================================

      const freshnessCheck = await callOpenAI({
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

Svensk tid just nu:
${nowInSweden}

Kontrollera denna kandidat:

${researchText}

Ditt uppdrag är TVÅ saker:

1. AKTUALITET
Bekräfta att det faktiskt finns en ny händelse eller publicering
kopplad till ämnet från de senaste 72 timmarna.

2. OBEROENDE KÄLLA
Hitta minst en ytterligare trovärdig källa från en ANNAN domän
som bekräftar den centrala nyheten.

Använd inte Reddit.
Använd inte startsidor.
Använd faktiska artiklar eller officiella sidor.

Svara exakt så här:

AKTUELL:
JA eller NEJ

FÄRSK TRIGGER:
[kort beskrivning]

TRIGGERDATUM:
[YYYY-MM-DD eller OKÄNT]

BEKRÄFTELSE:
[kort vad den andra källan bekräftar]

Använd källhänvisningar.
`
        }
      });

      if (!freshnessCheck.ok) {
        return jsonResponse({
          success: false,
          stage: `freshness-check-${candidateAttempt}`,
          statusFromOpenAI: freshnessCheck.status,
          error: freshnessCheck.data.error || freshnessCheck.data
        });
      }

      if (candidateAttempt === 1) {
        totalUsage.freshnessCheck1 = freshnessCheck.data.usage || null;
      } else {
        totalUsage.freshnessCheck2 = freshnessCheck.data.usage || null;
      }

      const freshnessTextPart = getOutputTextPart(freshnessCheck.data);
      const freshnessText = freshnessTextPart?.text || "";
      const freshnessSources = extractCitedSources(freshnessTextPart);

      // Hård kontroll av vad modellen själv säger.
      const isFresh =
        /AKTUELL:\s*JA/i.test(freshnessText);

      const allSources = dedupeSources([
        ...researchSources,
        ...freshnessSources
      ]);

      const distinctSources = getDistinctDomainSources(allSources);

      // Kandidaten faller: prova nästa.
      if (!isFresh || distinctSources.length < 2) {
        if (candidateAttempt === 1) {
          continue;
        }

        return jsonResponse({
          success: false,
          stage: "final-source-check",
          error:
            "Ingen kandidat klarade både aktualitetskravet och två oberoende källor.",
          lastResearchText: researchText,
          lastFreshnessText: freshnessText,
          sources: distinctSources,
          usage: {
            ...totalUsage,
            totalTokens: calculateTotalTokens(totalUsage)
          }
        });
      }

      const selectedSources = distinctSources.slice(0, 3);

      // =====================================================
      // STEG 3: SKRIV ARTIKEL
      // =====================================================

      const writing = await callOpenAI({
        apiKey: OPENAI_API_KEY,

        body: {
          model: "gpt-5.6-luna",

          reasoning: {
            effort: "none"
          },

          input: `
Du är skribent på Kafferasten.se.

Svensk tid:
${nowInSweden}

Skriv en färdig artikel ENBART utifrån verifierad research nedan.

RESEARCH:
${researchText}

AKTUALITETSKONTROLL:
${freshnessText}

KÄLLOR:
${selectedSources
  .map(
    (source, index) =>
      `${index + 1}. ${source.title} – ${source.url}`
  )
  .join("\n")}

Regler:
- använd bara verifierade fakta
- hitta aldrig på datum, citat, siffror eller personer
- framhäv det som faktiskt är NYTT nu
- skriv enkelt så att en 20-åring förstår
- kort, lättsam och fikavänlig ton
- inte stel nyhetsbyråtext
- rubriken ska vara kort och lockande
- 2 till 3 korta stycken
- undvik clickbait
- pollen ska ha exakt två tydliga alternativ
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

                  freshTrigger: {
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
                  "freshTrigger",
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

      totalUsage.writing = writing.data.usage || null;

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
        candidateAttempt,
        article,
        sources: selectedSources,

        usage: {
          ...totalUsage,
          totalTokens: calculateTotalTokens(totalUsage)
        }
      });
    }

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


// =====================================================
// HJÄLPFUNKTIONER
// =====================================================

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
      ?.filter(
        annotation =>
          annotation.type === "url_citation"
      )
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
      index ===
      array.findIndex(
        item => item.url === source.url
      )
  );
}


function getDomain(url) {
  try {
    return new URL(url)
      .hostname
      .replace(/^www\./, "");
  } catch {
    return null;
  }
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


function calculateTotalTokens(usageObject) {
  return Object.values(usageObject)
    .filter(Boolean)
    .reduce(
      (sum, usage) =>
        sum + (usage.total_tokens || 0),
      0
    );
}


function jsonResponse(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control": "no-store"
      }
    }
  );
}
