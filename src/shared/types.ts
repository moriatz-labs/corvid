export type ServiceStatus = "idle" | "starting" | "healthy" | "failed";

export type IntegrationStatus = "connected" | "ready" | "in-progress" | "needs-config" | "failed";

export type RepositoryConfig = {
  id: string;
  label: string;
  sourceRef: string;
  defaultBranch: string;
  localPath: string;
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
  repositories: RepositoryConfig[];
  services: ServiceConfig[];
  environment: {
    required: string[];
  };
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
  messageId: string;
  text: string;
  workspaceHint?: string;
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
  pm: PMProfile;
  integrations: Integration[];
  validation: ValidationResult;
  compose: string;
  steps: BlueprintStep[];
  logs: string[];
  requests: PMRequest[];
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
