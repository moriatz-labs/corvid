# Corvin Demo App Frontend

React/Vite frontend for the public Corvin demo app.

Demo goal: make the checkout explain every charge before payment. The frontend
renders the headline, charge rows, and payment note returned by the backend.

```bash
npm install
npm run dev -- --host 0.0.0.0
```

Set `VITE_API_BASE_URL` to the backend URL. The default local backend is
`http://localhost:3000`.
