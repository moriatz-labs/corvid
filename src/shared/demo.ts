import {
  createDeploymentDemoState,
  createOpenAIChangePlan,
  createRequestFromWhatsAppMessage,
  generateComposeFile,
  validateBlueprint,
} from "./mvp";
import type { BlueprintStep, Integration, MvpState, WorkspaceBlueprint } from "./types";

export const demoBlueprint: WorkspaceBlueprint = {
  id: "acme-checkout",
  name: "Acme Checkout Workspace",
  repositories: [
    {
      id: "web",
      label: "Web app",
      sourceRef: "synced-repo://acme/web",
      defaultBranch: "main",
      localPath: "repos/web",
    },
    {
      id: "api",
      label: "API",
      sourceRef: "synced-repo://acme/api",
      defaultBranch: "main",
      localPath: "repos/api",
    },
    {
      id: "worker",
      label: "Worker",
      sourceRef: "synced-repo://acme/worker",
      defaultBranch: "main",
      localPath: "repos/worker",
    },
  ],
  services: [
    {
      id: "web",
      label: "Web app",
      repositoryId: "web",
      port: 5173,
      healthUrl: "http://localhost:5173",
      status: "healthy",
    },
    {
      id: "api",
      label: "API",
      repositoryId: "api",
      port: 3000,
      healthUrl: "http://localhost:3000/health",
      status: "healthy",
    },
    {
      id: "worker",
      label: "Worker",
      repositoryId: "worker",
      port: 4318,
      healthUrl: "http://localhost:4318/health",
      status: "idle",
    },
  ],
  environment: {
    required: ["DATABASE_URL", "API_BASE_URL", "WHATSAPP_VERIFY_TOKEN"],
  },
};

export const initialIntegrations: Integration[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    status: "needs-config",
    detail: "Webhook endpoint ready at /webhooks/whatsapp",
  },
  {
    id: "github",
    label: "GitHub",
    status: "needs-config",
    detail: "OAuth URL can be generated when GITHUB_CLIENT_ID is set",
  },
  {
    id: "docker",
    label: "Docker",
    status: "ready",
    detail: "Local runner is in demo-safe mode",
  },
];

export const initialSteps: BlueprintStep[] = [
  {
    id: "whatsapp-entry",
    label: "Connect WhatsApp entry point",
    kind: "deterministic",
    status: "pending",
    summary: "Meta-compatible webhook verification is exposed at /webhooks/whatsapp",
  },
  {
    id: "github-sync",
    label: "Connect GitHub repository sync",
    kind: "deterministic",
    status: "pending",
    summary: "OAuth URL generation and demo repository sync are available",
  },
  {
    id: "blueprint",
    label: "Load workspace blueprint",
    kind: "deterministic",
    status: "succeeded",
    summary: "Acme Checkout blueprint loaded",
  },
  {
    id: "validate",
    label: "Validate setup",
    kind: "deterministic",
    status: "succeeded",
    summary: "Repos, env, Docker, and ports checked",
  },
  {
    id: "compose",
    label: "Generate Compose file",
    kind: "deterministic",
    status: "succeeded",
    summary: "Compose preview generated from blueprint",
  },
  {
    id: "run",
    label: "Run workspace",
    kind: "deterministic",
    status: "running",
    summary: "Demo runner simulates the safe Docker command set",
  },
  {
    id: "status",
    label: "Show service status",
    kind: "deterministic",
    status: "pending",
    summary: "Health checks stream into the dashboard",
  },
  {
    id: "request",
    label: "Capture PM request",
    kind: "agent",
    status: "pending",
    summary: "Web and WhatsApp requests attach workspace context",
  },
  {
    id: "handoff",
    label: "Prepare handoff context",
    kind: "agent",
    status: "pending",
    summary: "Request captures workspace, repo refs, and preview context",
  },
  {
    id: "whatsapp-github-ready",
    label: "WhatsApp request has GitHub context",
    kind: "deterministic",
    status: "pending",
    summary: "A WhatsApp request can arrive with repository context attached",
  },
];

export function createInitialState(): MvpState {
  const validation = validateBlueprint(demoBlueprint, {
    dockerReady: true,
    syncedRepositoryIds: ["web", "api", "worker"],
    env: {
      DATABASE_URL: "postgres://postgres:corvin@localhost:5432/postgres",
      API_BASE_URL: "http://localhost:3000",
      WHATSAPP_VERIFY_TOKEN: "local-dev",
    },
    occupiedPorts: [],
  });

  return {
    workspace: demoBlueprint,
    pm: {
      name: "Maya Rao",
      role: "Product Manager",
      team: "Acme Growth",
      avatarInitials: "MR",
      currentIntent: "Change checkout copy, verify it on staging or locally, then push it to production.",
    },
    integrations: initialIntegrations,
    validation,
    compose: generateComposeFile(demoBlueprint),
    steps: initialSteps,
    logs: [
      "[runner] safe mode enabled",
      "[blueprint] loaded acme-checkout workspace",
      "[compose] generated corvin-acme-checkout services",
    ],
    requests: [
      createRequestFromWhatsAppMessage(
        {
          from: "15551234567",
          messageId: "wamid.seed",
          text: "Corvin acme-checkout: change checkout headline",
          workspaceHint: "acme-checkout",
        },
        demoBlueprint,
      ),
    ],
    running: false,
    openAI: {
      provider: "OpenAI",
      model: "gpt-5.5",
      configured: false,
      lastPlan: createOpenAIChangePlan({
        requestBody: "Change the checkout headline to reduce confusion",
        pmName: "Maya Rao",
        workspaceName: demoBlueprint.name,
        openAIConfigured: false,
      }),
    },
    deployment: createDeploymentDemoState(),
  };
}
