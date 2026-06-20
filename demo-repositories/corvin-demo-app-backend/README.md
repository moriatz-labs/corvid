# Corvin Demo App Backend

Express backend for the public Corvin demo app.

Demo goal: make the checkout explain every charge before payment. The backend
owns the charge rows, payment note, totals, and health endpoint used by Corvin.

```bash
npm install
npm run dev
```

Endpoints:

- `GET /health`
- `GET /api/checkout-summary`
