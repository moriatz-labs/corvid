import { describe, expect, it } from "vitest";
import {
  buildGitHubAuthorizeUrl,
  createDeploymentDemoState,
  createOpenAIChangePlan,
  createRequestFromWhatsAppMessage,
  promoteStagingToProduction,
  stageRequestedChange,
  generateComposeFile,
  parseWhatsAppPayload,
  validateBlueprint,
} from "../src/shared/mvp";
import type { WorkspaceBlueprint } from "../src/shared/types";

const blueprint: WorkspaceBlueprint = {
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
        expect.objectContaining({ id: "repo-api", status: "failed" }),
        expect.objectContaining({ id: "env-API_BASE_URL", status: "failed" }),
        expect.objectContaining({ id: "port-api", status: "failed" }),
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
