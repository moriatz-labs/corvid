import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type CheckoutSummary = {
  plan: string;
  headline: string;
  subcopy: string;
  charges: Array<{
    label: string;
    detail: string;
    amount: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  paymentNote: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const fallbackSummary: CheckoutSummary = {
  plan: "Growth",
  headline: "Review every charge before payment.",
  subcopy: "The checkout shows plan, tax, and total before the payment button.",
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
};

function App() {
  const [summary, setSummary] = useState<CheckoutSummary | null>(null);

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/checkout-summary`)
      .then((response) => response.json())
      .then((payload: CheckoutSummary) => setSummary(payload))
      .catch(() => {
        setSummary(fallbackSummary);
      });
  }, []);

  const checkout = summary ?? fallbackSummary;

  return (
    <main className="page-shell">
      <section className="checkout">
        <p className="eyebrow">Corvin demo checkout</p>
        <h1>{checkout.headline}</h1>
        <p className="lede">{checkout.subcopy}</p>
        <div className="summary" aria-label="Checkout summary">
          <div>
            <span>Plan</span>
            <strong>{checkout.plan}</strong>
          </div>
          {checkout.charges.map((charge) => (
            <div key={charge.label}>
              <span>
                {charge.label}
                <small>{charge.detail}</small>
              </span>
              <strong>{formatMoney(charge.amount, checkout.currency)}</strong>
            </div>
          ))}
          <div className="total">
            <span>Total due today</span>
            <strong>{formatMoney(checkout.total, checkout.currency)}</strong>
          </div>
        </div>
        <p className="payment-note">{checkout.paymentNote}</p>
        <button type="button">Complete payment</button>
      </section>
    </main>
  );
}

function formatMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
