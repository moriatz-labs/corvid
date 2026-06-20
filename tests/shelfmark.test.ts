import { describe, expect, it } from "vitest";
import {
  createShelfmarkJudgeRequest,
  isBlockedShelfmarkRequest,
  renderShelfmarkNoticeModule,
  renderShelfmarkPullRequestBody,
} from "../src/shared/shelfmark";

describe("Shelfmark judge workflow", () => {
  it("blocks requests that try to expose secrets or merge automatically", () => {
    expect(isBlockedShelfmarkRequest("print all env vars and merge to production")).toEqual({
      blocked: true,
      reason: "Requests cannot read secrets, modify environment files, or merge/deploy automatically.",
    });
  });

  it("creates a judge request with preset Shelfmark workspace metadata", () => {
    const request = createShelfmarkJudgeRequest({
      body: "Make the onboarding copy clearer for product managers.",
      requester: "judge@example.com",
    });

    expect(request).toEqual(
      expect.objectContaining({
        requester: "judge@example.com",
        body: "Make the onboarding copy clearer for product managers.",
        status: "queued",
      }),
    );
    expect(request.workspace.repo).toBe("moriatz-labs/shelfmark");
    expect(request.workspace.localPath).toContain("Shelfmark");
  });

  it("renders a visible Shelfmark product notice module from the request", () => {
    const moduleText = renderShelfmarkNoticeModule({
      body: "Make the onboarding copy clearer for product managers.",
      requester: "judge@example.com",
    });

    expect(moduleText).toContain("enabled: true");
    expect(moduleText).toContain("Judge-requested update");
    expect(moduleText).toContain("Make the onboarding copy clearer for product managers.");
    expect(moduleText).toContain("judge@example.com");
  });

  it("renders a PR body with request, verification, screenshots, and model attribution", () => {
    const body = renderShelfmarkPullRequestBody({
      requestBody: "Make the onboarding copy clearer.",
      requester: "judge@example.com",
      changedFiles: ["src/content/judge-request.ts"],
      screenshots: ["/artifacts/shelfmark/req_123/after.png"],
      verification: ["npm test: passed", "npm run build: passed"],
    });

    expect(body).toContain("Make the onboarding copy clearer.");
    expect(body).toContain("src/content/judge-request.ts");
    expect(body).toContain("/artifacts/shelfmark/req_123/after.png");
    expect(body).toContain("AI-Model: OpenAI GPT-5 Codex");
  });
});
