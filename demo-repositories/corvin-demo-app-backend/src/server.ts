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
    headline: "Review every charge before payment.",
    subcopy: "The backend now sends the exact charge labels the frontend displays, so the PM change exercises both repositories.",
    charges: [
      {
        label: "Growth plan",
        detail: "Monthly subscription",
        amount: 49,
      },
      {
        label: "Estimated tax",
        detail: "Calculated before payment",
        amount: 4,
      },
    ],
    subtotal: 49,
    tax: 4,
    total: 53,
    currency: "USD",
    paymentNote: "No payment is submitted until the customer confirms this total.",
  });
});

app.listen(port, () => {
  console.log(`Corvin demo backend listening on ${port}`);
});
