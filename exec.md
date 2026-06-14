# exec.md

## Purpose
Run Acme Checkout Workspace locally for PM review.

## Repositories
```yaml
repositories:
  - id: web
    repo: acme/web
    role: Customer checkout and PM-visible product surface.
    install: pnpm install
    dev: pnpm dev --host 0.0.0.0
    health: http://localhost:5173
  - id: api
    repo: acme/api
    role: Checkout pricing, plan metadata, and payment session API.
    install: pnpm install
    dev: pnpm dev
    health: http://localhost:3000/health
  - id: worker
    repo: acme/worker
    role: Async receipt, webhook, and analytics processing.
    install: pnpm install
    dev: pnpm worker:dev
    health: http://localhost:4318/health
```

## Environment
```yaml
global:
  - name: DATABASE_URL
    required: true
    description: Required to run Acme Checkout Workspace locally.
  - name: API_BASE_URL
    required: true
    description: Required to run Acme Checkout Workspace locally.
  - name: WHATSAPP_VERIFY_TOKEN
    required: true
    description: Required to run Acme Checkout Workspace locally.
perRepo: {}
```

## Local Run Notes
Engineering supplied the execution script; Corvin agents resolve repo sync, branch alignment, env checks, startup order, and health checks.
