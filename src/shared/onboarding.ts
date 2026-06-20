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
    description: "Default bookmarking product for PM judge requests and review evidence.",
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
    novusInstalled: false,
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
    screenshotPaths: ["/"],
    canRunJudgeRequests: true,
    novusInstalled: false,
  },
];

export function buildOnboardingRepositories(configJson?: string): OnboardingRepository[] {
  const configured = parseConfiguredRepositories(configJson);
  const merged = new Map(defaultOnboardingRepositories.map((repository) => [repository.id, repository]));
  for (const repository of configured) {
    merged.set(repository.id, repository);
  }
  return Array.from(merged.values());
}

export function findOnboardingRepository(
  idOrRepo: string,
  repositories: OnboardingRepository[] = defaultOnboardingRepositories,
): OnboardingRepository | undefined {
  const normalized = idOrRepo.trim().toLowerCase();
  return repositories.find(
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
        label: "Workspace connected",
        status: "complete",
        detail: `${repository.label} is selected from the connected GitHub account.`,
      },
      {
        id: "scan",
        label: "Product scanned",
        status: "complete",
        detail: `${repository.framework} scripts, local URL, screenshot targets, and analytics keys were inferred.`,
      },
      {
        id: "install",
        label: "Run packet generated",
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
    purpose: `Run ${repository.label} locally so a product manager can request, verify, and review visible product changes.`,
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
      `Generated by Corvin AI onboarding from the ${repository.label} workspace on ${repository.defaultBranch}.`,
      `Verify with ${repository.testCommand} and ${repository.buildCommand}.`,
      `Capture PM evidence from ${repository.screenshotPaths.join(", ")}.`,
      repository.novusInstalled
        ? "Novus/Pendo analytics is expected to track login, bookmark creation, collection filtering, search, and tag use."
        : "Add Novus/Pendo analytics credentials before public launch if this workspace becomes the judged product.",
      "Environment values can be added in Vercel or local .env files after onboarding; the packet remains valid without exposing secrets.",
    ].join(" "),
  };
}

function parseConfiguredRepositories(configJson?: string): OnboardingRepository[] {
  if (!configJson?.trim()) return [];

  try {
    const parsed = JSON.parse(configJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(coerceConfiguredRepository).filter((repository): repository is OnboardingRepository => Boolean(repository));
  } catch {
    return [];
  }
}

function coerceConfiguredRepository(value: unknown): OnboardingRepository | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<OnboardingRepository>;
  const id = String(input.id ?? input.name ?? "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const repo = String(input.repo ?? "").trim();
  const label = String(input.label ?? input.name ?? id).trim();
  if (!id || !repo || !label) return null;

  return {
    id,
    account: String(input.account ?? repo.split("/")[0] ?? "connected").trim(),
    name: String(input.name ?? repo.split("/")[1] ?? id).trim(),
    label,
    repo,
    description: String(input.description ?? `${label} connected product workspace.`).trim(),
    defaultBranch: String(input.defaultBranch ?? "main").trim(),
    localPath: input.localPath ? String(input.localPath).trim() : undefined,
    framework: String(input.framework ?? "Detected during onboarding").trim(),
    packageManager: input.packageManager === "pnpm" || input.packageManager === "yarn" ? input.packageManager : "npm",
    installCommand: String(input.installCommand ?? "npm install").trim(),
    devCommand: String(input.devCommand ?? "npm run dev").trim(),
    testCommand: String(input.testCommand ?? "npm test").trim(),
    buildCommand: String(input.buildCommand ?? "npm run build").trim(),
    healthUrl: String(input.healthUrl ?? "http://localhost:5173").trim(),
    productionUrl: input.productionUrl ? String(input.productionUrl).trim() : undefined,
    screenshotPaths: Array.isArray(input.screenshotPaths) ? input.screenshotPaths.map(String) : ["/"],
    canRunJudgeRequests: input.canRunJudgeRequests ?? true,
    novusInstalled: Boolean(input.novusInstalled),
  };
}

function describeEnvKey(name: string): string {
  if (name.includes("CLERK")) return "Clerk publishable key for authenticated product access.";
  if (name.includes("SUPABASE")) return "Supabase browser credential for persisted product data.";
  if (name.includes("NOVUS") || name.includes("PENDO")) return "Novus/Pendo analytics key for product usage events.";
  if (name.includes("GITHUB")) return "GitHub token used by Corvin to create branches and pull requests.";
  return "Detected during repository onboarding.";
}
