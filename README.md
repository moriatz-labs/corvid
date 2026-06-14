# Corvin Hackathon MVP

Corvin is a PM-visible workbench for agentic autonomy in a multi-repository setting. Engineering supplies an execution packet once; OpenAI-powered agents resolve repositories, startup order, branch coupling, and service health; the PM runs one prepared command, reviews a visible local/staging change, and pushes the reviewed result to a production app demo.

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
2. Resolve repository metadata.
3. Load engineering execution packet.
4. Validate agent-run setup.
5. Generate Compose from the packet.
6. Run the PM one-line command.
7. Show service status.
8. Capture PM request.
9. Prepare agent handoff context.
10. Confirm WhatsApp request has GitHub context.

The dashboard shows these steps and advances them through the local API.

## Engineering Execution Packet

The PM should not manually load, sync, or wire repositories. If `exec.md` is missing or invalid, Corvin blocks the PM request and asks the first user to complete the setup form first.

For the demo, `exec.md` lives in the workspace root. It is a human-editable Markdown file with parseable YAML sections. The setup UI creates it through a hybrid editor: survey fields on the left and editable Markdown preview on the right.

Engineering needs to provide:

- Repository names and ownership.
- What each repository does.
- Install, dev, and health-check details for each selected GitHub-linked repository.
- Global and per-repository environment variables.
- Local run notes for seed data, known setup failures, ports, and caveats.

After `exec.md` is valid, the PM path is intentionally simple: Corvin reads the file, packages the local run workflow at runtime, and runs the safe-mode demo command set. The PM does not type repo commands.

Example shape:

````md
# exec.md

## Purpose
Run Acme Checkout Workspace locally for PM review.

## Repositories
```yaml
repositories:
  - id: web
    repo: acme/web
    role: frontend
    install: pnpm install
    dev: pnpm dev --host 0.0.0.0
    health: http://localhost:5173
```

## Environment
```yaml
global:
  - name: DATABASE_URL
    required: true
    description: Local Postgres connection string.
perRepo: {}
```

## Local Run Notes
Add setup caveats, seed data, known local failures, and port notes.
````

Missing essentials block save/run. Weak documentation and inferred command risks are warnings.

## OpenAI Agent Orchestration

All AI routing uses OpenAI. The current demo shows the intended routing policy:

- `gpt-5.5` as the router and high-reasoning model for classification, multi-repo planning, verification, and deployment readiness.
- `gpt-5.4-mini` for lower-cost context gathering, file/log summarization, checklist work, and mechanical subtasks.
- No non-OpenAI AI providers are configured.

## Demo Story

1. The product manager `Maya Rao` is visible in the dashboard.
2. Show the engineering execution packet as already complete for the Acme Checkout workspace.
3. Show `exec.md` as the editable engineering setup file for local run packaging.
4. Maya asks to change checkout copy.
5. Corvin routes the request through OpenAI-only agents.
6. The change is applied visibly to local preview and staging.
7. Maya pushes the staged change to the production app preview.

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

Generate a real OAuth URL when `GITHUB_CLIENT_ID` is set:

```bash
curl "http://127.0.0.1:8787/api/integrations/github/authorize"
```

For local hackathon demo mode, connect repository sync without GitHub credentials:

```bash
curl -X POST "http://127.0.0.1:8787/api/integrations/github/sync-demo"
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
- Engineering execution-packet readiness, Compose generation, validation, service health, logs, WhatsApp intake, and GitHub sync state are implemented.
- OpenAI is the only AI provider surface.
- OpenAI agent routing is implemented as a visible policy surface; actual multi-agent code editing is still simulated.
- Staging and production are visible demo app previews, not real hosted deployments yet.
- Real repository editing, branch creation, pushing, and merging are not implemented in this MVP.
