import {
  createDeploymentDemoState,
  createEmptyExecSetup,
  createExecDraftFromBlueprint,
  createOpenAIChangePlan,
  createOpenAIRoutingPlan,
  createRequestFromWhatsAppMessage,
  generateComposeFile,
  validateBlueprint,
} from "./mvp";
import type { BlueprintStep, Integration, MvpState, WorkspaceBlueprint } from "./types";

export const demoBlueprint: WorkspaceBlueprint = {
  id: "acme-checkout",
  name: "Acme Checkout Workspace",
  setupStatus: "ready",
  pmRunCommand: "npx corvin run acme-checkout",
  executionScriptSummary:
    "Engineering supplied the execution script; Corvin agents resolve repo sync, branch alignment, env checks, startup order, and health checks.",
  engineeringIntake: [
    {
      id: "repository-map",
      label: "Repository names and ownership",
      detail: "Frontend, API, and worker repositories are listed with owners and source refs.",
      status: "provided",
    },
    {
      id: "repository-purpose",
      label: "What each repository does",
      detail: "Each repo has a short responsibility statement so agents know where changes belong.",
      status: "provided",
    },
    {
      id: "startup-functions",
      label: "Startup functions and commands",
      detail: "Install, dev, seed, worker, migration, and health-check commands are allowlisted.",
      status: "provided",
    },
    {
      id: "branch-contract",
      label: "Cross-repo branch contract",
      detail: "Branch coupling rules explain when frontend, API, and worker branches must match.",
      status: "provided",
    },
    {
      id: "service-connections",
      label: "How services connect coherently",
      detail: "Ports, env vars, databases, queues, webhooks, and API base URLs are declared.",
      status: "provided",
    },
    {
      id: "missing-edge-cases",
      label: "Missing pieces and edge cases",
      detail: "Known setup gaps, optional services, seed data, and laptop-specific risks are recorded.",
      status: "provided",
    },
  ],
  repositories: [
    {
      id: "web",
      label: "Web app",
      sourceRef: "synced-repo://acme/web",
      defaultBranch: "main",
      localPath: "repos/web",
      purpose: "Customer checkout and PM-visible product surface.",
      startupCommand: "pnpm install && pnpm dev --host 0.0.0.0",
      branchCoupling: "Use the same feature branch as api when checkout contract changes.",
    },
    {
      id: "api",
      label: "API",
      sourceRef: "synced-repo://acme/api",
      defaultBranch: "main",
      localPath: "repos/api",
      purpose: "Checkout pricing, plan metadata, and payment session API.",
      startupCommand: "pnpm install && pnpm dev",
      branchCoupling: "Must match web branch when response schema changes.",
    },
    {
      id: "worker",
      label: "Worker",
      sourceRef: "synced-repo://acme/worker",
      defaultBranch: "main",
      localPath: "repos/worker",
      purpose: "Async receipt, webhook, and analytics processing.",
      startupCommand: "pnpm install && pnpm worker:dev",
      branchCoupling: "Can stay on main unless checkout events change.",
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
    detail: "Set GitHub App client ID and secret to connect",
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
    label: "Connect GitHub App",
    kind: "deterministic",
    status: "pending",
    summary: "GitHub App web authorization is available when app credentials are set",
  },
  {
    id: "blueprint",
    label: "Load engineering execution packet",
    kind: "deterministic",
    status: "succeeded",
    summary: "Repository map, startup functions, service contracts, and edge cases loaded",
  },
  {
    id: "validate",
    label: "Validate agent-run setup",
    kind: "deterministic",
    status: "succeeded",
    summary: "Repos, env, Docker, branch coupling, and ports checked",
  },
  {
    id: "compose",
    label: "Generate Compose from packet",
    kind: "deterministic",
    status: "succeeded",
    summary: "Compose preview generated from engineering-authored execution script",
  },
  {
    id: "run",
    label: "Run PM one-line command",
    kind: "deterministic",
    status: "running",
    summary: "PM runs only npx corvin run acme-checkout or clicks the equivalent UI action",
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
    summary: "Requests are blocked unless the engineering execution packet is ready",
  },
  {
    id: "handoff",
    label: "Prepare agent handoff context",
    kind: "agent",
    status: "pending",
    summary: "Agents attach repo refs, branch rules, startup order, and preview context",
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
    exec: createEmptyExecSetup(createExecDraftFromBlueprint(demoBlueprint)),
    pm: {
      name: "Maya Rao",
      role: "Product Manager",
      team: "Acme Growth",
      avatarInitials: "MR",
      currentIntent:
        "Ask for a product change after engineering has supplied the execution blueprint. Maya only runs the one-line command and reviews visible previews.",
    },
    integrations: initialIntegrations,
    validation,
    compose: generateComposeFile(demoBlueprint),
    steps: initialSteps,
    logs: [
      "[runner] safe mode enabled",
      "[engineering] execution packet complete for acme-checkout",
      "[agents] resolved repositories, startup order, and service contracts",
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
    jobs: [],
    running: false,
    openAI: {
      provider: "OpenAI",
      model: "gpt-5.5",
      configured: false,
      routing: createOpenAIRoutingPlan(),
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
