import cors from "cors";
import express from "express";
import OpenAI from "openai";
import {
  buildGitHubAuthorizeUrl,
  createOpenAIChangePlan,
  createWebRequest,
  generateComposeFile,
  parseWhatsAppPayload,
  promoteStagingToProduction,
  stageRequestedChange,
  validateBlueprint,
} from "../src/shared/mvp";
import { createInitialState } from "../src/shared/demo";
import type { MvpState } from "../src/shared/types";

export const app = express();
export const state: MvpState = createInitialState();

const openAIModel = process.env.OPENAI_MODEL ?? "gpt-5.5";
const openAIClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

state.openAI = {
  ...state.openAI,
  model: openAIModel,
  configured: Boolean(openAIClient),
};

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/state", (_request, response) => {
  response.json(state);
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
  state.logs.unshift("[runner] docker compose up --build simulated in safe mode");
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
