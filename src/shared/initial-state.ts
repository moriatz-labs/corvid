import {
  createDeploymentDemoState,
  createEmptyExecSetup,
  createOpenAIChangePlan,
  createOpenAIRoutingPlan,
  generateComposeFile,
  validateBlueprint,
} from "./mvp.js";
import type { BlueprintStep, Integration, MvpState, WorkspaceBlueprint } from "./types.js";

const initialIntegrations: Integration[] = [
  {
    id: "github",
    label: "GitHub",
    status: "needs-config",
    detail: "Connect GitHub or set GITHUB_TOKEN so Corvin can create branches and pull requests.",
  },
  {
    id: "docker",
    label: "Local runner",
    status: "ready",
    detail: "Local runner is available for connected product workspaces.",
  },
  {
    id: "whatsapp",
    label: "Request intake",
    status: "ready",
    detail: "Product requests can be captured from the Corvin workbench.",
  },
];

const initialSteps: BlueprintStep[] = [
  {
    id: "github-sync",
    label: "Connect GitHub",
    kind: "deterministic",
    status: "pending",
    summary: "GitHub credentials allow Corvin to create branches and PRs.",
  },
  {
    id: "blueprint",
    label: "Select product workspace",
    kind: "deterministic",
    status: "pending",
    summary: "Choose Shelfmark or another connected product workspace.",
  },
  {
    id: "validate",
    label: "Generate run packet",
    kind: "deterministic",
    status: "pending",
    summary: "Corvin scans the workspace and generates exec.md.",
  },
  {
    id: "request",
    label: "Capture product request",
    kind: "agent",
    status: "pending",
    summary: "A PM describes the product problem, feature, or experiment.",
  },
  {
    id: "handoff",
    label: "Prepare review evidence",
    kind: "agent",
    status: "pending",
    summary: "Corvin prepares checks, screenshots, summary, and PR evidence.",
  },
];

const publicWorkspace: WorkspaceBlueprint = {
  id: "product-workspace-setup",
  name: "Connected product workspace",
  setupStatus: "needs-engineering",
  pmRunCommand: "",
  executionScriptSummary: "",
  engineeringIntake: [
    {
      id: "workspace",
      label: "Product workspace",
      detail: "Select Shelfmark or another configured product workspace.",
      status: "required",
    },
    {
      id: "review-gate",
      label: "Review gate",
      detail: "Corvin opens pull requests and never merges or deploys judge-created changes.",
      status: "provided",
    },
  ],
  repositories: [],
  services: [],
  environment: {
    required: [],
  },
};

export function createPublicInitialState(): MvpState {
  const validation = validateBlueprint(publicWorkspace, {
    dockerReady: true,
    syncedRepositoryIds: [],
    env: {},
    occupiedPorts: [],
  });

  return {
    workspace: publicWorkspace,
    exec: createEmptyExecSetup(),
    pm: {
      name: "Product team",
      role: "Product",
      team: "Workspace",
      avatarInitials: "PT",
      currentIntent: "Connect a product workspace, then request a visible change.",
    },
    integrations: initialIntegrations,
    validation,
    compose: generateComposeFile(publicWorkspace),
    steps: initialSteps,
    logs: ["[setup] waiting for product workspace selection"],
    requests: [],
    jobs: [],
    running: false,
    openAI: {
      provider: "OpenAI",
      model: "gpt-5.5",
      configured: false,
      routing: createOpenAIRoutingPlan(),
      lastPlan: createOpenAIChangePlan({
        requestBody: "Connect the product workspace before planning a change.",
        pmName: "Product team",
        workspaceName: publicWorkspace.name,
        openAIConfigured: false,
      }),
    },
    deployment: createDeploymentDemoState(),
  };
}
