import { getStore } from "@netlify/blobs";

const STORE_NAME = "kafferasten-news";
const LOCK_KEY = "_locks/generate-news";
const STATUS_KEY = "_diagnostics/generation-status";

const HISTORY_DAYS = 14;
const HISTORY_LIMIT = 20;
const MAX_ATTEMPTS = 3;


/* =========================================================
   FIKATIPS
========================================================= */

const FIKA_TIPS = [
  {
    emoji: "🥐",
    kicker: "Lite kontinentalt",
    title: "Croissant utan krångel",
    text: "En bra croissant och en kopp kaffe. Franskt i teorin, fullt rimligt i ett svenskt fikarum.",
    imageQuery: "fresh croissant coffee",
    imageAlt: "Croissant till kaffet"
  },
  {
    emoji: "🍇",
    kicker: "När sötsuget kommer",
    title: "Kalla vindruvor",
    text: "Kalla vindruvor till kaffet är friskt, sött och märkligt lätt att fortsätta plocka av.",
    imageQuery: "fresh green grapes bowl",
    imageAlt: "Kalla vindruvor i en skål"
  },
  {
    emoji: "🍪",
    kicker: "Två tuggor räcker",
    title: "Småkakan gör comeback",
    text: "En liten kaka till kaffet är underskattat. Bonuspoäng om den smular lagom mycket över tangentbordet.",
    imageQuery: "cookies coffee table",
    imageAlt: "Småkakor till kaffe"
  },
  {
    emoji: "🍫",
    kicker: "Akutlösningen",
    title: "Två rutor choklad",
    text: "Två bra rutor choklad till kaffet – och sedan låtsas vi att självdisciplin var planen hela tiden.",
    imageQuery: "dark chocolate pieces coffee",
    imageAlt: "Chokladbitar bredvid kaffe"
  },
  {
    emoji: "🍎",
    kicker: "Enklast vinner",
    title: "Äpple och kaffe",
    text: "Krispigt äpple till kaffe låter nästan för nyttigt för fika, men kombinationen fungerar.",
    imageQuery: "red apple coffee",
    imageAlt: "Äpple och kaffe"
  },
  {
    emoji: "🥪",
    kicker: "När fikat är hungrigt",
    title: "Den lilla mackan",
    text: "En halv ost- eller skinkmacka gör underverk när det egentligen är lunchen du längtar efter.",
    imageQuery: "small cheese sandwich coffee",
    imageAlt: "En liten smörgås till kaffet"
  },
  {
    emoji: "🧁",
    kicker: "Klassiker med krydda",
    title: "Kardemummabulle",
    text: "När kanelbullen känns för självklar: kardemumma. Fortfarande fika, men med lite mer självförtroende.",
    imageQuery: "Swedish cardamom bun",
    imageAlt: "Kardemummabulle"
  },
  {
    emoji: "🍰",
    kicker: "Fredagskänsla",
    title: "En liten bit morotskaka",
    text: "Morot i namnet betyder inte sallad. Men det är åtminstone ett trevligt alibi.",
    imageQuery: "carrot cake slice coffee",
    imageAlt: "En bit morotskaka"
  }
];


/* =========================================================
   FIKAFAKTA
========================================================= */

const FIKA_FACTS = [
  {
    emoji: "☕",
    kicker: "Språkhörnan",
    title: "Fika är både sak och handling",
    text: "På svenska kan fika vara både substantiv och verb: vi tar en fika – och vi fikar.",
    imageQuery: "Swedish coffee break coffee cups",
    imageAlt: "Kaffekoppar under en fikapaus"
  },
  {
    emoji: "🔄",
    kicker: "Ordet fika",
    title: "Kaffi blev fika",
    text: "En vanlig förklaring är att fika växte fram ur backslang där stavelserna i ”kaffi” kastades om.",
    imageQuery: "coffee cup cafe table",
    imageAlt: "Kaffekopp på ett kafébord"
  },
  {
    emoji: "🍒",
    kicker: "Från buske till kopp",
    title: "Kaffe börjar som en frukt",
    text: "Kaffebönan är egentligen fröet inuti kaffeväxtens frukt.",
    imageQuery: "coffee cherries plant",
    imageAlt: "Kaffebär på en kaffeväxt"
  },
  {
    emoji: "🌱",
    kicker: "Två stora namn",
    title: "Arabica och robusta",
    text: "Arabica och robusta är de två kaffevarianter som dominerar kaffemarknaden.",
    imageQuery: "coffee beans arabica robusta",
    imageAlt: "Rostade kaffebönor"
  },
  {
    emoji: "🌿",
    kicker: "Bakom kryddan",
    title: "Kanel är bark",
    text: "Kanel kommer från den torkade innerbarken på träd i släktet Cinnamomum.",
    imageQuery: "cinnamon sticks bark spice",
    imageAlt: "Kanelstänger"
  },
  {
    emoji: "🥐",
    kicker: "Smörvetenskap",
    title: "Croissanten byggs i lager",
    text: "Croissantdeg kavlas och viks med smör i flera lager. Det är där fraset föds.",
    imageQuery: "croissant pastry layers close up",
    imageAlt: "Frasiga lager i en croissant"
  },
  {
    emoji: "🍫",
    kicker: "Före chokladen",
    title: "Kakao växer i stora frukter",
    text: "Kakaobönor finns inuti stora kakaofrukter som växer direkt på kakaoträdet.",
    imageQuery: "cacao pods tree",
    imageAlt: "Kakaofrukter på ett kakaoträd"
  },
  {
    emoji: "🫖",
    kicker: "Inte bara kaffe",
    title: "Fika kräver ingen kaffekopp",
    text: "Fika handlar minst lika mycket om pausen och sällskapet som om drycken.",
    imageQuery: "friends coffee break table",
    imageAlt: "Vänner som tar en fikapaus tillsammans"
  }
];


/* =========================================================
   HUVUDFUNKTION
========================================================= */

export default async (request) => {

  const CRON_SECRET =
    process.env.KAFFERASTEN_CRON_SECRET;


  if (!CRON_SECRET) {

    return jsonResponse(
      {
        success: false,
        error: "KAFFERASTEN_CRON_SECRET saknas i Netlify"
      },
      500
    );
  }


  if (request.method !== "POST") {

    return new Response(
      JSON.stringify(
        {
          success: false,
          error: "Method not allowed"
        },
        null,
        2
      ),
      {
        status: 405,
        headers: {
          "Content-Type":
            "application/json; charset=utf-8",
          "Cache-Control":
            "no-store",
          "Allow":
            "POST"
        }
      }
    );
  }


  const authorization =
    request.headers.get("authorization") || "";


  const expectedAuthorization =
    `Bearer ${CRON_SECRET}`;


  if (
    authorization !==
    expectedAuthorization
  ) {

    return jsonResponse(
      {
        success: false,
        error: "Unauthorized"
      },
      401
    );
  }


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
      message: "Background-funktionen har startat.",
      startedAt: now.toISOString(),
      updatedAt: new Date().toISOString(),
      swedishTime: nowInSweden
    }
  );


  if (!OPENAI_API_KEY) {

    await saveGenerationStatus(
      store,
      {
        runId,
        status: "error",
        stage: "api-key",
        message: "OPENAI_API_KEY saknas i Netlify.",
        startedAt: now.toISOString(),
        updatedAt: new Date().toISOString(),
        swedishTime: nowInSweden
      }
    );

    return jsonResponse(
      {
        success: false,
        error: "OPENAI_API_KEY saknas i Netlify"
      },
      500
    );
  }


  try {

    /* =====================================================
       KÖRLÅS
    ===================================================== */

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
            generationLock.startedAt || null,
          lockRunId:
            generationLock.runId || null,
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


    /* =====================================================
       HISTORIK
    ===================================================== */

    const recentHistory =
      await loadRecentHistory({
        store,
        now,
        days: HISTORY_DAYS,
        limit: HISTORY_LIMIT
      });


    const recentTopicsForPrompt =
      formatRecentTopicsForPrompt(
        recentHistory
      );


    const editorialVarietyForPrompt =
      buildEditorialVarietyRule(
        recentHistory
      );


    const totalUsage = {
      research1: null,
      verification1: null,
      research2: null,
      verification2: null,
      research3: null,
      verification3: null,
      writing: null
    };


    let rejectedTopic =
      "";


    /* =====================================================
       KANDIDATER
    ===================================================== */

    for (
      let candidateAttempt = 1;
      candidateAttempt <= MAX_ATTEMPTS;
      candidateAttempt++
    ) {

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


      /* ===================================================
         RESEARCH
      =================================================== */

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

Hitta EN färsk, rolig eller intressant snackis
som passar riktigt bra vid en svensk fikarast.

Detta är kandidatförsök ${candidateAttempt} av ${MAX_ATTEMPTS}.

KRAV:

- Själva händelsen ska normalt ha inträffat under de senaste 72 timmarna.
- En ny artikel om en gammal händelse gör inte händelsen ny.
- Ämnet ska vara lätt att förstå även för den som inte redan följer nyheten.
- Det ska finnas en naturlig fikafråga eller åsikt att haka upp samtalet på.

REDAKTIONELLT MINNE:

Kafferasten.se har redan publicerat följande ämnen
de senaste ${HISTORY_DAYS} dagarna:

${recentTopicsForPrompt || "Inga tidigare ämnen finns ännu."}

MYCKET VIKTIGT – VARIERA FIKABORDET:

${editorialVarietyForPrompt}

Kafferasten ska kännas som ett blandat fikabord,
inte som en sajt som fastnat i en enda sorts nyheter.

Titta särskilt på de senaste 6 publiceringarna.

Välj helst en ANNAN ämnesfamilj än de som nyligen dominerat.

Ämnesfamiljer kan exempelvis vara:

- djur
- TV och streaming
- musik och kändisar
- teknik
- arbetsliv
- konsument
- sport
- internet och viralt
- mat och livsstil
- vetenskap
- vardagsfenomen
- svenska traditioner

HÅRD REGEL:

Om minst två av de senaste sex snackisarna handlar
huvudsakligen om djur ska du INTE välja ännu en djurnyhet,
såvida det inte är en exceptionellt stor och mycket bred snackis.

Samma princip gäller andra ämnesfamiljer:
om något redan dominerar ska du aktivt leta någon annanstans.

Variation är en del av redaktörsjobbet.

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
        research.data.usage || null;


      const researchPart =
        getOutputTextPart(
          research.data
        );


      const researchText =
        researchPart?.text || "";


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


      /* ===================================================
         VERIFIERING
      =================================================== */

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
        verification.data.usage || null;


      const verificationPart =
        getOutputTextPart(
          verification.data
        );


      const verificationText =
        verificationPart?.text || "";


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
              candidateAttempt < MAX_ATTEMPTS
                ? "running"
                : "rejected",

            stage:
              `candidate-${candidateAttempt}-rejected`,

            message:
              "Kandidaten underkändes eftersom den inte klarade färskhets- eller källkraven.",

            candidateAttempt,

            saysCurrent,

            triggerDate:
              triggerDate || null,

            triggerIsFresh:
              Boolean(triggerIsFresh),

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
          candidateAttempt < MAX_ATTEMPTS
        ) {
          continue;
        }


        return jsonResponse(
          {
            success: false,
            stage: "verification"
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


      /* ===================================================
         DUBLETTCHECK
      =================================================== */

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
              candidateAttempt < MAX_ATTEMPTS
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
          candidateAttempt < MAX_ATTEMPTS
        ) {
          continue;
        }


        return jsonResponse(
          {
            success: false,
            stage: "duplicate-check"
          },
          422
        );
      }


      /* ===================================================
         SKRIV ARTIKEL
      =================================================== */

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

Källorna används bara för att säkerställa fakta.
De visas separat av sajten längst ner.

I title, summary, freshTrigger, paragraphs,
whyTalkAboutIt, pollQuestion och pollOptions
får du ALDRIG skriva:

- URL
- domännamn
- tekniska citationsmarkeringar
- "källa:"
- "enligt svt.se"
- liknande tekniskt källspråk

KAFFERASTENS RÖST OCH SPRÅK:

MÅLGRUPPEN ÄR SVENSK.

Skriv för en vanlig person i Sverige som läser
snackisen på jobbet och inte förväntas känna till
utländska platser, fenomen, djurarter, tv-program
eller engelska uttryck sedan tidigare.

SPRÅKET:

- Skriv idiomatisk, modern och naturlig svenska.
- Texten får ALDRIG kännas direktöversatt från engelska.
- Kontrollera svensk grammatik, genus, böjning och ordföljd.
- Var särskilt noga med en/ett.
- Använd etablerad svensk benämning när sådan finns.
- Översätt engelska beskrivande ord när svenska är naturligt.
- Skriv exempelvis "kristet metalband", aldrig "Christian metalband".
- Behåll riktiga egennamn, filmtitlar, artistnamn och varumärken.
- Undvik svengelska konstruktioner.
- Undvik pressmeddelandespråk.
- Undvik stela AI-formuleringar.

OBEKANTA ORD OCH FENOMEN:

Om artikeln innehåller ett ord, en djurart,
ett fenomen, en institution eller ett begrepp
som många svenska läsare rimligen inte känner till:

1. använd korrekt svensk benämning om sådan finns
2. förklara kort vad det är första gången det nämns
3. gör det naturligt inne i meningen

Exempel:

"En wallaby, ett mindre kängurudjur, ..."

Skriv INTE som om läsaren redan vet vad en wallaby,
ett amerikanskt tv-format, en lokal myndighet
eller ett ovanligt engelskt begrepp är.

UTLÄNDSKA NYHETER:

En utländsk snackis är helt okej,
men den ska berättas ur en svensk läsares perspektiv.

Om platsen är obekant:
ge precis så mycket geografisk förklaring som behövs.

Skriv hellre:
"i Cornwall i sydvästra England"

än att bara kasta in ett lokalt ortsnamn utan sammanhang.

TON:

- Våga ta ut svängarna utan att hitta på fakta.
- Skriv som en kvick människa som verkligen vill berätta nyheten vid fikabordet.
- Var varm, nyfiken och lite smårolig.
- Var inte tramsig eller hurtig.
- Rubriken ska säga vad som faktiskt hänt.
- Sammanfattningen ska vara högst två meningar.
- Brödtexten ska vara 2 eller 3 korta stycken.
- Tänk mobil.

SNACKA VIDARE PÅ FIKAT:

Fältet whyTalkAboutIt visas för läsaren
under rubriken "Snacka vidare på fikat".

Det ska därför INTE förklara varför redaktionen
tycker att ämnet passar på fika.

Skriv INTE:

- "Det här passar bra på fikat eftersom..."
- "Det är ett roligt samtalsämne eftersom..."
- "Nyheten väcker diskussion..."
- andra interna redaktionella motiveringar.

whyTalkAboutIt ska i stället innehålla
2–3 konkreta samtalsöppnare som läsaren faktiskt
kan använda runt bordet.

De får gärna vara frågor.

Exempel:

- "Vilket djur hade varit värst att hitta i trädgården?"
- "Hade du försökt fånga den – eller låst dörren?"
- "Vilken helt vanlig vardagspryl borde egentligen uppfinnas om från början?"

Variera formuleringarna och anpassa dem till nyheten.

Pollfrågan ska ha exakt två alternativ.

SKRIBENTENS TON:

${writerVoice(byline)}

BILDMETADATA:

Vi söker automatiskt bilder på Pexels.

Skapa TRE engelska bildsökningar
i prioriteringsordning.

imageSearchQueries[0]:
- huvudmotivet
- 1–4 konkreta ord
- exempel "monitor lizard", "curling stones", "concert crowd"

imageSearchQueries[1]:
- bredare version av motivet
- exempel "large lizard reptile", "winter curling sport"

imageSearchQueries[2]:
- miljö eller visuell metafor
- exempel "South Korea park", "winter sports arena"

Lägg inte platsnamn i första sökningen
om huvudmotivet går att söka direkt.

imageAlt:
- kort naturlig svensk alt-text

imagePrompt:
- beskrivning för möjlig framtida illustration
- ingen text eller logotyp

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
                    },

                    imageSearchQueries: {
                      type: "array",
                      minItems: 3,
                      maxItems: 3,

                      items: {
                        type: "string"
                      }
                    },

                    imageAlt: {
                      type: "string"
                    },

                    imagePrompt: {
                      type: "string"
                    },

                    imageStyle: {
                      type: "string",

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
                    "imageSearchQueries",
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
        writing.data.usage || null;


      const writingPart =
        getOutputTextPart(
          writing.data
        );


      let article;


      try {

        article =
          JSON.parse(
            writingPart?.text || ""
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
              writingPart?.text?.slice(
                0,
                1000
              ) || "",
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


      /* ===================================================
         RENGÖR ARTIKEL
      =================================================== */

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
        safeArray(
          article.paragraphs
        )
          .map(cleanReaderText)
          .filter(Boolean);

      article.whyTalkAboutIt =
        safeArray(
          article.whyTalkAboutIt
        )
          .map(cleanReaderText)
          .filter(Boolean);

      article.pollQuestion =
        cleanReaderText(
          article.pollQuestion
        );

      article.pollOptions =
        safeArray(
          article.pollOptions
        )
          .map(cleanReaderText)
          .filter(Boolean);

      article.imageSearchQueries =
        safeArray(
          article.imageSearchQueries
        )
          .map(
            query =>
              String(query || "").trim()
          )
          .filter(Boolean)
          .slice(0, 3);


      /* ===================================================
         SLUTLIG DUBLETTCHECK
      =================================================== */

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
              candidateAttempt < MAX_ATTEMPTS
                ? "running"
                : "rejected",

            stage:
              "final-duplicate-check",

            message:
              `Den färdiga artikeln bedömdes vara för lik "${duplicateArticle.title}".`,

            candidateAttempt,

            articleTitle:
              article.title || null,

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
          candidateAttempt < MAX_ATTEMPTS
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


      /* ===================================================
         ARTIKEL-ID
      =================================================== */

      const articleId =
        createArticleId(
          new Date()
        );


      /* ===================================================
         BILDER
      =================================================== */

      await saveGenerationStatus(
        store,
        {
          runId,
          status: "running",
          stage: "image",
          message:
            "Letar efter artikelbild och fikabilder på Pexels.",
          candidateAttempt,
          imageSearchQueries:
            article.imageSearchQueries,
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

          queries:
            article.imageSearchQueries,

          alt:
            article.imageAlt,

          category:
            article.category
        });


      const sidebarContent =
        await buildSidebarContent({
          apiKey:
            PEXELS_API_KEY,

          seed:
            articleId
        });


      /* ===================================================
         BYGG POST
      =================================================== */

      const savedNews = {

        id:
          articleId,

        createdAt:
          new Date().toISOString(),

        generatedAt:
          formatSwedishDateTime(
            new Date()
          ),

        byline,

        editorialTone,

        verifiedTrigger,

        article,

        heroImage,

        sidebarContent,

        sources:
          selectedSources
      };


      /* ===================================================
         PUBLICERING
      =================================================== */

      await saveGenerationStatus(
        store,
        {
          runId,
          status: "running",
          stage: "publishing",
          message:
            "Artikeln och bilderna är godkända. Förbereder publicering.",
          title:
            article.title,
          byline,
          editorialTone,
          articleId,

          imageProvider:
            heroImage?.provider ||
            "fallback",

          imageSearchUsed:
            heroImage?.searchQuery ||
            null,

          fikaTipImageProvider:
            sidebarContent?.tip?.image?.provider ||
            "fallback",

          fikaFactImageProvider:
            sidebarContent?.fact?.image?.provider ||
            "fallback",

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
              confirmation?.id || null,
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


      /* ===================================================
         KLART
      =================================================== */

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

          imageSearchQueries:
            article.imageSearchQueries,

          imageSearchUsed:
            heroImage?.searchQuery ||
            null,

          imageProvider:
            heroImage?.provider ||
            "fallback",

          imagePhotographer:
            heroImage?.photographerName ||
            null,

          fikaTip:
            sidebarContent?.tip?.title ||
            null,

          fikaTipImageProvider:
            sidebarContent?.tip?.image?.provider ||
            "fallback",

          fikaFact:
            sidebarContent?.fact?.title ||
            null,

          fikaFactImageProvider:
            sidebarContent?.fact?.image?.provider ||
            "fallback",

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
          sidebarContent,
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
        status: "rejected",
        stage: "no-result",
        message:
          "Alla tre kandidater underkändes. Ingen ny artikel publicerades.",
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
      422
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
            error.stack || ""
          ).slice(0, 2500),
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


/* =========================================================
   SIDOINNEHÅLL
========================================================= */

async function buildSidebarContent({
  apiKey,
  seed
}) {

  const base =
    hashString(seed);


  const tip =
    {
      ...FIKA_TIPS[
        base %
        FIKA_TIPS.length
      ]
    };


  const fact =
    {
      ...FIKA_FACTS[
        (
          base * 7 + 3
        ) %
        FIKA_FACTS.length
      ]
    };


  const [
    tipImage,
    factImage
  ] =
    await Promise.all([
      searchPexelsImage({
        apiKey,
        query:
          tip.imageQuery,
        alt:
          tip.imageAlt
      }),

      searchPexelsImage({
        apiKey,
        query:
          fact.imageQuery,
        alt:
          fact.imageAlt
      })
    ]);


  tip.image =
    tipImage ||
    {
      provider: "fallback"
    };


  fact.image =
    factImage ||
    {
      provider: "fallback"
    };


  return {
    tip,
    fact
  };
}


/* =========================================================
   HERO-BILD
========================================================= */

async function getHeroImage({
  apiKey,
  queries,
  alt,
  category
}) {

  if (!apiKey) {

    return fallbackHeroImage(
      category,
      alt
    );
  }


  const searchQueries =
    safeArray(
      queries
    )
      .map(
        query =>
          String(query || "").trim()
      )
      .filter(Boolean)
      .slice(0, 3);


  for (
    const query
    of searchQueries
  ) {

    const result =
      await searchPexelsImage({
        apiKey,
        query,
        alt
      });


    if (result) {
      return result;
    }
  }


  return fallbackHeroImage(
    category,
    alt
  );
}


/* =========================================================
   PEXELS
========================================================= */

async function searchPexelsImage({
  apiKey,
  query,
  alt
}) {

  if (
    !apiKey ||
    !query
  ) {
    return null;
  }


  try {

    const params =
      new URLSearchParams({
        query,
        orientation: "landscape",
        size: "medium",
        locale: "en-US",
        per_page: "5"
      });


    const response =
      await fetch(
        `https://api.pexels.com/v1/search?${params.toString()}`,
        {
          headers: {
            Authorization:
              apiKey
          }
        }
      );


    if (!response.ok) {

      console.warn(
        "Pexels-sökning misslyckades:",
        query,
        response.status
      );

      return null;
    }


    const data =
      await response.json();


    const photos =
      Array.isArray(
        data.photos
      )
        ? data.photos
        : [];


    if (!photos.length) {
      return null;
    }


    const photo =
      photos[0];


    const imageUrl =
      photo.src?.landscape ||
      photo.src?.large ||
      photo.src?.medium ||
      photo.src?.original;


    if (!imageUrl) {
      return null;
    }


    return {
      provider: "pexels",

      searchQuery:
        query,

      url:
        imageUrl,

      smallUrl:
        photo.src?.medium ||
        photo.src?.small ||
        imageUrl,

      alt:
        cleanReaderText(
          alt ||
          photo.alt ||
          "Bild från Pexels"
        ),

      photographerName:
        photo.photographer ||
        "Pexels-fotograf",

      photographerUrl:
        photo.photographer_url ||
        photo.url ||
        "https://www.pexels.com/",

      photoUrl:
        photo.url ||
        "https://www.pexels.com/",

      pexelsUrl:
        "https://www.pexels.com/",

      pexelsPhotoId:
        photo.id || null
    };


  } catch (error) {

    console.warn(
      "Pexels-sökningen kraschade:",
      query,
      error.message
    );

    return null;
  }
}


function fallbackHeroImage(
  category,
  alt
) {

  return {
    provider: "fallback",
    searchQuery: null,
    url: null,
    smallUrl: null,

    alt:
      cleanReaderText(
        alt ||
        `Bild till dagens snackis i kategorin ${category || "Vardag"}`
      )
  };
}


/* =========================================================
   DIAGNOSTIK
========================================================= */

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


/* =========================================================
   KÖRLÅS
========================================================= */

async function acquireGenerationLock(
  store,
  now,
  runId
) {

  const staleAfterMs =
    20 * 60 * 1000;


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
          existing.runId || null
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
        current?.startedAt || null,
      runId:
        current?.runId || null
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


/* =========================================================
   HISTORIK
========================================================= */

async function loadRecentHistory({
  store,
  now,
  days,
  limit
}) {

  const result = [];

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
      prefix: "archive/"
    });


  const archiveKeys =
    (
      listing.blobs || []
    )
      .map(
        blob =>
          blob.key
      )
      .sort()
      .reverse()
      .slice(0, 50);


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
        seenIds.has(item.id)
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
      (a, b) =>
        new Date(
          b.createdAt || 0
        ) -
        new Date(
          a.createdAt || 0
        )
    )
    .slice(
      0,
      limit
    );
}


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
          item.article?.title ||
          "Okänd rubrik";


        const trigger =
          item.verifiedTrigger?.description ||
          item.article?.freshTrigger ||
          "";


        const date =
          item.verifiedTrigger?.date ||
          item.article?.triggerDate ||
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


/* =========================================================
   REDAKTIONELL VARIATION
========================================================= */

function buildEditorialVarietyRule(
  history
) {

  const recent =
    safeArray(history)
      .slice(0, 6);


  if (!recent.length) {

    return `
Det finns ännu för få tidigare publiceringar
för att någon ämnesfamilj ska blockeras.
Försök ändå välja en bred och originell snackis.
`.trim();
  }


  const families = {};


  for (
    const item
    of recent
  ) {

    const family =
      detectTopicFamily(item);


    families[family] =
      (families[family] || 0) + 1;
  }


  const sorted =
    Object.entries(families)
      .sort(
        (a, b) =>
          b[1] - a[1]
      );


  const summary =
    sorted
      .map(
        ([family, count]) =>
          `${family}: ${count}`
      )
      .join(", ");


  const overused =
    sorted
      .filter(
        ([, count]) =>
          count >= 2
      )
      .map(
        ([family]) =>
          family
      );


  if (!overused.length) {

    return `
De senaste ${recent.length} snackisarna är ganska väl varierade.

Fördelning:
${summary}

Fortsätt sprida ämnena och undvik helst
samma ämnesfamilj som den allra senaste artikeln.
`.trim();
  }


  return `
De senaste ${recent.length} snackisarna har denna fördelning:

${summary}

FÖR ÖVERREPRESENTERADE ÄMNEN:

${overused.join(", ")}

Välj i första hand INTE någon av dessa ämnesfamiljer
i den här publiceringen.

Leta aktivt efter ett ämne från en annan del
av fikabordet.
`.trim();
}


function detectTopicFamily(
  item
) {

  const article =
    item?.article || {};


  const text =
    [
      article.title,
      article.summary,
      article.category,
      article.freshTrigger,
      ...(safeArray(
        article.paragraphs
      ))
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();


  const containsTerm =
    term => {

      const escaped =
        String(term)
          .replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );


      return new RegExp(
        `(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`,
        "iu"
      )
        .test(text);
    };


  const containsAny =
    words =>
      words.some(
        containsTerm
      );


  if (
    containsAny([
      "djur",
      "hund",
      "katt",
      "känguru",
      "kanguru",
      "wallaby",
      "älg",
      "björn",
      "varg",
      "orm",
      "ödla",
      "krokodil",
      "alligator",
      "apa",
      "fågel",
      "pingvin",
      "häst",
      "gris",
      "räv",
      "utter",
      "säl",
      "haj",
      "delfin"
    ])
  ) {

    return "djur";
  }


  if (
    article.category ===
      "TV & streaming"
    ||
    containsAny([
      "netflix",
      "hbo",
      "disney+",
      "streaming",
      "tv-serie",
      "tv-program",
      "säsong",
      "sasong"
    ])
  ) {

    return "TV och streaming";
  }


  if (
    containsAny([
      "artist",
      "sångare",
      "sangare",
      "musik",
      "album",
      "konsert",
      "festival",
      "kändis",
      "kandis"
    ])
  ) {

    return "musik och kändisar";
  }


  if (
    article.category ===
      "Teknik"
  ) {

    return "teknik";
  }


  if (
    article.category ===
      "Arbetsliv"
  ) {

    return "arbetsliv";
  }


  if (
    article.category ===
      "Sport"
  ) {

    return "sport";
  }


  if (
    containsAny([
      "tiktok",
      "viral",
      "internet",
      "sociala medier",
      "instagram",
      "youtube",
      "meme"
    ])
  ) {

    return "internet och viralt";
  }


  if (
    containsAny([
      "mat",
      "restaurang",
      "recept",
      "godis",
      "kaffe",
      "dryck",
      "glass",
      "hamburgare"
    ])
  ) {

    return "mat och livsstil";
  }


  if (
    article.category ===
      "Vardag"
  ) {

    return "vardagsfenomen";
  }


  if (
    article.category ===
      "Nöje"
  ) {

    return "nöje";
  }


  return "udda och övrigt";
}


/* =========================================================
   SKRIBENTER
========================================================= */

function normalizeEditorialTone(
  value
) {

  const normalized =
    String(value || "")
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
    editorialTone === "UNGDOMLIG"
  ) {

    return "Camille";
  }


  return Math.random() < 0.5
    ? "Kent på Kafferasten"
    : "Bettan";
}


function writerVoice(
  byline
) {

  if (
    byline === "Camille"
  ) {

    return `
Camille är snabb, samtida och popkulturellt nyfiken.
Hon kan vara lekfull och pigg, men använder naturlig svenska.
Hon tvingar aldrig in ungdomsslang eller engelska uttryck.
`;
  }


  if (
    byline === "Bettan"
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


/* =========================================================
   TEXTTVÄTT
========================================================= */

function cleanReaderText(
  value
) {

  if (!value) {
    return "";
  }


  return String(value)

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


function safeArray(
  value
) {

  return Array.isArray(value)
    ? value
    : [];
}


/* =========================================================
   DUBLETTER – MINDRE AGGRESSIV VERSION
========================================================= */

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
      item.article?.title,
      item.article?.summary,
      item.article?.freshTrigger,
      item.verifiedTrigger?.description
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
      [...candidate]
        .filter(
          token =>
            previous.has(token)
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


    const specificSharedTerms =
      intersection.filter(
        token =>
          token.length >= 5 &&
          !GENERIC_TOPIC_WORDS.has(
            token
          ) &&
          !SOFT_DUPLICATE_WORDS.has(
            token
          )
      );


    const strongContainment =
      intersection.length >= 3 &&
      containment >= 0.42;


    const strongJaccard =
      intersection.length >= 4 &&
      jaccard >= 0.24;


    const strongSpecificMatch =
      specificSharedTerms.length >= 2 &&
      containment >= 0.30;


    const looksDuplicate =
      strongContainment ||
      strongJaccard ||
      strongSpecificMatch;


    if (looksDuplicate) {

      return {
        id:
          item.id || null,

        title:
          item.article?.title ||
          "Tidigare snackis",

        createdAt:
          item.createdAt || null,

        score:
          Number(
            Math.max(
              jaccard,
              containment
            ).toFixed(2)
          ),

        sharedTerms:
          intersection.slice(0, 10),

        specificSharedTerms:
          specificSharedTerms.slice(0, 10),

        duplicateReason:
          strongSpecificMatch
            ? "specific-terms"
            : strongContainment
              ? "containment"
              : "jaccard"
      };
    }
  }


  return null;
}


/* =========================================================
   STOPPORD
========================================================= */

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


const SOFT_DUPLICATE_WORDS =
  new Set([
    "traditionella",
    "traditionell",
    "internationella",
    "internationell",
    "uppmärksamhet",
    "uppmarksamhet",
    "förändringen",
    "forandringen",
    "förändring",
    "forandring",
    "nyheten",
    "nyheter",
    "beskedet",
    "besked",
    "hjälpen",
    "hjalpen",
    "frågan",
    "fragan",
    "diskussion",
    "reaktioner",
    "reagerar",
    "reagerat",
    "aktuella",
    "aktuell",
    "händelsen",
    "handelsen",
    "händelse",
    "handelse",
    "personer",
    "personen",
    "företaget",
    "foretaget",
    "bolaget",
    "svenska",
    "sverige"
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


/* =========================================================
   ÄMNESORD
========================================================= */

function buildTopicTokens(
  text
) {

  return new Set(
    normalizeTopicText(text)
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

  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
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


/* =========================================================
   HASH
========================================================= */

function hashString(
  value
) {

  let hash = 0;

  const text =
    String(
      value ||
      "kafferasten"
    );


  for (
    let i = 0;
    i < text.length;
    i++
  ) {

    hash =
      (
        (hash << 5) -
        hash
      )
      +
      text.charCodeAt(i);

    hash |= 0;
  }


  return Math.abs(hash);
}


/* =========================================================
   DATUM
========================================================= */

function isWithinDays(
  isoDate,
  now,
  days
) {

  if (!isoDate) {
    return true;
  }


  const date =
    new Date(isoDate);


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


/* =========================================================
   OPENAI
========================================================= */

async function callOpenAI({
  apiKey,
  body
}) {

  const response =
    await fetch(
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
    ok: response.ok,
    status: response.status,
    data
  };
}


function getOutputTextPart(
  data
) {

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


/* =========================================================
   KÄLLOR
========================================================= */

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
          hostname !== "reddit.com" &&
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
          item.url === source.url
      )
  );
}


function getDomain(
  url
) {

  try {

    const hostname =
      new URL(url)
        .hostname
        .toLowerCase()
        .replace(
          /^www\./,
          ""
        );


    const parts =
      hostname.split(".");


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

  const result = [];


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
      seenDomains.has(domain)
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


/* =========================================================
   TRIGGER
========================================================= */

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


/* =========================================================
   ID / TID
========================================================= */

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

      dateStyle: "full",
      timeStyle: "short"
    }
  )
    .format(date);
}


/* =========================================================
   FEL / TOKENS / JSON
========================================================= */

function simplifyError(
  data
) {

  if (!data) {
    return null;
  }


  if (
    typeof data === "string"
  ) {

    return data.slice(
      0,
      1500
    );
  }


  try {

    return JSON.stringify(
      data.error || data
    ).slice(
      0,
      1500
    );


  } catch {

    return "Okänt fel";
  }
}


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
