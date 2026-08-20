import { getStore } from "@netlify/blobs";

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

  const store = getStore("kafferasten-news");

  try {
    let totalUsage = {
      research1: null,
      verification1: null,
      research2: null,
      verification2: null,
      writing: null
    };

    let rejectedTopic = "";

    for (let candidateAttempt = 1; candidateAttempt <= 2; candidateAttempt++) {

      // =====================================================
      // STEG 1: HITTA KANDIDAT
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

Svensk tid:
${nowInSweden}

Hitta EN aktuell snackis som passar riktigt bra vid en svensk fikarast.

Detta är kandidatförsök ${candidateAttempt} av 2.

KRAV:
Själva händelsen måste ha inträffat under de senaste 72 timmarna.

En ny artikel om en gammal händelse räcker inte.

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

Använd inte Reddit som källa.

${rejectedTopic
  ? `Välj INTE detta tidigare underkända ämne:\n${rejectedTopic}`
  : ""}

Svara kort:

VINNARE:
[ämnet]

FÄRSK TRIGGER:
[exakt vad som nyligen hänt]

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
          error: research.data.error || research.data
        });
      }

      if (candidateAttempt === 1) {
        totalUsage.research1 = research.data.usage || null;
      } else {
        totalUsage.research2 = research.data.usage || null;
      }

      const researchPart = getOutputTextPart(research.data);
      const researchText = researchPart?.text || "";

      const researchSources = filterAllowedSources(
        extractCitedSources(researchPart)
      );

      // =====================================================
      // STEG 2: VERIFIERA TRIGGER + KÄLLOR
      // =====================================================

      const verification = await callOpenAI({
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
Du är faktakontrollant för Kafferasten.se.

Svensk tid:
${nowInSweden}

Kontrollera:

${researchText}

Du ska:

1. kontrollera själva händelsen
2. fastställa datumet för triggern
3. hitta minst två oberoende källor
4. säkerställa att händelsen är högst 72 timmar gammal

Använd inte:
- Reddit
- forum
- startsidor
- rena sociala medier som verifieringskälla

Prioritera:
- etablerade medier
- officiella organisationer
- officiella pressidor
- etablerade branschmedier

Två sidor från samma organisation räknas inte som två oberoende källor.

Svara exakt:

AKTUELL:
JA eller NEJ

TRIGGER:
[kort beskrivning]

TRIGGERDATUM:
[YYYY-MM-DD eller OKÄNT]

BEKRÄFTELSE:
[kort sammanfattning]

Använd källhänvisningar.
`
        }
      });

      if (!verification.ok) {
        return jsonResponse({
          success: false,
          stage: `verification-${candidateAttempt}`,
          error: verification.data.error || verification.data
        });
      }

      if (candidateAttempt === 1) {
        totalUsage.verification1 = verification.data.usage || null;
      } else {
        totalUsage.verification2 = verification.data.usage || null;
      }

      const verificationPart = getOutputTextPart(verification.data);
      const verificationText = verificationPart?.text || "";

      const verificationSources = filterAllowedSources(
        extractCitedSources(verificationPart)
      );

      const saysCurrent =
        /AKTUELL:\s*JA/i.test(verificationText);

      const triggerDate =
        extractTriggerDate(verificationText);

      const triggerDescription =
        extractField(verificationText, "TRIGGER");

      const allSources = dedupeSources([
        ...researchSources,
        ...verificationSources
      ]);

      const independentSources =
        getDistinctDomainSources(allSources);

      const triggerIsFresh =
        triggerDate &&
        isFreshDate(triggerDate, now, 72);

      if (
        !saysCurrent ||
        !triggerIsFresh ||
        independentSources.length < 2
      ) {
        rejectedTopic = researchText;

        if (candidateAttempt === 1) {
          continue;
        }

        return jsonResponse({
          success: false,
          stage: "verification",
          error:
            "Ingen kandidat klarade kraven på färsk trigger och två oberoende källor.",
          triggerDate,
          sources: independentSources,
          usage: {
            ...totalUsage,
            totalTokens:
              calculateTotalTokens(totalUsage)
          }
        });
      }

      const selectedSources =
        independentSources.slice(0, 3);

      const verifiedTrigger = {
        description:
          triggerDescription ||
          "Verifierad aktuell händelse",

        date: triggerDate,

        sourceName:
          selectedSources[0]?.title || "Källa",

        sourceUrl:
          selectedSources[0]?.url || null
      };

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

Skriv en färdig artikel ENBART utifrån verifierad information.

RESEARCH:
${researchText}

FAKTAKONTROLL:
${verificationText}

VERIFIERAD TRIGGER:
${verifiedTrigger.description}

TRIGGERDATUM:
${verifiedTrigger.date}

KÄLLOR:
${selectedSources
  .map(
    (source, index) =>
      `${index + 1}. ${source.title} – ${source.url}`
  )
  .join("\n")}

REGLER:
- använd bara verifierade fakta
- hitta aldrig på datum, personer, citat eller siffror
- framhäv vad som faktiskt är nytt
- skriv enkelt
- lättsam svenska
- kort och fikavänlig
- 2 eller 3 korta stycken
- ingen clickbait
- pollfrågan ska ha exakt två alternativ
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

                  triggerDate: {
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
                  "triggerDate",
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
          error: writing.data.error || writing.data
        });
      }

      totalUsage.writing =
        writing.data.usage || null;

      const writingPart =
        getOutputTextPart(writing.data);

      let article;

      try {
        article =
          JSON.parse(writingPart?.text || "");
      } catch {
        return jsonResponse({
          success: false,
          stage: "writing",
          error:
            "Artikeln kunde inte läsas som JSON."
        });
      }

      // Modellen får inte ändra triggern själv.
      article.triggerDate = triggerDate;
      article.freshTrigger =
        verifiedTrigger.description;

      // =====================================================
      // STEG 4: BYGG SPARAD POST
      // =====================================================

      const articleId =
        createArticleId(now);

      const savedNews = {
        id: articleId,

        createdAt:
          now.toISOString(),

        generatedAt:
          nowInSweden,

        verifiedTrigger,

        article,

        sources:
          selectedSources
      };

      // =====================================================
      // STEG 5: HÄMTA TIDIGARE LATEST
      // =====================================================

      const previousLatest =
        await store.get("latest", {
          type: "json",
          consistency: "strong"
        });

      // =====================================================
      // STEG 6: ARKIVERA TIDIGARE
      // =====================================================

      if (previousLatest?.id) {
        await store.setJSON(
          `archive/${previousLatest.id}`,
          previousLatest
        );
      }

      // =====================================================
      // STEG 7: SPARA NYA LATEST
      // =====================================================

      await store.setJSON(
        "latest",
        savedNews
      );

      // Spara även nya artikeln permanent i arkivet.
      await store.setJSON(
        `archive/${articleId}`,
        savedNews
      );

      return jsonResponse({
        success: true,

        message:
          "Ny artikel skapad och sparad!",

        candidateAttempt,

        latest:
          savedNews,

        archivedPrevious:
          previousLatest?.id || null,

        usage: {
          ...totalUsage,

          totalTokens:
            calculateTotalTokens(
              totalUsage
            )
        }
      });
    }

  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: "Generate-news kraschade",
        details: error.message
      },
      500
    );
  }
};


// =====================================================
// OPENAI
// =====================================================

async function callOpenAI({
  apiKey,
  body
}) {
  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        Authorization:
          `Bearer ${apiKey}`
      },

      body:
        JSON.stringify(body)
    }
  );

  const data =
    await response.json();

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}


// =====================================================
// TEXT OCH KÄLLOR
// =====================================================

function getOutputTextPart(data) {
  const message =
    data.output?.find(
      item =>
        item.type === "message"
    );

  return message?.content?.find(
    item =>
      item.type === "output_text"
  );
}


function extractCitedSources(
  textPart
) {
  return (
    textPart?.annotations
      ?.filter(
        annotation =>
          annotation.type ===
          "url_citation"
      )
      ?.map(
        annotation => ({
          title:
            annotation.title ||
            "Källa",

          url:
            annotation.url
        })
      )
      ?.filter(
        source =>
          source.url
      )
      || []
  );
}


// =====================================================
// KÄLLFILTER
// =====================================================

function filterAllowedSources(
  sources
) {
  return sources.filter(
    source => {
      try {
        const hostname =
          new URL(source.url)
            .hostname
            .toLowerCase();

        // Reddit ska aldrig användas.
        if (
          hostname === "reddit.com" ||
          hostname.endsWith(".reddit.com")
        ) {
          return false;
        }

        return true;

      } catch {
        return false;
      }
    }
  );
}


function dedupeSources(
  sources
) {
  return sources.filter(
    (
      source,
      index,
      array
    ) =>
      index ===
      array.findIndex(
        item =>
          item.url ===
          source.url
      )
  );
}


// =====================================================
// DOMÄNER
// =====================================================

function getDomain(url) {
  try {
    const hostname =
      new URL(url)
        .hostname
        .toLowerCase()
        .replace(/^www\./, "");

    const parts =
      hostname.split(".");

    const twoPartSuffixes = [
      "co.uk",
      "com.au",
      "co.nz",
      "co.jp"
    ];

    const lastTwo =
      parts
        .slice(-2)
        .join(".");

    if (
      parts.length >= 3 &&
      twoPartSuffixes.includes(
        lastTwo
      )
    ) {
      return parts
        .slice(-3)
        .join(".");
    }

    if (
      parts.length >= 2
    ) {
      return lastTwo;
    }

    return hostname;

  } catch {
    return null;
  }
}


function getDistinctDomainSources(
  sources
) {
  const seenDomains =
    new Set();

  const result = [];

  for (
    const source of sources
  ) {
    const domain =
      getDomain(source.url);

    if (
      !domain ||
      seenDomains.has(domain)
    ) {
      continue;
    }

    seenDomains.add(domain);

    result.push(source);
  }

  return result;
}


// =====================================================
// TRIGGERDATUM
// =====================================================

function extractTriggerDate(
  text
) {
  const match =
    text.match(
      /TRIGGERDATUM:\s*(\d{4}-\d{2}-\d{2})/i
    );

  return match
    ? match[1]
    : null;
}


function extractField(
  text,
  fieldName
) {
  const regex =
    new RegExp(
      `${fieldName}:\\s*([^\\n]+)`,
      "i"
    );

  const match =
    text.match(regex);

  return match
    ? match[1].trim()
    : null;
}


function isFreshDate(
  dateString,
  now,
  hours
) {
  try {
    const trigger =
      new Date(
        `${dateString}T23:59:59Z`
      );

    const difference =
      now.getTime() -
      trigger.getTime();

    const maxAge =
      hours *
      60 *
      60 *
      1000;

    return (
      difference <= maxAge &&
      difference >
        -(24 * 60 * 60 * 1000)
    );

  } catch {
    return false;
  }
}


// =====================================================
// ARTIKEL-ID
// =====================================================

function createArticleId(
  date
) {
  const formatter =
    new Intl.DateTimeFormat(
      "sv-SE",
      {
        timeZone:
          "Europe/Stockholm",

        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",

        hour12: false
      }
    );

  return formatter
    .format(date)
    .replace(/\D/g, "");
}


// =====================================================
// TOKENRÄKNING
// =====================================================

function calculateTotalTokens(
  usageObject
) {
  return Object.values(
    usageObject
  )
    .filter(Boolean)
    .reduce(
      (
        sum,
        usage
      ) =>
        sum +
        (
          usage.total_tokens ||
          0
        ),
      0
    );
}


// =====================================================
// JSON
// =====================================================

function jsonResponse(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),

    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store"
      }
    }
  );
}

export const config = {
  background: true
};
