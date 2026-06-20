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

## Public Demo Repositories

The demo app is split into two public GitHub repositories:

- Frontend: `Paul-M-Kallarackal/corvin-demo-app-frontend`
- Backend: `Paul-M-Kallarackal/corvin-demo-app-backend`

Their source seeds live under `demo-repositories/` in this workspace. Corvin's
public setup flow loads these repositories when GitHub is connected, then
generates `exec.md` from the frontend and backend selections.

## Shelfmark Judge Workflow

Corvin also includes a real external-product workflow for Shelfmark, the sibling
bookmarking product repository at:

```text
C:\Users\loqpm\Documents\Shelfmark
```

Judges sign into Corvin with Clerk, open the Shelfmark view, and submit an
open-text product change. Corvin applies a safe visible change to Shelfmark's
`src/content/judge-request.ts`, runs Shelfmark install/test/build, captures a
review screenshot, commits the branch, and opens a GitHub pull request when a
GitHub token is configured.

Required Corvin environment variables for the public flow:

```text
VITE_CLERK_PUBLISHABLE_KEY=
GITHUB_TOKEN=
SHELFMARK_GITHUB_REPO=moriatz-labs/shelfmark
SHELFMARK_LOCAL_PATH=C:/Users/loqpm/Documents/Shelfmark
SHELFMARK_PRODUCTION_URL=https://shelfmark.vercel.app
SHELFMARK_NOVUS_INSTALLED=true
```

Safety guardrails block requests that try to read secrets, edit environment
files, delete repositories, merge, or deploy production. Corvin creates PRs only;
it does not merge or deploy judge-created changes.

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
Run Corvin Demo App locally for PM review.

## Repositories
```yaml
repositories:
  - id: frontend
    repo: Paul-M-Kallarackal/corvin-demo-app-frontend
    role: frontend
    install: npm install
    dev: npm run dev -- --host 0.0.0.0
    health: http://localhost:5173
  - id: backend
    repo: Paul-M-Kallarackal/corvin-demo-app-backend
    role: backend
    install: npm install
    dev: npm run dev
    health: http://localhost:3000/health
```

## Environment
```yaml
global:
  - name: VITE_API_BASE_URL
    required: true
    description: Local backend API URL.
  - name: PORT
    required: true
    description: Local backend API port.
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
2. Show the engineering execution packet as already complete for the Corvin Demo App workspace.
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
  -d '{"entry":[{"changes":[{"value":{"messages":[{"from":"15550001111","id":"wamid.demo","type":"text","text":{"body":"Corvin corvin-demo-app: replace hero copy on checkout page"}}]}}]}]}'
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

When GitHub App credentials are not configured, the local demo falls back to the
public `corvin-demo-app-frontend` and `corvin-demo-app-backend` repositories so
the setup screen can still request both code repositories and generate `exec.md`.

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
