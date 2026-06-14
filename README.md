# Corvin Hackathon MVP

Corvin is a PM-visible workbench for running a multi-repository product stack, accepting WhatsApp entry-point requests, using OpenAI-only change planning, reviewing a visible local/staging change, and pushing the reviewed change to a production app demo.

## Run

```bash
npm install
npm run dev
```

Open:

- App: http://127.0.0.1:5173
- Local runner API: http://127.0.0.1:8787

## Deploy

The project is Vercel-ready with `vercel.json` and an API catch-all function in `api/[...path].ts`.

```bash
vercel deploy --prod
```

If the CLI is not logged in:

```bash
vercel login
vercel deploy --prod
```

For CI or a non-interactive shell:

```bash
vercel deploy --prod --token=$VERCEL_TOKEN
```

The deployed app uses the same routes:

- `/api/state`
- `/api/openai/change-plan`
- `/api/deploy/staging`
- `/api/deploy/production`
- `/webhooks/whatsapp`

## Verify

```bash
npm test
npm run build
npm run lint
```

## 10-Step MVP Flow

1. Connect WhatsApp entry point.
2. Connect GitHub repository sync.
3. Load workspace blueprint.
4. Validate setup.
5. Generate Compose file.
6. Run workspace.
7. Show service status.
8. Capture PM request.
9. Prepare handoff context.
10. Confirm WhatsApp request has GitHub context.

The dashboard shows these steps and advances them through the local API.

## Demo Story

1. The product manager `Maya Rao` is visible in the dashboard.
2. Maya asks to change checkout copy.
3. Corvin generates an OpenAI-only change plan.
4. The change is applied visibly to local preview and staging.
5. Maya pushes the staged change to the production app preview.

No non-OpenAI AI providers are configured.

## WhatsApp Entry Point

Webhook verification:

```bash
curl "http://127.0.0.1:8787/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=local-dev&hub.challenge=ok"
```

Message intake:

```bash
curl -X POST "http://127.0.0.1:8787/webhooks/whatsapp" \
  -H "Content-Type: application/json" \
  -d '{"entry":[{"changes":[{"value":{"messages":[{"from":"15550001111","id":"wamid.demo","type":"text","text":{"body":"Corvin acme-checkout: replace hero copy on checkout page"}}]}}]}]}'
```

## GitHub Entry Point

Create a GitHub App and set its user authorization callback URL to:

```text
http://localhost:8787/api/integrations/github/callback
```

Then copy the GitHub App credentials into `.env`:

```bash
GITHUB_APP_CLIENT_ID=...
GITHUB_APP_CLIENT_SECRET=...
GITHUB_APP_OAUTH_STATE=corvin-local-demo
GITHUB_REDIRECT_URI=http://localhost:8787/api/integrations/github/callback
```

Generate the GitHub App authorization URL:

```bash
curl "http://127.0.0.1:8787/api/integrations/github/authorize"
```

## OpenAI-Only Change Planning

Without `OPENAI_API_KEY`, the app shows OpenAI demo mode and keeps the provider/model policy visible.

With `OPENAI_API_KEY`, the backend uses the OpenAI Responses API through the official OpenAI Node SDK.

```bash
curl -X POST "http://127.0.0.1:8787/api/openai/change-plan" \
  -H "Content-Type: application/json" \
  -d '{"requestBody":"Change the checkout headline to reduce confusion"}'
```

## Staging and Production Demo

```bash
curl -X POST "http://127.0.0.1:8787/api/deploy/staging" \
  -H "Content-Type: application/json" \
  -d '{"headline":"Checkout that explains every charge before you pay."}'

curl -X POST "http://127.0.0.1:8787/api/deploy/production"
```

## Notes

- Docker execution is intentionally safe-mode simulated in this MVP.
- Compose generation, validation, service health, logs, WhatsApp intake, and GitHub sync state are implemented.
- OpenAI is the only AI provider surface.
- Staging and production are visible demo app previews, not real hosted deployments yet.
- Real repository editing, branch creation, pushing, and merging are not implemented in this MVP.
