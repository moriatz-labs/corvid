import type {
  BlueprintCheck,
  GithubOAuthConfig,
  PMRequest,
  DeploymentDemoState,
  OpenAIChangePlan,
  ValidationResult,
  WhatsAppIntake,
  WorkspaceBlueprint,
} from "./types";

type ValidationInput = {
  dockerReady: boolean;
  syncedRepositoryIds: string[];
  env: Record<string, string | undefined>;
  occupiedPorts: number[];
};

export function validateBlueprint(
  blueprint: WorkspaceBlueprint,
  input: ValidationInput,
): ValidationResult {
  const checks: BlueprintCheck[] = [
    {
      id: "docker",
      label: "Docker runtime",
      status: input.dockerReady ? "passed" : "failed",
      detail: input.dockerReady ? "Docker is reachable" : "Docker is not reachable",
    },
  ];

  for (const repository of blueprint.repositories) {
    const synced = input.syncedRepositoryIds.includes(repository.id);
    checks.push({
      id: `repo-${repository.id}`,
      label: `${repository.label} repository`,
      status: synced ? "passed" : "failed",
      detail: synced
        ? `${repository.sourceRef} is available`
        : `${repository.sourceRef} has not been synced yet`,
    });
  }

  for (const key of blueprint.environment.required) {
    const present = Boolean(input.env[key]?.trim());
    checks.push({
      id: `env-${key}`,
      label: `${key} environment variable`,
      status: present ? "passed" : "failed",
      detail: present ? "Value is present" : "Value is missing",
    });
  }

  for (const service of blueprint.services) {
    const available = !input.occupiedPorts.includes(service.port);
    checks.push({
      id: `port-${service.id}`,
      label: `${service.label} port ${service.port}`,
      status: available ? "passed" : "failed",
      detail: available ? "Port is available" : "Port is already occupied",
    });
  }

  return {
    ready: checks.every((check) => check.status === "passed"),
    checks,
  };
}

export function generateComposeFile(blueprint: WorkspaceBlueprint): string {
  const serviceBlocks = blueprint.services
    .map((service) => {
      const repository = blueprint.repositories.find((item) => item.id === service.repositoryId);
      const context = repository?.localPath ?? ".";
      return [
        `  ${service.id}:`,
        `    build:`,
        `      context: ./${context}`,
        `    ports:`,
        `      - "${service.port}:${service.port}"`,
        `    environment:`,
        ...blueprint.environment.required.map((key) => `      - ${key}=\${${key}}`),
        `    healthcheck:`,
        `      test: ["CMD", "node", "-e", "fetch('${service.healthUrl}').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]`,
        `      interval: 10s`,
        `      timeout: 5s`,
        `      retries: 6`,
      ].join("\n");
    })
    .join("\n");

  return [
    `name: corvin-${blueprint.id}`,
    `services:`,
    serviceBlocks,
    `  postgres:`,
    `    image: postgres:16-alpine`,
    `    environment:`,
    `      - POSTGRES_PASSWORD=corvin`,
    `    ports:`,
    `      - "5432:5432"`,
    `    healthcheck:`,
    `      test: ["CMD-SHELL", "pg_isready -U postgres"]`,
    `      interval: 10s`,
    `      timeout: 5s`,
    `      retries: 6`,
  ].join("\n");
}

export function parseWhatsAppPayload(payload: unknown): WhatsAppIntake | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const root = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from?: string;
            id?: string;
            timestamp?: string;
            text?: { body?: string };
            type?: string;
          }>;
        };
      }>;
    }>;
  };

  const message = root.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const text = message?.text?.body?.trim();
  if (!message?.from || !message.id || !text) {
    return null;
  }

  const workspaceHint = extractWorkspaceHint(text);
  return {
    from: message.from,
    messageId: message.id,
    text,
    workspaceHint,
  };
}

export function createRequestFromWhatsAppMessage(
  intake: WhatsAppIntake,
  workspace: WorkspaceBlueprint,
): PMRequest {
  const body = intake.text.replace(/^corvin\s+[\w-]+:\s*/i, "").trim();
  const title = titleCase(body || intake.text);

  return {
    id: `req_${stableId(`${intake.messageId}:${intake.text}`)}`,
    title,
    body: body || intake.text,
    channel: "whatsapp",
    requester: intake.from,
    workspaceId: intake.workspaceHint || workspace.id,
    status: "captured",
    createdAt: new Date(0).toISOString(),
  };
}

export function createWebRequest(input: {
  title: string;
  body: string;
  requester: string;
  workspaceId: string;
}): PMRequest {
  return {
    id: `req_${stableId(`${input.workspaceId}:${input.requester}:${input.title}:${input.body}`)}`,
    title: input.title.trim() || "Untitled request",
    body: input.body.trim(),
    channel: "web",
    requester: input.requester.trim() || "pm@local",
    workspaceId: input.workspaceId,
    status: "captured",
    createdAt: new Date().toISOString(),
  };
}

export function buildGitHubAuthorizeUrl(config: GithubOAuthConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state: config.state,
    scope: config.scopes.join(" "),
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export function createOpenAIChangePlan(input: {
  requestBody: string;
  pmName: string;
  workspaceName: string;
  openAIConfigured: boolean;
  model?: string;
}): OpenAIChangePlan {
  const model = input.model ?? "gpt-5.5";
  const recommendedHeadline = inferHeadline(input.requestBody);

  return {
    provider: "OpenAI",
    model,
    mode: input.openAIConfigured ? "live" : "demo",
    summary: input.openAIConfigured
      ? `OpenAI generated a change plan for ${input.pmName} in ${input.workspaceName}.`
      : `OpenAI is the only configured AI provider. Set OPENAI_API_KEY to turn this demo plan into a live OpenAI Responses API call.`,
    recommendedHeadline,
    steps: [
      `Use OpenAI ${model} to summarize the PM request and suggest a safe copy change.`,
      "Apply the suggested copy to the local preview first.",
      "Deploy the visible change to staging for PM review.",
      "Promote the reviewed staging change to the production app.",
    ],
  };
}

export function createDeploymentDemoState(): DeploymentDemoState {
  return {
    local: {
      id: "local",
      label: "Local preview",
      url: "http://localhost:5173/preview/checkout",
      status: "idle",
      headline: "Checkout built for fast-growing teams.",
      subcopy: "Review your order, confirm your plan, and complete payment in one place.",
      lastUpdatedBy: "Engineering blueprint",
    },
    staging: {
      id: "staging",
      label: "Staging app",
      url: "https://staging.corvin-demo.app/checkout",
      status: "idle",
      headline: "Checkout built for fast-growing teams.",
      subcopy: "Review your order, confirm your plan, and complete payment in one place.",
      lastUpdatedBy: "Last deployed build",
    },
    production: {
      id: "production",
      label: "Production app",
      url: "https://corvin-demo.app/checkout",
      status: "live",
      headline: "Checkout built for fast-growing teams.",
      subcopy: "Review your order, confirm your plan, and complete payment in one place.",
      lastUpdatedBy: "Current production",
    },
    auditTrail: ["Production app is live with the original checkout copy."],
  };
}

export function stageRequestedChange(
  state: DeploymentDemoState,
  input: { requestId: string; requestedBy: string; newHeadline: string },
): DeploymentDemoState {
  const headline = input.newHeadline.trim();
  return {
    ...state,
    local: {
      ...state.local,
      status: "ready",
      headline,
      lastUpdatedBy: input.requestedBy,
    },
    staging: {
      ...state.staging,
      status: "ready",
      headline,
      lastUpdatedBy: input.requestedBy,
    },
    auditTrail: [
      ...state.auditTrail,
      `${input.requestedBy} staged ${input.requestId} for visible review in local and staging.`,
    ],
  };
}

export function promoteStagingToProduction(state: DeploymentDemoState): DeploymentDemoState {
  return {
    ...state,
    production: {
      ...state.production,
      status: "live",
      headline: state.staging.headline,
      subcopy: state.staging.subcopy,
      lastUpdatedBy: state.staging.lastUpdatedBy,
    },
    auditTrail: [
      ...state.auditTrail,
      `Promoted staging checkout copy to the production app.`,
    ],
  };
}

function extractWorkspaceHint(text: string): string | undefined {
  const match = text.match(/\bcorvin\s+([\w-]+)\s*:/i);
  return match?.[1];
}

function titleCase(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function stableId(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function inferHeadline(requestBody: string): string {
  const lower = requestBody.toLowerCase();
  if (lower.includes("charge") || lower.includes("confus")) {
    return "Checkout that explains every charge before you pay.";
  }
  if (lower.includes("headline") || lower.includes("copy")) {
    return "Checkout that makes the next step obvious.";
  }
  return "Checkout that helps customers finish with confidence.";
}
