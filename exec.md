# exec.md

## Purpose
Run Corvin Demo App locally for PM review of the checkout headline request.

## Repositories
```yaml
repositories:
  - id: frontend
    repo: Paul-M-Kallarackal/corvin-demo-app-frontend
    role: React/Vite customer checkout and PM-visible product surface for the demo app.
    install: npm install
    dev: npm run dev -- --host 0.0.0.0
    health: http://localhost:5173
  - id: backend
    repo: Paul-M-Kallarackal/corvin-demo-app-backend
    role: Express/Node checkout summary and health API for the demo app.
    install: npm install
    dev: npm run dev
    health: http://localhost:3000/health
```

## Environment
```yaml
global:
  - name: VITE_API_BASE_URL
    required: true
    description: Local backend API URL used by the frontend app.
  - name: PORT
    required: true
    description: Local backend API port.
  - name: WHATSAPP_VERIFY_TOKEN
    required: true
    description: WhatsApp webhook verification token.
perRepo: {}
```

## Local Run Notes
This demo packet is approved for the public Corvin demo app walkthrough. Corvin uses it to sync the frontend and backend repositories, check environment readiness, start both services, and package before-and-after evidence for PM review.
