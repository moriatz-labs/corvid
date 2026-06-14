# Loops House Hackathon Submission

## Step 1 Fields

### Project Name

Corvin

### Tagline

Agentic Autonomy for PM's, in a multi repository setting.

Character count: 60 / 250

### Description

Corvin is a PM-visible workbench for shipping small product changes without asking an engineer to manually stitch together frontend, backend, worker, and database repositories.

In the demo, product manager Maya Rao asks for a checkout copy change. Corvin accepts the request through the app or a WhatsApp-compatible webhook, attaches GitHub/repository context, loads an engineering-authored workspace blueprint, validates the local setup, generates a Docker Compose preview, and runs the product stack in safe mode. Corvin then uses OpenAI-only change planning to propose the visible copy update, shows the change on local and staging app previews, and lets the PM push the reviewed version to the production app preview.

The MVP focuses on the full PM loop: request, context, local/staging visibility, OpenAI planning, and production promotion. WhatsApp webhook verification, WhatsApp message intake, GitHub OAuth URL generation, demo repository sync, workspace validation, service health, logs, staging preview, and production preview are implemented.

### Pitch

Product managers often know exactly what small product change they want, but they cannot safely run the full product locally. Modern products are split across frontend repos, backend repos, workers, databases, environment variables, and setup instructions. That means even a copy change or small bug report turns into an engineering interruption.

Corvin makes the PM workflow visible and controlled. The engineering team defines a workspace blueprint once. The PM can connect WhatsApp and GitHub, request a change, see the product stack status, run the local or staging preview, and review the exact production-facing result before pushing it live.

The AI layer is intentionally OpenAI-only. Corvin uses OpenAI change planning to turn the PM request into a clear implementation and review path, while keeping dangerous operations explicit and visible. The MVP does not claim autonomous production engineering. It proves the product wedge: PMs can move from request to visible staging/production preview without manually becoming local-dev experts.

## Logo

Use:

`public/corvin-logo.png`

## Demo URLs

Local app:

`http://127.0.0.1:5173`

Local runner API:

`http://127.0.0.1:8787`

Production deployment:

Not deployed from this machine because Vercel CLI credentials are missing. The project is deploy-ready with `vercel.json` and `api/[...path].ts`.

Deploy command:

```bash
vercel deploy --prod --token=$VERCEL_TOKEN
```

## What To Show In The Demo

1. Maya Rao is visible as the product manager.
2. WhatsApp and GitHub entry-point cards are visible.
3. The 10-step flow shows the workspace path from request to GitHub context.
4. OpenAI is visibly the only AI provider.
5. Click `Ask OpenAI for change plan`.
6. Click `Run local + staging preview`.
7. Show the changed checkout headline on local and staging.
8. Click `Push to production app`.
9. Show the production app preview now has the same changed headline.

## Verification Evidence

Latest verified commands:

```bash
npm test
npm run build
npm run lint
npm audit --omit=dev
```

Latest verified behavior:

- PM visible: Maya Rao.
- AI provider visible: OpenAI.
- Staging app visible.
- Production app visible.
- Changed checkout copy visible.
- API flow updates staging and production headline.
