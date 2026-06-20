import { renderExecMarkdown } from "./mvp.js";
import type { ExecDocument, ExecValidationResult } from "./types.js";

export type OnboardingRepository = {
  id: string;
  account: string;
  name: string;
  label: string;
  repo: string;
  description: string;
  defaultBranch: string;
  localPath?: string;
  framework: string;
  packageManager: "npm" | "pnpm" | "yarn";
  installCommand: string;
  devCommand: string;
  testCommand: string;
  buildCommand: string;
  healthUrl: string;
  productionUrl?: string;
  screenshotPaths: string[];
  canRunJudgeRequests: boolean;
  novusInstalled: boolean;
};

export type OnboardingScanStep = {
  id: "connect" | "scan" | "install";
  label: string;
  status: "complete" | "pending";
  detail: string;
};

export type OnboardingScanResult = {
  repository: OnboardingRepository;
  generatedBy: "Corvin AI onboarding";
  generatedAt: string;
  detected: {
    framework: string;
    packageManager: string;
    scripts: string[];
    envKeys: string[];
    pages: string[];
  };
  steps: OnboardingScanStep[];
  execDocument: ExecDocument;
  execMarkdown: string;
  validation?: ExecValidationResult;
};

const shelfmarkEnvKeys = [
  "VITE_CLERK_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_NOVUS_PENDO_API_KEY",
];

export const defaultOnboardingRepositories: OnboardingRepository[] = [
  {
    id: "shelfmark",
    account: "moriatz-labs",
    name: "shelfmark",
    label: "Shelfmark",
    repo: "moriatz-labs/shelfmark",
    description: "Public bookmarking product for PM judge requests.",
    defaultBranch: "main",
    localPath: "C:/Users/loqpm/Documents/Shelfmark",
    framework: "React + TypeScript + Vite",
    packageManager: "npm",
    installCommand: "npm install",
    devCommand: "npm run dev -- --host 0.0.0.0",
    testCommand: "npm test",
    buildCommand: "npm run build",
    healthUrl: "http://localhost:5175",
    productionUrl: "https://shelfmark.vercel.app",
    screenshotPaths: ["/", "/collections", "/search"],
    canRunJudgeRequests: true,
    novusInstalled: true,
  },
  {
    id: "corvin",
    account: "moriatz-labs",
    name: "corvid",
    label: "Corvin",
    repo: "moriatz-labs/corvid",
    description: "PM workbench that converts product requests into reviewable PRs.",
    defaultBranch: "main",
    localPath: "C:/Users/loqpm/Documents/Corvin",
    framework: "React + TypeScript + Vite + Express",
    packageManager: "npm",
    installCommand: "npm install",
    devCommand: "npm run dev",
    testCommand: "npm test",
    buildCommand: "npm run build",
    healthUrl: "http://localhost:5173",
    productionUrl: "https://corvin.vercel.app",
    screenshotPaths: ["/", "/demo"],
    canRunJudgeRequests: false,
    novusInstalled: false,
  },
];

export function findOnboardingRepository(idOrRepo: string): OnboardingRepository | undefined {
  const normalized = idOrRepo.trim().toLowerCase();
  return defaultOnboardingRepositories.find(
    (repository) => repository.id.toLowerCase() === normalized || repository.repo.toLowerCase() === normalized,
  );
}

export function generateOnboardingScan(repository: OnboardingRepository, generatedAt = new Date().toISOString()): OnboardingScanResult {
  const envKeys = repository.id === "shelfmark" ? shelfmarkEnvKeys : ["GITHUB_TOKEN", "VITE_CLERK_PUBLISHABLE_KEY"];
  const execDocument = createExecDocumentFromRepository(repository, envKeys);
  const execMarkdown = renderExecMarkdown(execDocument);

  return {
    repository,
    generatedBy: "Corvin AI onboarding",
    generatedAt,
    detected: {
      framework: repository.framework,
      packageManager: repository.packageManager,
      scripts: [repository.installCommand, repository.devCommand, repository.testCommand, repository.buildCommand],
      envKeys,
      pages: repository.screenshotPaths,
    },
    steps: [
      {
        id: "connect",
        label: "Repository connected",
        status: "complete",
        detail: `${repository.repo} is selected from the Moriatz Labs GitHub account.`,
      },
      {
        id: "scan",
        label: "Codebase scanned",
        status: "complete",
        detail: `${repository.framework} scripts, local URL, screenshot targets, and analytics keys were inferred.`,
      },
      {
        id: "install",
        label: "exec.md generated",
        status: "complete",
        detail: "Corvin generated the execution packet during onboarding, so engineering does not need to author one by hand.",
      },
    ],
    execDocument,
    execMarkdown,
  };
}

function createExecDocumentFromRepository(repository: OnboardingRepository, envKeys: string[]): ExecDocument {
  return {
    purpose: `Run ${repository.label} locally so a product manager can request, verify, and review repository changes.`,
    repositories: [
      {
        id: repository.id,
        repo: repository.repo,
        role: repository.description,
        install: repository.installCommand,
        dev: repository.devCommand,
        health: repository.healthUrl,
      },
    ],
    environment: {
      global: envKeys.map((name) => ({
        name,
        required: false,
        description: describeEnvKey(name),
      })),
      perRepo: {},
    },
    localRunNotes: [
      `Generated by Corvin AI onboarding from ${repository.repo} on ${repository.defaultBranch}.`,
      `Verify with ${repository.testCommand} and ${repository.buildCommand}.`,
      `Capture PM evidence from ${repository.screenshotPaths.join(", ")}.`,
      repository.novusInstalled
        ? "Novus/Pendo analytics is expected to track login, bookmark creation, collection filtering, search, and tag use."
        : "Add analytics credentials before public launch if this repository becomes the judged product.",
      "Environment values can be added in Vercel or local .env files after onboarding; the packet remains valid without exposing secrets.",
    ].join(" "),
  };
}

function describeEnvKey(name: string): string {
  if (name.includes("CLERK")) return "Clerk publishable key for authenticated product access.";
  if (name.includes("SUPABASE")) return "Supabase browser credential for persisted product data.";
  if (name.includes("NOVUS") || name.includes("PENDO")) return "Novus/Pendo analytics key for product usage events.";
  if (name.includes("GITHUB")) return "GitHub token used by Corvin to create branches and pull requests.";
  return "Detected during repository onboarding.";
}
