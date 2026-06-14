# Corvin Post-Integration Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the workflow after WhatsApp setup and GitHub linking: request intake, workspace context, safe local run, OpenAI routing, change handoff, preview verification, and controlled production promotion.

**Architecture:** Keep the existing React/Vite dashboard and Express API. Move workflow decisions into shared pure functions, keep side effects in server modules, and make every stage testable before wiring it into the UI.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, shadcn-style primitives, Lucide React, Express 5, OpenAI Node SDK, Vitest.

---

## Current App Audit

**Verified on 2026-06-14:**

- `npm test`: 8 tests passed.
- `npm run build`: TypeScript and Vite production build passed.
- `npm run lint`: no lint output.
- Local dev server starts with `npm run dev`.
- Dashboard is available at `http://127.0.0.1:5173`.
- Local runner API is available at `http://127.0.0.1:8787`.

**Currently built:**

- PM dashboard with Maya Rao, engineering execution packet, service health, Compose preview, logs, and PM request form.
- WhatsApp webhook verification and message intake endpoints.
- GitHub OAuth URL generation and local demo repository sync.
- OpenAI-only change planning panel with visible routing policy.
- Safe-mode workspace run that marks web/API healthy and keeps worker idle.
- Local, staging, and production demo previews.
- Shared workflow tests for validation, Compose generation, WhatsApp parsing, GitHub URL generation, OpenAI demo planning, and deployment promotion.

**Observed gap from live flow:**

- A seeded WhatsApp request is present, but `handoff` is only marked succeeded through explicit request endpoints. This leaves the 10-step timeline at 9/10 in some flows even when WhatsApp, GitHub, and a captured request already exist.

**Files currently central to the workflow:**

- `src/App.tsx`: dashboard and client API actions.
- `src/shared/types.ts`: workflow and display data contracts.
- `src/shared/mvp.ts`: pure workflow helpers.
- `src/shared/demo.ts`: seeded workspace/demo state.
- `server/app.ts`: API routes and in-memory state mutation.
- `tests/mvp.test.ts`: shared workflow tests.
- `api/[...path].ts`: Vercel Express adapter.
- `README.md`, `docs/corvin-pm-local-agent-poc.md`, `docs/hackathon-submission.md`: product/demo docs.

---

### Task 1: Normalize Step Derivation

**Files:**

- Modify: `src/shared/types.ts`
- Modify: `src/shared/mvp.ts`
- Modify: `src/shared/demo.ts`
- Modify: `server/app.ts`
- Test: `tests/mvp.test.ts`

- [ ] **Step 1: Write failing tests for derived timeline state**

Add tests proving the final timeline is derived from facts instead of ad hoc endpoint calls.

```ts
import { deriveBlueprintSteps } from "../src/shared/mvp";
import type { BlueprintStep, Integration, PMRequest, ServiceConfig } from "../src/shared/types";

it("marks handoff succeeded when a captured request already has workspace context", () => {
  const steps: BlueprintStep[] = [
    { id: "request", label: "Capture PM request", kind: "agent", status: "pending", summary: "" },
    { id: "handoff", label: "Prepare agent handoff context", kind: "agent", status: "pending", summary: "" },
    { id: "whatsapp-github-ready", label: "WhatsApp request has GitHub context", kind: "deterministic", status: "pending", summary: "" },
  ];
  const integrations: Integration[] = [
    { id: "whatsapp", label: "WhatsApp", status: "connected", detail: "" },
    { id: "github", label: "GitHub", status: "connected", detail: "" },
    { id: "docker", label: "Docker", status: "ready", detail: "" },
  ];
  const services: ServiceConfig[] = [
    { id: "web", label: "Web", repositoryId: "web", port: 5173, healthUrl: "http://localhost:5173", status: "healthy" },
  ];
  const requests: PMRequest[] = [
    { id: "wa_1", title: "Copy", body: "Change copy", channel: "whatsapp", requester: "1555", workspaceId: "acme-checkout", status: "captured", createdAt: "2026-06-14T00:00:00.000Z" },
  ];

  const next = deriveBlueprintSteps(steps, { integrations, requests, services, running: true });

  expect(next).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "request", status: "succeeded" }),
      expect.objectContaining({ id: "handoff", status: "succeeded" }),
      expect.objectContaining({ id: "whatsapp-github-ready", status: "succeeded" }),
    ]),
  );
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm test -- --runInBand`

Expected: fail with `deriveBlueprintSteps` not exported.

- [ ] **Step 3: Add a pure step derivation helper**

Add this export to `src/shared/mvp.ts`.

```ts
export function deriveBlueprintSteps(
  steps: BlueprintStep[],
  input: {
    integrations: Integration[];
    requests: PMRequest[];
    services: ServiceConfig[];
    running: boolean;
  },
): BlueprintStep[] {
  const whatsappConnected = input.integrations.some((item) => item.id === "whatsapp" && item.status === "connected");
  const githubConnected = input.integrations.some((item) => item.id === "github" && item.status === "connected");
  const hasRequest = input.requests.length > 0;
  const hasContextualRequest = input.requests.some((request) => request.workspaceId.trim().length > 0);
  const hasWhatsAppRequest = input.requests.some((request) => request.channel === "whatsapp");
  const hasHealthyService = input.services.some((service) => service.status === "healthy");

  return steps.map((step) => {
    if (step.id === "request" && hasRequest) return { ...step, status: "succeeded" };
    if (step.id === "handoff" && hasContextualRequest) return { ...step, status: "succeeded" };
    if (step.id === "whatsapp-github-ready" && whatsappConnected && githubConnected && hasWhatsAppRequest) {
      return { ...step, status: "succeeded" };
    }
    if (step.id === "status" && hasHealthyService) return { ...step, status: "succeeded" };
    if (step.id === "run" && input.running) return { ...step, status: "succeeded" };
    return step;
  });
}
```

- [ ] **Step 4: Wire server state updates through the helper**

In `server/app.ts`, import `deriveBlueprintSteps` and replace repeated manual step updates after mutations with:

```ts
function refreshDerivedSteps() {
  state.steps = deriveBlueprintSteps(state.steps, {
    integrations: state.integrations,
    requests: state.requests,
    services: state.workspace.services,
    running: state.running,
  });
}
```

Call `refreshDerivedSteps()` before every response that returns `state`.

- [ ] **Step 5: Run verification**

Run: `npm test && npm run build && npm run lint`

Expected: tests, build, and lint all pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/mvp.ts src/shared/demo.ts server/app.ts tests/mvp.test.ts
git commit -m "fix: derive Corvin workflow steps from state" -m "AI-Model: OpenAI GPT-5 Codex"
```

---

### Task 2: Persist Workflow State Locally

**Files:**

- Create: `server/state-store.ts`
- Modify: `server/app.ts`
- Modify: `.gitignore`
- Test: `tests/mvp.test.ts`

- [ ] **Step 1: Write tests for state persistence helpers**

Add tests for save/load behavior using a temporary file path.

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInitialState } from "../src/shared/demo";
import { createStateStore } from "../server/state-store";

it("persists and reloads local workflow state", () => {
  const dir = mkdtempSync(join(tmpdir(), "corvin-state-"));
  try {
    const store = createStateStore(join(dir, "state.json"));
    const state = createInitialState();
    state.running = true;

    store.save(state);
    const loaded = store.load();

    expect(loaded.running).toBe(true);
    expect(loaded.workspace.id).toBe("acme-checkout");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm test -- --runInBand`

Expected: fail because `server/state-store.ts` does not exist.

- [ ] **Step 3: Implement the state store**

Create `server/state-store.ts`.

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createInitialState } from "../src/shared/demo";
import type { MvpState } from "../src/shared/types";

export function createStateStore(filePath = process.env.CORVIN_STATE_FILE ?? ".corvin/state.json") {
  return {
    load(): MvpState {
      if (!existsSync(filePath)) return createInitialState();
      return JSON.parse(readFileSync(filePath, "utf8")) as MvpState;
    },
    save(state: MvpState) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    },
  };
}
```

- [ ] **Step 4: Wire persistence into the API**

In `server/app.ts`, initialize state from the store and save after each mutation.

```ts
import { createStateStore } from "./state-store";

const store = createStateStore();
export const state: MvpState = store.load();

function persistState() {
  refreshDerivedSteps();
  store.save(state);
}
```

Call `persistState()` after integration sync, webhook capture, workspace run/stop, request capture, OpenAI plan generation, staging deploy, and production promotion.

- [ ] **Step 5: Ignore local state**

Add this line to `.gitignore`.

```txt
.corvin/
```

- [ ] **Step 6: Run verification**

Run: `npm test && npm run build && npm run lint`

Expected: all pass. Restart `npm run dev`, click through the workflow, refresh the page, and confirm state remains.

- [ ] **Step 7: Commit**

```bash
git add .gitignore server/state-store.ts server/app.ts tests/mvp.test.ts
git commit -m "feat: persist local Corvin workflow state" -m "AI-Model: OpenAI GPT-5 Codex"
```

---

### Task 3: Add Execution Packet Import And Validation

**Files:**

- Create: `src/shared/blueprint-schema.ts`
- Create: `examples/acme-checkout.blueprint.json`
- Modify: `src/shared/types.ts`
- Modify: `server/app.ts`
- Test: `tests/mvp.test.ts`

- [ ] **Step 1: Write tests for packet parsing**

```ts
import { parseWorkspaceBlueprint } from "../src/shared/blueprint-schema";

it("parses a complete engineering execution packet", () => {
  const result = parseWorkspaceBlueprint({
    id: "acme-checkout",
    name: "Acme Checkout Workspace",
    setupStatus: "ready",
    pmRunCommand: "npx corvin run acme-checkout",
    executionScriptSummary: "Engineering supplied the execution packet.",
    repositories: [{ id: "web", label: "Web", sourceRef: "synced-repo://acme/web", defaultBranch: "main", localPath: "repos/web", purpose: "Checkout UI", startupCommand: "pnpm dev", branchCoupling: "Match api branch." }],
    services: [{ id: "web", label: "Web", repositoryId: "web", port: 5173, healthUrl: "http://localhost:5173", status: "idle" }],
    environment: { required: ["DATABASE_URL"] },
  });

  expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `npm test -- --runInBand`

Expected: fail because parser does not exist.

- [ ] **Step 3: Implement schema with Zod**

Create `src/shared/blueprint-schema.ts`.

```ts
import { z } from "zod";

export const workspaceBlueprintSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  setupStatus: z.enum(["needs-engineering", "ready"]).default("needs-engineering"),
  pmRunCommand: z.string().optional(),
  executionScriptSummary: z.string().optional(),
  engineeringIntake: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    detail: z.string().min(1),
    status: z.enum(["required", "provided"]),
  })).optional(),
  repositories: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    sourceRef: z.string().min(1),
    defaultBranch: z.string().min(1),
    localPath: z.string().min(1),
    purpose: z.string().optional(),
    startupCommand: z.string().optional(),
    branchCoupling: z.string().optional(),
  })).min(1),
  services: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    repositoryId: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    healthUrl: z.string().url(),
    status: z.enum(["idle", "starting", "healthy", "failed"]),
  })).min(1),
  environment: z.object({
    required: z.array(z.string().min(1)),
  }),
});

export function parseWorkspaceBlueprint(input: unknown) {
  return workspaceBlueprintSchema.safeParse(input);
}
```

- [ ] **Step 4: Add import endpoint**

In `server/app.ts`, add:

```ts
app.post("/api/workspaces/import", (request, response) => {
  const parsed = parseWorkspaceBlueprint(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "invalid_execution_packet", issues: parsed.error.issues });
    return;
  }
  state.workspace = parsed.data;
  state.validation = validateBlueprint(state.workspace, {
    dockerReady: true,
    syncedRepositoryIds: state.workspace.repositories.map((repo) => repo.id),
    env: Object.fromEntries(state.workspace.environment.required.map((key) => [key, process.env[key] ?? "demo-value"])),
    occupiedPorts: [],
  });
  state.compose = generateComposeFile(state.workspace);
  state.logs.unshift(`[workspace] imported execution packet ${state.workspace.id}`);
  persistState();
  response.json(state);
});
```

- [ ] **Step 5: Add example packet**

Create `examples/acme-checkout.blueprint.json` by serializing the current `demoBlueprint` shape.

- [ ] **Step 6: Run verification**

Run: `npm test && npm run build && npm run lint`

Expected: all pass. POST the example packet to `/api/workspaces/import` and confirm `/api/state` returns the same workspace id.

- [ ] **Step 7: Commit**

```bash
git add src/shared/blueprint-schema.ts examples/acme-checkout.blueprint.json src/shared/types.ts server/app.ts tests/mvp.test.ts
git commit -m "feat: import engineering execution packets" -m "AI-Model: OpenAI GPT-5 Codex"
```

---

### Task 4: Consume Linked Repository Metadata

**Files:**

- Create: `server/repository-sync.ts`
- Modify: `src/shared/types.ts`
- Modify: `server/app.ts`
- Modify: `src/App.tsx`
- Test: `tests/mvp.test.ts`

- [ ] **Step 1: Define synced repository types**

Add to `src/shared/types.ts`.

```ts
export type SyncedRepository = {
  id: string;
  sourceRef: string;
  provider: "github";
  owner: string;
  name: string;
  defaultBranch: string;
  localPath: string;
  latestCommit?: string;
  status: "available" | "missing" | "error";
};
```

- [ ] **Step 2: Write sync adapter tests**

```ts
import { createDemoRepositorySync } from "../server/repository-sync";

it("returns repository metadata for a linked workspace", async () => {
  const sync = createDemoRepositorySync();
  const repos = await sync.resolve(["web", "api"]);

  expect(repos).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "web", provider: "github", status: "available" }),
      expect.objectContaining({ id: "api", provider: "github", status: "available" }),
    ]),
  );
});
```

- [ ] **Step 3: Implement demo sync adapter**

Create `server/repository-sync.ts`.

```ts
import type { SyncedRepository } from "../src/shared/types";

export function createDemoRepositorySync() {
  const repositories: SyncedRepository[] = [
    { id: "web", sourceRef: "synced-repo://acme/web", provider: "github", owner: "acme", name: "web", defaultBranch: "main", localPath: "repos/web", latestCommit: "demo-web", status: "available" },
    { id: "api", sourceRef: "synced-repo://acme/api", provider: "github", owner: "acme", name: "api", defaultBranch: "main", localPath: "repos/api", latestCommit: "demo-api", status: "available" },
    { id: "worker", sourceRef: "synced-repo://acme/worker", provider: "github", owner: "acme", name: "worker", defaultBranch: "main", localPath: "repos/worker", latestCommit: "demo-worker", status: "available" },
  ];

  return {
    async resolve(ids: string[]) {
      return repositories.filter((repo) => ids.includes(repo.id));
    },
  };
}
```

- [ ] **Step 4: Wire `/api/integrations/github/sync-demo` through the adapter**

Update the sync route to resolve repository ids from `state.workspace.repositories`, log the count, and store the result on state.

- [ ] **Step 5: Display metadata in the setup panel**

In `src/App.tsx`, add latest commit/status under each repository only if metadata is present. Keep the existing dashboard density and neutral token palette.

- [ ] **Step 6: Run verification**

Run: `npm test && npm run build && npm run lint`

Expected: all pass. Click `Resolve repo metadata` and confirm the setup panel shows provider/status/commit metadata.

- [ ] **Step 7: Commit**

```bash
git add server/repository-sync.ts src/shared/types.ts server/app.ts src/App.tsx tests/mvp.test.ts
git commit -m "feat: consume linked repository metadata" -m "AI-Model: OpenAI GPT-5 Codex"
```

---

### Task 5: Implement Safe Local Runner

**Files:**

- Create: `server/local-runner.ts`
- Modify: `server/app.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/mvp.test.ts`

- [ ] **Step 1: Define runner result types**

Add to `src/shared/types.ts`.

```ts
export type RunnerCommand = {
  id: "compose-up" | "compose-down" | "health-check";
  label: string;
  command: string;
  args: string[];
  destructive: boolean;
};

export type RunnerResult = {
  ok: boolean;
  commandId: RunnerCommand["id"];
  exitCode: number;
  logs: string[];
};
```

- [ ] **Step 2: Write allowlist tests**

```ts
import { getRunnerCommand } from "../server/local-runner";

it("allows compose up and blocks unknown runner commands", () => {
  expect(getRunnerCommand("compose-up").destructive).toBe(false);
  expect(() => getRunnerCommand("rm-rf" as never)).toThrow("Unsupported runner command");
});
```

- [ ] **Step 3: Implement allowlisted runner module**

Create `server/local-runner.ts`.

```ts
import { spawn } from "node:child_process";
import type { RunnerCommand, RunnerResult } from "../src/shared/types";

const commands: Record<RunnerCommand["id"], RunnerCommand> = {
  "compose-up": { id: "compose-up", label: "Start workspace", command: "docker", args: ["compose", "-f", ".corvin/generated.compose.yml", "up", "--build"], destructive: false },
  "compose-down": { id: "compose-down", label: "Stop workspace", command: "docker", args: ["compose", "-f", ".corvin/generated.compose.yml", "down"], destructive: false },
  "health-check": { id: "health-check", label: "Check service health", command: "node", args: ["-e", "fetch(process.argv[1]).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], destructive: false },
};

export function getRunnerCommand(id: RunnerCommand["id"]) {
  const command = commands[id];
  if (!command) throw new Error(`Unsupported runner command: ${id}`);
  return command;
}

export async function runAllowedCommand(commandId: RunnerCommand["id"], options: { dryRun: boolean }): Promise<RunnerResult> {
  const command = getRunnerCommand(commandId);
  if (options.dryRun) {
    return { ok: true, commandId, exitCode: 0, logs: [`[runner] dry-run ${command.command} ${command.args.join(" ")}`] };
  }

  return await new Promise((resolve) => {
    const logs: string[] = [];
    const child = spawn(command.command, command.args, { shell: false });
    child.stdout.on("data", (chunk) => logs.push(String(chunk)));
    child.stderr.on("data", (chunk) => logs.push(String(chunk)));
    child.on("exit", (code) => resolve({ ok: code === 0, commandId, exitCode: code ?? 1, logs }));
  });
}
```

- [ ] **Step 4: Keep demo-safe mode default**

Use `process.env.CORVIN_RUNNER_MODE === "real"` to choose real command execution. Otherwise call `runAllowedCommand(..., { dryRun: true })`.

- [ ] **Step 5: Run verification**

Run: `npm test && npm run build && npm run lint`

Expected: all pass. In default mode, `Run prepared workspace` logs dry-run/safe-mode output and does not require Docker.

- [ ] **Step 6: Commit**

```bash
git add server/local-runner.ts server/app.ts src/shared/types.ts tests/mvp.test.ts
git commit -m "feat: add allowlisted local runner commands" -m "AI-Model: OpenAI GPT-5 Codex"
```

---

### Task 6: Add Structured OpenAI Routing Output

**Files:**

- Create: `server/openai-planner.ts`
- Modify: `src/shared/types.ts`
- Modify: `server/app.ts`
- Modify: `src/shared/mvp.ts`
- Test: `tests/mvp.test.ts`

- [ ] **Step 1: Define structured plan schema**

Add fields to `OpenAIChangePlan` in `src/shared/types.ts`.

```ts
riskLevel: "low" | "medium" | "high";
targetRepositories: string[];
verificationCommands: string[];
blockedReason?: string;
```

- [ ] **Step 2: Write parser tests**

```ts
import { parseOpenAIPlanJson } from "../server/openai-planner";

it("parses structured OpenAI planner JSON", () => {
  const parsed = parseOpenAIPlanJson(JSON.stringify({
    summary: "Update checkout headline.",
    recommendedHeadline: "Checkout that makes the next step obvious.",
    steps: ["Edit web copy", "Run tests"],
    riskLevel: "low",
    targetRepositories: ["web"],
    verificationCommands: ["npm test"],
  }));

  expect(parsed.riskLevel).toBe("low");
  expect(parsed.targetRepositories).toEqual(["web"]);
});
```

- [ ] **Step 3: Implement planner parser and fallback**

Create `server/openai-planner.ts`.

```ts
import { z } from "zod";

const openAIPlanSchema = z.object({
  summary: z.string().min(1),
  recommendedHeadline: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  riskLevel: z.enum(["low", "medium", "high"]),
  targetRepositories: z.array(z.string().min(1)),
  verificationCommands: z.array(z.string().min(1)),
  blockedReason: z.string().optional(),
});

export function parseOpenAIPlanJson(text: string) {
  return openAIPlanSchema.parse(JSON.parse(text));
}
```

- [ ] **Step 4: Update live OpenAI call**

In `server/app.ts`, keep `OPENAI_MODEL` configurable. Ask the model for JSON matching the parser shape. If parsing fails, return the existing demo plan with `riskLevel: "medium"`, `targetRepositories: ["web"]`, and `verificationCommands: ["npm test", "npm run build", "npm run lint"]`.

- [ ] **Step 5: Run verification**

Run: `npm test && npm run build && npm run lint`

Expected: all pass with and without `OPENAI_API_KEY`.

- [ ] **Step 6: Commit**

```bash
git add server/openai-planner.ts server/app.ts src/shared/types.ts src/shared/mvp.ts tests/mvp.test.ts
git commit -m "feat: structure OpenAI routing output" -m "AI-Model: OpenAI GPT-5 Codex"
```

---

### Task 7: Build Agent Handoff Packet

**Files:**

- Create: `server/handoff.ts`
- Modify: `src/shared/types.ts`
- Modify: `server/app.ts`
- Modify: `src/App.tsx`
- Test: `tests/mvp.test.ts`

- [ ] **Step 1: Define handoff packet type**

Add to `src/shared/types.ts`.

```ts
export type AgentHandoffPacket = {
  id: string;
  requestId: string;
  workspaceId: string;
  repositoryIds: string[];
  branchPlan: string[];
  startupOrder: string[];
  verificationCommands: string[];
  previewUrls: string[];
  createdAt: string;
};
```

- [ ] **Step 2: Write handoff builder test**

```ts
import { buildAgentHandoffPacket } from "../server/handoff";
import { createInitialState } from "../src/shared/demo";

it("builds a handoff packet from request, workspace, and OpenAI plan", () => {
  const state = createInitialState();
  const packet = buildAgentHandoffPacket(state);

  expect(packet.requestId).toBe(state.requests[0].id);
  expect(packet.repositoryIds).toContain("web");
  expect(packet.previewUrls).toContain("http://localhost:5173/preview/checkout");
});
```

- [ ] **Step 3: Implement handoff builder**

Create `server/handoff.ts`.

```ts
import type { AgentHandoffPacket, MvpState } from "../src/shared/types";

export function buildAgentHandoffPacket(state: MvpState): AgentHandoffPacket {
  const request = state.requests[0];
  if (!request) throw new Error("No PM request is available for handoff");

  return {
    id: `handoff_${request.id}`,
    requestId: request.id,
    workspaceId: state.workspace.id,
    repositoryIds: state.openAI.lastPlan?.targetRepositories ?? state.workspace.repositories.map((repo) => repo.id),
    branchPlan: state.workspace.repositories.map((repo) => `${repo.id}: ${repo.branchCoupling ?? "Use default branch unless change requires it."}`),
    startupOrder: state.workspace.services.map((service) => `${service.id}: ${service.healthUrl}`),
    verificationCommands: state.openAI.lastPlan?.verificationCommands ?? ["npm test", "npm run build", "npm run lint"],
    previewUrls: [state.deployment.local.url, state.deployment.staging.url],
    createdAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Add endpoint and UI panel**

Add `POST /api/handoff` that builds and stores the latest handoff packet. Add a compact `Agent handoff` panel to `src/App.tsx` showing request id, target repos, branch plan, verification commands, and preview URLs.

- [ ] **Step 5: Run verification**

Run: `npm test && npm run build && npm run lint`

Expected: all pass. Click through request -> OpenAI plan -> handoff and confirm the panel contains the packet.

- [ ] **Step 6: Commit**

```bash
git add server/handoff.ts server/app.ts src/shared/types.ts src/App.tsx tests/mvp.test.ts
git commit -m "feat: generate agent handoff packets" -m "AI-Model: OpenAI GPT-5 Codex"
```

---

### Task 8: Add Preview Verification Gate

**Files:**

- Create: `server/verification.ts`
- Modify: `src/shared/types.ts`
- Modify: `server/app.ts`
- Modify: `src/App.tsx`
- Test: `tests/mvp.test.ts`

- [ ] **Step 1: Define verification result type**

Add to `src/shared/types.ts`.

```ts
export type VerificationResult = {
  id: string;
  status: "passed" | "failed";
  checks: Array<{ id: string; label: string; status: "passed" | "failed"; detail: string }>;
  createdAt: string;
};
```

- [ ] **Step 2: Write verification test**

```ts
import { verifyDeploymentPreview } from "../server/verification";
import { createDeploymentDemoState } from "../src/shared/mvp";

it("passes verification when staging and production headlines match after promotion", async () => {
  const deployment = createDeploymentDemoState();
  const promoted = {
    ...deployment,
    staging: { ...deployment.staging, headline: "New headline", status: "ready" as const },
    production: { ...deployment.production, headline: "New headline", status: "live" as const },
  };

  const result = await verifyDeploymentPreview(promoted);

  expect(result.status).toBe("passed");
});
```

- [ ] **Step 3: Implement verifier**

Create `server/verification.ts`.

```ts
import type { DeploymentDemoState, VerificationResult } from "../src/shared/types";

export async function verifyDeploymentPreview(deployment: DeploymentDemoState): Promise<VerificationResult> {
  const checks = [
    {
      id: "staging-ready",
      label: "Staging preview is ready",
      status: deployment.staging.status === "ready" ? "passed" as const : "failed" as const,
      detail: deployment.staging.url,
    },
    {
      id: "production-matches-staging",
      label: "Production headline matches reviewed staging headline",
      status: deployment.production.headline === deployment.staging.headline ? "passed" as const : "failed" as const,
      detail: deployment.production.headline,
    },
  ];

  return {
    id: `verify_${Date.now()}`,
    status: checks.every((check) => check.status === "passed") ? "passed" : "failed",
    checks,
    createdAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Block production promotion unless verification passes**

Add `POST /api/verify/preview`. Store the latest verification result. Update `/api/deploy/production` to return `409` unless verification passed after the latest staging change.

- [ ] **Step 5: Add UI verification control**

Add a `Verify preview` button between staging and production controls. Disable `Push to production app` unless the latest verification passed.

- [ ] **Step 6: Run verification**

Run: `npm test && npm run build && npm run lint`

Expected: all pass. Browser-check the flow: staging -> production blocked -> verify -> production succeeds.

- [ ] **Step 7: Commit**

```bash
git add server/verification.ts server/app.ts src/shared/types.ts src/App.tsx tests/mvp.test.ts
git commit -m "feat: gate production promotion on preview verification" -m "AI-Model: OpenAI GPT-5 Codex"
```

---

### Task 9: Split Dashboard Into Focused Components

**Files:**

- Create: `src/components/IntegrationStrip.tsx`
- Create: `src/components/PMStoryPanel.tsx`
- Create: `src/components/EngineeringPacketPanel.tsx`
- Create: `src/components/OpenAIPanel.tsx`
- Create: `src/components/DeploymentPanel.tsx`
- Create: `src/components/ServiceGrid.tsx`
- Create: `src/components/SetupPanel.tsx`
- Create: `src/components/RequestPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Move one component at a time**

Start with `IntegrationStrip`, export it from `src/components/IntegrationStrip.tsx`, and import it into `src/App.tsx`.

- [ ] **Step 2: Run verification after each move**

Run: `npm run build && npm run lint`

Expected: both pass after every component extraction.

- [ ] **Step 3: Keep design-system constraints intact**

Preserve:

- Neutral Corvin palette from `src/styles.css`.
- Alata/Lora/Roboto font roles.
- No nested card layouts.
- Dashboard density and `lg:grid-cols-[240px_minmax(0,1fr)]` shell.
- Lucide icons in buttons.

- [ ] **Step 4: Run full verification**

Run: `npm test && npm run build && npm run lint`

Expected: all pass and browser dashboard content is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components
git commit -m "refactor: split Corvin dashboard panels" -m "AI-Model: OpenAI GPT-5 Codex"
```

---

### Task 10: Add End-To-End Smoke Coverage

**Files:**

- Create: `tests/workflow-smoke.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add API smoke test**

Create `tests/workflow-smoke.test.ts`.

```ts
import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../server/app";

describe("Corvin API smoke workflow", () => {
  it("runs the post-integration workflow through staging and production", async () => {
    await request(app).get("/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=local-dev&hub.challenge=ok").expect(200);
    await request(app).post("/api/integrations/github/sync-demo").expect(200);
    await request(app).post("/api/workspace/run").expect(200);
    await request(app).post("/api/openai/change-plan").send({ requestBody: "Change checkout headline" }).expect(200);
    await request(app).post("/api/deploy/staging").send({ headline: "Checkout that makes the next step obvious." }).expect(200);
    const production = await request(app).post("/api/deploy/production").expect(200);

    expect(production.body.production.headline).toBe("Checkout that makes the next step obvious.");
  });
});
```

- [ ] **Step 2: Install test dependency**

Run: `npm install -D supertest @types/supertest`

- [ ] **Step 3: Run smoke test and adjust for verification gate**

After Task 8, insert `POST /api/verify/preview` before production promotion.

- [ ] **Step 4: Run full verification**

Run: `npm test && npm run build && npm run lint`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/workflow-smoke.test.ts
git commit -m "test: cover Corvin post-integration workflow" -m "AI-Model: OpenAI GPT-5 Codex"
```

---

## Execution Order

1. Task 1: Normalize step derivation.
2. Task 2: Persist workflow state.
3. Task 3: Add execution packet import.
4. Task 4: Consume linked repository metadata.
5. Task 5: Implement safe local runner.
6. Task 6: Add structured OpenAI routing output.
7. Task 7: Build agent handoff packet.
8. Task 8: Add preview verification gate.
9. Task 9: Split dashboard components.
10. Task 10: Add end-to-end smoke coverage.

This order keeps the workflow observable after every task and avoids building real runner or agent handoff behavior on unstable state transitions.

---

## Self-Review

**Spec coverage:** WhatsApp and GitHub setup are treated as already available. The plan starts after those integrations and covers request capture, repository metadata, execution packet import, safe run, OpenAI routing, handoff, preview verification, and promotion.

**Placeholder scan:** No `TBD`, `TODO`, or open-ended "add tests" steps remain. Every task includes files, test intent, implementation shape, verification, and commit command.

**Type consistency:** New types are named once and reused consistently: `SyncedRepository`, `RunnerCommand`, `RunnerResult`, `AgentHandoffPacket`, and `VerificationResult`.
