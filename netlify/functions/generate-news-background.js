import { getStore } from "@netlify/blobs";

const STORE_NAME = "kafferasten-news";
const LOCK_KEY = "_locks/generate-news";
const STATUS_KEY = "_diagnostics/generation-status";
const HISTORY_DAYS = 14;
const HISTORY_LIMIT = 20;
const MAX_ATTEMPTS = 3;


export default async () => {

  const OPENAI_API_KEY =
    process.env.OPENAI_API_KEY;

  const PEXELS_API_KEY =
    process.env.PEXELS_API_KEY || "";

  const store =
    getStore(STORE_NAME);

  const now =
    new Date();

  const runId =
    createRunId(now);

  const nowInSweden =
    formatSwedishDateTime(now);

  let generationLock =
    null;


  await saveGenerationStatus(
    store,
    {
      runId,
      status: "running",
      stage: "start",
      message:
        "Background-funktionen har startat.",
      startedAt:
        now.toISOString(),
      updatedAt:
        new Date().toISOString(),
      swedishTime:
        nowInSweden
    }
  );


  if (!OPENAI_API_KEY) {

    await saveGenerationStatus(
      store,
      {
        runId,
        status: "error",
        stage: "api-key",
        message:
          "OPENAI_API_KEY saknas i Netlify.",
        startedAt:
          now.toISOString(),
        updatedAt:
          new Date().toISOString(),
        swedishTime:
          nowInSweden
      }
    );


    return jsonResponse(
      {
        success: false,
        error:
          "OPENAI_API_KEY saknas i Netlify"
      },
      500
    );
  }


  try {

    // =====================================================
    // KÖRLÅS
    // =====================================================

    generationLock =
      await acquireGenerationLock(
        store,
        now,
        runId
      );


    if (!generationLock.acquired) {

      await saveGenerationStatus(
        store,
        {
          runId,
          status: "blocked",
          stage: "lock",
          message:
            "Körningen stoppades eftersom en annan generering redan verkar pågå.",
          lockStartedAt:
            generationLock.startedAt ||
            null,
          lockRunId:
            generationLock.runId ||
            null,
          startedAt:
            now.toISOString(),
          updatedAt:
            new Date().toISOString(),
          swedishTime:
            nowInSweden
        }
      );


      return jsonResponse(
        {
          success: false,
          skipped: true,
          stage: "lock"
        },
        409
      );
    }


    // =====================================================
    // REDAKTIONELLT MINNE
    // =====================================================

    const recentHistory =
      await loadRecentHistory({
        store,
        now,
        days:
          HISTORY_DAYS,
        limit:
          HISTORY_LIMIT
      });


    const recentTopicsForPrompt =
      formatRecentTopicsForPrompt(
        recentHistory
      );


    const totalUsage = {

      research1:
        null,

      verification1:
        null,

      research2:
        null,

      verification2:
        null,

      research3:
        null,

      verification3:
        null,

      writing:
        null
    };


    let rejectedTopic =
      "";


    // =====================================================
    // UPP TILL TRE KANDIDATER
    // =====================================================

    for (
      let candidateAttempt = 1;
      candidateAttempt <= MAX_ATTEMPTS;
      candidateAttempt++
    ) {


      // ===================================================
      // RESEARCH
      // ===================================================

      await saveGenerationStatus(
        store,
        {
          runId,
          status: "running",
          stage:
            `research-${candidateAttempt}`,
          message:
            `OpenAI letar efter kandidat ${candidateAttempt} av ${MAX_ATTEMPTS}.`,
          candidateAttempt,
          historyCount:
            recentHistory.length,
          startedAt:
            now.toISOString(),
          updatedAt:
            new Date().toISOString(),
          swedishTime:
            nowInSweden
        }
      );


      const research =
        await callOpenAI({

          apiKey:
            OPENAI_API_KEY,

          body: {

            model:
              "gpt-5.6-luna",

            reasoning: {
              effort: "none"
            },

            max_tool_calls:
              3,

            tools: [
              {
                type:
                  "web_search",

                search_context_size:
                  "low",

                user_location: {
                  type:
                    "approximate",

                  country:
                    "SE",

                  timezone:
                    "Europe/Stockholm"
                }
              }
            ],

            tool_choice:
              "required",

            input: `
Du är researchredaktör för Kafferasten.se.

Svensk tid:
${nowInSweden}

Hitta EN färsk, rolig eller intressant snackis
som passar riktigt bra vid en svensk fikarast.

Detta är kandidatförsök ${candidateAttempt} av ${MAX_ATTEMPTS}.

KRAV:

- Själva händelsen ska normalt ha inträffat under de senaste 72 timmarna.
- En ny artikel om en gammal händelse gör inte händelsen ny.
- Ämnet ska vara lätt att förstå även för den som inte redan följer nyheten.
- Det ska finnas en naturlig fikafråga eller åsikt att haka upp samtalet på.

REDAKTIONELLT MINNE – MYCKET VIKTIGT:

Kafferasten.se har redan publicerat följande ämnen
de senaste ${HISTORY_DAYS} dagarna:

${recentTopicsForPrompt || "Inga tidigare ämnen finns ännu."}

Välj INTE samma huvudsakliga:

- händelse
- premiär
- trailer
- lansering
- person + händelse
- TV-program + händelse
- film + händelse
- serie + händelse
- annan omskrivning av samma nyhet

En annan rubrik räknas inte som en ny snackis.

Prioritera gärna:

- nöje och populärkultur
- TV och streaming
- musik
- internetkultur
- virala fenomen
- teknik
- konsumentnyheter
- arbetsliv
- vardagsfenomen
- udda eller roliga nyheter
- bred sport
- svenska traditioner
- säsongsfenomen
- sådant som får folk att säga:
  "Va? Har du hört det här?"

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

Försök hitta minst två oberoende trovärdiga källor.

En stark och trovärdig källa får räcka
om nyheten tydligt kan verifieras.

${
  rejectedTopic
    ? `
VIKTIGT:

Ett tidigare förslag i denna körning har underkänts.

Välj INTE detta ämne eller en omskrivning
av samma händelse:

${rejectedTopic}
`
    : ""
}

Bedöm också vilken TON ämnet naturligt passar för:

UNGDOMLIG
= musik, gaming, sociala medier, unga kändisar,
internetfenomen eller trendig populärkultur.

BRED
= allmän snackis för många åldrar.

KLASSISK
= traditioner, vardagsfenomen, nostalgi
eller klassisk fikabordskänsla.

Svara kort i exakt denna struktur:

VINNARE:
[ämnet]

FÄRSK TRIGGER:
[exakt vad som nyligen hänt]

TRIGGERDATUM:
[YYYY-MM-DD]

TON:
[UNGDOMLIG, BRED eller KLASSISK]

FAKTA:
- 3 till 5 verifierade fakta

VARFÖR FIKA:
- en kort mening

Använd källhänvisningar i researchsvaret.
`
          }
        });


      if (!research.ok) {

        await saveGenerationStatus(
          store,
          {
            runId,
            status: "error",
            stage:
              `research-${candidateAttempt}`,
            message:
              "OpenAI-research misslyckades.",
            candidateAttempt,
            openAIStatus:
              research.status,
            openAIError:
              simplifyError(
                research.data
              ),
            startedAt:
              now.toISOString(),
            updatedAt:
              new Date().toISOString(),
            swedishTime:
              nowInSweden
          }
        );


        return jsonResponse(
          {
            success: false,
            stage:
              `research-${candidateAttempt}`
          },
          500
        );
      }


      totalUsage[
        `research${candidateAttempt}`
      ] =
        research.data.usage ||
        null;


      const researchPart =
        getOutputTextPart(
          research.data
        );


      const researchText =
        researchPart?.text ||
        "";


      const researchSources =
        filterAllowedSources(
          extractCitedSources(
            researchPart
          )
        );


      const editorialTone =
        normalizeEditorialTone(
          extractField(
            researchText,
            "TON"
          )
        );


      const byline =
        chooseByline(
          editorialTone
        );


      // ===================================================
      // FAKTAKONTROLL
      // ===================================================

      const verification =
        await callOpenAI({

          apiKey:
            OPENAI_API_KEY,

          body: {

            model:
              "gpt-5.6-luna",

            reasoning: {
              effort: "none"
            },

            max_tool_calls:
              3,

            tools: [
              {
                type:
                  "web_search",

                search_context_size:
                  "low",

                user_location: {
                  type:
                    "approximate",

                  country:
                    "SE",

                  timezone:
                    "Europe/Stockholm"
                }
              }
            ],

            tool_choice:
              "required",

            input: `
Du är faktakontrollant för Kafferasten.se.

Svensk tid:
${nowInSweden}

Kontrollera följande kandidat:

${researchText}

Du ska:

1. kontrollera att själva händelsen verkligen har inträffat
2. fastställa datumet för triggern
3. försöka hitta minst två oberoende trovärdiga källor
4. säkerställa att själva händelsen är högst 72 timmar gammal
5. skilja på artikelns publiceringsdatum och datumet då händelsen faktiskt inträffade

Två oberoende källor är önskvärt.

Men EN stark och trovärdig källa räcker
om händelsen tydligt kan verifieras.

Använd inte:

- Reddit
- forum
- tveksamma aggregatorsidor
- rena sociala medier som verifieringskälla

Svara exakt:

AKTUELL:
JA eller NEJ

TRIGGER:
[kort beskrivning av själva nya händelsen]

TRIGGERDATUM:
[YYYY-MM-DD eller OKÄNT]

BEKRÄFTELSE:
[kort sammanfattning]

Använd källhänvisningar i faktakontrollsvaret.
`
          }
        });


      if (!verification.ok) {

        await saveGenerationStatus(
          store,
          {
            runId,
            status: "error",
            stage:
              `verification-${candidateAttempt}`,
            message:
              "OpenAI-faktakontrollen misslyckades.",
            candidateAttempt,
            openAIStatus:
              verification.status,
            openAIError:
              simplifyError(
                verification.data
              ),
            startedAt:
              now.toISOString(),
            updatedAt:
              new Date().toISOString(),
            swedishTime:
              nowInSweden
          }
        );


        return jsonResponse(
          {
            success: false,
            stage:
              `verification-${candidateAttempt}`
          },
          500
        );
      }


      totalUsage[
        `verification${candidateAttempt}`
      ] =
        verification.data.usage ||
        null;


      const verificationPart =
        getOutputTextPart(
          verification.data
        );


      const verificationText =
        verificationPart?.text ||
        "";


      const verificationSources =
        filterAllowedSources(
          extractCitedSources(
            verificationPart
          )
        );


      const saysCurrent =
        /AKTUELL:\s*JA/i.test(
          verificationText
        );


      const triggerDate =
        extractTriggerDate(
          verificationText
        );


      const triggerDescription =
        extractField(
          verificationText,
          "TRIGGER"
        );


      const independentSources =
        getDistinctDomainSources(
          dedupeSources([
            ...researchSources,
            ...verificationSources
          ])
        );


      const triggerIsFresh =
        triggerDate &&
        isFreshDate(
          triggerDate,
          now,
          72
        );


      if (
        !saysCurrent ||
        !triggerIsFresh ||
        independentSources.length < 1
      ) {

        rejectedTopic =
          researchText;


        await saveGenerationStatus(
          store,
          {
            runId,

            status:
              candidateAttempt <
              MAX_ATTEMPTS
                ? "running"
                : "rejected",

            stage:
              `candidate-${candidateAttempt}-rejected`,

            message:
              "Kandidaten underkändes eftersom den inte klarade färskhets- eller källkraven.",

            candidateAttempt,

            saysCurrent,

            triggerDate:
              triggerDate ||
              null,

            triggerIsFresh:
              Boolean(
                triggerIsFresh
              ),

            independentSources:
              independentSources.length,

            startedAt:
              now.toISOString(),

            updatedAt:
              new Date().toISOString(),

            swedishTime:
              nowInSweden
          }
        );


        if (
          candidateAttempt <
          MAX_ATTEMPTS
        ) {
          continue;
        }


        return jsonResponse(
          {
            success: false,
            stage:
              "verification"
          },
          422
        );
      }


      const selectedSources =
        independentSources.slice(
          0,
          3
        );


      const verifiedTrigger = {

        description:
          triggerDescription ||
          "Verifierad aktuell händelse",

        date:
          triggerDate,

        sourceName:
          selectedSources[0]
            ?.title ||
          "Källa",

        sourceUrl:
          selectedSources[0]
            ?.url ||
          null
      };


      // ===================================================
      // DUBLETTCHECK
      // ===================================================

      const duplicateCandidate =
        findDuplicateMatch({

          candidateText: [
            researchText,
            verifiedTrigger.description
          ].join("\n"),

          history:
            recentHistory
        });


      if (duplicateCandidate) {

        rejectedTopic =
          `Dubblett mot tidigare publicering: "${duplicateCandidate.title}". Välj ett helt annat ämne.`;


        await saveGenerationStatus(
          store,
          {
            runId,

            status:
              candidateAttempt <
              MAX_ATTEMPTS
                ? "running"
                : "rejected",

            stage:
              `duplicate-rejected-${candidateAttempt}`,

            message:
              `Kandidaten bedömdes vara en dubblett av "${duplicateCandidate.title}".`,

            candidateAttempt,

            duplicateOf:
              duplicateCandidate,

            startedAt:
              now.toISOString(),

            updatedAt:
              new Date().toISOString(),

            swedishTime:
              nowInSweden
          }
        );


        if (
          candidateAttempt <
          MAX_ATTEMPTS
        ) {
          continue;
        }


        return jsonResponse(
          {
            success: false,
            stage:
              "duplicate-check"
          },
          422
        );
      }


      // ===================================================
      // SKRIV ARTIKEL
      // ===================================================

      await saveGenerationStatus(
        store,
        {
          runId,
          status: "running",
          stage: "writing",
          message:
            `${byline} skriver den färdiga artikeln.`,
          candidateAttempt,
          editorialTone,
          byline,
          startedAt:
            now.toISOString(),
          updatedAt:
            new Date().toISOString(),
          swedishTime:
            nowInSweden
        }
      );


      const writing =
        await callOpenAI({

          apiKey:
            OPENAI_API_KEY,

          body: {

            model:
              "gpt-5.6-luna",

            reasoning: {
              effort: "none"
            },

            input: `
Du är skribent på Kafferasten.se.

Dagens signatur är:

${byline}

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

KÄLLOR SOM ENDAST SKA ANVÄNDAS FÖR FAKTAKONTROLL:

${selectedSources
  .map(
    (source, index) =>
      `${index + 1}. ${source.title} – ${source.url}`
  )
  .join("\n")}

VIKTIGT OM KÄLLOR:

Källorna ovan används bara för att säkerställa fakta.

I title, summary, freshTrigger, paragraphs,
whyTalkAboutIt, pollQuestion och pollOptions
får du ALDRIG skriva:

- URL
- domännamn
- teknisk citationsmarkering
- "källa:"
- "enligt svt.se"
- motsvarande tekniskt källspråk

Om ett mediebolag i sig är en del av nyheten
får dess vanliga namn naturligtvis nämnas.

KAFFERASTENS RÖST:

- Skriv idiomatisk och naturlig svenska.
- Texten får aldrig kännas direktöversatt från engelska.
- Översätt engelska beskrivande ord när svenska är naturligt.
- Skriv exempelvis "kristet metalband", aldrig "Christian metalband".
- Behåll riktiga egennamn, filmtitlar, artistnamn, varumärken och etablerade engelska titlar när de faktiskt heter så.
- Undvik svengelska konstruktioner.
- Undvik pressmeddelandespråk.
- Undvik stela AI-formuleringar.
- Våga ta ut svängarna språkligt utan att hitta på fakta.
- Skriv som en kvick människa som just hittat något hon verkligen vill berätta för kollegorna.
- Var varm, nyfiken och lite smårolig.
- Var inte tramsig.
- Var inte hurtig.
- Var inte krystat ungdomlig.
- Rubriken ska säga vad som hänt och gärna ha en tydlig fikakrok.
- Sammanfattningen ska vara högst två meningar.
- Brödtexten ska vara 2 eller 3 korta stycken.
- Tänk mobil.
- whyTalkAboutIt ska vara 2–3 konkreta, lite spetsiga samtalsöppnare.
- Pollfrågan ska vara enkel, gärna lekfull, och ha exakt två alternativ.

SKRIBENTENS TON:

${writerVoice(byline)}

BILDMETADATA:

Skapa också metadata för artikelns huvudbild.

imageSearchQuery:
- 3–7 konkreta engelska sökord
- ska beskriva ett faktiskt visuellt motiv
- ska fungera bra för en relevant stockbild på Pexels
- prioritera det faktiska motivet i nyheten
- använd gärna sport, miljö, objekt, aktivitet eller situation
- om exakt person, film eller TV-serie knappast finns som stockbild,
  välj en konkret visuell metafor eller miljö
- skriv INTE ord som "news", "article", "headline" eller "website"
  om de inte faktiskt beskriver motivet

imageAlt:
- kort naturlig svensk alt-text

imagePrompt:
- kort beskrivning för en möjlig redaktionell illustration
- ingen text
- inga logotyper

imageStyle:
- photo eller illustration
`,

            text: {

              format: {

                type:
                  "json_schema",

                name:
                  "kafferasten_article",

                strict:
                  true,

                schema: {

                  type:
                    "object",

                  additionalProperties:
                    false,

                  properties: {

                    title: {
                      type: "string"
                    },

                    category: {

                      type:
                        "string",

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

                      type:
                        "array",

                      minItems:
                        2,

                      maxItems:
                        3,

                      items: {
                        type: "string"
                      }
                    },

                    whyTalkAboutIt: {

                      type:
                        "array",

                      minItems:
                        2,

                      maxItems:
                        3,

                      items: {
                        type: "string"
                      }
                    },

                    pollQuestion: {
                      type: "string"
                    },

                    pollOptions: {

                      type:
                        "array",

                      minItems:
                        2,

                      maxItems:
                        2,

                      items: {
                        type: "string"
                      }
                    },

                    imageSearchQuery: {
                      type: "string"
                    },

                    imageAlt: {
                      type: "string"
                    },

                    imagePrompt: {
                      type: "string"
                    },

                    imageStyle: {

                      type:
                        "string",

                      enum: [
                        "photo",
                        "illustration"
                      ]
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
                    "pollOptions",
                    "imageSearchQuery",
                    "imageAlt",
                    "imagePrompt",
                    "imageStyle"
                  ]
                }
              }
            }
          }
        });


      if (!writing.ok) {

        await saveGenerationStatus(
          store,
          {
            runId,
            status: "error",
            stage: "writing",
            message:
              "OpenAI kunde inte skriva artikeln.",
            openAIStatus:
              writing.status,
            openAIError:
              simplifyError(
                writing.data
              ),
            startedAt:
              now.toISOString(),
            updatedAt:
              new Date().toISOString(),
            swedishTime:
              nowInSweden
          }
        );


        return jsonResponse(
          {
            success: false,
            stage: "writing"
          },
          500
        );
      }


      totalUsage.writing =
        writing.data.usage ||
        null;


      const writingPart =
        getOutputTextPart(
          writing.data
        );


      let article;


      try {

        article =
          JSON.parse(
            writingPart?.text ||
            ""
          );

      } catch (error) {

        await saveGenerationStatus(
          store,
          {
            runId,
            status: "error",
            stage: "writing-json",
            message:
              "OpenAI svarade, men artikelns JSON kunde inte läsas.",
            writingPreview:
              writingPart
                ?.text
                ?.slice(
                  0,
                  1000
                ) ||
              "",
            details:
              error.message,
            startedAt:
              now.toISOString(),
            updatedAt:
              new Date().toISOString(),
            swedishTime:
              nowInSweden
          }
        );


        return jsonResponse(
          {
            success: false,
            stage: "writing-json"
          },
          500
        );
      }


      // ===================================================
      // SERVERN BESTÄMMER
      // ===================================================

      article.triggerDate =
        triggerDate;

      article.byline =
        byline;

      article.editorialTone =
        editorialTone;


      article.title =
        cleanReaderText(
          article.title
        );


      article.summary =
        cleanReaderText(
          article.summary
        );


      article.freshTrigger =
        cleanReaderText(
          article.freshTrigger
        );


      article.paragraphs =
        (
          article.paragraphs ||
          []
        )
          .map(
            cleanReaderText
          )
          .filter(
            Boolean
          );


      article.whyTalkAboutIt =
        (
          article.whyTalkAboutIt ||
          []
        )
          .map(
            cleanReaderText
          )
          .filter(
            Boolean
          );


      article.pollQuestion =
        cleanReaderText(
          article.pollQuestion
        );


      article.pollOptions =
        (
          article.pollOptions ||
          []
        )
          .map(
            cleanReaderText
          )
          .filter(
            Boolean
          );


      // ===================================================
      // SLUTLIG DUBLETTCHECK
      // ===================================================

      const duplicateArticle =
        findDuplicateMatch({

          candidateText: [
            article.title,
            article.summary,
            article.freshTrigger,
            ...article.paragraphs
          ].join("\n"),

          history:
            recentHistory
        });


      if (duplicateArticle) {

        rejectedTopic =
          `Den färdiga artikeln blev för lik "${duplicateArticle.title}". Välj ett helt annat ämne.`;


        await saveGenerationStatus(
          store,
          {
            runId,

            status:
              candidateAttempt <
              MAX_ATTEMPTS
                ? "running"
                : "rejected",

            stage:
              "final-duplicate-check",

            message:
              `Den färdiga artikeln bedömdes vara för lik "${duplicateArticle.title}".`,

            candidateAttempt,

            articleTitle:
              article.title ||
              null,

            duplicateOf:
              duplicateArticle,

            startedAt:
              now.toISOString(),

            updatedAt:
              new Date().toISOString(),

            swedishTime:
              nowInSweden
          }
        );


        if (
          candidateAttempt <
          MAX_ATTEMPTS
        ) {
          continue;
        }


        return jsonResponse(
          {
            success: false,
            stage:
              "duplicate-check-final"
          },
          422
        );
      }


      // ===================================================
      // PASS 2 – PEXELS-BILD
      // ===================================================

      await saveGenerationStatus(
        store,
        {
          runId,

          status:
            "running",

          stage:
            "image",

          message:
            PEXELS_API_KEY
              ? "Letar efter en relevant artikelbild på Pexels."
              : "PEXELS_API_KEY saknas. Använder fallbackbild.",

          candidateAttempt,

          imageSearchQuery:
            article.imageSearchQuery,

          startedAt:
            now.toISOString(),

          updatedAt:
            new Date().toISOString(),

          swedishTime:
            nowInSweden
        }
      );


      const heroImage =
        await getHeroImage({

          apiKey:
            PEXELS_API_KEY,

          query:
            article.imageSearchQuery,

          alt:
            article.imageAlt,

          category:
            article.category
        });


      // ===================================================
      // BYGG POST
      // ===================================================

      const articleId =
        createArticleId(
          new Date()
        );


      const savedNews = {

        id:
          articleId,

        createdAt:
          new Date()
            .toISOString(),

        generatedAt:
          formatSwedishDateTime(
            new Date()
          ),

        byline,

        editorialTone,

        verifiedTrigger,

        article,

        heroImage,

        sources:
          selectedSources
      };


      // ===================================================
      // PUBLICERING
      // ===================================================

      await saveGenerationStatus(
        store,
        {
          runId,
          status: "running",
          stage: "publishing",
          message:
            "Artikeln är godkänd. Förbereder publicering.",
          title:
            article.title,
          byline,
          editorialTone,
          articleId,
          imageProvider:
            heroImage?.provider ||
            "fallback",
          imageQuery:
            article.imageSearchQuery,
          startedAt:
            now.toISOString(),
          updatedAt:
            new Date().toISOString(),
          swedishTime:
            nowInSweden
        }
      );


      const previousLatest =
        await store.get(
          "latest",
          {
            type: "json",
            consistency: "strong"
          }
        );


      if (previousLatest?.id) {

        await store.setJSON(
          `archive/${previousLatest.id}`,
          previousLatest
        );
      }


      await store.setJSON(
        "latest",
        savedNews
      );


      const confirmation =
        await store.get(
          "latest",
          {
            type: "json",
            consistency: "strong"
          }
        );


      if (
        !confirmation ||
        confirmation.id !== articleId
      ) {

        await saveGenerationStatus(
          store,
          {
            runId,
            status: "error",
            stage:
              "publish-confirmation",
            message:
              "Artikeln skrevs till latest men kontrolläsningen matchade inte.",
            expectedId:
              articleId,
            actualId:
              confirmation?.id ||
              null,
            startedAt:
              now.toISOString(),
            updatedAt:
              new Date().toISOString(),
            swedishTime:
              nowInSweden
          }
        );


        return jsonResponse(
          {
            success: false,
            stage:
              "publish-confirmation"
          },
          500
        );
      }


      // ===================================================
      // KLART
      // ===================================================

      await saveGenerationStatus(
        store,
        {
          runId,
          status: "success",
          stage: "published",
          message:
            "Ny artikel har publicerats som latest.",
          articleId,
          title:
            article.title,
          category:
            article.category,
          byline,
          editorialTone,
          imageSearchQuery:
            article.imageSearchQuery,
          imageProvider:
            heroImage?.provider ||
            "fallback",
          imagePhotographer:
            heroImage?.photographerName ||
            null,
          candidateAttempt,
          historyChecked:
            recentHistory.length,
          sourcesUsed:
            selectedSources.length,
          archivedPrevious:
            previousLatest?.id ||
            null,
          totalTokens:
            calculateTotalTokens(
              totalUsage
            ),
          startedAt:
            now.toISOString(),
          finishedAt:
            new Date().toISOString(),
          updatedAt:
            new Date().toISOString(),
          swedishTime:
            formatSwedishDateTime(
              new Date()
            )
        }
      );


      return jsonResponse(
        {
          success: true,
          message:
            "Ny artikel skapad och publicerad!",
          runId,
          candidateAttempt,
          byline,
          editorialTone,
          heroImage,
          latest:
            savedNews,
          archivedPrevious:
            previousLatest?.id ||
            null,
          historyChecked:
            recentHistory.length,
          sourcesUsed:
            selectedSources.length,
          usage: {
            ...totalUsage,
            totalTokens:
              calculateTotalTokens(
                totalUsage
              )
          }
        }
      );
    }


    await saveGenerationStatus(
      store,
      {
        runId,
        status: "error",
        stage: "no-result",
        message:
          "Alla kandidatförsök tog slut utan publicering.",
        startedAt:
          now.toISOString(),
        updatedAt:
          new Date().toISOString(),
        swedishTime:
          nowInSweden
      }
    );


    return jsonResponse(
      {
        success: false,
        error:
          "Ingen artikel kunde skapas."
      },
      500
    );


  } catch (error) {

    await saveGenerationStatus(
      store,
      {
        runId,
        status: "error",
        stage: "crash",
        message:
          "Generate-news kraschade.",
        details:
          error.message,
        stack:
          String(
            error.stack ||
            ""
          ).slice(
            0,
            2500
          ),
        startedAt:
          now.toISOString(),
        updatedAt:
          new Date().toISOString(),
        swedishTime:
          nowInSweden
      }
    );


    return jsonResponse(
      {
        success: false,
        error:
          "Generate-news kraschade",
        details:
          error.message
      },
      500
    );


  } finally {

    if (generationLock?.token) {

      await releaseGenerationLock(
        store,
        generationLock.token
      );
    }
  }
};


// =====================================================
// PASS 2 – PEXELS
// =====================================================

async function getHeroImage({
  apiKey,
  query,
  alt,
  category
}) {

  if (
    !apiKey ||
    !query
  ) {

    return fallbackHeroImage(
      category,
      alt
    );
  }


  try {

    const params =
      new URLSearchParams({

        query:
          String(query),

        orientation:
          "landscape",

        size:
          "medium",

        locale:
          "en-US",

        per_page:
          "5"
      });


    const response =
      await fetch(
        `https://api.pexels.com/v1/search?${params.toString()}`,
        {
          method:
            "GET",

          headers: {
            Authorization:
              apiKey
          }
        }
      );


    if (!response.ok) {

      console.error(
        "Pexels svarade med status:",
        response.status
      );


      return fallbackHeroImage(
        category,
        alt
      );
    }


    const data =
      await response.json();


    const photos =
      Array.isArray(
        data.photos
      )
        ? data.photos
        : [];


    const photo =
      photos[0] ||
      null;


    if (
      !photo ||
      !photo.src
    ) {

      return fallbackHeroImage(
        category,
        alt
      );
    }


    const imageUrl =
      photo.src.landscape ||
      photo.src.large ||
      photo.src.large2x ||
      photo.src.medium ||
      photo.src.original;


    const smallUrl =
      photo.src.medium ||
      photo.src.small ||
      imageUrl;


    if (!imageUrl) {

      return fallbackHeroImage(
        category,
        alt
      );
    }


    return {

      provider:
        "pexels",

      url:
        imageUrl,

      smallUrl:
        smallUrl,

      alt:
        cleanReaderText(
          alt ||
          photo.alt ||
          "Bild till dagens snackis"
        ),

      photographerName:
        photo.photographer ||
        "Pexels-fotograf",

      photographerUrl:
        photo.url ||
        photo.photographer_url ||
        "https://www.pexels.com/",

      photoUrl:
        photo.url ||
        "https://www.pexels.com/",

      pexelsUrl:
        "https://www.pexels.com/",

      pexelsPhotoId:
        photo.id ||
        null
    };


  } catch (error) {

    console.error(
      "Pexels-bildsökningen misslyckades:",
      error.message
    );


    return fallbackHeroImage(
      category,
      alt
    );
  }
}


// =====================================================
// FALLBACKBILD
// =====================================================

function fallbackHeroImage(
  category,
  alt
) {

  /*
  Ingen extern API-bild används här.

  Frontend behåller sin neutrala kaffebild
  om Pexels av någon anledning inte fungerar.
  */

  return {

    provider:
      "fallback",

    url:
      null,

    smallUrl:
      null,

    alt:
      cleanReaderText(
        alt ||
        `Bild till dagens snackis i kategorin ${category || "Vardag"}`
      )
  };
}


// =====================================================
// DIAGNOSTIK
// =====================================================

async function saveGenerationStatus(
  store,
  data
) {

  try {

    await store.setJSON(
      STATUS_KEY,
      data
    );

  } catch (error) {

    console.error(
      "Kunde inte spara generation-status:",
      error
    );
  }
}


// =====================================================
// KÖRLÅS
// =====================================================

async function acquireGenerationLock(
  store,
  now,
  runId
) {

  const staleAfterMs =
    20 *
    60 *
    1000;


  const existing =
    await store.get(
      LOCK_KEY,
      {
        type: "json",
        consistency: "strong"
      }
    );


  if (existing?.startedAt) {

    const started =
      new Date(
        existing.startedAt
      );


    const age =
      now.getTime() -
      started.getTime();


    if (
      Number.isFinite(age) &&
      age >= 0 &&
      age < staleAfterMs
    ) {

      return {
        acquired: false,
        startedAt:
          existing.startedAt,
        runId:
          existing.runId ||
          null
      };
    }


    await store.delete(
      LOCK_KEY
    );
  }


  const token =
    `${now.getTime()}-${Math.random()
      .toString(36)
      .slice(2)}`;


  const result =
    await store.setJSON(
      LOCK_KEY,
      {
        token,
        runId,
        startedAt:
          now.toISOString()
      },
      {
        onlyIfNew: true
      }
    );


  if (!result.modified) {

    const current =
      await store.get(
        LOCK_KEY,
        {
          type: "json",
          consistency: "strong"
        }
      );


    return {
      acquired: false,
      startedAt:
        current?.startedAt ||
        null,
      runId:
        current?.runId ||
        null
    };
  }


  return {
    acquired: true,
    token,
    runId,
    startedAt:
      now.toISOString()
  };
}


async function releaseGenerationLock(
  store,
  token
) {

  if (!token) {
    return;
  }


  try {

    const current =
      await store.get(
        LOCK_KEY,
        {
          type: "json",
          consistency: "strong"
        }
      );


    if (
      current?.token === token
    ) {

      await store.delete(
        LOCK_KEY
      );
    }


  } catch (error) {

    console.error(
      "Kunde inte släppa körlåset:",
      error
    );
  }
}


// =====================================================
// HISTORIK
// =====================================================

async function loadRecentHistory({
  store,
  now,
  days,
  limit
}) {

  const result =
    [];


  const seenIds =
    new Set();


  const latest =
    await store.get(
      "latest",
      {
        type: "json",
        consistency: "strong"
      }
    );


  if (latest?.id) {

    result.push(
      latest
    );


    seenIds.add(
      latest.id
    );
  }


  const listing =
    await store.list({
      prefix:
        "archive/"
    });


  const archiveKeys =
    (
      listing.blobs ||
      []
    )
      .map(
        blob =>
          blob.key
      )
      .sort()
      .reverse()
      .slice(
        0,
        50
      );


  for (
    const key
    of archiveKeys
  ) {

    if (
      result.length >= limit
    ) {
      break;
    }


    try {

      const item =
        await store.get(
          key,
          {
            type: "json",
            consistency: "strong"
          }
        );


      if (
        !item?.id ||
        seenIds.has(
          item.id
        )
      ) {
        continue;
      }


      if (
        isWithinDays(
          item.createdAt,
          now,
          days
        )
      ) {

        result.push(
          item
        );


        seenIds.add(
          item.id
        );
      }


    } catch (error) {

      console.warn(
        "Kunde inte läsa arkivpost:",
        key,
        error.message
      );
    }
  }


  return result

    .sort(
      (
        a,
        b
      ) =>
        new Date(
          b.createdAt ||
          0
        ) -
        new Date(
          a.createdAt ||
          0
        )
    )

    .slice(
      0,
      limit
    );
}


// =====================================================
// HISTORIK TILL OPENAI
// =====================================================

function formatRecentTopicsForPrompt(
  history
) {

  return history

    .slice(
      0,
      HISTORY_LIMIT
    )

    .map(
      (
        item,
        index
      ) => {

        const title =
          item.article
            ?.title ||
          "Okänd rubrik";


        const trigger =
          item.verifiedTrigger
            ?.description ||
          item.article
            ?.freshTrigger ||
          "";


        const date =
          item.verifiedTrigger
            ?.date ||
          item.article
            ?.triggerDate ||
          "";


        return (
          `${index + 1}. ${title}` +

          (
            trigger
              ? ` | Händelse: ${trigger}`
              : ""
          ) +

          (
            date
              ? ` | Datum: ${date}`
              : ""
          )
        );
      }
    )

    .join("\n");
}


// =====================================================
// SKRIBENTER
// =====================================================

function normalizeEditorialTone(
  value
) {

  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toUpperCase();


  if (
    normalized.includes(
      "UNGDOMLIG"
    )
  ) {

    return "UNGDOMLIG";
  }


  if (
    normalized.includes(
      "KLASSISK"
    )
  ) {

    return "KLASSISK";
  }


  return "BRED";
}


function chooseByline(
  editorialTone
) {

  if (
    editorialTone ===
    "UNGDOMLIG"
  ) {

    return "Camille";
  }


  return Math.random() <
    0.5
      ? "Kent på Kafferasten"
      : "Bettan";
}


function writerVoice(
  byline
) {

  if (
    byline ===
    "Camille"
  ) {

    return `
Camille är snabb, samtida och popkulturellt nyfiken.
Hon kan vara lekfull och pigg, men använder naturlig svenska.
Hon tvingar aldrig in ungdomsslang eller engelska uttryck.
`;
  }


  if (
    byline ===
    "Bettan"
  ) {

    return `
Bettan är varm, kvick och vardagsnära.
Hon ser gärna den mänskliga eller småroliga detaljen
som gör att folk börjar prata.
Hon blir aldrig hurtig eller tillgjord.
`;
  }


  return `
Kent på Kafferasten är nyfiken, torrt smårolig och lite klurig.
Han gillar en bra formulering och en oväntad vinkel,
men håller texten enkel, folklig och lätt att prata vidare om.
`;
}


// =====================================================
// RENGÖR LÄSARTEXT
// =====================================================

function cleanReaderText(
  value
) {

  if (!value) {
    return "";
  }


  return String(
    value
  )

    .replace(
      /[\uE000-\uF8FF]/g,
      ""
    )

    .replace(
      /\[[^\]]*\]\(\s*https?:\/\/[^)]*\)/gi,
      ""
    )

    .replace(
      /https?:\/\/\S+/gi,
      ""
    )

    .replace(
      /\bwww\.\S+/gi,
      ""
    )

    .replace(
      /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi,
      ""
    )

    .replace(
      /\[\s*\]\s*\(\s*\)/g,
      ""
    )

    .replace(
      /\(\s*\[\s*\]\s*\)/g,
      ""
    )

    .replace(
      /[\[\]\(\)\{\}]{2,}/g,
      ""
    )

    .replace(
      /\s+([,.!?;:])/g,
      "$1"
    )

    .replace(
      /\s{2,}/g,
      " "
    )

    .trim();
}


// =====================================================
// DUBLETTER
// =====================================================

function findDuplicateMatch({
  candidateText,
  history
}) {

  const candidate =
    buildTopicTokens(
      candidateText
    );


  if (!candidate.size) {
    return null;
  }


  for (
    const item
    of history
  ) {

    const previousText = [

      item.article
        ?.title,

      item.article
        ?.summary,

      item.article
        ?.freshTrigger,

      item.verifiedTrigger
        ?.description

    ]
      .filter(Boolean)
      .join("\n");


    const previous =
      buildTopicTokens(
        previousText
      );


    if (!previous.size) {
      continue;
    }


    const intersection =
      [
        ...candidate
      ]
        .filter(
          token =>
            previous.has(
              token
            )
        );


    const union =
      new Set([
        ...candidate,
        ...previous
      ]);


    const jaccard =
      union.size
        ? intersection.length /
          union.size
        : 0;


    const containment =
      intersection.length /
      Math.min(
        candidate.size,
        previous.size
      );


    const hasRareExactToken =
      intersection.some(
        token =>
          token.length >= 9 &&
          !GENERIC_TOPIC_WORDS.has(
            token
          )
      );


    const looksDuplicate =

      (
        intersection.length >= 2 &&
        containment >= 0.42
      )

      ||

      jaccard >= 0.28

      ||

      hasRareExactToken;


    if (looksDuplicate) {

      return {

        id:
          item.id ||
          null,

        title:
          item.article
            ?.title ||
          "Tidigare snackis",

        createdAt:
          item.createdAt ||
          null,

        score:
          Number(
            Math.max(
              jaccard,
              containment
            )
              .toFixed(2)
          ),

        sharedTerms:
          intersection.slice(
            0,
            8
          )
      };
    }
  }


  return null;
}


// =====================================================
// STOPPORD
// =====================================================

const SWEDISH_STOP_WORDS =
  new Set([

    "och",
    "att",
    "det",
    "den",
    "detta",
    "denna",
    "de",
    "dem",
    "som",
    "för",
    "från",
    "med",
    "till",
    "har",
    "hade",
    "ska",
    "skall",
    "kan",
    "kommer",
    "är",
    "var",
    "blir",
    "blev",
    "ett",
    "en",
    "på",
    "av",
    "om",
    "nu",
    "nya",
    "ny",
    "igen",
    "efter",
    "under",
    "över",
    "sin",
    "sitt",
    "sina",
    "sig",
    "vid",
    "i",

    "the",
    "a",
    "an",
    "of",
    "to",
    "and",
    "is",
    "in",
    "on",
    "with"
  ]);


const GENERIC_TOPIC_WORDS =
  new Set([

    "premiar",
    "premiaren",
    "sasong",
    "sasongen",
    "serie",
    "serien",
    "film",
    "filmen",
    "trailer",
    "slappt",
    "slapptes",
    "publicerad",
    "publicerades",
    "tillbaka",
    "streaming",
    "program",
    "programmet",
    "officiella",
    "forsta",
    "sista",
    "svenska",
    "sverige",
    "augusti",
    "2026"
  ]);


// =====================================================
// TEXT → ÄMNESORD
// =====================================================

function buildTopicTokens(
  text
) {

  return new Set(

    normalizeTopicText(
      text
    )

      .split(" ")

      .filter(Boolean)

      .filter(
        token =>
          token.length >= 3 &&
          !SWEDISH_STOP_WORDS.has(
            token
          ) &&
          !GENERIC_TOPIC_WORDS.has(
            token
          )
      )
  );
}


function normalizeTopicText(
  text
) {

  return String(
    text ||
    ""
  )

    .toLowerCase()

    .normalize(
      "NFD"
    )

    .replace(
      /[\u0300-\u036f]/g,
      ""
    )

    .replace(
      /[^a-z0-9åäö]+/gi,
      " "
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();
}


// =====================================================
// DATUM
// =====================================================

function isWithinDays(
  isoDate,
  now,
  days
) {

  if (!isoDate) {
    return true;
  }


  const date =
    new Date(
      isoDate
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return true;
  }


  const age =
    now.getTime() -
    date.getTime();


  return (
    age >= 0 &&
    age <=
      days *
      24 *
      60 *
      60 *
      1000
  );
}


// =====================================================
// OPENAI
// =====================================================

async function callOpenAI({
  apiKey,
  body
}) {

  const response =
    await fetch(
      "https://api.openai.com/v1/responses",
      {
        method:
          "POST",

        headers: {

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${apiKey}`
        },

        body:
          JSON.stringify(
            body
          )
      }
    );


  let data;


  try {

    data =
      await response.json();

  } catch {

    data = {
      error:
        "OpenAI-svaret kunde inte läsas som JSON."
    };
  }


  return {
    ok:
      response.ok,
    status:
      response.status,
    data
  };
}


// =====================================================
// OPENAI TEXT
// =====================================================

function getOutputTextPart(
  data
) {

  const message =
    data.output
      ?.find(
        item =>
          item.type ===
          "message"
      );


  return message
    ?.content
    ?.find(
      item =>
        item.type ===
        "output_text"
    );
}


// =====================================================
// KÄLLOR
// =====================================================

function extractCitedSources(
  textPart
) {

  return (
    textPart
      ?.annotations

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

    ||

    []
  );
}


function filterAllowedSources(
  sources
) {

  return sources.filter(
    source => {

      try {

        const hostname =
          new URL(
            source.url
          )
            .hostname
            .toLowerCase();


        return (
          hostname !==
            "reddit.com" &&
          !hostname.endsWith(
            ".reddit.com"
          )
        );


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

function getDomain(
  url
) {

  try {

    const hostname =
      new URL(
        url
      )
        .hostname
        .toLowerCase()
        .replace(
          /^www\./,
          ""
        );


    const parts =
      hostname.split(
        "."
      );


    const twoPartSuffixes =
      [
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


    return parts.length >= 2
      ? lastTwo
      : hostname;


  } catch {

    return null;
  }
}


function getDistinctDomainSources(
  sources
) {

  const seenDomains =
    new Set();


  const result =
    [];


  for (
    const source
    of sources
  ) {

    const domain =
      getDomain(
        source.url
      );


    if (
      !domain ||
      seenDomains.has(
        domain
      )
    ) {
      continue;
    }


    seenDomains.add(
      domain
    );


    result.push(
      source
    );
  }


  return result;
}


// =====================================================
// TRIGGER
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
    text.match(
      regex
    );


  return match
    ? match[1].trim()
    : null;
}


// =====================================================
// FÄRSKHET
// =====================================================

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
        -(
          24 *
          60 *
          60 *
          1000
        )
    );


  } catch {

    return false;
  }
}


// =====================================================
// ID OCH TID
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

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",

        hour12:
          false
      }
    );


  return formatter
    .format(date)
    .replace(
      /\D/g,
      ""
    );
}


function createRunId(
  date
) {

  return (
    createArticleId(date)
    +
    "-"
    +
    Math.random()
      .toString(36)
      .slice(2, 8)
  );
}


function formatSwedishDateTime(
  date
) {

  return new Intl.DateTimeFormat(
    "sv-SE",
    {
      timeZone:
        "Europe/Stockholm",

      dateStyle:
        "full",

      timeStyle:
        "short"
    }
  )
    .format(date);
}


// =====================================================
// FELTEXT
// =====================================================

function simplifyError(
  data
) {

  if (!data) {
    return null;
  }


  if (
    typeof data ===
    "string"
  ) {

    return data.slice(
      0,
      1500
    );
  }


  try {

    return JSON.stringify(
      data.error ||
      data
    )
      .slice(
        0,
        1500
      );


  } catch {

    return "Okänt fel";
  }
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
