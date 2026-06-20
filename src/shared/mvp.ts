import YAML from "yaml";
import type {
  BlueprintCheck,
  ExecDocument,
  ExecEnvVar,
  ExecParseResult,
  ExecRunPlanResult,
  ExecSetupState,
  ExecValidationIssue,
  ExecValidationResult,
  GithubOAuthConfig,
  JobFileEditPlan,
  JobWorkspacePlan,
  PMRequest,
  DeploymentDemoState,
  OpenAIChangePlan,
  OpenAIRoute,
  ValidationResult,
  WhatsAppConnect,
  WhatsAppIntake,
  WorkspaceBlueprint,
} from "./types.js";

type ValidationInput = {
  dockerReady: boolean;
  syncedRepositoryIds: string[];
  env: Record<string, string | undefined>;
  occupiedPorts: number[];
};

const emptyExecValidation: ExecValidationResult = {
  ready: false,
  errors: [
    {
      id: "exec-missing",
      label: "exec.md is missing",
      detail: "Create exec.md before Corvin can package the local run workflow.",
      severity: "error",
    },
  ],
  warnings: [],
};

export function createEmptyExecSetup(markdown = "") {
  return {
    exists: false,
    markdown,
    validation: emptyExecValidation,
  };
}

export function createExecDraftFromBlueprint(blueprint: WorkspaceBlueprint): string {
  return renderExecMarkdown({
    purpose: `Run ${blueprint.name} locally for PM review.`,
    repositories: blueprint.repositories.map((repository) => {
      const service = blueprint.services.find((item) => item.repositoryId === repository.id);
      const startupCommand = repository.startupCommand?.trim() || "";
      const commands = splitStartupCommand(startupCommand);
      return {
        id: repository.id,
        repo: repository.sourceRef.replace(/^synced-repo:\/\//, ""),
        role: repository.purpose ?? repository.label,
        install: commands.install,
        dev: commands.dev,
        health: service?.healthUrl ?? "",
      };
    }),
    environment: {
      global: blueprint.environment.required.map((key) => ({
        name: key,
        required: true,
        description: `Required to run ${blueprint.name} locally.`,
      })),
      perRepo: {},
    },
    localRunNotes: blueprint.executionScriptSummary ?? "Add setup caveats, seed data, known local failures, and port notes here.",
  });
}

export function renderExecMarkdown(document: ExecDocument): string {
  const repositoriesYaml = YAML.stringify({ repositories: document.repositories }).trimEnd();
  const environmentYaml = YAML.stringify(document.environment).trimEnd();

  return [
    "# exec.md",
    "",
    "## Purpose",
    document.purpose.trim(),
    "",
    "## Repositories",
    "```yaml",
    repositoriesYaml,
    "```",
    "",
    "## Environment",
    "```yaml",
    environmentYaml,
    "```",
    "",
    "## Local Run Notes",
    document.localRunNotes.trim(),
    "",
  ].join("\n");
}

export function parseExecMarkdown(markdown: string): ExecParseResult {
  const purpose = extractMarkdownSection(markdown, "Purpose").trim();
  const localRunNotes = extractMarkdownSection(markdown, "Local Run Notes").trim();
  const repositoryBlock = extractFencedYaml(markdown, "Repositories");
  const environmentBlock = extractFencedYaml(markdown, "Environment");
  const errors: ExecValidationIssue[] = [];

  if (!repositoryBlock) {
    errors.push(createExecIssue("exec-repositories-yaml", "Repository YAML is missing", "Add a fenced YAML block under Repositories."));
  }
  if (!environmentBlock) {
    errors.push(createExecIssue("exec-environment-yaml", "Environment YAML is missing", "Add a fenced YAML block under Environment."));
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  try {
    const repositoryYaml = YAML.parse(repositoryBlock ?? "") as { repositories?: unknown };
    const environmentYaml = YAML.parse(environmentBlock ?? "") as { global?: unknown; perRepo?: unknown };
    const repositories = Array.isArray(repositoryYaml.repositories) ? repositoryYaml.repositories.map(coerceExecRepository) : [];
    const environment = {
      global: Array.isArray(environmentYaml.global) ? environmentYaml.global.map(coerceExecEnvVar) : [],
      perRepo: coercePerRepoEnv(environmentYaml.perRepo),
    };

    return {
      ok: true,
      document: {
        purpose,
        repositories,
        environment,
        localRunNotes,
      },
      errors: [],
    };
  } catch (error) {
    return {
      ok: false,
      errors: [
        createExecIssue(
          "exec-yaml-parse",
          "exec.md YAML could not be parsed",
          error instanceof Error ? error.message : "The structured YAML blocks are invalid.",
        ),
      ],
    };
  }
}

export function validateExecDocument(
  document: ExecDocument,
  env: Record<string, string | undefined> = {},
): ExecValidationResult {
  const errors: ExecValidationIssue[] = [];
  const warnings: ExecValidationIssue[] = [];
  const repoIds = new Set<string>();

  if (document.repositories.length === 0) {
    errors.push(createExecIssue("exec-repositories-empty", "No repositories selected", "Select at least one GitHub-linked repository."));
  }

  for (const repository of document.repositories) {
    if (!repository.id.trim()) {
      errors.push(createExecIssue("repo-id", "Repository id is missing", "Every selected repository needs an id."));
    }
    if (repoIds.has(repository.id)) {
      errors.push(createExecIssue(`repo-${repository.id}-duplicate`, "Repository id is duplicated", `${repository.id} appears more than once.`));
    }
    repoIds.add(repository.id);
    if (!repository.repo.trim()) {
      errors.push(createExecIssue(`repo-${repository.id}-repo`, `${repository.id} GitHub repo is missing`, "Pick the repository from the linked GitHub repo dropdown."));
    }
    if (!repository.install.trim()) {
      errors.push(createExecIssue(`repo-${repository.id}-install`, `${repository.id} install command is missing`, "Add the command that installs dependencies."));
    }
    if (!repository.dev.trim()) {
      errors.push(createExecIssue(`repo-${repository.id}-dev`, `${repository.id} dev command is missing`, "Add the command that starts the local service."));
    }
    if (!repository.health.trim()) {
      errors.push(createExecIssue(`repo-${repository.id}-health`, `${repository.id} health check is missing`, "Add a local URL Corvin can check."));
    } else if (!isValidUrl(repository.health)) {
      errors.push(createExecIssue(`repo-${repository.id}-health-url`, `${repository.id} health URL is invalid`, `${repository.health} is not a valid URL.`));
    }
  }

  for (const variable of collectExecEnvVars(document)) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(variable.name)) {
      errors.push(createExecIssue(`env-${variable.name}-name`, `${variable.name} is not a valid env name`, "Use uppercase letters, numbers, and underscores."));
    }
    if (variable.required && !env[variable.name]?.trim()) {
      errors.push(createExecIssue(`env-${variable.name}-value`, `${variable.name} value is missing`, "Required env values must be configured before local run."));
    }
    if (!variable.description.trim()) {
      warnings.push({
        ...createExecIssue(`env-${variable.name}-description`, `${variable.name} description is weak`, "Add a short note so teams know where this value comes from."),
        severity: "warning",
      });
    }
  }

  if (!document.purpose.trim()) {
    warnings.push({
      ...createExecIssue("exec-purpose", "Purpose is empty", "Add one sentence describing what this local workspace runs."),
      severity: "warning",
    });
  }

  return {
    ready: errors.length === 0,
    errors,
    warnings,
  };
}

export function buildExecRunPlan(document: ExecDocument, env: Record<string, string | undefined>): ExecRunPlanResult {
  const validation = validateExecDocument(document, env);
  if (!validation.ready) {
    return {
      ready: false,
      errors: validation.errors,
    };
  }

  return {
    ready: true,
    errors: [],
    plan: {
      summary: `Run ${document.repositories.length} repositories from exec.md.`,
      commands: document.repositories.map((repository) => `${repository.id}: ${repository.install} && ${repository.dev}`),
      healthChecks: document.repositories.map((repository) => `${repository.id}: ${repository.health}`),
      requiredEnv: collectExecEnvVars(document)
        .filter((variable) => variable.required)
        .map((variable) => variable.name),
    },
  };
}

export function buildJobWorkspacePlan(input: {
  request: PMRequest;
  document: ExecDocument;
  workspaceRoot: string;
  createdAt?: string;
}): JobWorkspacePlan {
  const jobId = `job_${sanitizeIdentifier(input.request.id)}`;
  const branchName = `corvin/${sanitizeIdentifier(input.request.id)}`;
  const rootPath = joinPath(input.workspaceRoot, jobId);

  return {
    id: jobId,
    requestId: input.request.id,
    rootPath,
    branchName,
    createdAt: input.createdAt ?? new Date().toISOString(),
    repositories: input.document.repositories.map((repository) => ({
      id: repository.id,
      repo: repository.repo,
      cloneUrl: normalizeGitHubCloneUrl(repository.repo),
      localPath: joinPath(rootPath, "repos", repository.id),
      branchName,
      installCommand: repository.install,
      devCommand: repository.dev,
      healthUrl: repository.health,
      status: "planned",
    })),
  };
}

export function validateBlueprint(
  blueprint: WorkspaceBlueprint,
  input: ValidationInput,
): ValidationResult {
  const checks: BlueprintCheck[] = [
    {
      id: "engineering-packet",
      label: "Engineering execution packet",
      status: blueprint.setupStatus === "ready" ? "passed" : "failed",
      detail:
        blueprint.setupStatus === "ready"
          ? "Repository map, startup commands, branch rules, and edge cases are provided"
          : "Ask engineering to complete the setup packet before a PM request can run",
    },
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

export function canCapturePMRequest(
  blueprint: WorkspaceBlueprint,
  validation: ValidationResult,
  exec?: ExecSetupState,
): boolean {
  return blueprint.setupStatus === "ready" && validation.ready && (exec ? exec.exists && exec.validation.ready : true);
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

export function buildWhatsAppConnect(input: {
  connected: boolean;
  status: WhatsAppConnect["status"];
  origin: string;
  qrImageUrl?: string;
  qrUpdatedAt?: string;
  detail?: string;
}): WhatsAppConnect {
  return {
    connected: input.connected,
    status: input.status,
    qrImageUrl: input.qrImageUrl,
    qrUpdatedAt: input.qrUpdatedAt,
    webhookUrl: `${input.origin.replace(/\/$/, "")}/webhooks/whatsapp`,
    detail: input.detail ?? (input.connected ? "WhatsApp is connected" : "Waiting for WhatsApp QR"),
  };
}

export function createRequestFromWhatsAppMessage(
  intake: WhatsAppIntake,
  workspace: WorkspaceBlueprint,
): PMRequest {
  const body = intake.text
    .replace(/^corvin\s+[\w-]+:\s*/i, "")
    .replace(/^corvin:?\s*/i, "")
    .trim();
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

export function upsertPMRequest(requests: PMRequest[], request: PMRequest): { requests: PMRequest[]; inserted: boolean } {
  if (requests.some((item) => item.id === request.id)) {
    return {
      requests,
      inserted: false,
    };
  }

  return {
    requests: [request, ...requests],
    inserted: true,
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

export function createJobFileEditPlan(requestBody: string): JobFileEditPlan {
  const replacementText = inferHeadline(requestBody);
  const lower = requestBody.toLowerCase();
  const targetFileHints = [
    "src/App.tsx",
    "src/App.jsx",
    "src/app/page.tsx",
    "app/page.tsx",
    "pages/index.tsx",
    "pages/index.jsx",
    "src/pages/index.tsx",
    "src/components/Home.tsx",
    "src/components/BookmarkList.tsx",
    "src/components/Onboarding.tsx",
  ];

  if (lower.includes("api") || lower.includes("bug")) {
    targetFileHints.push("src/server.ts", "src/index.ts", "server/index.ts", "api/index.ts");
  }

  return {
    targetFileHints,
    replacementText,
    fallbackFile: "CORVIN_CHANGE_REQUEST.md",
    summary: `Apply requested change with visible copy: ${replacementText}`,
  };
}

export function createOpenAIRoutingPlan(): OpenAIRoute[] {
  return [
    {
      id: "triage",
      label: "Classify PM request",
      agent: "Router agent",
      model: "gpt-5.5",
      taskClass: "routing",
      reason:
        "A strong reasoning model decides whether the request is copy-only, bug triage, product experiment, repo setup issue, or unsafe deployment.",
    },
    {
      id: "context",
      label: "Collect repository context",
      agent: "Context agent",
      model: "gpt-5.4-mini",
      taskClass: "light",
      reason:
        "Smaller OpenAI models summarize files, execution-packet fields, logs, and service metadata after the router has chosen the path.",
    },
    {
      id: "execution-plan",
      label: "Plan code or copy change",
      agent: "Execution planner",
      model: "gpt-5.5",
      taskClass: "heavy",
      reason:
        "High-reasoning planning is used when the change spans repositories, branch contracts, deployment safety, or ambiguous product behavior.",
    },
    {
      id: "mechanical-subtasks",
      label: "Run mechanical subtasks",
      agent: "Worker agents",
      model: "gpt-5.4-mini",
      taskClass: "light",
      reason:
        "Routine extraction, checklist updates, changelog drafting, and preview summaries can use lower-cost OpenAI mini models.",
    },
    {
      id: "verification",
      label: "Verify preview and deployment readiness",
      agent: "Verification agent",
      model: "gpt-5.5",
      taskClass: "verification",
      reason:
        "Promotion to production preview requires stronger reasoning over tests, screenshots, logs, and known edge cases.",
    },
  ];
}

export function createDeploymentDemoState(): DeploymentDemoState {
  return {
    local: {
      id: "local",
      label: "Local preview",
      url: "http://localhost:5175",
      status: "idle",
      headline: "Save research where product decisions happen.",
      subcopy: "Collect bookmarks, notes, tags, and customer evidence in one product workspace.",
      lastUpdatedBy: "Shelfmark baseline",
    },
    staging: {
      id: "staging",
      label: "Review preview",
      url: "https://shelfmark-navy.vercel.app",
      status: "idle",
      headline: "Save research where product decisions happen.",
      subcopy: "Collect bookmarks, notes, tags, and customer evidence in one product workspace.",
      lastUpdatedBy: "Current review build",
    },
    production: {
      id: "production",
      label: "Production app",
      url: "https://shelfmark-navy.vercel.app",
      status: "live",
      headline: "Save research where product decisions happen.",
      subcopy: "Collect bookmarks, notes, tags, and customer evidence in one product workspace.",
      lastUpdatedBy: "Current production",
    },
    auditTrail: ["Production app is live with the baseline Shelfmark copy."],
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
      `Promoted reviewed product copy to the production app.`,
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

function normalizeGitHubCloneUrl(repo: string) {
  const trimmed = repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  return `https://github.com/${trimmed}.git`;
}

function sanitizeIdentifier(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "job"
  );
}

function joinPath(...parts: string[]) {
  return parts
    .filter(Boolean)
    .map((part, index) => {
      const normalized = part.replace(/\\/g, "/");
      if (index === 0) return normalized.replace(/\/+$/g, "");
      return normalized.replace(/^\/+|\/+$/g, "");
    })
    .join("/");
}

function inferHeadline(requestBody: string): string {
  const lower = requestBody.toLowerCase();
  if (lower.includes("research") || lower.includes("evidence")) {
    return "Research evidence, saved where product decisions happen.";
  }
  if (lower.includes("headline") || lower.includes("copy")) {
    return "Product context that makes the next step obvious.";
  }
  return "A product workspace that turns requests into reviewable change.";
}

function extractMarkdownSection(markdown: string, heading: string): string {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const match = normalized.match(new RegExp(`## ${escapeRegExp(heading)}\\n([\\s\\S]*?)(?=\\n## |$)`, "i"));
  return match?.[1] ?? "";
}

function extractFencedYaml(markdown: string, heading: string): string | null {
  const section = extractMarkdownSection(markdown, heading);
  const match = section.match(/```ya?ml\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() ?? null;
}

function coerceExecRepository(value: unknown) {
  const repository = value as Record<string, unknown>;
  return {
    id: String(repository.id ?? "").trim(),
    repo: String(repository.repo ?? "").trim(),
    role: String(repository.role ?? "").trim(),
    install: String(repository.install ?? "").trim(),
    dev: String(repository.dev ?? "").trim(),
    health: String(repository.health ?? "").trim(),
  };
}

function coerceExecEnvVar(value: unknown): ExecEnvVar {
  const variable = value as Record<string, unknown>;
  return {
    name: String(variable.name ?? "").trim(),
    required: Boolean(variable.required),
    description: String(variable.description ?? "").trim(),
  };
}

function coercePerRepoEnv(value: unknown): Record<string, ExecEnvVar[]> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([repoId, variables]) => [
      repoId,
      Array.isArray(variables) ? variables.map(coerceExecEnvVar) : [],
    ]),
  );
}

function collectExecEnvVars(document: ExecDocument): ExecEnvVar[] {
  return [
    ...document.environment.global,
    ...Object.values(document.environment.perRepo).flat(),
  ];
}

function createExecIssue(id: string, label: string, detail: string): ExecValidationIssue {
  return {
    id,
    label,
    detail,
    severity: "error",
  };
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitStartupCommand(command: string): { install: string; dev: string } {
  const parts = command.split("&&").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      install: parts[0],
      dev: parts.slice(1).join(" && "),
    };
  }
  return {
    install: command,
    dev: command,
  };
}
