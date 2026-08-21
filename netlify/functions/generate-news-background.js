import { getStore } from "@netlify/blobs";

export default async () => {
  const OPENAI_API_KEY =
    process.env.OPENAI_API_KEY;

  const store =
    getStore("kafferasten-news");

  const now =
    new Date();

  const runId =
    createRunId(now);

  const nowInSweden =
    new Intl.DateTimeFormat(
      "sv-SE",
      {
        timeZone:
          "Europe/Stockholm",
        dateStyle:
          "full",
        timeStyle:
          "short"
      }
    ).format(now);


  // =====================================================
  // DIAGNOSTIK – KÖRNING STARTAD
  // =====================================================

  await saveGenerationStatus(
    store,
    {
      runId,
      status:
        "running",
      stage:
        "start",
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


  // =====================================================
  // KONTROLLERA API-NYCKEL
  // =====================================================

  if (!OPENAI_API_KEY) {

    await saveGenerationStatus(
      store,
      {
        runId,
        status:
          "error",
        stage:
          "api-key",
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
        success:
          false,
        error:
          "OPENAI_API_KEY saknas i Netlify"
      },
      500
    );
  }


  // =====================================================
  // KÖRLÅS
  // =====================================================

  let generationLock;

  try {

    await saveGenerationStatus(
      store,
      {
        runId,
        status:
          "running",
        stage:
          "lock-check",
        message:
          "Kontrollerar om en annan generering redan kör.",
        startedAt:
          now.toISOString(),
        updatedAt:
          new Date().toISOString(),
        swedishTime:
          nowInSweden
      }
    );


    generationLock =
      await acquireGenerationLock(
        store,
        now,
        runId
      );


    if (
      !generationLock.acquired
    ) {

      await saveGenerationStatus(
        store,
        {
          runId,
          status:
            "blocked",
          stage:
            "lock",
          message:
            "Körningen stoppades eftersom en annan generering redan verkar pågå.",
          startedAt:
            now.toISOString(),
          updatedAt:
            new Date().toISOString(),
          swedishTime:
            nowInSweden,
          lockStartedAt:
            generationLock.startedAt ||
            null,
          lockRunId:
            generationLock.runId ||
            null
        }
      );

      return jsonResponse(
        {
          success:
            false,
          skipped:
            true,
          stage:
            "lock",
          error:
            "En annan nyhetsgenerering pågår redan.",
          lockStartedAt:
            generationLock.startedAt ||
            null
        },
        409
      );
    }


    await saveGenerationStatus(
      store,
      {
        runId,
        status:
          "running",
        stage:
          "lock-acquired",
        message:
          "Körlåset är taget. Bara denna körning får fortsätta.",
        startedAt:
          now.toISOString(),
        updatedAt:
          new Date().toISOString(),
        swedishTime:
          nowInSweden
      }
    );

  } catch (error) {

    await saveGenerationStatus(
      store,
      {
        runId,
        status:
          "error",
        stage:
          "lock-error",
        message:
          "Kunde inte skapa körlåset.",
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
        success:
          false,
        stage:
          "lock",
        error:
          "Kunde inte skapa körlås.",
        details:
          error.message
      },
      500
    );
  }


  try {

    // =====================================================
    // REDAKTIONELLT MINNE
    // =====================================================

    await saveGenerationStatus(
      store,
      {
        runId,
        status:
          "running",
        stage:
          "history-start",
        message:
          "Läser tidigare publicerade snackisar.",
        startedAt:
          now.toISOString(),
        updatedAt:
          new Date().toISOString(),
        swedishTime:
          nowInSweden
      }
    );


    const recentHistory =
      await loadRecentHistory({
        store,
        now,
        days:
          14,
        limit:
          20
      });


    await saveGenerationStatus(
      store,
      {
        runId,
        status:
          "running",
        stage:
          "history-loaded",
        message:
          `Redaktionellt minne laddat. ${recentHistory.length} tidigare artiklar hittades.`,
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
      candidateAttempt <= 3;
      candidateAttempt++
    ) {

      // =====================================================
      // STEG 1 – RESEARCH
      // =====================================================

      await saveGenerationStatus(
        store,
        {
          runId,
          status:
            "running",
          stage:
            `research-${candidateAttempt}`,
          message:
            `OpenAI letar efter kandidat ${candidateAttempt} av 3.`,
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
              effort:
                "none"
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

Hitta EN aktuell snackis som passar riktigt bra vid en svensk fikarast.

Detta är kandidatförsök ${candidateAttempt} av 3.

KRAV:
Själva händelsen måste ha inträffat under de senaste 72 timmarna.

En ny artikel om en gammal händelse räcker inte.

MYCKET VIKTIGT – REDAKTIONELLT MINNE:

Nedan finns ämnen som Kafferasten.se redan har publicerat de senaste 14 dagarna.

Välj INTE samma huvudsakliga:
- händelse
- TV-program
- film
- serie
- person + händelse
- premiär
- lansering
- trailer
- nyhetsvinkel

En ny rubrik eller omskrivning gör INTE ämnet nytt.

Exempel:

Om "Outer Banks säsong 5 har släppts" redan finns får du INTE välja:

- Outer Banks är tillbaka
- Sista säsongen av Outer Banks
- Streamingpubliken får nya Outer Banks
- Outer Banks-finalen väcker reaktioner

Det är samma huvudsakliga nyhet.

TIDIGARE PUBLICERADE ÄMNEN:

${recentTopicsForPrompt || "Inga tidigare ämnen finns ännu."}

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
- svenska traditioner och fenomen
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

${
  rejectedTopic
    ? `
VIKTIGT:

Ett tidigare förslag i denna körning har underkänts.

Välj INTE detta ämne eller en omskrivning av samma händelse:

${rejectedTopic}
`
    : ""
}

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

        await saveGenerationStatus(
          store,
          {
            runId,
            status:
              "error",
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
            success:
              false,
            stage:
              `research-${candidateAttempt}`,
            error:
              research.data.error ||
              research.data
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


      await saveGenerationStatus(
        store,
        {
          runId,
          status:
            "running",
          stage:
            `research-${candidateAttempt}-done`,
          message:
            "Research klar.",
          candidateAttempt,
          researchPreview:
            researchText.slice(
              0,
              900
            ),
          startedAt:
            now.toISOString(),
          updatedAt:
            new Date().toISOString(),
          swedishTime:
            nowInSweden
        }
      );


      const researchSources =
        filterAllowedSources(
          extractCitedSources(
            researchPart
          )
        );


      // =====================================================
      // STEG 2 – FAKTAKONTROLL
      // =====================================================

      await saveGenerationStatus(
        store,
        {
          runId,
          status:
            "running",
          stage:
            `verification-${candidateAttempt}`,
          message:
            "Faktakontrollerar kandidaten.",
          candidateAttempt,
          researchPreview:
            researchText.slice(
              0,
              500
            ),
          startedAt:
            now.toISOString(),
          updatedAt:
            new Date().toISOString(),
          swedishTime:
            nowInSweden
        }
      );


      const verification =
        await callOpenAI({
          apiKey:
            OPENAI_API_KEY,

          body: {
            model:
              "gpt-5.6-luna",

            reasoning: {
              effort:
                "none"
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
3. hitta minst två oberoende källor
4. säkerställa att själva händelsen är högst 72 timmar gammal
5. skilja på artikelns publiceringsdatum och datumet då händelsen faktiskt inträffade

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

Två artiklar från samma organisation räknas inte som två oberoende källor.

Svara exakt:

AKTUELL:
JA eller NEJ

TRIGGER:
[kort beskrivning av själva nya händelsen]

TRIGGERDATUM:
[YYYY-MM-DD eller OKÄNT]

BEKRÄFTELSE:
[kort sammanfattning]

Använd källhänvisningar.
`
          }
        });


      if (!verification.ok) {

        await saveGenerationStatus(
          store,
          {
            runId,
            status:
              "error",
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
            success:
              false,
            stage:
              `verification-${candidateAttempt}`,
            error:
              verification.data.error ||
              verification.data
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


      const allSources =
        dedupeSources([
          ...researchSources,
          ...verificationSources
        ]);


      const independentSources =
        getDistinctDomainSources(
          allSources
        );


      const triggerIsFresh =
        triggerDate &&
        isFreshDate(
          triggerDate,
          now,
          72
        );


      await saveGenerationStatus(
        store,
        {
          runId,
          status:
            "running",
          stage:
            `verification-${candidateAttempt}-done`,
          message:
            "Faktakontrollen är klar.",
          candidateAttempt,
          saysCurrent,
          triggerDate:
            triggerDate ||
            null,
          triggerDescription:
            triggerDescription ||
            null,
          triggerIsFresh:
            Boolean(
              triggerIsFresh
            ),
          independentSources:
            independentSources.length,
          verificationPreview:
            verificationText.slice(
              0,
              900
            ),
          startedAt:
            now.toISOString(),
          updatedAt:
            new Date().toISOString(),
          swedishTime:
            nowInSweden
        }
      );


      // =====================================================
      // KANDIDAT UNDERKÄND AV FAKTAKONTROLL
      // =====================================================

      if (
        !saysCurrent ||
        !triggerIsFresh ||
        independentSources.length < 2
      ) {

        rejectedTopic =
          researchText;


        await saveGenerationStatus(
          store,
          {
            runId,
            status:
              candidateAttempt < 3
                ? "running"
                : "rejected",
            stage:
              `candidate-${candidateAttempt}-rejected`,
            message:
              "Kandidaten underkändes eftersom den inte klarade färskhets- och källkraven.",
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
          candidateAttempt < 3
        ) {
          continue;
        }


        return jsonResponse(
          {
            success:
              false,

            stage:
              "verification",

            error:
              "Ingen kandidat klarade kraven på färsk trigger och två oberoende källor.",

            triggerDate,

            sources:
              independentSources,

            usage: {
              ...totalUsage,

              totalTokens:
                calculateTotalTokens(
                  totalUsage
                )
            }
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


      // =====================================================
      // STEG 2B – LOKAL DUBLETTCHECK
      // =====================================================

      await saveGenerationStatus(
        store,
        {
          runId,
          status:
            "running",
          stage:
            `duplicate-check-${candidateAttempt}`,
          message:
            "Jämför kandidaten med tidigare publicerade snackisar.",
          candidateAttempt,
          triggerDescription:
            verifiedTrigger.description,
          startedAt:
            now.toISOString(),
          updatedAt:
            new Date().toISOString(),
          swedishTime:
            nowInSweden
        }
      );


      const duplicateCandidate =
        findDuplicateMatch({
          candidateText: [
            researchText,
            verifiedTrigger.description
          ].join("\n"),

          history:
            recentHistory
        });


      if (
        duplicateCandidate
      ) {

        rejectedTopic =
          `Dubblett mot tidigare publicering: "${duplicateCandidate.title}". Välj ett helt annat ämne.`;


        await saveGenerationStatus(
          store,
          {
            runId,
            status:
              candidateAttempt < 3
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
          candidateAttempt < 3
        ) {
          continue;
        }


        return jsonResponse(
          {
            success:
              false,
            stage:
              "duplicate-check",
            error:
              "Alla kandidater låg för nära ämnen som redan publicerats.",
            duplicateOf:
              duplicateCandidate
          },
          422
        );
      }


      // =====================================================
      // STEG 3 – SKRIV ARTIKEL
      // =====================================================

      await saveGenerationStatus(
        store,
        {
          runId,
          status:
            "running",
          stage:
            "writing",
          message:
            "Kandidaten är godkänd. Skriver den färdiga artikeln.",
          candidateAttempt,
          triggerDescription:
            verifiedTrigger.description,
          triggerDate:
            verifiedTrigger.date,
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
              effort:
                "none"
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
- hitta aldrig på datum
- hitta aldrig på personer
- hitta aldrig på citat
- hitta aldrig på siffror
- framhäv vad som faktiskt är nytt
- skriv enkelt
- skriv lättsam svenska
- texten ska fungera för en vanlig svensk fikarast
- 2 eller 3 korta stycken
- undvik onödiga detaljer
- ingen clickbait
- rubriken ska vara tydlig och lockande
- sammanfattningen ska vara kort
- "whyTalkAboutIt" ska vara konkreta samtalsöppnare
- pollfrågan ska vara enkel att svara på
- pollfrågan ska ha exakt två alternativ
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
                      type:
                        "string"
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
                      type:
                        "string"
                    },

                    freshTrigger: {
                      type:
                        "string"
                    },

                    triggerDate: {
                      type:
                        "string"
                    },

                    paragraphs: {
                      type:
                        "array",
                      minItems:
                        2,
                      maxItems:
                        3,
                      items: {
                        type:
                          "string"
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
                        type:
                          "string"
                      }
                    },

                    pollQuestion: {
                      type:
                        "string"
                    },

                    pollOptions: {
                      type:
                        "array",
                      minItems:
                        2,
                      maxItems:
                        2,
                      items: {
                        type:
                          "string"
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

        await saveGenerationStatus(
          store,
          {
            runId,
            status:
              "error",
            stage:
              "writing",
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
            success:
              false,
            stage:
              "writing",
            error:
              writing.data.error ||
              writing.data
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
            status:
              "error",
            stage:
              "writing-json",
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
            success:
              false,
            stage:
              "writing",
            error:
              "Artikeln kunde inte läsas som JSON."
          },
          500
        );
      }


      // Modellen får inte ändra triggern själv.

      article.triggerDate =
        triggerDate;

      article.freshTrigger =
        verifiedTrigger.description;


      await saveGenerationStatus(
        store,
        {
          runId,
          status:
            "running",
          stage:
            "article-written",
          message:
            "Artikeln är färdigskriven.",
          candidateAttempt,
          title:
            article.title ||
            null,
          category:
            article.category ||
            null,
          startedAt:
            now.toISOString(),
          updatedAt:
            new Date().toISOString(),
          swedishTime:
            nowInSweden
        }
      );


      // =====================================================
      // STEG 3B – SLUTLIG DUBLETTCHECK
      // =====================================================

      const duplicateArticle =
        findDuplicateMatch({
          candidateText: [
            article.title,
            article.summary,
            article.freshTrigger,
            ...(
              article.paragraphs ||
              []
            )
          ].join("\n"),

          history:
            recentHistory
        });


      if (
        duplicateArticle
      ) {

        rejectedTopic =
          `Den färdiga artikeln blev för lik "${duplicateArticle.title}". Välj ett helt annat ämne.`;


        await saveGenerationStatus(
          store,
          {
            runId,
            status:
              candidateAttempt < 3
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
          candidateAttempt < 3
        ) {
          continue;
        }


        return jsonResponse(
          {
            success:
              false,
            stage:
              "duplicate-check-final",
            error:
              "Den färdiga artikeln blev för lik en tidigare publicering.",
            duplicateOf:
              duplicateArticle
          },
          422
        );
      }


      // =====================================================
      // STEG 4 – BYGG SPARAD POST
      // =====================================================

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
          new Intl.DateTimeFormat(
            "sv-SE",
            {
              timeZone:
                "Europe/Stockholm",
              dateStyle:
                "full",
              timeStyle:
                "short"
            }
          ).format(
            new Date()
          ),

        verifiedTrigger,

        article,

        sources:
          selectedSources
      };


      // =====================================================
      // STEG 5 – HÄMTA NUVARANDE LATEST
      // =====================================================

      await saveGenerationStatus(
        store,
        {
          runId,
          status:
            "running",
          stage:
            "publishing",
          message:
            "Artikeln är godkänd. Förbereder publicering.",
          title:
            article.title,
          articleId:
            articleId,
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
            type:
              "json",
            consistency:
              "strong"
          }
        );


      // =====================================================
      // STEG 6 – ARKIVERA FÖREGÅENDE LATEST
      // =====================================================

      if (
        previousLatest?.id
      ) {

        await store.setJSON(
          `archive/${previousLatest.id}`,
          previousLatest
        );


        await saveGenerationStatus(
          store,
          {
            runId,
            status:
              "running",
            stage:
              "previous-archived",
            message:
              "Föregående huvudartikel har arkiverats.",
            archivedPreviousId:
              previousLatest.id,
            archivedPreviousTitle:
              previousLatest
                .article
                ?.title ||
              null,
            newTitle:
              article.title,
            startedAt:
              now.toISOString(),
            updatedAt:
              new Date().toISOString(),
            swedishTime:
              nowInSweden
          }
        );
      }


      // =====================================================
      // STEG 7 – SPARA NY LATEST
      // =====================================================

      await store.setJSON(
        "latest",
        savedNews
      );


      // =====================================================
      // KONTROLLÄS LATEST
      // =====================================================

      const confirmation =
        await store.get(
          "latest",
          {
            type:
              "json",
            consistency:
              "strong"
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
            status:
              "error",
            stage:
              "publish-confirmation",
            message:
              "Artikeln skrevs till latest men kontrolläsningen matchade inte.",
            expectedId:
              articleId,
            actualId:
              confirmation?.id ||
              null,
            title:
              article.title,
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
            success:
              false,
            stage:
              "publish-confirmation",
            error:
              "Latest kunde inte verifieras efter publiceringen."
          },
          500
        );
      }


      // =====================================================
      // KLART!
      // =====================================================

      await saveGenerationStatus(
        store,
        {
          runId,
          status:
            "success",
          stage:
            "published",
          message:
            "Ny artikel har publicerats som latest.",
          articleId,
          title:
            article.title,
          category:
            article.category,
          candidateAttempt,
          historyChecked:
            recentHistory.length,
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
            new Intl.DateTimeFormat(
              "sv-SE",
              {
                timeZone:
                  "Europe/Stockholm",
                dateStyle:
                  "full",
                timeStyle:
                  "short"
              }
            ).format(
              new Date()
            )
        }
      );


      return jsonResponse(
        {
          success:
            true,

          message:
            "Ny artikel skapad och publicerad!",

          runId,

          candidateAttempt,

          latest:
            savedNews,

          archivedPrevious:
            previousLatest?.id ||
            null,

          historyChecked:
            recentHistory.length,

          usage: {
            ...totalUsage,

            totalTokens:
              calculateTotalTokens(
                totalUsage
              )
          }
        },
        200
      );
    }


    await saveGenerationStatus(
      store,
      {
        runId,
        status:
          "error",
        stage:
          "no-result",
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
        success:
          false,
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
        status:
          "error",
        stage:
          "crash",
        message:
          "Generate-news kraschade.",
        details:
          error.message,
        stack:
          String(
            error.stack ||
            ""
          )
          .slice(
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
        success:
          false,
        error:
          "Generate-news kraschade",
        details:
          error.message
      },
      500
    );


  } finally {

    // =====================================================
    // SLÄPP KÖRLÅSET
    // =====================================================

    if (
      generationLock?.token
    ) {

      await releaseGenerationLock(
        store,
        generationLock.token
      );
    }
  }
};


// =====================================================
// DIAGNOSTIK
// =====================================================

async function saveGenerationStatus(
  store,
  data
) {
  try {

    await store.setJSON(
      "_diagnostics/generation-status",
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
  const key =
    "_locks/generate-news";


  // Om ett jobb har dött helt får
  // låset betraktas som gammalt
  // efter 20 minuter.

  const staleAfterMs =
    20 *
    60 *
    1000;


  const existing =
    await store.get(
      key,
      {
        type:
          "json",
        consistency:
          "strong"
      }
    );


  if (
    existing?.startedAt
  ) {

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
        acquired:
          false,
        startedAt:
          existing.startedAt,
        runId:
          existing.runId ||
          null
      };
    }


    // Gammalt övergivet lås.

    await store.delete(
      key
    );
  }


  const token =
    `${now.getTime()}-${Math.random()
      .toString(36)
      .slice(2)}`;


  const result =
    await store.setJSON(
      key,
      {
        token,
        runId,
        startedAt:
          now.toISOString()
      },
      {
        onlyIfNew:
          true
      }
    );


  if (
    !result.modified
  ) {

    const current =
      await store.get(
        key,
        {
          type:
            "json",
          consistency:
            "strong"
        }
      );


    return {
      acquired:
        false,
      startedAt:
        current?.startedAt ||
        null,
      runId:
        current?.runId ||
        null
    };
  }


  return {
    acquired:
      true,
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
        "_locks/generate-news",
        {
          type:
            "json",
          consistency:
            "strong"
        }
      );


    if (
      current?.token === token
    ) {

      await store.delete(
        "_locks/generate-news"
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
// REDAKTIONELLT MINNE
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


  // =====================================================
  // NUVARANDE LATEST
  // =====================================================

  const latest =
    await store.get(
      "latest",
      {
        type:
          "json",
        consistency:
          "strong"
      }
    );


  if (
    latest?.id
  ) {

    result.push(
      latest
    );

    seenIds.add(
      latest.id
    );
  }


  // =====================================================
  // ARKIV
  // =====================================================

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
      result.length >=
      limit
    ) {
      break;
    }


    try {

      const item =
        await store.get(
          key,
          {
            type:
              "json",
            consistency:
              "strong"
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
  if (
    !history.length
  ) {
    return "";
  }


  return history
    .slice(
      0,
      20
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
// DUBLETTSKYDD
// =====================================================

function findDuplicateMatch({
  candidateText,
  history
}) {
  const candidate =
    buildTopicTokens(
      candidateText
    );


  if (
    !candidate.size
  ) {
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


    if (
      !previous.size
    ) {
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


    const unionSize =
      union.size;


    const jaccard =
      unionSize
        ? intersection.length /
          unionSize
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
      ) ||
      jaccard >= 0.28 ||
      hasRareExactToken;


    if (
      looksDuplicate
    ) {

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
              .toFixed(
                2
              )
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
// DATUMFILTER HISTORIK
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
      ) ||
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


        if (
          hostname ===
            "reddit.com" ||
          hostname.endsWith(
            ".reddit.com"
          )
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
        .slice(
          -2
        )
        .join(
          "."
        );


    if (
      parts.length >= 3 &&
      twoPartSuffixes.includes(
        lastTwo
      )
    ) {

      return parts
        .slice(
          -3
        )
        .join(
          "."
        );
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
      difference <=
        maxAge &&

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
    .format(
      date
    )
    .replace(
      /\D/g,
      ""
    );
}


function createRunId(
  date
) {
  return (
    createArticleId(
      date
    ) +
    "-" +
    Math.random()
      .toString(
        36
      )
      .slice(
        2,
        8
      )
  );
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
    ).slice(
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
// JSON RESPONSE
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
