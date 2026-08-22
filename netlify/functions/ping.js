export default async () => {
  return new Response(
    JSON.stringify(
      {
        success: true,
        message: "Vanlig Netlify Function fungerar."
      },
      null,
      2
    ),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
};
