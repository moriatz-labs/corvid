export type ServiceStatus = "idle" | "starting" | "healthy" | "failed";

export type IntegrationStatus = "connected" | "ready" | "in-progress" | "needs-config" | "failed";

export type RepositoryConfig = {
  id: string;
  label: string;
  sourceRef: string;
  defaultBranch: string;
  localPath: string;
  purpose?: string;
  startupCommand?: string;
  branchCoupling?: string;
};

export type ServiceConfig = {
  id: string;
  label: string;
  repositoryId: string;
  port: number;
  healthUrl: string;
  status: ServiceStatus;
};

export type WorkspaceBlueprint = {
  id: string;
  name: string;
  setupStatus?: "needs-engineering" | "ready";
  pmRunCommand?: string;
  executionScriptSummary?: string;
  engineeringIntake?: EngineeringIntakeItem[];
  repositories: RepositoryConfig[];
  services: ServiceConfig[];
  environment: {
    required: string[];
  };
};

export type ExecRepository = {
  id: string;
  repo: string;
  role: string;
  install: string;
  dev: string;
  health: string;
};

export type ExecEnvVar = {
  name: string;
  required: boolean;
  description: string;
};

export type ExecEnvironment = {
  global: ExecEnvVar[];
  perRepo: Record<string, ExecEnvVar[]>;
};

export type ExecDocument = {
  purpose: string;
  repositories: ExecRepository[];
  environment: ExecEnvironment;
  localRunNotes: string;
};

export type ExecValidationIssue = {
  id: string;
  label: string;
  detail: string;
  severity: "error" | "warning";
};

export type ExecValidationResult = {
  ready: boolean;
  errors: ExecValidationIssue[];
  warnings: ExecValidationIssue[];
};

export type ExecParseResult =
  | {
      ok: true;
      document: ExecDocument;
      errors: [];
    }
  | {
      ok: false;
      document?: undefined;
      errors: ExecValidationIssue[];
    };

export type ExecRunPlan = {
  summary: string;
  commands: string[];
  healthChecks: string[];
  requiredEnv: string[];
};

export type ExecRunPlanResult = {
  ready: boolean;
  errors: ExecValidationIssue[];
  plan?: ExecRunPlan;
};

export type ExecSetupState = {
  exists: boolean;
  markdown: string;
  validation: ExecValidationResult;
  runPlan?: ExecRunPlan;
};

export type JobRepositoryStatus =
  | "planned"
  | "cloning"
  | "cloned"
  | "branch-ready"
  | "installing"
  | "starting"
  | "healthy"
  | "failed";

export type JobRepositoryWorkspace = {
  id: string;
  repo: string;
  cloneUrl: string;
  localPath: string;
  branchName: string;
  installCommand: string;
  devCommand: string;
  healthUrl: string;
  status: JobRepositoryStatus;
  lastError?: string;
};

export type JobWorkspacePlan = {
  id: string;
  requestId: string;
  rootPath: string;
  branchName: string;
  repositories: JobRepositoryWorkspace[];
  createdAt: string;
};

export type JobRunStatus =
  | "planned"
  | "blocked"
  | "cloning"
  | "branch-ready"
  | "running"
  | "healthy"
  | "waiting-for-approval"
  | "waiting-for-changes"
  | "pr-open"
  | "merged"
  | "failed";

export type JobRunState = {
  id: string;
  requestId: string;
  status: JobRunStatus;
  currentAction: string;
  plan: JobWorkspacePlan;
  logs: string[];
  startedAt: string;
  updatedAt: string;
  pullRequestUrl?: string;
  finalUrl?: string;
};

export type EngineeringIntakeItem = {
  id: string;
  label: string;
  detail: string;
  status: "required" | "provided";
};

export type BlueprintCheck = {
  id: string;
  label: string;
  status: "passed" | "failed" | "warning";
  detail: string;
};

export type ValidationResult = {
  ready: boolean;
  checks: BlueprintCheck[];
};

export type BlueprintStep = {
  id: string;
  label: string;
  kind: "deterministic" | "agent";
  status: "pending" | "running" | "succeeded" | "failed";
  summary: string;
};

export type WhatsAppIntake = {
  from: string;
  chatId?: string;
  messageId: string;
  text: string;
  workspaceHint?: string;
};

export type WhatsAppConnect = {
  connected: boolean;
  status: "idle" | "connecting" | "qr" | "connected" | "failed";
  qrImageUrl?: string;
  qrUpdatedAt?: string;
  webhookUrl: string;
  detail: string;
};

export type PMRequest = {
  id: string;
  title: string;
  body: string;
  channel: "web" | "whatsapp";
  requester: string;
  workspaceId: string;
  status: "captured" | "ready-for-context" | "blocked";
  createdAt: string;
};

export type GithubOAuthConfig = {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
};

export type Integration = {
  id: "whatsapp" | "github" | "docker";
  label: string;
  status: IntegrationStatus;
  detail: string;
};

export type MvpState = {
  workspace: WorkspaceBlueprint;
  exec: ExecSetupState;
  pm: PMProfile;
  integrations: Integration[];
  validation: ValidationResult;
  compose: string;
  steps: BlueprintStep[];
  logs: string[];
  requests: PMRequest[];
  jobs: JobRunState[];
  running: boolean;
  openAI: OpenAIStatus;
  deployment: DeploymentDemoState;
};

export type PMProfile = {
  name: string;
  role: string;
  team: string;
  avatarInitials: string;
  currentIntent: string;
};

export type OpenAIStatus = {
  provider: "OpenAI";
  model: string;
  configured: boolean;
  lastPlan?: OpenAIChangePlan;
  routing: OpenAIRoute[];
};

export type OpenAIRoute = {
  id: string;
  label: string;
  agent: string;
  model: string;
  reason: string;
  taskClass: "routing" | "light" | "heavy" | "verification";
};

export type OpenAIChangePlan = {
  provider: "OpenAI";
  model: string;
  mode: "live" | "demo";
  summary: string;
  steps: string[];
  recommendedHeadline: string;
};

export type DeploymentStatus = "idle" | "running" | "ready" | "live";

export type AppEnvironment = {
  id: "local" | "staging" | "production";
  label: string;
  url: string;
  status: DeploymentStatus;
  headline: string;
  subcopy: string;
  lastUpdatedBy: string;
};

export type DeploymentDemoState = {
  local: AppEnvironment;
  staging: AppEnvironment;
  production: AppEnvironment;
  auditTrail: string[];
};
