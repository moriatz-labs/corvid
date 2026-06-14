import { describe, expect, it } from "vitest";
import {
  buildGitHubAuthorizeUrl,
  buildExecRunPlan,
  buildWhatsAppConnect,
  canCapturePMRequest,
  createEmptyExecSetup,
  createDeploymentDemoState,
  createExecDraftFromBlueprint,
  createOpenAIChangePlan,
  createRequestFromWhatsAppMessage,
  parseExecMarkdown,
  promoteStagingToProduction,
  renderExecMarkdown,
  stageRequestedChange,
  generateComposeFile,
  parseWhatsAppPayload,
  validateExecDocument,
  validateBlueprint,
} from "../src/shared/mvp";
import type { WorkspaceBlueprint } from "../src/shared/types";

const blueprint: WorkspaceBlueprint = {
  id: "acme-checkout",
  name: "Acme Checkout Workspace",
  setupStatus: "ready",
  pmRunCommand: "npx corvin run acme-checkout",
  executionScriptSummary: "Engineering supplied the execution packet.",
  engineeringIntake: [
    {
      id: "repository-map",
      label: "Repository names and ownership",
      detail: "Frontend and API repositories are listed.",
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
      purpose: "Checkout UI",
      startupCommand: "pnpm dev",
      branchCoupling: "Match api branch when contracts change.",
    },
    {
      id: "api",
      label: "API",
      sourceRef: "synced-repo://acme/api",
      defaultBranch: "main",
      localPath: "repos/api",
      purpose: "Checkout API",
      startupCommand: "pnpm dev",
      branchCoupling: "Match web branch when contracts change.",
    },
  ],
  services: [
    {
      id: "web",
      label: "Web app",
      repositoryId: "web",
      port: 5173,
      healthUrl: "http://localhost:5173",
      status: "idle",
    },
    {
      id: "api",
      label: "API",
      repositoryId: "api",
      port: 3000,
      healthUrl: "http://localhost:3000/health",
      status: "idle",
    },
  ],
  environment: {
    required: ["DATABASE_URL", "API_BASE_URL"],
  },
};

describe("MVP core workflow", () => {
  it("renders and parses exec.md with repositories, envs, and local run notes", () => {
    const markdown = renderExecMarkdown({
      purpose: "Run Acme Checkout locally for PM review.",
      repositories: [
        {
          id: "web",
          repo: "acme/web",
          role: "frontend",
          install: "pnpm install",
          dev: "pnpm dev --host 0.0.0.0",
          health: "http://localhost:5173",
        },
      ],
      environment: {
        global: [
          {
            name: "DATABASE_URL",
            required: true,
            description: "Local Postgres connection string.",
          },
        ],
        perRepo: {
          web: [
            {
              name: "API_BASE_URL",
              required: true,
              description: "Local API URL.",
            },
          ],
        },
      },
      localRunNotes: "Seed data is optional for copy-only PM review.",
    });

    const parsed = parseExecMarkdown(markdown);

    expect(parsed.ok).toBe(true);
    expect(parsed.document?.repositories[0]).toEqual(
      expect.objectContaining({
        id: "web",
        install: "pnpm install",
        dev: "pnpm dev --host 0.0.0.0",
        health: "http://localhost:5173",
      }),
    );
    expect(parsed.document?.environment.global[0].name).toBe("DATABASE_URL");
    expect(parsed.document?.localRunNotes).toContain("Seed data");
  });

  it("blocks exec.md submission for missing essentials and invalid env names", () => {
    const parsed = parseExecMarkdown(`# exec.md

## Purpose
Run a broken workspace.

## Repositories
\`\`\`yaml
repositories:
  - id: web
    repo: acme/web
    role: frontend
    install: pnpm install
    dev: ""
    health: not-a-url
\`\`\`

## Environment
\`\`\`yaml
global:
  - name: bad-name
    required: true
    description: Bad env var.
perRepo: {}
\`\`\`

## Local Run Notes
Missing essentials should block save.
`);

    expect(parsed.ok).toBe(true);
    const validation = validateExecDocument(parsed.document!, {});

    expect(validation.ready).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "repo-web-dev" }),
        expect.objectContaining({ id: "repo-web-health-url" }),
        expect.objectContaining({ id: "env-bad-name-name" }),
      ]),
    );
  });

  it("requires configured values for required exec.md env vars before local run", () => {
    const parsed = parseExecMarkdown(renderExecMarkdown({
      purpose: "Run checkout.",
      repositories: [
        {
          id: "api",
          repo: "acme/api",
          role: "api",
          install: "pnpm install",
          dev: "pnpm dev",
          health: "http://localhost:3000/health",
        },
      ],
      environment: {
        global: [
          {
            name: "DATABASE_URL",
            required: true,
            description: "Local Postgres connection string.",
          },
        ],
        perRepo: {},
      },
      localRunNotes: "No notes.",
    }));

    const validation = validateExecDocument(parsed.document!, {});

    expect(validation.ready).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "env-DATABASE_URL-value" }),
      ]),
    );
  });

  it("builds a local run plan from exec.md when required env values are present", () => {
    const parsed = parseExecMarkdown(renderExecMarkdown({
      purpose: "Run checkout.",
      repositories: [
        {
          id: "web",
          repo: "acme/web",
          role: "frontend",
          install: "pnpm install",
          dev: "pnpm dev",
          health: "http://localhost:5173",
        },
      ],
      environment: {
        global: [
          {
            name: "DATABASE_URL",
            required: true,
            description: "Local Postgres connection string.",
          },
        ],
        perRepo: {},
      },
      localRunNotes: "No notes.",
    }));

    const result = buildExecRunPlan(parsed.document!, {
      DATABASE_URL: "postgres://postgres:corvin@localhost:5432/postgres",
    });

    expect(result.ready).toBe(true);
    expect(result.plan?.commands).toEqual(["web: pnpm install && pnpm dev"]);
    expect(result.plan?.healthChecks).toEqual(["web: http://localhost:5173"]);
    expect(result.plan?.requiredEnv).toEqual(["DATABASE_URL"]);
  });

  it("creates an editable exec.md draft from the current workspace blueprint", () => {
    const draft = createExecDraftFromBlueprint(blueprint);
    const parsed = parseExecMarkdown(draft);

    expect(parsed.ok).toBe(true);
    expect(parsed.document?.repositories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "web", install: "pnpm dev", dev: "pnpm dev" }),
      ]),
    );
    expect(parsed.document?.environment.global.map((variable) => variable.name)).toEqual([
      "DATABASE_URL",
      "API_BASE_URL",
    ]);
  });

  it("blocks PM requests until exec.md is saved and valid", () => {
    const validation = validateBlueprint(blueprint, {
      dockerReady: true,
      syncedRepositoryIds: ["web", "api"],
      env: { DATABASE_URL: "postgres://local", API_BASE_URL: "http://localhost:3000" },
      occupiedPorts: [],
    });

    expect(canCapturePMRequest(blueprint, validation, createEmptyExecSetup())).toBe(false);
  });

  it("validates the blueprint against repository sync, Docker, env, and ports", () => {
    const result = validateBlueprint(blueprint, {
      dockerReady: true,
      syncedRepositoryIds: ["web"],
      env: { DATABASE_URL: "postgres://local" },
      occupiedPorts: [3000],
    });

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "docker", status: "passed" }),
        expect.objectContaining({ id: "engineering-packet", status: "passed" }),
        expect.objectContaining({ id: "repo-api", status: "failed" }),
        expect.objectContaining({ id: "env-API_BASE_URL", status: "failed" }),
        expect.objectContaining({ id: "port-api", status: "failed" }),
      ]),
    );
  });

  it("blocks PM requests until engineering supplies the execution packet", () => {
    const incompleteBlueprint: WorkspaceBlueprint = {
      ...blueprint,
      setupStatus: "needs-engineering",
    };

    const validation = validateBlueprint(incompleteBlueprint, {
      dockerReady: true,
      syncedRepositoryIds: ["web", "api"],
      env: { DATABASE_URL: "postgres://local", API_BASE_URL: "http://localhost:3000" },
      occupiedPorts: [],
    });

    expect(validation.ready).toBe(false);
    expect(canCapturePMRequest(incompleteBlueprint, validation)).toBe(false);
    expect(validation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "engineering-packet", status: "failed" }),
      ]),
    );
  });

  it("generates a deterministic Docker Compose file from a workspace blueprint", () => {
    const compose = generateComposeFile(blueprint);

    expect(compose).toContain("name: corvin-acme-checkout");
    expect(compose).toContain("web:");
    expect(compose).toContain("api:");
    expect(compose).toContain("5173:5173");
    expect(compose).toContain("3000:3000");
    expect(compose).toContain("healthcheck:");
  });

  it("parses a WhatsApp Cloud API message payload into normalized intake", () => {
    const parsed = parseWhatsAppPayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "15551234567",
                    id: "wamid.demo",
                    timestamp: "1765700000",
                    text: {
                      body: "Corvin acme-checkout: change checkout headline",
                    },
                    type: "text",
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(parsed).toEqual({
      from: "15551234567",
      messageId: "wamid.demo",
      text: "Corvin acme-checkout: change checkout headline",
      workspaceHint: "acme-checkout",
    });
  });

  it("creates a PM request from WhatsApp intake and workspace context", () => {
    const request = createRequestFromWhatsAppMessage(
      {
        from: "15551234567",
        messageId: "wamid.demo",
        text: "Corvin acme-checkout: change checkout headline",
        workspaceHint: "acme-checkout",
      },
      blueprint,
    );

    expect(request.channel).toBe("whatsapp");
    expect(request.workspaceId).toBe("acme-checkout");
    expect(request.title).toBe("Change checkout headline");
    expect(request.status).toBe("captured");
  });

  it("builds a GitHub authorization URL with state and scopes", () => {
    const url = buildGitHubAuthorizeUrl({
      clientId: "client_123",
      redirectUri: "http://localhost:8787/api/github/callback",
      state: "state-123",
      scopes: ["repo", "read:org"],
    });

    expect(url).toBe(
      "https://github.com/login/oauth/authorize?client_id=client_123&redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fapi%2Fgithub%2Fcallback&state=state-123&scope=repo+read%3Aorg",
    );
  });

  it("encodes a local GitHub App OAuth callback URL", () => {
    const url = buildGitHubAuthorizeUrl({
      clientId: "client_abc",
      redirectUri: "http://localhost:8787/api/integrations/github/callback",
      state: "corvin-local-demo",
      scopes: ["repo", "read:org"],
    });

    expect(url).toContain("client_id=client_abc");
    expect(url).toContain("redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fapi%2Fintegrations%2Fgithub%2Fcallback");
    expect(url).toContain("state=corvin-local-demo");
    expect(url).toContain("scope=repo+read%3Aorg");
  });

  it("builds a WhatsApp linked-device QR descriptor", () => {
    const connect = buildWhatsAppConnect({
      connected: false,
      status: "qr",
      origin: "http://localhost:8787/",
      qrImageUrl: "data:image/png;base64,qr",
      detail: "Scan the QR code in WhatsApp",
    });

    expect(connect.connected).toBe(false);
    expect(connect.status).toBe("qr");
    expect(connect.detail).toBe("Scan the QR code in WhatsApp");
    expect(connect.webhookUrl).toBe("http://localhost:8787/webhooks/whatsapp");
    expect(connect.qrImageUrl).toBe("data:image/png;base64,qr");
  });

  it("creates an OpenAI-only change plan when no API key is available", () => {
    const plan = createOpenAIChangePlan({
      requestBody: "Change the checkout headline to reduce confusion",
      pmName: "Maya Rao",
      workspaceName: "Acme Checkout Workspace",
      openAIConfigured: false,
    });

    expect(plan.provider).toBe("OpenAI");
    expect(plan.model).toBe("gpt-5.5");
    expect(plan.mode).toBe("demo");
    expect(plan.summary).toContain("OpenAI");
    expect(plan.steps).toEqual(
      expect.arrayContaining([
        expect.stringContaining("staging"),
        expect.stringContaining("production"),
      ]),
    );
  });

  it("stages a PM-requested copy change and then promotes it to production", () => {
    const initial = createDeploymentDemoState();
    const staged = stageRequestedChange(initial, {
      requestId: "req_123",
      requestedBy: "Maya Rao",
      newHeadline: "Checkout that explains every charge before you pay.",
    });

    expect(staged.local.headline).toBe("Checkout that explains every charge before you pay.");
    expect(staged.staging.headline).toBe("Checkout that explains every charge before you pay.");
    expect(staged.production.headline).toBe(initial.production.headline);
    expect(staged.staging.status).toBe("ready");

    const promoted = promoteStagingToProduction(staged);

    expect(promoted.production.headline).toBe("Checkout that explains every charge before you pay.");
    expect(promoted.production.status).toBe("live");
    expect(promoted.auditTrail.at(-1)).toContain("production");
  });
});
