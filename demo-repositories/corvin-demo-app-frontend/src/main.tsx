import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type CheckoutSummary = {
  plan: string;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

function App() {
  const [summary, setSummary] = useState<CheckoutSummary | null>(null);

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/checkout-summary`)
      .then((response) => response.json())
      .then((payload: CheckoutSummary) => setSummary(payload))
      .catch(() => {
        setSummary({
          plan: "Growth",
          subtotal: 49,
          tax: 4,
          total: 53,
          currency: "USD",
        });
      });
  }, []);

  return (
    <main className="page-shell">
      <section className="checkout">
        <p className="eyebrow">Corvin demo checkout</p>
        <h1>Checkout built for fast-growing teams.</h1>
        <p className="lede">
          Review your plan, confirm every charge, and complete payment from a
          focused checkout surface.
        </p>
        <div className="summary" aria-label="Checkout summary">
          <div>
            <span>Plan</span>
            <strong>{summary?.plan ?? "Loading"}</strong>
          </div>
          <div>
            <span>Subtotal</span>
            <strong>{formatMoney(summary?.subtotal ?? 0, summary?.currency)}</strong>
          </div>
          <div>
            <span>Estimated tax</span>
            <strong>{formatMoney(summary?.tax ?? 0, summary?.currency)}</strong>
          </div>
          <div className="total">
            <span>Total due today</span>
            <strong>{formatMoney(summary?.total ?? 0, summary?.currency)}</strong>
          </div>
        </div>
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
