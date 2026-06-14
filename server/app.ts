import { existsSync, readFileSync, writeFileSync } from "node:fs";
import cors from "cors";
import express from "express";
import OpenAI from "openai";
import {
  buildGitHubAuthorizeUrl,
  buildExecRunPlan,
  canCapturePMRequest,
  createOpenAIChangePlan,
  createOpenAIRoutingPlan,
  createWebRequest,
  generateComposeFile,
  parseExecMarkdown,
  parseWhatsAppPayload,
  promoteStagingToProduction,
  stageRequestedChange,
  validateExecDocument,
  validateBlueprint,
} from "../src/shared/mvp";
import { createInitialState } from "../src/shared/demo";
import type { ExecDocument, ExecSetupState, MvpState, ServiceConfig, WorkspaceBlueprint } from "../src/shared/types";

export const app = express();
export const state: MvpState = createInitialState();
const execFileUrl = new URL("../exec.md", import.meta.url);

const openAIModel = process.env.OPENAI_MODEL ?? "gpt-5.5";
const openAIClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

state.openAI = {
  ...state.openAI,
  model: openAIModel,
  configured: Boolean(openAIClient),
  routing: createOpenAIRoutingPlan(),
};
syncExecFromDisk();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/state", (_request, response) => {
  response.json(state);
});

app.get("/api/exec", (_request, response) => {
  response.json(state.exec);
});

app.post("/api/exec/validate", (request, response) => {
  const markdown = String(request.body.markdown ?? "");
  response.json(createExecSetupFromMarkdown(markdown, false));
});

app.post("/api/exec", (request, response) => {
  const markdown = String(request.body.markdown ?? "");
  const nextExec = createExecSetupFromMarkdown(markdown, true);

  if (!nextExec.exists || !nextExec.validation.ready) {
    state.exec = nextExec;
    response.status(400).json(nextExec);
    return;
  }

  const parsed = parseExecMarkdown(markdown);
  if (!parsed.ok) {
    state.exec = nextExec;
    response.status(400).json(nextExec);
    return;
  }

  writeFileSync(execFileUrl, markdown, "utf8");
  applyExecDocument(parsed.document, markdown);
  state.logs.unshift("[exec.md] saved and validated workspace setup");
  response.json(state.exec);
});

app.post("/api/integrations/github/sync-demo", (_request, response) => {
  upsertIntegration("github", "connected", "Demo repository sync is connected");
  updateStep("github-sync", "succeeded");
  updateFinalEntryPointStep();
  state.logs.unshift("[github] demo repository sync connected");
  response.json(state);
});

app.get("/api/integrations/github/authorize", (request, response) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const protocol = String(request.headers["x-forwarded-proto"] ?? request.protocol ?? "http").split(",")[0];
  const host = request.headers.host ?? `localhost:${process.env.CORVIN_API_PORT ?? 8787}`;
  const redirectUri =
    process.env.GITHUB_REDIRECT_URI ?? `${protocol}://${host}/api/integrations/github/callback`;
  const oauthState = process.env.GITHUB_OAUTH_STATE ?? "corvin-local-demo";

  if (!clientId) {
    response.json({
      configured: false,
      message: "Set GITHUB_CLIENT_ID to generate a live GitHub OAuth URL.",
      demoAction: "/api/integrations/github/sync-demo",
    });
    return;
  }

  response.json({
    configured: true,
    url: buildGitHubAuthorizeUrl({
      clientId,
      redirectUri,
      state: oauthState,
      scopes: ["repo", "read:org"],
    }),
  });
});

app.get("/api/integrations/github/callback", (request, response) => {
  upsertIntegration("github", "connected", "GitHub OAuth callback received");
  state.logs.unshift(`[github] callback received with code=${String(request.query.code ?? "missing")}`);
  response.type("html").send("<p>GitHub connected. You can return to Corvin.</p>");
});

app.get("/webhooks/whatsapp", (request, response) => {
  const mode = request.query["hub.mode"];
  const token = request.query["hub.verify_token"];
  const challenge = request.query["hub.challenge"];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "local-dev";

  if (mode === "subscribe" && token === expected && typeof challenge === "string") {
    upsertIntegration("whatsapp", "connected", "WhatsApp webhook verified");
    updateStep("whatsapp-entry", "succeeded");
    updateFinalEntryPointStep();
    state.logs.unshift("[whatsapp] webhook verification succeeded");
    response.status(200).send(challenge);
    return;
  }

  response.status(403).json({ ok: false, message: "Webhook verification failed" });
});

app.post("/webhooks/whatsapp", (request, response) => {
  const intake = parseWhatsAppPayload(request.body);
  if (!intake) {
    response.status(200).json({ ok: true, ignored: true });
    return;
  }

  if (!canCapturePMRequest(state.workspace, state.validation, state.exec)) {
    response.status(409).json({
      ok: false,
      error: "exec_md_required",
      message:
        "Create and validate exec.md before a PM request can run locally. Required fields include repositories, install commands, dev commands, health checks, and required env values.",
    });
    return;
  }

  const pmRequest = {
    ...createWebRequest({
      title: intake.text.replace(/^corvin\s+[\w-]+:\s*/i, ""),
      body: intake.text,
      requester: intake.from,
      workspaceId: intake.workspaceHint ?? state.workspace.id,
    }),
    id: `wa_${intake.messageId.replace(/[^\w-]/g, "_")}`,
    channel: "whatsapp" as const,
  };

  state.requests.unshift(pmRequest);
  upsertIntegration("whatsapp", "connected", "WhatsApp message captured");
  updateStep("whatsapp-entry", "succeeded");
  updateStep("request", "succeeded");
  updateStep("handoff", "succeeded");
  updateFinalEntryPointStep();
  state.logs.unshift(`[whatsapp] captured request ${pmRequest.id} from ${intake.from}`);
  response.json({ ok: true, request: pmRequest });
});

app.post("/api/workspace/validate", (_request, response) => {
  state.validation = validateBlueprint(state.workspace, {
    dockerReady: true,
    syncedRepositoryIds: state.workspace.repositories.map((repository) => repository.id),
    env: {
      DATABASE_URL: "postgres://postgres:corvin@localhost:5432/postgres",
      API_BASE_URL: "http://localhost:3000",
      WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN ?? "local-dev",
    },
    occupiedPorts: [],
  });
  state.logs.unshift("[validate] workspace validation completed");
  response.json(state.validation);
});

app.post("/api/workspace/run", (_request, response) => {
  if (!state.exec.exists || !state.exec.validation.ready) {
    state.logs.unshift("[exec.md] local run blocked because exec.md is missing or invalid");
    response.status(409).json({
      error: "exec_md_required",
      message: "Create and validate exec.md before Corvin can package the local run workflow.",
      exec: state.exec,
    });
    return;
  }

  const parsed = parseExecMarkdown(state.exec.markdown);
  if (!parsed.ok) {
    state.exec = {
      exists: false,
      markdown: state.exec.markdown,
      validation: {
        ready: false,
        errors: parsed.errors,
        warnings: [],
      },
    };
    response.status(409).json({ error: "exec_md_invalid", exec: state.exec });
    return;
  }

  const runPlan = buildExecRunPlan(parsed.document, getDemoEnvValues());
  if (!runPlan.ready || !runPlan.plan) {
    state.exec = {
      ...state.exec,
      validation: {
        ready: false,
        errors: runPlan.errors,
        warnings: state.exec.validation.warnings,
      },
    };
    state.logs.unshift("[exec.md] local run blocked because required setup values are missing");
    response.status(409).json({ error: "exec_md_run_blocked", exec: state.exec });
    return;
  }

  state.running = true;
  state.compose = generateComposeFile(state.workspace);
  state.workspace.services = state.workspace.services.map((service) => ({
    ...service,
    status: service.id === "worker" ? "idle" : "healthy",
  }));
  state.steps = state.steps.map((step) => {
    if (["blueprint", "validate", "compose", "run", "status"].includes(step.id)) {
      return { ...step, status: "succeeded" };
    }
    if (step.id === "request") {
      return { ...step, status: state.requests.length > 0 ? "succeeded" : "pending" };
    }
    return step;
  });
  state.exec = {
    ...state.exec,
    runPlan: runPlan.plan,
  };
  state.logs.unshift(`[runner] packaged ${runPlan.plan.commands.length} exec.md commands in safe mode`);
  for (const command of runPlan.plan.commands.slice().reverse()) {
    state.logs.unshift(`[exec.md] ${command}`);
  }
  state.logs.unshift("[health] web and api services are healthy");
  response.json(state);
});

app.post("/api/workspace/stop", (_request, response) => {
  state.running = false;
  state.workspace.services = state.workspace.services.map((service) => ({
    ...service,
    status: "idle",
  }));
  state.logs.unshift("[runner] docker compose down simulated in safe mode");
  response.json(state);
});

app.post("/api/requests", (request, response) => {
  if (!canCapturePMRequest(state.workspace, state.validation, state.exec)) {
    response.status(409).json({
      error: "exec_md_required",
      message:
        "Create and validate exec.md before a PM request can run locally. Required fields include repositories, install commands, dev commands, health checks, and required env values.",
    });
    return;
  }

  const pmRequest = createWebRequest({
    title: String(request.body.title ?? ""),
    body: String(request.body.body ?? ""),
    requester: String(request.body.requester ?? "pm@local"),
    workspaceId: state.workspace.id,
  });
  state.requests.unshift(pmRequest);
  updateStep("request", "succeeded");
  updateStep("handoff", "succeeded");
  updateFinalEntryPointStep();
  state.logs.unshift(`[request] captured ${pmRequest.id} from web form`);
  response.json(pmRequest);
});

app.post("/api/openai/change-plan", async (request, response) => {
  const requestBody = String(request.body.requestBody ?? state.requests[0]?.body ?? "");
  const basePlan = createOpenAIChangePlan({
    requestBody,
    pmName: state.pm.name,
    workspaceName: state.workspace.name,
    openAIConfigured: Boolean(openAIClient),
    model: openAIModel,
  });

  if (!openAIClient) {
    state.openAI.lastPlan = basePlan;
    state.logs.unshift("[openai] demo plan generated; set OPENAI_API_KEY for live Responses API");
    response.json(basePlan);
    return;
  }

  try {
    const result = await openAIClient.responses.create({
      model: openAIModel,
      input: [
        {
          role: "developer",
          content:
            "You create concise PM-facing implementation plans. Return a short JSON object with summary, recommendedHeadline, and steps.",
        },
        {
          role: "user",
          content: `PM: ${state.pm.name}\nWorkspace: ${state.workspace.name}\nRequest: ${requestBody}`,
        },
      ],
    });
    const text = result.output_text;
    const livePlan = {
      ...basePlan,
      mode: "live" as const,
      summary: text || basePlan.summary,
    };
    state.openAI.lastPlan = livePlan;
    state.logs.unshift(`[openai] live ${openAIModel} plan generated`);
    response.json(livePlan);
  } catch (error) {
    state.openAI.lastPlan = basePlan;
    state.logs.unshift("[openai] live request failed; demo plan kept");
    response.status(502).json({
      ...basePlan,
      error: error instanceof Error ? error.message : "OpenAI request failed",
    });
  }
});

app.post("/api/deploy/staging", (request, response) => {
  const headline =
    String(request.body.headline ?? state.openAI.lastPlan?.recommendedHeadline ?? "").trim() ||
    "Checkout that makes the next step obvious.";
  const requestId = String(request.body.requestId ?? state.requests[0]?.id ?? "demo-request");
  state.deployment = stageRequestedChange(state.deployment, {
    requestId,
    requestedBy: state.pm.name,
    newHeadline: headline,
  });
  state.logs.unshift(`[deploy] ${state.pm.name} staged ${requestId} for visible review`);
  response.json(state.deployment);
});

app.post("/api/deploy/production", (_request, response) => {
  state.deployment = promoteStagingToProduction(state.deployment);
  state.logs.unshift("[deploy] staging change promoted to production app");
  response.json(state.deployment);
});

function upsertIntegration(id: "whatsapp" | "github" | "docker", status: MvpState["integrations"][number]["status"], detail: string) {
  state.integrations = state.integrations.map((integration) =>
    integration.id === id ? { ...integration, status, detail } : integration,
  );
}

function updateStep(id: string, status: MvpState["steps"][number]["status"]) {
  state.steps = state.steps.map((step) => (step.id === id ? { ...step, status } : step));
}

function updateFinalEntryPointStep() {
  const whatsappConnected = state.integrations.some(
    (integration) => integration.id === "whatsapp" && integration.status === "connected",
  );
  const githubConnected = state.integrations.some(
    (integration) => integration.id === "github" && integration.status === "connected",
  );
  const hasWhatsAppRequest = state.requests.some((request) => request.channel === "whatsapp");

  if (whatsappConnected && githubConnected && hasWhatsAppRequest) {
    updateStep("whatsapp-github-ready", "succeeded");
  }
}

function syncExecFromDisk() {
  if (!existsSync(execFileUrl)) {
    return;
  }

  const markdown = readFileSync(execFileUrl, "utf8");
  const parsed = parseExecMarkdown(markdown);
  if (!parsed.ok) {
    state.exec = {
      exists: false,
      markdown,
      validation: {
        ready: false,
        errors: parsed.errors,
        warnings: [],
      },
    };
    return;
  }

  applyExecDocument(parsed.document, markdown);
}

function createExecSetupFromMarkdown(markdown: string, includeEnvValues: boolean): ExecSetupState {
  const parsed = parseExecMarkdown(markdown);
  if (!parsed.ok) {
    return {
      exists: false,
      markdown,
      validation: {
        ready: false,
        errors: parsed.errors,
        warnings: [],
      },
    };
  }

  const validation = validateExecDocument(parsed.document, includeEnvValues ? getDemoEnvValues() : getDemoEnvValues());
  return {
    exists: validation.ready,
    markdown,
    validation: {
      ...validation,
      warnings: [...validation.warnings, ...createExecReadinessWarnings(parsed.document)],
    },
    runPlan: validation.ready ? buildExecRunPlan(parsed.document, getDemoEnvValues()).plan : undefined,
  };
}

function applyExecDocument(document: ExecDocument, markdown: string) {
  const validation = validateExecDocument(document, getDemoEnvValues());
  const runPlan = buildExecRunPlan(document, getDemoEnvValues());
  state.exec = {
    exists: validation.ready,
    markdown,
    validation: {
      ...validation,
      warnings: [...validation.warnings, ...createExecReadinessWarnings(document)],
    },
    runPlan: runPlan.plan,
  };
  state.workspace = createWorkspaceFromExec(document, state.workspace);
  state.validation = validateBlueprint(state.workspace, {
    dockerReady: true,
    syncedRepositoryIds: state.workspace.repositories.map((repository) => repository.id),
    env: getDemoEnvValues(),
    occupiedPorts: [],
  });
  state.compose = generateComposeFile(state.workspace);
}

function createWorkspaceFromExec(document: ExecDocument, current: WorkspaceBlueprint): WorkspaceBlueprint {
  const services: ServiceConfig[] = document.repositories.map((repository) => ({
    id: repository.id,
    label: repository.id,
    repositoryId: repository.id,
    port: parsePort(repository.health),
    healthUrl: repository.health,
    status: "idle",
  }));

  return {
    ...current,
    setupStatus: "ready",
    pmRunCommand: "Generated at runtime from exec.md",
    executionScriptSummary: document.localRunNotes,
    engineeringIntake: [
      {
        id: "exec-md",
        label: "exec.md local setup",
        detail: "Repositories, env vars, install commands, dev commands, and health checks are saved in workspace-root exec.md.",
        status: "provided",
      },
    ],
    repositories: document.repositories.map((repository) => ({
      id: repository.id,
      label: repository.id,
      sourceRef: `synced-repo://${repository.repo}`,
      defaultBranch: "main",
      localPath: `repos/${repository.id}`,
      purpose: repository.role,
      startupCommand: `${repository.install} && ${repository.dev}`,
      branchCoupling: "Selected from GitHub-linked repositories and configured in exec.md.",
    })),
    services,
    environment: {
      required: collectRequiredExecEnv(document),
    },
  };
}

function getDemoEnvValues(): Record<string, string | undefined> {
  return {
    DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:corvin@localhost:5432/postgres",
    API_BASE_URL: process.env.API_BASE_URL ?? "http://localhost:3000",
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN ?? "local-dev",
  };
}

function collectRequiredExecEnv(document: ExecDocument): string[] {
  return Array.from(
    new Set([
      ...document.environment.global,
      ...Object.values(document.environment.perRepo).flat(),
    ].filter((variable) => variable.required).map((variable) => variable.name)),
  );
}

function parsePort(url: string): number {
  try {
    const parsed = new URL(url);
    if (parsed.port) {
      return Number(parsed.port);
    }
    return parsed.protocol === "https:" ? 443 : 80;
  } catch {
    return 0;
  }
}

function createExecReadinessWarnings(document: ExecDocument): ExecSetupState["validation"]["warnings"] {
  const warnings: ExecSetupState["validation"]["warnings"] = [];
  if (document.localRunNotes.trim().length < 20) {
    warnings.push({
      id: "exec-notes-short",
      label: "Local run notes are brief",
      detail: "Add setup caveats, seed data, common failures, or port notes so another team can fix local run issues.",
      severity: "warning",
    });
  }
  for (const repository of document.repositories) {
    if (repository.install === repository.dev) {
      warnings.push({
        id: `repo-${repository.id}-commands-same`,
        label: `${repository.id} install and dev commands match`,
        detail: "This can work for a demo, but teams should separate install and start commands when possible.",
        severity: "warning",
      });
    }
  }
  return warnings;
}
