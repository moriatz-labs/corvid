import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "corvin-demo-app-backend" });
});

app.get("/api/checkout-summary", (_request, response) => {
  response.json({
    plan: "Growth",
    subtotal: 49,
    tax: 4,
    total: 53,
    currency: "USD",
  });
});

app.listen(port, () => {
  console.log(`Corvin demo backend listening on ${port}`);
});
