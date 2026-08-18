import fetch from 'node-fetch';

export async function handler(event, context) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "API-nyckel saknas i Netlify" }),
    };
  }

  try {
    const prompt = `Du är redaktör för Kafferasten.se.
Skapa dagens mest underhållande och aktuella snackis för svenska fikaraster baserat på vad som trender i Sverige just nu.
Returnera SVARET ENBART som giltig JSON utan markdown-formatering med följande nycklar:
{
  "title": "En fångande rubrik om nyheten",
  "image": "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800",
  "imageCaption": "Foto / Bildkälla: Illustrativ bild",
  "content": "<p>Första stycket om nyheten...</p><p>Andra stycket med detaljer...</p>",
  "updatedTime": "06:30",
  "pollQuestion": "En rolig fråga till fikarasten relaterad till artikeln?",
  "pollOpt1": "Alternativ 1",
  "pollOpt2": "Alternativ 2",
  "sourcesHtml": "<a href='https://sverigesradio.se' target='_blank'>Sveriges Radio</a> • <a href='https://aftonbladet.se' target='_blank'>Aftonbladet</a>"
}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const result = await response.json();
    const rawText = result.candidates[0].content.parts[0].text;
    
    const cleanJsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const articleData = JSON.parse(cleanJsonText);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(articleData)
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}