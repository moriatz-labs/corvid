# exec.md

## Purpose
Run the Corvin Demo App locally so a PM can request one clear cross-repo change: explain every checkout charge before payment.

## Repositories
```yaml
repositories:
  - id: frontend
    repo: Paul-M-Kallarackal/corvin-demo-app-frontend
    role: React/Vite checkout UI that renders the clearer charge review experience.
    install: npm install
    dev: npm run dev -- --host 0.0.0.0
    health: http://localhost:5173
  - id: backend
    repo: Paul-M-Kallarackal/corvin-demo-app-backend
    role: Express/Node API that owns checkout charges, totals, and payment-note copy.
    install: npm install
    dev: npm run dev
    health: http://localhost:3000/health
```

## Environment
```yaml
global:
  - name: VITE_API_BASE_URL
    required: true
    description: Required to run Corvin Demo App locally.
  - name: PORT
    required: true
    description: Required to run Corvin Demo App locally.
  - name: WHATSAPP_VERIFY_TOKEN
    required: true
    description: Required to run Corvin Demo App locally.
perRepo: {}
```

## Local Run Notes
Engineering supplied a minimal frontend plus backend execution script for the public Corvin demo app. The demo request should touch both repositories: backend returns clearer checkout charge data, frontend displays it for PM review.
