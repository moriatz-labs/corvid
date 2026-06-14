# Corvin PM Local Agent POC

Date: 2026-06-14

## Goal

Build a proof of concept for product managers who want to request small product changes, copy changes, bug fixes, or startup-iteration tasks without personally wiring together multiple repositories, servers, environment variables, and local commands.

The PM should rely on connected communication and repository metadata once those integration workstreams are available, then use engineering-authored setup instructions to run the needed product stack locally through Docker. The first version runs on the PM laptop. The future version can replace the local runner with cloud agents.

## Stripe Minions Research Summary

Stripe's Minions are internal unattended coding agents focused on one-shot, end-to-end code changes. Stripe describes them as homegrown coding agents producing more than a thousand merged pull requests per week, with humans still reviewing the final output. The useful lessons for Corvin are not "let an agent do anything." The useful lessons are controlled execution, strong context hydration, deterministic steps around the model, and review gates.

Sources:

- Stripe Part 1: https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents
- Stripe Part 2: https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2
- Stripe Sessions 2026 developer keynote: https://stripe.com/sessions/2026/developer-keynote
- Docker Compose services and startup ordering: https://docs.docker.com/reference/compose-file/services/
- Docker Compose profiles: https://docs.docker.com/compose/how-tos/profiles/
- Dev Container spec: https://devcontainers.github.io/implementors/spec/
- OpenClaw WhatsApp channel docs: https://docs.openclaw.ai/channels/whatsapp

## Corvin Interpretation

Corvin should adapt the Minions pattern for PM use cases:

1. Intake starts from the app or the WhatsApp-compatible webhook endpoint.
2. A workspace blueprint determines which repositories, services, commands, ports, secrets, and health checks are required.
3. The local runner uses repository metadata supplied by the external sync layer.
4. Docker Compose starts the stack under a named project.
5. The PM sees ready links, logs, preview screenshots, and status.
6. The PM can describe the desired product, copy, or bug-fix change for later handoff once the code integration exists.

Stripe maps to Corvin like this:

| Stripe Minions concept | Corvin POC equivalent |
| --- | --- |
| Slack trigger | WhatsApp intake data, owned by another workstream |
| Stripe devbox | Local Docker workspace on PM laptop |
| Blueprints | Versioned workspace blueprints in YAML/JSON |
| Toolshed MCP | Curated local tools: Docker, repository metadata, health checks, logs |
| Human review | Deferred until the synced code repository exists |
| CI feedback | Local test and health-check feedback first, CI later |

## Feasibility

A narrow 5-hour POC is feasible.

The full extended product is not feasible in 5 hours. The full version includes WhatsApp connection, GitHub/repository sync, multi-repo auth, secret management, automatic environment inference, real code handling, cloud runners, audit logs, and enterprise-grade sandboxing. Those are separate workstreams and should not be planned in this POC beyond accepting their eventual data.

The 5-hour POC should prove the hardest product assumption: a PM can select a task and run a multi-repository product stack from one simple UI without manually understanding each repository.

## 5-Hour POC Scope

In scope:

- React + TypeScript + Vite app.
- shadcn/ui components.
- Tailwind tokens based on `DESIGN.md`.
- SaaS dashboard UI, not a marketing landing page.
- Workspaces page with one seeded example workspace.
- Setup instructions editor for engineering-authored workspace config.
- Docker Compose manifest preview.
- Local runner API that can run a safe subset of commands.
- WhatsApp webhook verification and message intake for the hackathon entry point.
- GitHub OAuth URL generation plus demo repository sync for local hackathon mode.
- PM task form for "change copy", "fix small bug", or "try product idea".
- Blueprint timeline showing deterministic steps and agent steps.
- Health-check and preview-link status.
- Future-agent pitch prompt saved in `docs/prompts/pm-agent-pitch.md`.

Out of scope for the 5-hour POC:

- Production WhatsApp pairing or OpenClaw setup.
- Production GitHub OAuth token exchange, branch, merge, or push behavior.
- Any plan for creating, pushing, reviewing, or merging code.
- Real cloud agents.
- Automatic discovery of arbitrary monorepo topology.
- Strong isolation against malicious repositories.
- Production secret vault.
- Payments, billing, teams, RBAC.

## Proposed Architecture

### Frontend

Location when implemented: `frontend/`

Stack:

- React + TypeScript + Vite.
- Tailwind CSS.
- shadcn/ui.
- Framer Motion for restrained state transitions.
- Lucide React icons.

Primary screens:

- Workspace dashboard.
- Workspace setup wizard.
- Instructions editor.
- Run detail page.
- Task request drawer.

### Local Orchestrator

Location when implemented: `apps/local-runner/` or `server/`

Recommended POC stack:

- Node.js + TypeScript + Express or Fastify.
- `child_process.spawn` for safe, allowlisted Docker and Git commands.
- Local SQLite or JSON file for run state.
- WebSocket or server-sent events for logs.

Why Node.js: it keeps the POC in one TypeScript ecosystem and is fast enough for local orchestration. Python would also work, but it adds another runtime decision for no immediate gain.

### Workspace Blueprint

Each customer/team can define a workspace blueprint. The blueprint is written by the engineering team, not by the PM.

Example shape:

```yaml
id: acme-checkout
name: Acme Checkout Stack
repositories:
  - id: frontend
    sourceRef: synced-repo://acme/web
    defaultBranch: main
    path: repos/web
  - id: api
    sourceRef: synced-repo://acme/api
    defaultBranch: main
    path: repos/api
services:
  - id: web
    repository: frontend
    composeFile: docker-compose.dev.yml
    port: 5173
    healthUrl: http://localhost:5173
  - id: api
    repository: api
    composeFile: docker-compose.dev.yml
    port: 3000
    healthUrl: http://localhost:3000/health
environment:
  required:
    - DATABASE_URL
    - API_BASE_URL
commands:
  start: docker compose -p corvin-acme -f generated.compose.yml up --build
  stop: docker compose -p corvin-acme -f generated.compose.yml down
policy:
  allowDestructiveCommands: false
  requireConfirmationForVolumes: true
```

### Docker Strategy

Use Docker Compose heavily, but do not make the PM hand-author Compose files.

Recommended behavior:

1. Engineering team writes repository-specific setup instructions.
2. Corvin stores the blueprint.
3. Corvin generates a project-level Compose file that wires frontend, backend, database, queues, and supporting services together.
4. Compose profiles allow optional services such as workers, seeders, or storybook.
5. Health checks determine whether the PM can open a preview link.

Local Docker gives enough isolation for a POC, but it is not equivalent to Stripe's devboxes. The POC should avoid destructive host operations, run allowlisted commands only, and treat untrusted repositories as risky.

## Blueprint Flow

### Connect

- WhatsApp: webhook verification and message intake endpoint.
- GitHub/repository sync: OAuth URL generation and local demo sync endpoint.
- Current POC: seeded local workspace and safe-mode repository metadata.

### Configure

- Engineering adds setup instructions.
- Corvin validates the shape.
- Corvin shows which repos and services are required.
- PM sees only a simplified "Ready to run" view.

### Run

- Corvin reads repository metadata and local paths from the external sync layer.
- Corvin generates Compose config.
- Corvin runs Docker Compose.
- Corvin streams logs.
- Corvin checks health URLs.
- Corvin shows preview links.

### Change

- PM describes the desired change.
- Corvin records the request with the running workspace context.
- Code-edit, branch, push, and merge behavior is deferred until the synced repository implementation exists.

### Review

- PM can preview the change locally.
- Engineering review mechanics are outside this POC and should be designed only after the code integration exists.

## UI Plan

The UI should be a SaaS operations dashboard, not a landing page.

First viewport:

- Left sidebar: Workspaces, Runs, Instructions, Integrations, Settings.
- Header: current workspace, connection status, primary "Run workspace" action.
- Main panel: setup completeness, service health, preview links.
- Right panel: active blueprint timeline and logs.

Important components:

- `Button` with loading, disabled, and confirmation states.
- `Card` only for repeated workspace/service items, not nested section wrappers.
- `Tabs` for Overview, Instructions, Runs, Logs.
- `Badge` for "Ready", "Running", "Failed", "Connected", and "Needs config".
- `AlertDialog` for destructive actions such as stopping with volumes.
- `Tooltip` on icon-only actions.
- `Sheet` for PM task request entry.
- `Progress` for blueprint execution.

Safe button behavior:

- "Run workspace" is disabled while a run is active.
- "Stop" is allowed, but "Stop and remove volumes" requires confirmation.
- WhatsApp and GitHub/repository sync buttons are active hackathon entry-point controls.
- All command-running buttons show the exact command category before execution.
- No button executes arbitrary user-provided shell text.

## Stitch UI Handoff

Stitch MCP is available in this environment. A first dashboard screen was generated for layout reference:

- Stitch project: `projects/2669047611391183588`
- Stitch screen: `projects/2669047611391183588/screens/a34bc8d7ad344484b625aa2c35768f91`
- Stitch design asset: `assets/91fde2528d84447abc44b2d780b5454c`

The implementation session should:

1. Reuse the generated Stitch project, or create a new project only if the generated one is unavailable.
2. Upload root `DESIGN.md` when the `upload_design_md` Stitch tool is exposed; otherwise pass the same constraints directly in the screen-generation prompt.
3. Generate or refine the desktop dashboard screen from the UI plan.
4. Use Stitch output as the layout reference.
5. Implement the screen with shadcn/ui and local tokens.

Implementation note: Stitch's generated screen is useful for layout and information architecture, but it drifted some typography and color tokens from the local UI design system. Treat root `DESIGN.md` and `C:\Users\loqpm\Documents\UI\AGENTS.md` as the source of truth during implementation.

## Recommended 5-Hour Build Schedule

| Time | Work |
| --- | --- |
| 0:00-0:30 | Scaffold Vite, Tailwind, shadcn/ui, tokens, base layout |
| 0:30-1:15 | Build dashboard shell, workspace cards, integration stubs |
| 1:15-2:00 | Add blueprint schema, seeded example, instructions editor |
| 2:00-3:00 | Build local runner API and safe command allowlist |
| 3:00-3:45 | Add Docker Compose preview and mock/real run status |
| 3:45-4:30 | Add PM task drawer and blueprint timeline |
| 4:30-5:00 | Verify UI, run lint/build, document next steps |

## Recommended Data Model

```ts
type Workspace = {
  id: string;
  name: string;
  description: string;
  repositories: RepositoryConfig[];
  services: ServiceConfig[];
  integrations: IntegrationStatus[];
};

type RepositoryConfig = {
  id: string;
  label: string;
  sourceRef: string;
  defaultBranch: string;
  localPath: string;
};

type ServiceConfig = {
  id: string;
  label: string;
  repositoryId: string;
  composeFile: string;
  port: number;
  healthUrl: string;
  status: "idle" | "starting" | "healthy" | "failed";
};

type BlueprintStep = {
  id: string;
  label: string;
  kind: "deterministic" | "agent";
  status: "pending" | "running" | "succeeded" | "failed";
  summary: string;
};
```

## Risk Register

| Risk | Impact | POC mitigation |
| --- | --- | --- |
| Running arbitrary repo commands on PM laptop | High | Allowlist Docker/Git commands only |
| Secrets leakage into logs | High | Redact env values and avoid real secrets in POC |
| Docker setup differs per laptop | Medium | Preflight check for Docker availability |
| Multi-repo dependency graph is messy | Medium | Engineering-authored blueprint required |
| PM expects production WhatsApp/GitHub on day one | Medium | Provide hackathon entry points and keep production token exchange out of scope |
| 5-hour scope creep | High | Keep code, branch, push, and merge behavior out of POC |

## Build Recommendation

Proceed with the 5-hour POC only if the target is a convincing local demo, not a production agent platform.

The strongest demo story is:

"A PM receives a customer-facing copy change request, opens Corvin, selects the product workspace, starts the whole frontend/API/database stack through one safe button, records the requested change with the correct workspace context, and previews the running product locally."

That proves the product wedge without requiring this POC to own the WhatsApp or GitHub/repository-sync workstreams.
