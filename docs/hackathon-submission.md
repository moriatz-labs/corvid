# Loops House Hackathon Submission

## Step 1 Fields

### Project Name

Corvin

### Tagline

Agentic Autonomy for PM's, in a multi repository setting.

Character count: 60 / 250

### Description

Corvin is a PM-visible workbench for shipping small product changes without asking the PM to manually stitch together frontend, backend, worker, and database repositories.

In the demo, engineering has already supplied an execution packet: repository names, what each repository does, startup commands, branch coupling rules, service connections, missing dependencies, and edge cases. Corvin agents use that packet to resolve the multi-repository workspace and produce one PM-safe command. Product manager Maya Rao then asks for a checkout copy change, reviews the OpenAI-routed plan, sees the change in local and staging previews, and pushes the reviewed version to the production app preview.

The MVP focuses on the full PM loop after engineering setup exists: request, agent routing, context, local/staging visibility, OpenAI planning, and production promotion. WhatsApp webhook verification, WhatsApp message intake, GitHub OAuth URL generation, demo repository sync, engineering execution-packet readiness, workspace validation, service health, logs, staging preview, and production preview are implemented.

### Pitch

Product managers often know exactly what small product change they want, but they cannot safely run the full product locally. Modern products are split across frontend repos, backend repos, workers, databases, environment variables, and setup instructions. That means even a copy change or small bug report turns into an engineering interruption.

Corvin makes the PM workflow visible and controlled. The engineering team defines the execution packet once. The PM should not pick repositories, sync branches, or wire Docker services. If the packet is missing, Corvin prompts the PM to ask engineering to complete the setup form. Once it exists, the PM can request a change, run the prepared workspace, see local or staging preview, and review the exact production-facing result before pushing it live.

The AI layer is intentionally OpenAI-only. Corvin uses a strong OpenAI router model for task classification and high-reasoning planning, then routes simpler subtasks to smaller OpenAI models for context gathering, summarization, and mechanical work. The MVP does not claim fully autonomous production engineering. It proves the product wedge: PMs can move from request to visible staging/production preview without manually becoming local-dev experts.

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
2. The engineering execution packet is visible and marked ready.
3. The PM one-line command is visible: `npx corvin run acme-checkout`.
4. WhatsApp and GitHub entry-point cards are visible as input sources, not PM-owned setup work.
5. The 10-step flow shows agents resolving repository metadata and setup from the execution packet.
6. OpenAI is visibly the only AI provider.
7. Show OpenAI routing across router, context, execution planner, worker, and verification agents.
8. Click `Ask OpenAI for change plan`.
9. Click `Run prepared local + staging preview`.
10. Show the changed checkout headline on local and staging.
11. Click `Push to production app`.
12. Show the production app preview now has the same changed headline.

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
- OpenAI routing visible: router, context, execution planner, workers, verification.
- Engineering execution packet visible and ready.
- Staging app visible.
- Production app visible.
- Changed checkout copy visible.
- API flow updates staging and production headline.
