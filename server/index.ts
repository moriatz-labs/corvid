import { app } from "./app.js";

const port = Number(process.env.CORVIN_API_PORT ?? 8787);

app.listen(port, "127.0.0.1", () => {
  console.log(`Corvin local runner listening on http://127.0.0.1:${port}`);
});
