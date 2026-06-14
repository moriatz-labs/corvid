import {
  buildExecRunPlan,
  buildJobWorkspacePlan,
  createDeploymentDemoState,
  createEmptyExecSetup,
  createExecDraftFromBlueprint,
  createJobFileEditPlan,
  createOpenAIChangePlan,
  createOpenAIRoutingPlan,
  createRequestFromWhatsAppMessage,
  generateComposeFile,
  parseExecMarkdown,
  promoteStagingToProduction,
  stageRequestedChange,
  validateBlueprint,
  validateExecDocument,
} from "./mvp.js";
import type { BlueprintStep, Integration, JobRunState, MvpState, WorkspaceBlueprint } from "./types.js";

const defaultDemoOwner = "Paul-M-Kallarackal";

export function createCorvinDemoBlueprint(owner = defaultDemoOwner): WorkspaceBlueprint {
  return {
  id: "corvin-demo-app",
  name: "Corvin Demo App",
  setupStatus: "ready",
  pmRunCommand: "npx corvin run corvin-demo-app",
  executionScriptSummary:
    "Engineering supplied the execution script for the public Corvin demo app; Corvin agents resolve the frontend and backend repositories, branch alignment, environment, startup order, and health checks.",
  engineeringIntake: [
    {
      id: "repository-map",
      label: "Repository names and ownership",
      detail: "Frontend and backend repositories are listed with public GitHub owner and source refs.",
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
      detail: "Install, dev, seed, migration, and health-check commands are allowlisted.",
      status: "provided",
    },
    {
      id: "branch-contract",
      label: "Cross-repo branch contract",
      detail: "Branch coupling rules explain when frontend and backend branches must match.",
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
      id: "frontend",
      label: "Frontend app",
      sourceRef: `synced-repo://${owner}/corvin-demo-app-frontend`,
      defaultBranch: "main",
      localPath: "repos/frontend",
      purpose: "React/Vite customer checkout and PM-visible product surface for the demo app.",
      startupCommand: "npm install && npm run dev -- --host 0.0.0.0",
      branchCoupling: "Use the same feature branch as backend when checkout API contracts change.",
    },
    {
      id: "backend",
      label: "Backend API",
      sourceRef: `synced-repo://${owner}/corvin-demo-app-backend`,
      defaultBranch: "main",
      localPath: "repos/backend",
      purpose: "Express/Node checkout summary and health API for the demo app.",
      startupCommand: "npm install && npm run dev",
      branchCoupling: "Must match frontend branch when response schema changes.",
    },
  ],
  services: [
    {
      id: "frontend",
      label: "Frontend app",
      repositoryId: "frontend",
      port: 5173,
      healthUrl: "http://localhost:5173",
      status: "healthy",
    },
    {
      id: "backend",
      label: "Backend API",
      repositoryId: "backend",
      port: 3000,
      healthUrl: "http://localhost:3000/health",
      status: "healthy",
    },
  ],
  environment: {
    required: ["VITE_API_BASE_URL", "PORT", "WHATSAPP_VERIFY_TOKEN"],
  },
  };
}

export const demoBlueprint: WorkspaceBlueprint = createCorvinDemoBlueprint();

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
    summary: "PM runs only npx corvin run corvin-demo-app or clicks the equivalent UI action",
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

const publicWorkspace: WorkspaceBlueprint = {
  id: "workspace-setup",
  name: "Workspace setup",
  setupStatus: "needs-engineering",
  pmRunCommand: "",
  executionScriptSummary: "",
  engineeringIntake: [
    {
      id: "connectors",
      label: "Connectors",
      detail: "Connect WhatsApp and GitHub before selecting repositories.",
      status: "required",
    },
    {
      id: "repositories",
      label: "Repository selection",
      detail: "Repository access is empty until GitHub is connected.",
      status: "required",
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
      currentIntent: "Connect the required services, then capture a product request.",
    },
    integrations: initialIntegrations,
    validation,
    compose: generateComposeFile(publicWorkspace),
    steps: initialSteps.map((step) => ({
      ...step,
      status: step.id === "blueprint" || step.id === "validate" ? "pending" : step.status,
    })),
    logs: ["[setup] waiting for WhatsApp, GitHub, and repository selection"],
    requests: [],
    jobs: [],
    running: false,
    openAI: {
      provider: "OpenAI",
      model: "gpt-5.5",
      configured: false,
      routing: createOpenAIRoutingPlan(),
      lastPlan: createOpenAIChangePlan({
        requestBody: "Connect the workspace before planning a change.",
        pmName: "Product team",
        workspaceName: publicWorkspace.name,
        openAIConfigured: false,
      }),
    },
    deployment: createDeploymentDemoState(),
  };
}

export function createInitialState(): MvpState {
  const validation = validateBlueprint(demoBlueprint, {
    dockerReady: true,
    syncedRepositoryIds: ["frontend", "backend"],
    env: {
      VITE_API_BASE_URL: "http://localhost:3000",
      PORT: "3000",
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
      team: "Corvin Demo",
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
      "[engineering] execution packet complete for corvin-demo-app",
      "[agents] resolved repositories, startup order, and service contracts",
      "[compose] generated corvin-corvin-demo-app services",
    ],
    requests: [
      createRequestFromWhatsAppMessage(
        {
          from: "15551234567",
          messageId: "wamid.seed",
          text: "Corvin corvin-demo-app: change checkout headline",
          workspaceHint: "corvin-demo-app",
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

export function createDemoModeState(): MvpState {
  const base = createInitialState();
  const request = {
    ...base.requests[0],
    body: "Change the checkout headline to explain every charge before payment.",
    status: "ready-for-context" as const,
  };
  const parsedExec = parseExecMarkdown(base.exec.markdown);
  if (!parsedExec.ok) {
    throw new Error("Demo exec.md could not be parsed.");
  }

  const env = {
    VITE_API_BASE_URL: "http://localhost:3000",
    PORT: "3000",
    WHATSAPP_VERIFY_TOKEN: "local-dev",
  };
  const execValidation = validateExecDocument(parsedExec.document, env);
  const execRunPlan = buildExecRunPlan(parsedExec.document, env);
  const plan = buildJobWorkspacePlan({
    request,
    document: parsedExec.document,
    workspaceRoot: "C:/Users/maya/corvin-jobs",
    createdAt: "2026-06-14T09:30:00.000Z",
  });
  const editPlan = createJobFileEditPlan(request.body);
  const staged = stageRequestedChange(base.deployment, {
    requestId: request.id,
    requestedBy: base.pm.name,
    newHeadline: editPlan.replacementText,
  });

  const job: JobRunState = {
    id: plan.id,
    requestId: request.id,
    status: "pr-open",
    currentAction: "Demo complete",
    plan: {
      ...plan,
      repositories: plan.repositories.map((repository) => ({
        ...repository,
        status: "branch-ready",
      })),
    },
    logs: [
      "[demo] loaded exec.md and repository map for corvin-demo-app",
      "[github] cloned Paul-M-Kallarackal/corvin-demo-app-frontend and Paul-M-Kallarackal/corvin-demo-app-backend into the job workspace",
      "[branch] created corvin/req_change-checkout-headline across frontend and backend",
      "[openai] planned copy-only checkout change with repo context",
      "[edit] updated src/App.tsx and added docs/checkout-copy.md",
      "[verify] ran lint, tests, and local preview capture",
      "[review] attached summary, screenshots, and diff evidence",
      "[github] opened pull request for engineering review",
    ],
    changedFiles: [
      {
        repositoryId: "frontend",
        path: "src/App.tsx",
        status: "modified",
      },
      {
        repositoryId: "backend",
        path: "docs/checkout-copy.md",
        status: "added",
      },
      {
        repositoryId: "frontend",
        path: "tests/checkout-copy.test.ts",
        status: "added",
      },
    ],
    diff: [
      "diff --git a/src/App.tsx b/src/App.tsx",
      "- Checkout built for fast-growing teams.",
      "+ Checkout that explains every charge before you pay.",
      "",
      "diff --git a/docs/checkout-copy.md b/docs/checkout-copy.md",
      "+ PM request, implementation notes, preview URLs, and verification logs.",
    ].join("\n"),
    pullRequests: [
      {
        repositoryId: "frontend",
        repo: "Paul-M-Kallarackal/corvin-demo-app-frontend",
        url: "https://github.com/Paul-M-Kallarackal/corvin-demo-app-frontend/pull/184",
        number: 184,
        status: "open",
      },
    ],
    reviewIterations: [
      {
        id: "review-1",
        model: "gpt-5.5",
        mode: "fallback",
        feedback: "Confirm the request is copy-only and can stay inside the checkout frontend surface.",
        summary: "Classified as low-risk copy change with frontend-only visible impact.",
        targetFile: "src/App.tsx",
        createdAt: "2026-06-14T09:34:00.000Z",
      },
      {
        id: "review-2",
        model: "gpt-5.4-mini",
        mode: "fallback",
        feedback: "Collect the repo files, exec.md commands, branch contract, and preview path.",
        summary: "Context packet included frontend, backend, env, health checks, and branch coupling.",
        targetFile: "exec.md",
        createdAt: "2026-06-14T09:36:00.000Z",
      },
      {
        id: "review-3",
        model: "gpt-5.5",
        mode: "fallback",
        feedback: "Verify final state before creating the pull request.",
        summary: "Tests passed, preview copy matched request, and PR evidence was generated.",
        targetFile: "CORVIN_CHANGE_REQUEST.md",
        createdAt: "2026-06-14T09:41:00.000Z",
      },
    ],
    reviewPackage: {
      wrong: "The original checkout headline did not explain when charges are reviewed.",
      fixed: "The preview now says: Checkout that explains every charge before you pay.",
      revised: "No follow-up changes requested; the prepared demo is already complete.",
      screenshots: [
        {
          label: "Checkout preview",
          url: "https://staging.corvin-demo.app/checkout",
          path: "artifacts/checkout-preview.png",
          capturedAt: "2026-06-14T09:42:00.000Z",
          status: "captured",
        },
      ],
      updatedAt: "2026-06-14T09:42:00.000Z",
    },
    startedAt: "2026-06-14T09:30:00.000Z",
    updatedAt: "2026-06-14T09:45:00.000Z",
  };

  return {
    ...base,
    exec: {
      exists: true,
      markdown: base.exec.markdown,
      validation: execValidation,
      runPlan: execRunPlan.plan,
    },
    integrations: base.integrations.map((integration) => {
      if (integration.id === "whatsapp") {
        return {
          ...integration,
          status: "connected" as const,
          detail: "Demo inbox connected without login; seeded WhatsApp request is already captured.",
        };
      }
      if (integration.id === "github") {
        return {
          ...integration,
          status: "connected" as const,
          detail: "Demo GitHub context connected without OAuth; corvin-demo-app frontend and backend repositories are available.",
        };
      }
      return {
        ...integration,
        status: "ready" as const,
        detail: "Local runner is in demo-safe mode.",
      };
    }),
    steps: base.steps.map((step) => ({
      ...step,
      status: "succeeded" as const,
    })),
    logs: [
      "[demo] no-login demo mode selected from sidebar",
      "[exec] exec.md validated with frontend and backend repositories",
      "[whatsapp] seeded request captured from Maya Rao",
      "[github] corvin-demo-app frontend and backend connected from demo context",
      "[runner] job workspace created at C:/Users/maya/corvin-jobs/job_req_change-checkout-headline",
      "[openai] request planned with OpenAI-only routing in demo mode",
      "[changes] modified src/App.tsx and added docs/checkout-copy.md",
      "[verify] lint, tests, preview, and screenshot evidence completed",
      "[pr] opened pull request https://github.com/Paul-M-Kallarackal/corvin-demo-app-frontend/pull/184",
    ],
    requests: [request],
    jobs: [job],
    running: false,
    deployment: promoteStagingToProduction(staged),
  };
}
