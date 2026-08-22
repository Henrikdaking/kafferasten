export default async () => {
  console.log("Ping background startade.");

  await new Promise(
    resolve => setTimeout(resolve, 5000)
  );

  console.log("Ping background klar.");
};

export const config = {
  background: true
};
