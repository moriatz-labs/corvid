import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import "./env";
import cors from "cors";
import express from "express";
import OpenAI from "openai";
import QRCode from "qrcode";
import {
  buildGitHubAuthorizeUrl,
  buildExecRunPlan,
  buildJobWorkspacePlan,
  buildWhatsAppConnect,
  canCapturePMRequest,
  createOpenAIChangePlan,
  createOpenAIRoutingPlan,
  createRequestFromWhatsAppMessage,
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
import type { ExecDocument, ExecSetupState, JobChangedFile, JobRunState, MvpState, ServiceConfig, WorkspaceBlueprint } from "../src/shared/types";
import type { WhatsAppIntake } from "../src/shared/types";
import {
  getWhatsAppSnapshot,
  refreshWhatsAppConnector,
  sendWhatsAppMessage,
  startWhatsAppConnector,
} from "./whatsapp";

export const app = express();
export const state: MvpState = createInitialState();
const execFileUrl = new URL("../exec.md", import.meta.url);

const openAIModel = process.env.OPENAI_MODEL ?? "gpt-5.5";
const openAIClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const githubAppOAuthState = process.env.GITHUB_APP_OAUTH_STATE ?? process.env.GITHUB_OAUTH_STATE ?? "corvin-local-demo";

type GitHubConnection = {
  connected: boolean;
  login?: string;
  name?: string;
  scopes: string[];
  connectedAt?: string;
  error?: string;
  accessToken?: string;
};

const githubConnection: GitHubConnection = {
  connected: false,
  scopes: [],
};
const jobDevProcesses = new Map<string, ChildProcess>();

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
  const clientId = getGitHubAppClientId();
  const clientSecret = getGitHubAppClientSecret();
  const protocol = String(request.headers["x-forwarded-proto"] ?? request.protocol ?? "http").split(",")[0];
  const host = request.headers.host ?? `localhost:${process.env.CORVIN_API_PORT ?? 8787}`;
  const redirectUri =
    process.env.GITHUB_REDIRECT_URI ?? `${protocol}://${host}/api/integrations/github/callback`;

  if (!clientId || !clientSecret) {
    githubConnection.connected = false;
    githubConnection.error = "GitHub App OAuth is not configured";
    upsertIntegration("github", "needs-config", "Set GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET to connect GitHub");
    updateStep("github-sync", "pending");
    response.json({
      configured: false,
      message: "Set GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET from your GitHub App settings.",
    });
    return;
  }

  response.json({
    configured: true,
    url: buildGitHubAuthorizeUrl({
      clientId,
      redirectUri,
      state: githubAppOAuthState,
      scopes: ["repo", "read:org"],
    }),
  });
});

app.get("/api/integrations/github/status", (_request, response) => {
  response.json({
    connected: githubConnection.connected,
    login: githubConnection.login,
    name: githubConnection.name,
    scopes: githubConnection.scopes,
    connectedAt: githubConnection.connectedAt,
    error: githubConnection.error,
  });
});

app.get("/api/integrations/github/callback", async (request, response) => {
  const code = String(request.query.code ?? "");
  const returnedState = String(request.query.state ?? "");
  const error = request.query.error ? String(request.query.error) : "";

  if (error) {
    markGitHubFailed(`GitHub App OAuth failed: ${error}`);
    response.type("html").send(renderOAuthResult("GitHub connection failed", error));
    return;
  }

  if (!code || returnedState !== githubAppOAuthState) {
    markGitHubFailed("GitHub App OAuth callback failed state validation");
    response.status(400).type("html").send(renderOAuthResult("GitHub connection failed", "Invalid OAuth state."));
    return;
  }

  const clientId = getGitHubAppClientId();
  const clientSecret = getGitHubAppClientSecret();
  const protocol = String(request.headers["x-forwarded-proto"] ?? request.protocol ?? "http").split(",")[0];
  const host = request.headers.host ?? `localhost:${process.env.CORVIN_API_PORT ?? 8787}`;
  const redirectUri =
    process.env.GITHUB_REDIRECT_URI ?? `${protocol}://${host}/api/integrations/github/callback`;

  if (!clientId || !clientSecret) {
    markGitHubFailed("GitHub App OAuth credentials are not configured");
    response.status(500).type("html").send(renderOAuthResult("GitHub connection failed", "OAuth credentials are missing."));
    return;
  }

  try {
    const token = await exchangeGitHubCode({
      clientId,
      clientSecret,
      code,
      redirectUri,
    });
    const profile = await fetchGitHubProfile(token.accessToken);
    githubConnection.connected = true;
    githubConnection.login = profile.login;
    githubConnection.name = profile.name ?? undefined;
    githubConnection.scopes = token.scopes;
    githubConnection.connectedAt = new Date().toISOString();
    githubConnection.error = undefined;
    githubConnection.accessToken = token.accessToken;

    upsertIntegration("github", "connected", `Connected as ${profile.login}`);
    updateStep("github-sync", "succeeded");
    updateFinalEntryPointStep();
    state.logs.unshift(`[github] connected as ${profile.login}`);
    response.type("html").send(renderOAuthResult("GitHub connected", "You can close this window and return to Corvin."));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "GitHub App OAuth failed";
    markGitHubFailed(message);
    response.status(502).type("html").send(renderOAuthResult("GitHub connection failed", message));
  }
});

app.get("/api/integrations/whatsapp/connect", async (request, response) => {
  const protocol = String(request.headers["x-forwarded-proto"] ?? request.protocol ?? "http").split(",")[0];
  const host = request.headers.host ?? `localhost:${process.env.CORVIN_API_PORT ?? 8787}`;
  const connection = await startWhatsAppConnector(async (intake) => {
    await captureWhatsAppIntake(intake);
  });
  syncWhatsAppConnection(connection);

  response.json(
    await buildWhatsAppConnectResponse(connection, `${protocol}://${host}`),
  );
});

app.get("/api/integrations/whatsapp/status", async (request, response) => {
  const protocol = String(request.headers["x-forwarded-proto"] ?? request.protocol ?? "http").split(",")[0];
  const host = request.headers.host ?? `localhost:${process.env.CORVIN_API_PORT ?? 8787}`;
  const connection = getWhatsAppSnapshot();
  syncWhatsAppConnection(connection);

  response.json(
    await buildWhatsAppConnectResponse(connection, `${protocol}://${host}`),
  );
});

app.post("/api/integrations/whatsapp/refresh", async (request, response) => {
  const protocol = String(request.headers["x-forwarded-proto"] ?? request.protocol ?? "http").split(",")[0];
  const host = request.headers.host ?? `localhost:${process.env.CORVIN_API_PORT ?? 8787}`;
  const connection = await refreshWhatsAppConnector(async (intake) => {
    await captureWhatsAppIntake(intake);
  });
  syncWhatsAppConnection(connection);

  response.json(
    await buildWhatsAppConnectResponse(connection, `${protocol}://${host}`),
  );
});

app.get("/webhooks/whatsapp", (request, response) => {
  const mode = request.query["hub.mode"];
  const token = request.query["hub.verify_token"];
  const challenge = request.query["hub.challenge"];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "local-dev";

  if (mode === "subscribe" && token === expected && typeof challenge === "string") {
    upsertIntegration("whatsapp", isIntegrationConnected("whatsapp") ? "connected" : "ready", "Webhook verified; QR pairing is ready");
    state.logs.unshift("[whatsapp] webhook verification succeeded");
    response.status(200).send(challenge);
    return;
  }

  response.status(403).json({ ok: false, message: "Webhook verification failed" });
});

app.post("/webhooks/whatsapp", async (request, response) => {
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

  const pmRequest = await captureWhatsAppIntake(intake);
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

app.post("/api/workspace/run", async (_request, response) => {
  if (!state.exec.exists || !state.exec.validation.ready) {
    state.logs.unshift("[exec.md] local run blocked because exec.md is missing or invalid");
    response.status(409).json({
      error: "exec_md_required",
      message: "Create and validate exec.md before Corvin can package the local run workflow.",
      exec: state.exec,
    });
    return;
  }

  const pmRequest = state.requests[0];
  if (!pmRequest) {
    response.status(409).json({
      error: "request_required",
      message: "Start a job by capturing a PM request before Corvin clones repositories.",
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

  const gitHubToken = getGitHubCloneToken();
  if (!gitHubToken) {
    const blockedJob = createBlockedJob(pmRequest, parsed.document, "Connect GitHub or set GITHUB_TOKEN before cloning repositories.");
    state.jobs.unshift(blockedJob);
    state.logs.unshift("[job] repository clone blocked because GitHub credentials are missing");
    response.status(409).json({
      error: "github_token_required",
      message: "Connect GitHub or set GITHUB_TOKEN before cloning repositories.",
      job: blockedJob,
    });
    return;
  }

  const job = createPlannedJob(pmRequest, parsed.document);
  state.jobs.unshift(job);
  state.running = true;
  try {
    await cloneJobRepositories(job, gitHubToken);
    await startJobRepositories(job);
  } catch (error) {
    stopJobProcesses();
    state.running = false;
    response.status(502).json({
      error: "repository_clone_failed",
      message: error instanceof Error ? redactToken(error.message, gitHubToken) : "Repository clone failed.",
      job,
    });
    return;
  }
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
  state.logs.unshift(`[runner] prepared ${runPlan.plan.commands.length} exec.md commands for ${job.id}`);
  for (const command of runPlan.plan.commands.slice().reverse()) {
    state.logs.unshift(`[exec.md] ${command}`);
  }
  state.logs.unshift(`[job] ${job.id} repository branches are ready`);
  response.json(state);
});

app.post("/api/workspace/stop", (_request, response) => {
  stopJobProcesses();
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

app.post("/api/jobs/:jobId/apply-change", async (request, response) => {
  const job = findJob(String(request.params.jobId));
  if (!job) {
    response.status(404).json({ error: "job_not_found" });
    return;
  }
  const pmRequest = state.requests.find((item) => item.id === job.requestId);
  if (!pmRequest) {
    response.status(409).json({ error: "request_not_found", message: "The job request is missing." });
    return;
  }

  try {
    await applyJobChange(job, pmRequest, String(request.body?.feedback ?? ""));
    response.json(job);
  } catch (error) {
    job.status = "failed";
    job.currentAction = "Change application failed";
    job.logs.unshift(error instanceof Error ? error.message : "Change application failed");
    job.updatedAt = new Date().toISOString();
    response.status(502).json({ error: "change_apply_failed", job });
  }
});

app.post("/api/jobs/:jobId/request-changes", (request, response) => {
  const job = findJob(String(request.params.jobId));
  if (!job) {
    response.status(404).json({ error: "job_not_found" });
    return;
  }
  const feedback = String(request.body?.feedback ?? "PM requested changes.");
  job.status = "waiting-for-changes";
  job.currentAction = "Waiting for changes";
  job.logs.unshift(`[review] ${feedback}`);
  job.updatedAt = new Date().toISOString();
  response.json(job);
});

app.post("/api/jobs/:jobId/pull-request", async (_request, response) => {
  const job = findJob(String(_request.params.jobId));
  if (!job) {
    response.status(404).json({ error: "job_not_found" });
    return;
  }
  const token = getGitHubCloneToken();
  if (!token) {
    response.status(409).json({
      error: "github_token_required",
      message: "Connect GitHub or set GITHUB_TOKEN before creating pull requests.",
      job,
    });
    return;
  }

  try {
    await createPullRequestsForJob(job, token);
    response.json(job);
  } catch (error) {
    job.status = "failed";
    job.currentAction = "Pull request creation failed";
    job.logs.unshift(error instanceof Error ? redactToken(error.message, token) : "Pull request creation failed");
    job.updatedAt = new Date().toISOString();
    response.status(502).json({ error: "pull_request_failed", job });
  }
});

app.post("/api/jobs/:jobId/merge", async (_request, response) => {
  const job = findJob(String(_request.params.jobId));
  if (!job) {
    response.status(404).json({ error: "job_not_found" });
    return;
  }
  const token = getGitHubCloneToken();
  if (!token) {
    response.status(409).json({
      error: "github_token_required",
      message: "Connect GitHub or set GITHUB_TOKEN before merging pull requests.",
      job,
    });
    return;
  }
  if (job.pullRequests.length === 0) {
    response.status(409).json({
      error: "pull_request_required",
      message: "Create a pull request before merging this job.",
      job,
    });
    return;
  }

  try {
    await mergePullRequestsForJob(job, token);
    response.json(job);
  } catch (error) {
    job.status = "failed";
    job.currentAction = "Pull request merge failed";
    job.logs.unshift(error instanceof Error ? redactToken(error.message, token) : "Pull request merge failed");
    job.updatedAt = new Date().toISOString();
    response.status(502).json({ error: "pull_request_merge_failed", job });
  }
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

function getGitHubAppClientId() {
  return process.env.GITHUB_APP_CLIENT_ID ?? process.env.GITHUB_CLIENT_ID;
}

function getGitHubAppClientSecret() {
  return process.env.GITHUB_APP_CLIENT_SECRET ?? process.env.GITHUB_CLIENT_SECRET;
}

async function exchangeGitHubCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub App token exchange failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (payload.error || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? "GitHub App did not return an access token");
  }

  return {
    accessToken: payload.access_token,
    scopes: payload.scope ? payload.scope.split(",").map((scope) => scope.trim()).filter(Boolean) : [],
  };
}

async function fetchGitHubProfile(accessToken: string) {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "corvin-local-agent",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub profile request failed with ${response.status}`);
  }

  const profile = (await response.json()) as { login?: string; name?: string | null };
  if (!profile.login) {
    throw new Error("GitHub profile response did not include a login");
  }
  return profile;
}

function markGitHubFailed(message: string) {
  githubConnection.connected = false;
  githubConnection.error = message;
  upsertIntegration("github", "failed", message);
  state.logs.unshift(`[github] ${message}`);
}

function renderOAuthResult(title: string, message: string) {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(title)}</title>`,
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    "<style>body{font-family:system-ui,sans-serif;margin:40px;color:#1f1f23}p{color:#666;line-height:1.5}</style>",
    "</head>",
    "<body>",
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(message)}</p>`,
    "<script>setTimeout(()=>window.close(),1200)</script>",
    "</body>",
    "</html>",
  ].join("");
}

function getGitHubCloneToken() {
  return githubConnection.accessToken ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
}

function createPlannedJob(request: MvpState["requests"][number], document: ExecDocument): JobRunState {
  const now = new Date().toISOString();
  const plan = buildJobWorkspacePlan({
    request,
    document,
    workspaceRoot: ".corvin/jobs",
    createdAt: now,
  });

  return {
    id: plan.id,
    requestId: request.id,
    status: "planned",
    currentAction: "Planning repository workspace",
    plan,
    logs: [`[job] planned ${plan.repositories.length} repositories for ${request.id}`],
    changedFiles: [],
    pullRequests: [],
    startedAt: now,
    updatedAt: now,
  };
}

function createBlockedJob(request: MvpState["requests"][number], document: ExecDocument, reason: string): JobRunState {
  const job = createPlannedJob(request, document);
  const now = new Date().toISOString();
  return {
    ...job,
    status: "blocked",
    currentAction: "Waiting for GitHub credentials",
    logs: [reason, ...job.logs],
    updatedAt: now,
  };
}

async function cloneJobRepositories(job: JobRunState, token: string) {
  job.status = "cloning";
  job.currentAction = "Cloning repositories";
  job.updatedAt = new Date().toISOString();
  job.logs.unshift(`[job] cloning repositories into ${job.plan.rootPath}`);
  state.logs.unshift(`[job] cloning repositories for ${job.id}`);
  mkdirSync(job.plan.rootPath, { recursive: true });

  for (const repository of job.plan.repositories) {
    repository.status = "cloning";
    job.logs.unshift(`[git] cloning ${repository.repo}`);
    state.logs.unshift(`[git] cloning ${repository.repo}`);
    mkdirSync(new URL(`../${repository.localPath.replace(/\\/g, "/")}`, import.meta.url), { recursive: true });

    try {
      if (!existsSync(new URL(`../${repository.localPath.replace(/\\/g, "/")}/.git`, import.meta.url))) {
        await runGit(["clone", "--depth", "1", withGitHubToken(repository.cloneUrl, token), repository.localPath]);
      }
      repository.status = "cloned";
      await runGit(["checkout", "-B", repository.branchName], repository.localPath);
      repository.status = "branch-ready";
      job.logs.unshift(`[git] ${repository.repo} ready on ${repository.branchName}`);
    } catch (error) {
      repository.status = "failed";
      repository.lastError = error instanceof Error ? redactToken(error.message, token) : "Git command failed";
      job.status = "failed";
      job.currentAction = `Clone failed for ${repository.repo}`;
      job.logs.unshift(`[git] ${repository.repo} failed: ${repository.lastError}`);
      state.logs.unshift(`[git] ${repository.repo} failed: ${repository.lastError}`);
      job.updatedAt = new Date().toISOString();
      throw error;
    }
  }

  job.status = "branch-ready";
  job.currentAction = "Repository branches ready";
  job.updatedAt = new Date().toISOString();
}

async function startJobRepositories(job: JobRunState) {
  job.status = "running";
  job.currentAction = "Installing dependencies";
  job.updatedAt = new Date().toISOString();

  for (const repository of job.plan.repositories) {
    repository.status = "installing";
    job.logs.unshift(`[exec.md] ${repository.id} install: ${repository.installCommand}`);
    state.logs.unshift(`[exec.md] ${repository.id} install: ${repository.installCommand}`);
    const install = await runShellCommand(repository.installCommand, repository.localPath);
    if (install.exitCode !== 0) {
      repository.status = "failed";
      repository.lastError = install.output || `${repository.installCommand} failed`;
      job.status = "failed";
      job.currentAction = `Install failed for ${repository.id}`;
      job.logs.unshift(`[exec.md] ${repository.id} install failed: ${repository.lastError}`);
      throw new Error(repository.lastError);
    }

    repository.status = "starting";
    job.currentAction = `Starting ${repository.id}`;
    job.logs.unshift(`[exec.md] ${repository.id} dev: ${repository.devCommand}`);
    state.logs.unshift(`[exec.md] ${repository.id} dev: ${repository.devCommand}`);
    const child = spawnShellProcess(repository.devCommand, repository.localPath);
    repository.devProcessId = child.pid;
    jobDevProcesses.set(`${job.id}:${repository.id}`, child);
  }

  job.currentAction = "Waiting for health checks";
  for (const repository of job.plan.repositories) {
    await waitForHealth(repository.healthUrl, 45_000);
    repository.status = "healthy";
    job.logs.unshift(`[health] ${repository.id} healthy at ${repository.healthUrl}`);
    state.logs.unshift(`[health] ${repository.id} healthy at ${repository.healthUrl}`);
  }

  job.status = "healthy";
  job.currentAction = "Localhost preview ready";
  job.updatedAt = new Date().toISOString();
}

async function runGit(args: string[], cwd = ".") {
  const result = await runCommand("git", args, cwd);
  if (result.exitCode !== 0) {
    throw new Error(result.output || `git ${args[0]} failed`);
  }
  return result.output;
}

function runShellCommand(command: string, cwd: string) {
  return runCommand(command, [], cwd, true);
}

function spawnShellProcess(command: string, cwd: string) {
  const child = spawn(command, [], {
    cwd,
    shell: true,
    windowsHide: true,
    env: process.env,
  });
  child.stdout.on("data", (chunk) => {
    state.logs.unshift(`[process] ${String(chunk).trim()}`);
  });
  child.stderr.on("data", (chunk) => {
    state.logs.unshift(`[process] ${String(chunk).trim()}`);
  });
  return child;
}

function runCommand(command: string, args: string[], cwd: string): Promise<{ exitCode: number; output: string }>;
function runCommand(command: string, args: string[], cwd: string, shell: boolean): Promise<{ exitCode: number; output: string }>;
function runCommand(command: string, args: string[], cwd: string, shell = false) {
  return new Promise<{ exitCode: number; output: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell,
      windowsHide: true,
      env: process.env,
    });
    const output: string[] = [];

    child.stdout.on("data", (chunk) => output.push(String(chunk)));
    child.stderr.on("data", (chunk) => output.push(String(chunk)));
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        output: output.join("").trim(),
      });
    });
  });
}

async function waitForHealth(url: string, timeoutMs: number) {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = `${url} returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "health request failed";
    }
    await delay(1_000);
  }
  throw new Error(`Health check timed out for ${url}: ${lastError}`);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopJobProcesses() {
  for (const [key, child] of jobDevProcesses) {
    if (!child.killed) {
      child.kill();
      state.logs.unshift(`[process] stopped ${key}`);
    }
  }
  jobDevProcesses.clear();
}

function findJob(jobId: string) {
  return state.jobs.find((job) => job.id === jobId);
}

async function applyJobChange(job: JobRunState, request: MvpState["requests"][number], feedback: string) {
  const repository = pickWritableRepository(job);
  if (!repository) {
    throw new Error("No cloned repository is ready for changes.");
  }

  job.status = "running";
  job.currentAction = feedback.trim() ? "Applying requested changes" : "Applying initial change";
  job.updatedAt = new Date().toISOString();
  const changePath = `${repository.localPath}/CORVIN_CHANGE_REQUEST.md`;
  const content = renderJobChangeFile(job, request, feedback);
  mkdirSync(dirname(changePath), { recursive: true });
  writeFileSync(changePath, content, "utf8");
  job.logs.unshift(`[change] wrote ${changePath}`);
  state.logs.unshift(`[change] wrote ${changePath}`);
  await runGit(["add", "-N", "."], repository.localPath);
  await refreshJobDiff(job);
  job.status = "waiting-for-approval";
  job.currentAction = "Waiting for approval";
  job.updatedAt = new Date().toISOString();
}

function pickWritableRepository(job: JobRunState) {
  return (
    job.plan.repositories.find((repository) => ["healthy", "branch-ready", "starting"].includes(repository.status)) ??
    job.plan.repositories[0]
  );
}

function renderJobChangeFile(job: JobRunState, request: MvpState["requests"][number], feedback: string) {
  return [
    "# Corvin Change Request",
    "",
    `Job: ${job.id}`,
    `Request: ${request.id}`,
    `Branch: ${job.plan.branchName}`,
    "",
    "## Request",
    request.body.trim(),
    "",
    feedback.trim() ? "## Review Feedback" : "",
    feedback.trim(),
    "",
    "## Next Implementation Step",
    "Replace this artifact with product-code edits once the repository-specific code agent selects the correct files.",
    "",
  ].filter((line, index, lines) => line || lines[index - 1]).join("\n");
}

async function refreshJobDiff(job: JobRunState) {
  const diffs: string[] = [];
  const changedFiles: JobChangedFile[] = [];
  for (const repository of job.plan.repositories) {
    const nameStatus = await runGit(["diff", "--name-status"], repository.localPath);
    if (!nameStatus.trim()) {
      continue;
    }
    for (const line of nameStatus.split(/\r?\n/).filter(Boolean)) {
      const [statusCode, filePath] = line.split(/\s+/, 2);
      changedFiles.push({
        repositoryId: repository.id,
        path: filePath,
        status: mapGitStatus(statusCode),
      });
    }
    const diff = await runGit(["diff", "--", "."], repository.localPath);
    if (diff.trim()) {
      diffs.push(`diff --corvin-repository ${repository.id}\n${diff}`);
    }
  }
  job.changedFiles = changedFiles;
  job.diff = diffs.join("\n");
  job.logs.unshift(`[diff] captured ${changedFiles.length} changed files`);
}

function mapGitStatus(statusCode: string) {
  if (statusCode.startsWith("A")) return "added";
  if (statusCode.startsWith("M")) return "modified";
  if (statusCode.startsWith("D")) return "deleted";
  if (statusCode.startsWith("R")) return "renamed";
  return "unknown";
}

async function createPullRequestsForJob(job: JobRunState, token: string) {
  await refreshJobDiff(job);
  if (job.changedFiles.length === 0) {
    throw new Error("No changed files are available to push.");
  }

  const changedRepoIds = new Set(job.changedFiles.map((file) => file.repositoryId));
  for (const repository of job.plan.repositories.filter((item) => changedRepoIds.has(item.id))) {
    await runGit(["add", "-A"], repository.localPath);
    const staged = await runGit(["diff", "--cached", "--name-only"], repository.localPath);
    if (!staged.trim()) {
      continue;
    }
    await runGit(
      [
        "-c",
        "user.name=Corvin",
        "-c",
        "user.email=corvin@local",
        "commit",
        "-m",
        `Corvin job ${job.id}`,
      ],
      repository.localPath,
    );
    await runGit(["push", withGitHubToken(repository.cloneUrl, token), `HEAD:${repository.branchName}`], repository.localPath);
    const pullRequest = await createGitHubPullRequest(repository.repo, token, {
      title: `Corvin job ${job.id}`,
      head: repository.branchName,
      base: "main",
      body: renderPullRequestBody(job, repository.id),
    });
    job.pullRequests.push({
      repositoryId: repository.id,
      repo: repository.repo,
      url: pullRequest.html_url,
      number: pullRequest.number,
      status: "open",
    });
    job.logs.unshift(`[pr] opened ${repository.repo}#${pullRequest.number}`);
    state.logs.unshift(`[pr] opened ${pullRequest.html_url}`);
  }

  job.status = "pr-open";
  job.currentAction = "Pull request open";
  job.updatedAt = new Date().toISOString();
}

async function createGitHubPullRequest(
  repo: string,
  token: string,
  input: { title: string; head: string; base: string; body: string },
) {
  const normalized = repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  const response = await fetch(`https://api.github.com/repos/${normalized}/pulls`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "corvin-local-agent",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json()) as { html_url?: string; number?: number; message?: string };
  if (!response.ok || !payload.html_url || !payload.number) {
    throw new Error(payload.message ?? `GitHub pull request creation failed with ${response.status}`);
  }
  return {
    html_url: payload.html_url,
    number: payload.number,
  };
}

async function mergePullRequestsForJob(job: JobRunState, token: string) {
  for (const pullRequest of job.pullRequests.filter((item) => item.status === "open")) {
    await mergeGitHubPullRequest(pullRequest.repo, pullRequest.number, token);
    pullRequest.status = "merged";
    job.logs.unshift(`[merge] merged ${pullRequest.repo}#${pullRequest.number}`);
    state.logs.unshift(`[merge] merged ${pullRequest.url}`);
  }

  job.status = "merged";
  job.currentAction = "Merged";
  job.finalUrl = job.plan.repositories[0]?.healthUrl;
  job.updatedAt = new Date().toISOString();
}

async function mergeGitHubPullRequest(repo: string, number: number, token: string) {
  const normalized = repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  const response = await fetch(`https://api.github.com/repos/${normalized}/pulls/${number}/merge`, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "corvin-local-agent",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      merge_method: "merge",
      commit_title: `Merge Corvin job ${number}`,
    }),
  });
  const payload = (await response.json()) as { merged?: boolean; message?: string };
  if (!response.ok || !payload.merged) {
    throw new Error(payload.message ?? `GitHub pull request merge failed with ${response.status}`);
  }
}

function renderPullRequestBody(job: JobRunState, repositoryId: string) {
  const files = job.changedFiles
    .filter((file) => file.repositoryId === repositoryId)
    .map((file) => `- ${file.status}: ${file.path}`)
    .join("\n");
  return [
    `Corvin job: ${job.id}`,
    "",
    "## Changed files",
    files || "- No files captured",
    "",
    "## Review",
    "Review the diff, request changes in Corvin if needed, then merge after approval.",
  ].join("\n");
}

function withGitHubToken(cloneUrl: string, token: string) {
  const url = new URL(cloneUrl);
  url.username = "x-access-token";
  url.password = token;
  return url.toString();
}

function redactToken(value: string, token: string) {
  return value.replaceAll(token, "[redacted]");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function captureWhatsAppIntake(intake: WhatsAppIntake) {
  if (!canCapturePMRequest(state.workspace, state.validation, state.exec)) {
    state.logs.unshift("[whatsapp] request blocked until exec.md is valid");
    throw new Error("Create and validate exec.md before a PM request can run locally.");
  }

  const requestId = `wa_${intake.messageId.replace(/[^\w-]/g, "_")}`;
  const existing = state.requests.find((request) => request.id === requestId);
  if (existing) {
    state.logs.unshift(`[whatsapp] ignored duplicate message ${requestId}`);
    return existing;
  }

  const pmRequest = {
    ...createRequestFromWhatsAppMessage(intake, state.workspace),
    id: requestId,
    createdAt: new Date().toISOString(),
  };

  state.requests.unshift(pmRequest);
  upsertIntegration("whatsapp", "connected", "WhatsApp thread connected");
  updateStep("whatsapp-entry", "succeeded");
  updateStep("request", "succeeded");
  updateStep("handoff", "succeeded");
  updateFinalEntryPointStep();
  state.logs.unshift(`[whatsapp] captured request ${pmRequest.id} from ${intake.from}`);
  if (intake.chatId) {
    await sendUserSideWhatsAppResponse(intake.chatId, pmRequest.title);
  }
  return pmRequest;
}

async function sendUserSideWhatsAppResponse(chatId: string, title: string) {
  const responseText = [
    `Corvin captured: ${title}`,
    "I am preparing the workspace context and will use this thread for updates.",
  ].join("\n");

  try {
    await sendWhatsAppMessage(chatId, responseText);
    state.logs.unshift("[whatsapp] sent user-side response in linked chat");
  } catch (error) {
    state.logs.unshift(
      `[whatsapp] response send failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

function isIntegrationConnected(id: "whatsapp" | "github" | "docker") {
  return state.integrations.some((integration) => integration.id === id && integration.status === "connected");
}

function syncWhatsAppConnection(connection: { connected: boolean; status: string; detail: string }) {
  if (connection.connected) {
    upsertIntegration("whatsapp", "connected", connection.detail);
    updateStep("whatsapp-entry", "succeeded");
    updateFinalEntryPointStep();
    return;
  }
  if (connection.status === "qr" || connection.status === "connecting") {
    upsertIntegration("whatsapp", "in-progress", connection.detail);
  }
}

async function buildWhatsAppConnectResponse(
  connection: { connected: boolean; status: "idle" | "connecting" | "qr" | "connected" | "failed"; qr?: string; detail: string },
  origin: string,
) {
  return buildWhatsAppConnect({
    connected: connection.connected,
    status: connection.status,
    origin,
    qrImageUrl: connection.qr
      ? await QRCode.toDataURL(connection.qr, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 360,
        })
      : undefined,
    detail: connection.detail,
  });
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
