export default async () => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY saknas" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "Svara exakt med texten: Hej från Kafferasten"
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    return new Response(
      JSON.stringify(
        {
          statusFromGemini: response.status,
          ok: response.ok,
          data
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          error: "Netlify-funktionen fick ett undantag",
          message: error.message
        },
        null,
        2
      ),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
