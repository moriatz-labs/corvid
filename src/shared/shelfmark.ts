export type ShelfmarkWorkspacePreset = {
  id: "shelfmark";
  name: "Shelfmark";
  repo: string;
  defaultBranch: string;
  branchPrefix: string;
  localPath: string;
  productionUrl: string;
  installCommand: string;
  testCommand: string;
  buildCommand: string;
  screenshotPath: string;
  noticeFile: string;
  novusInstalled: boolean;
};

export type ShelfmarkJudgeRequestStatus = "queued" | "blocked" | "running" | "pr-open" | "failed";

export type ShelfmarkJudgeRequest = {
  id: string;
  requester: string;
  body: string;
  status: ShelfmarkJudgeRequestStatus;
  branchName: string;
  workspace: ShelfmarkWorkspacePreset;
  summary: string;
  pullRequestUrl?: string;
  cloudRunUrl?: string;
  screenshots: string[];
  changedFiles: string[];
  verification: string[];
  createdAt: string;
  updatedAt: string;
  blockedReason?: string;
};

export type ShelfmarkCloudAgentDispatch = {
  workflow: string;
  repo: string;
  url: string;
  body: {
    ref: string;
    inputs: {
      request_id: string;
      requester: string;
      request_body: string;
      branch_prefix: string;
      base_branch: string;
    };
  };
};

export const shelfmarkWorkspacePreset: ShelfmarkWorkspacePreset = {
  id: "shelfmark",
  name: "Shelfmark",
  repo: process.env.SHELFMARK_GITHUB_REPO ?? "moriatz-labs/shelfmark",
  defaultBranch: process.env.SHELFMARK_DEFAULT_BRANCH ?? "main",
  branchPrefix: "feature/shelfmark-judge",
  localPath: process.env.SHELFMARK_LOCAL_PATH ?? "C:/Users/loqpm/Documents/Shelfmark",
  productionUrl: process.env.SHELFMARK_PRODUCTION_URL ?? "https://shelfmark.vercel.app",
  installCommand: "npm install",
  testCommand: "npm test",
  buildCommand: "npm run build",
  screenshotPath: "/",
  noticeFile: "src/content/judge-request.ts",
  novusInstalled: Boolean(process.env.SHELFMARK_NOVUS_INSTALLED === "true" || process.env.VITE_NOVUS_PENDO_API_KEY),
};

export function isBlockedShelfmarkRequest(body: string): { blocked: boolean; reason?: string } {
  const lower = body.toLowerCase();
  const blockedTerms = [
    ".env",
    "env var",
    "environment variable",
    "secret",
    "token",
    "api key",
    "password",
    "merge",
    "deploy production",
    "delete repo",
    "remove repository",
  ];

  if (blockedTerms.some((term) => lower.includes(term))) {
    return {
      blocked: true,
      reason: "Requests cannot read secrets, modify environment files, or merge/deploy automatically.",
    };
  }

  return { blocked: false };
}

export function createShelfmarkJudgeRequest(input: {
  body: string;
  requester: string;
  now?: string;
  workspace?: ShelfmarkWorkspacePreset;
}): ShelfmarkJudgeRequest {
  const now = input.now ?? new Date().toISOString();
  const workspace = input.workspace ?? shelfmarkWorkspacePreset;
  const id = `sm_${stableId(`${input.requester}:${input.body}:${now}`)}`;
  const guardrail = isBlockedShelfmarkRequest(input.body);

  return {
    id,
    requester: input.requester.trim() || "judge@local",
    body: input.body.trim(),
    status: guardrail.blocked ? "blocked" : "queued",
    branchName: `${workspace.branchPrefix}-${id}`,
    workspace,
    summary: guardrail.blocked
      ? "Request blocked by Shelfmark safety guardrails."
      : "Queued for Shelfmark repository change.",
    screenshots: [],
    changedFiles: [],
    verification: [],
    createdAt: now,
    updatedAt: now,
    blockedReason: guardrail.reason,
  };
}

export function createShelfmarkCloudAgentDispatch(
  request: ShelfmarkJudgeRequest,
  workflow = "corvin-cloud-agent.yml",
): ShelfmarkCloudAgentDispatch {
  const repo = request.workspace.repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  return {
    workflow,
    repo,
    url: `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    body: {
      ref: request.workspace.defaultBranch,
      inputs: {
        request_id: request.id,
        requester: request.requester,
        request_body: request.body,
        branch_prefix: request.workspace.branchPrefix,
        base_branch: request.workspace.defaultBranch,
      },
    },
  };
}

export function createShelfmarkCloudAgentUrl(request: ShelfmarkJudgeRequest, workflow = "corvin-cloud-agent.yml") {
  const repo = request.workspace.repo.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  return `https://github.com/${repo}/actions/workflows/${workflow}`;
}

export function renderShelfmarkNoticeModule(input: { body: string; requester: string }): string {
  const safeBody = input.body.trim().replace(/\s+/g, " ").slice(0, 240);
  const safeRequester = input.requester.trim().slice(0, 120);

  return [
    "export const judgeRequestNotice = {",
    "  enabled: true,",
    `  title: ${JSON.stringify("Judge-requested update")},`,
    `  body: ${JSON.stringify(safeBody || "Shelfmark was updated from a judge request.")},`,
    `  updatedBy: ${JSON.stringify(safeRequester || "Corvin judge workflow")},`,
    "};",
    "",
  ].join("\n");
}

export function renderShelfmarkPullRequestBody(input: {
  requestBody: string;
  requester: string;
  changedFiles: string[];
  screenshots: string[];
  verification: string[];
}): string {
  return [
    "## Shelfmark judge request",
    "",
    input.requestBody,
    "",
    `Requester: ${input.requester}`,
    "",
    "## Summary",
    "Corvin updated Shelfmark's visible judge-request notice so the requested product change is reviewable in the app.",
    "",
    "## Changed files",
    ...(input.changedFiles.length > 0 ? input.changedFiles.map((file) => `- ${file}`) : ["- No files captured"]),
    "",
    "## Screenshots",
    ...(input.screenshots.length > 0 ? input.screenshots.map((file) => `- ${file}`) : ["- Screenshot capture unavailable"]),
    "",
    "## Verification",
    ...(input.verification.length > 0 ? input.verification.map((item) => `- ${item}`) : ["- Verification did not run"]),
    "",
    "AI-Model: OpenAI GPT-5 Codex",
  ].join("\n");
}

function stableId(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
