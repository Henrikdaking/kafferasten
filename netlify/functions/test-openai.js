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

  const todayInSweden = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .format(now)
    .replaceAll("-", "-");

  try {
    let totalUsage = {
      research1: null,
      verification1: null,
      research2: null,
      verification2: null,
      writing: null
    };

    let rejectedTopic = "";

    // Max två kandidater.
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

Dagens datum i Sverige:
${todayInSweden}

Hitta EN aktuell snackis som passar en svensk fikarast.

Det här är kandidatförsök ${candidateAttempt} av 2.

${rejectedTopic
  ? `VIKTIGT: Välj INTE samma ämne som detta tidigare underkända ämne:\n${rejectedTopic}\n`
  : ""}

KRITISKT KRAV:
Det måste finnas en verklig NY HÄNDELSE som inträffat inom de senaste 72 timmarna.

Det räcker INTE med att:
- en gammal nyhet fått en ny artikel
- någon publicerat en sammanställning idag
- ett gammalt ämne åter blivit populärt
- en sida nyligen uppdaterats

Själva händelsen måste vara ny.

Exempel på giltig ny trigger:
- premiär inom 72 timmar
- deltagare presenterades inom 72 timmar
- trailer släpptes inom 72 timmar
- nytt rekord sattes inom 72 timmar
- nytt besked gavs inom 72 timmar
- ny lansering skedde inom 72 timmar
- ny undersökning publicerades inom 72 timmar
- något blev viralt inom 72 timmar

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

Svara mycket kort:

VINNARE:
[ämnet]

FÖRESLAGEN TRIGGER:
[exakt vad som ska vara den nya händelsen]

FÖRESLAGET TRIGGERDATUM:
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
      // STEG 2: VERIFIERA SJÄLVA TRIGGERN
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

Svensk tid just nu:
${nowInSweden}

Kontrollera detta föreslagna ämne:

${researchText}

Du får INTE utgå från att ett färskt publiceringsdatum betyder att händelsen är färsk.

Ditt uppdrag:

1. Identifiera den EXAKTA händelse som skulle göra ämnet aktuellt.
2. Fastställ datumet då händelsen faktiskt inträffade.
3. Hitta EN SPECIFIK källa som uttryckligen stöder detta datum eller tydligt visar att händelsen inträffade då.
4. Hitta dessutom minst EN ANDRA oberoende källa från en annan huvuddomän som bekräftar den centrala nyheten.

KRAV:
- själva händelsen måste vara högst 72 timmar gammal
- artikelns publiceringsdatum får inte användas som bevis om händelsen är äldre
- Reddit räknas inte
- startsidor räknas inte
- två subdomäner hos samma företag räknas som samma källa
- om datumet inte går att fastställa säkert: svara NEJ
- om triggerkällan inte tydligt stöder datumet: svara NEJ

Svara exakt i detta format:

AKTUELL:
JA eller NEJ

TRIGGER:
[kort och exakt beskrivning av den nya händelsen]

TRIGGERDATUM:
[YYYY-MM-DD eller OKÄNT]

TRIGGERKÄLLA:
[namnet på källan som styrker datumet]

TRIGGERKÄLLA_URL:
[den exakta artikel- eller sidlänken]

OBEROENDE BEKRÄFTELSE:
[kort vad den andra källan bekräftar]

Använd källhänvisningar i svaret.
`
        }
      });

      if (!verification.ok) {
        return jsonResponse({
          success: false,
          stage: `verification-${candidateAttempt}`,
          statusFromOpenAI: verification.status,
          error: verification.data.error || verification.data
        });
      }

      if (candidateAttempt === 1) {
        totalUsage.verification1 = verification.data.usage || null;
      } else {
        totalUsage.verification2 = verification.data.usage || null;
      }

      const verificationTextPart = getOutputTextPart(verification.data);
      const verificationText = verificationTextPart?.text || "";
      const verificationSources = extractCitedSources(verificationTextPart);

      const isFresh = /AKTUELL:\s*JA/i.test(verificationText);

      const triggerDate = extractField(
        verificationText,
        "TRIGGERDATUM"
      );

      const triggerDescription = extractField(
        verificationText,
        "TRIGGER"
      );

      const triggerSourceUrl = extractField(
        verificationText,
        "TRIGGERKÄLLA_URL"
      );

      const triggerSourceName = extractField(
        verificationText,
        "TRIGGERKÄLLA"
      );

      const validTriggerDate =
        triggerDate &&
        triggerDate !== "OKÄNT" &&
        isDateWithinHours(triggerDate, now, 72);

      const allSources = dedupeSources([
        ...researchSources,
        ...verificationSources
      ]);

      const distinctSources = getDistinctDomainSources(allSources);

      const triggerSourceActuallyExists =
        triggerSourceUrl &&
        allSources.some(source =>
          normalizeUrl(source.url) === normalizeUrl(triggerSourceUrl)
        );

      const candidatePassed =
        isFresh &&
        validTriggerDate &&
        triggerSourceActuallyExists &&
        distinctSources.length >= 2;

      if (!candidatePassed) {
        rejectedTopic = researchText;

        if (candidateAttempt === 1) {
          continue;
        }

        return jsonResponse({
          success: false,
          stage: "final-verification",
          error:
            "Ingen kandidat klarade kraven på verifierad färsk trigger och två oberoende källor.",
          lastResearchText: researchText,
          lastVerificationText: verificationText,
          triggerDate,
          triggerDescription,
          triggerSourceUrl,
          sources: distinctSources,
          usage: {
            ...totalUsage,
            totalTokens: calculateTotalTokens(totalUsage)
          }
        });
      }

      const selectedSources = selectSources(
        distinctSources,
        triggerSourceUrl
      );

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

Den verifierade färska händelsen är:

TRIGGER:
${triggerDescription}

TRIGGERDATUM:
${triggerDate}

TRIGGERKÄLLA:
${triggerSourceName}

TRIGGERKÄLLA_URL:
${triggerSourceUrl}

ÖVRIG RESEARCH:
${researchText}

FAKTAKONTROLL:
${verificationText}

GODKÄNDA KÄLLOR:
${selectedSources
  .map(
    (source, index) =>
      `${index + 1}. ${source.title} – ${source.url}`
  )
  .join("\n")}

VIKTIGA REGLER:
- använd bara verifierade fakta ovan
- TRIGGERDATUM får inte ändras
- hitta aldrig på datum
- hitta aldrig på citat
- hitta aldrig på siffror
- hitta aldrig på personer eller detaljer
- det som är NYTT nu ska stå tydligt tidigt i artikeln
- skriv enkelt så att en 20-åring förstår
- kort, lättsam och fikavänlig ton
- inte stel nyhetsbyråtext
- undvik clickbait
- skriv 2 till 3 korta stycken
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

      // Extra spärr:
      // skribenten får inte ändra det verifierade datumet.
      if (article.triggerDate !== triggerDate) {
        return jsonResponse({
          success: false,
          stage: "writing-verification",
          error:
            "Skrivfasen ändrade det verifierade triggerdatumet och artikeln stoppades.",
          verifiedTriggerDate: triggerDate,
          articleTriggerDate: article.triggerDate
        });
      }

      return jsonResponse({
        success: true,
        generatedAt: nowInSweden,
        candidateAttempt,

        verifiedTrigger: {
          description: triggerDescription,
          date: triggerDate,
          sourceName: triggerSourceName,
          sourceUrl: triggerSourceUrl
        },

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


function extractField(text, fieldName) {
  const regex = new RegExp(
    `${fieldName}:\\s*([^\\n\\r]+)`,
    "i"
  );

  const match = text.match(regex);

  return match
    ? match[1].trim()
    : null;
}


function dedupeSources(sources) {
  return sources.filter(
    (source, index, array) =>
      index ===
      array.findIndex(
        item =>
          normalizeUrl(item.url) === normalizeUrl(source.url)
      )
  );
}


function normalizeUrl(url) {
  try {
    const parsed = new URL(url);

    parsed.searchParams.delete("utm_source");
    parsed.searchParams.delete("utm_medium");
    parsed.searchParams.delete("utm_campaign");

    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}


// commercial.tv4.se och tv4.se blir båda tv4.se
function getDomain(url) {
  try {
    const hostname = new URL(url)
      .hostname
      .replace(/^www\./, "");

    const parts = hostname.split(".");

    if (parts.length >= 2) {
      return parts.slice(-2).join(".");
    }

    return hostname;

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


function selectSources(sources, triggerSourceUrl) {
  const normalizedTrigger =
    normalizeUrl(triggerSourceUrl);

  const triggerSource = sources.find(
    source =>
      normalizeUrl(source.url) === normalizedTrigger
  );

  const others = sources.filter(
    source =>
      normalizeUrl(source.url) !== normalizedTrigger
  );

  const result = [];

  if (triggerSource) {
    result.push(triggerSource);
  }

  result.push(...others);

  return result.slice(0, 3);
}


function isDateWithinHours(dateString, now, maxHours) {
  try {
    const eventDate = new Date(
      `${dateString}T23:59:59+02:00`
    );

    if (Number.isNaN(eventDate.getTime())) {
      return false;
    }

    const diffMs =
      now.getTime() - eventDate.getTime();

    const maxMs =
      maxHours * 60 * 60 * 1000;

    // framtidsdatum ska inte godkännas
    if (diffMs < 0) {
      return false;
    }

    return diffMs <= maxMs;

  } catch {
    return false;
  }
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
