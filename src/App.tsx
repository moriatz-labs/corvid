import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/clerk-react";
import {
  ArrowRight,
  ArrowUpRight,
  BookmarkPlus,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Database,
  FileText,
  GitBranch,
  Github,
  GitPullRequest,
  Loader2,
  Lock,
  MessageCircle,
  Package,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { initializeProductAnalytics, trackProductEvent } from "./lib/analytics";
import { cn } from "./lib/utils";
import DemoApp from "./DemoApp";

type ShelfmarkWorkspace = {
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

type ShelfmarkJudgeRequest = {
  id: string;
  requester: string;
  body: string;
  status: "queued" | "blocked" | "running" | "pr-open" | "failed";
  summary: string;
  pullRequestUrl?: string;
  cloudRunUrl?: string;
  screenshots: string[];
  changedFiles: string[];
  verification: string[];
  blockedReason?: string;
};

type ShelfmarkWorkspaceResponse = {
  workspace: ShelfmarkWorkspace;
  requests: ShelfmarkJudgeRequest[];
  githubReady: boolean;
};

type OnboardingRepository = {
  id: string;
  account: string;
  name: string;
  label: string;
  repo: string;
  description: string;
  defaultBranch: string;
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

type OnboardingRepositoriesResponse = {
  account: string;
  repositories: OnboardingRepository[];
  githubReady: boolean;
};

type OnboardingScanResult = {
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
  steps: Array<{
    id: "connect" | "scan" | "install";
    label: string;
    status: "complete" | "pending";
    detail: string;
  }>;
  execMarkdown: string;
  validation?: {
    ready: boolean;
    errors: Array<{ id: string; label: string; detail: string }>;
    warnings: Array<{ id: string; label: string; detail: string }>;
  };
};

type OnboardingStep = "connect" | "scan" | "install";

const fallbackWorkspace: ShelfmarkWorkspace = {
  id: "shelfmark",
  name: "Shelfmark",
  repo: "moriatz-labs/shelfmark",
  defaultBranch: "main",
  branchPrefix: "feature/shelfmark-judge",
  localPath: "C:/Users/loqpm/Documents/Shelfmark",
  productionUrl: "https://shelfmark.vercel.app",
  installCommand: "npm install",
  testCommand: "npm test",
  buildCommand: "npm run build",
  screenshotPath: "/",
  noticeFile: "src/content/judge-request.ts",
  novusInstalled: false,
};

const starterRequest = "Make Shelfmark's onboarding clearer for product managers saving research and customer evidence.";
const trackedLoginIds = new Set<string>();

const fallbackRepositories: OnboardingRepository[] = [
  {
    id: "shelfmark",
    account: "moriatz-labs",
    name: "shelfmark",
    label: "Shelfmark",
    repo: "moriatz-labs/shelfmark",
    description: "Public bookmarking product for PM judge requests.",
    defaultBranch: "main",
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

export default function App() {
  if (window.location.pathname.replace(/\/+$/, "") === "/demo") {
    return <DemoApp />;
  }

  return <CorvinProductConsole />;
}

function CorvinProductConsole() {
  const clerkConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

  return (
    <div className="min-h-screen bg-terminal text-terminal-text">
      {clerkConfigured ? (
        <>
          <SignedOut>
            <SignedOutGate />
          </SignedOut>
          <SignedIn>
            <SignedInConsole />
          </SignedIn>
        </>
      ) : (
        <OnboardingShell requester="judge@local" authMode="Local review mode. Configure Clerk before public judging." />
      )}
    </div>
  );
}

function SignedInConsole() {
  const { user } = useUser();
  const requester = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "judge@local";

  useEffect(() => {
    initializeProductAnalytics(
      user
        ? {
            id: user.id,
            email: user.primaryEmailAddress?.emailAddress,
            name: user.fullName ?? undefined,
          }
        : null,
    );
    if (user && !trackedLoginIds.has(user.id)) {
      trackedLoginIds.add(user.id);
      trackProductEvent("corvin_login_completed", {
        email: user.primaryEmailAddress?.emailAddress,
      });
    }
  }, [user]);

  return <OnboardingShell requester={requester} authMode="Signed in with Clerk." />;
}

function SignedOutGate() {
  return (
    <div className="min-h-screen bg-terminal text-terminal-text">
      <OnboardingTopBar activeStep="connect" completed={[]} />
      <main className="mx-auto grid min-h-[calc(100vh-65px)] max-w-5xl place-items-center px-4 py-16 md:px-8">
        <div className="w-full max-w-2xl rounded-md border border-terminal-border bg-[#1a1a1c] p-8 shadow-2xl">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <DarkPill tone="warning">Judge sign-in required</DarkPill>
              <h1 className="mt-5 font-primary text-3xl font-medium leading-tight">Make product calls without waiting on setup.</h1>
              <p className="mt-3 max-w-prose font-body text-sm leading-relaxed text-terminal-muted">
                Sign in to turn product judgment into visible experiments: a clear request, screenshots, checks, and a reviewable change your team can inspect.
              </p>
            </div>
            <div className="grid size-12 shrink-0 place-items-center rounded-md border border-terminal-border bg-[#111113] text-terminal-muted">
              <Lock size={21} />
            </div>
          </div>
          <SignInButton mode="modal">
            <Button className="mt-8 min-h-12 w-full bg-terminal-text text-terminal hover:bg-white" icon={<ShieldCheck size={16} />}>
              Sign in to Corvin
            </Button>
          </SignInButton>
        </div>
      </main>
    </div>
  );
}

function OnboardingShell({ requester, authMode }: { requester: string; authMode: string }) {
  const [repositories, setRepositories] = useState<OnboardingRepository[]>(fallbackRepositories);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState("shelfmark");
  const [query, setQuery] = useState("");
  const [githubReady, setGithubReady] = useState(false);
  const [activeStep, setActiveStep] = useState<OnboardingStep>("connect");
  const [scan, setScan] = useState<OnboardingScanResult | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadRepositories() {
      try {
        const payload = await api<OnboardingRepositoriesResponse>("/api/onboarding/repositories");
        if (cancelled) return;
        setRepositories(payload.repositories.length > 0 ? payload.repositories : fallbackRepositories);
        setGithubReady(payload.githubReady);
        if (payload.repositories.some((repository) => repository.id === "shelfmark")) {
          setSelectedRepositoryId("shelfmark");
        }
      } catch {
        if (!cancelled) {
          setRepositories(fallbackRepositories);
        }
      }
    }

    void loadRepositories();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRepository = repositories.find((repository) => repository.id === selectedRepositoryId) ?? repositories[0] ?? fallbackRepositories[0];
  const filteredRepositories = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return repositories;
    return repositories.filter((repository) =>
      [repository.label, repository.repo, repository.description, repository.framework].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [query, repositories]);
  const completedSteps: OnboardingStep[] = scan ? ["connect", "scan", "install"] : activeStep === "scan" ? ["connect"] : [];

  if (!introComplete) {
    return (
      <OnboardingIntro
        onStart={() => {
          trackProductEvent("corvin_onboarding_started", { requester });
          setIntroComplete(true);
        }}
      />
    );
  }

  async function runScan() {
    setScanLoading(true);
    setError(null);
    setActiveStep("scan");

    try {
      const payload = await api<OnboardingScanResult>("/api/onboarding/scan", {
        method: "POST",
        body: JSON.stringify({ repositoryId: selectedRepository.id }),
      });
      setScan(payload);
      trackProductEvent("corvin_repository_scanned", {
        repository: payload.repository.repo,
        framework: payload.detected.framework,
        envKeyCount: payload.detected.envKeys.length,
        pageCount: payload.detected.pages.length,
        novusInstalled: payload.repository.novusInstalled,
      });
      setActiveStep("install");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Corvin could not prepare the selected product.");
      setActiveStep("connect");
    } finally {
      setScanLoading(false);
    }
  }

  if (onboardingComplete) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <WorkbenchHeader activeStep="install" />
        <JudgeConsole requester={requester} authMode={authMode} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-terminal text-terminal-text">
      <OnboardingTopBar activeStep={activeStep} completed={completedSteps} />
      <main className="grid min-h-[calc(100vh-65px)] border-t border-terminal-border lg:grid-cols-[minmax(0,1fr)_374px]">
        <section className="mx-auto grid w-full max-w-5xl content-start gap-8 px-4 py-12 md:px-8 md:py-20">
          <div className="mx-auto w-full max-w-3xl">
            <div className="mb-9 text-center">
              <h1 className="mx-auto max-w-2xl font-primary text-4xl font-medium leading-tight text-white md:text-5xl">
                Product decisions, backed by working software.
              </h1>
              <p className="mt-4 font-body text-sm leading-relaxed text-terminal-muted md:text-base">
                Pick the product you want to improve. Corvin handles the setup context, checks, and review evidence behind the scenes.
              </p>
            </div>

            <SetupHeroCard />

            <div className="mt-8 overflow-hidden rounded-md border border-terminal-border bg-[#19191b] shadow-2xl">
              <div className="border-b border-terminal-border p-5 md:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-4">
                    <div className="grid size-11 shrink-0 place-items-center rounded-md border border-terminal-border bg-[#242426] text-terminal-muted">
                      <Github size={20} />
                    </div>
                    <div>
                      <h2 className="font-primary text-lg font-medium text-white">Choose a product workspace</h2>
                      <p className="mt-1 font-body text-sm text-terminal-muted">{repositories.length} available Moriatz Labs products</p>
                    </div>
                  </div>
                  <DarkPill tone={githubReady ? "success" : "neutral"}>{githubReady ? "GitHub token ready" : "GitHub public sync"}</DarkPill>
                </div>

                <button className="mt-5 flex min-h-10 w-full items-center justify-between rounded-md border border-terminal-border bg-[#202022] px-3 text-left font-default text-sm text-terminal-muted">
                  <span>{selectedRepository.account}</span>
                  <ChevronDown size={16} />
                </button>
              </div>

              <div className="border-b border-terminal-border bg-[#0d0d0e] p-5 md:p-6">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-terminal-muted" size={17} />
                  <input
                    className="min-h-11 w-full rounded-md border border-terminal-border bg-[#111113] pl-10 pr-3 font-default text-sm text-terminal-text outline-none transition-colors placeholder:text-terminal-muted focus:border-terminal-muted"
                    placeholder="Search products..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>

                <div className="mt-4 grid max-h-80 gap-3 overflow-y-auto pr-1">
                  {filteredRepositories.map((repository) => (
                    <button
                      key={repository.id}
                      className={cn(
                        "w-full rounded-md border p-4 text-left transition-colors",
                        selectedRepository.id === repository.id
                          ? "border-terminal-text bg-[#202022]"
                          : "border-terminal-border bg-[#151517] hover:border-terminal-muted hover:bg-[#1d1d20]",
                      )}
                      onClick={() => {
                        setSelectedRepositoryId(repository.id);
                        trackProductEvent("corvin_repository_selected", {
                          repository: repository.repo,
                          canRunJudgeRequests: repository.canRunJudgeRequests,
                          novusInstalled: repository.novusInstalled,
                        });
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-primary text-sm font-medium text-white">{repository.label}</p>
                            {repository.canRunJudgeRequests ? <DarkPill tone="success">PM-ready</DarkPill> : <DarkPill tone="neutral">Not judge-ready</DarkPill>}
                          </div>
                          <p className="mt-3 font-body text-xs leading-relaxed text-terminal-muted">{repository.description}</p>
                        </div>
                        <div
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded-full border",
                            selectedRepository.id === repository.id ? "border-terminal-text bg-terminal-text text-terminal" : "border-terminal-border text-transparent",
                          )}
                        >
                          <Check size={13} />
                        </div>
                      </div>
                    </button>
                  ))}
                  {filteredRepositories.length === 0 ? (
                    <p className="rounded-md border border-dashed border-terminal-border p-5 text-center font-body text-sm text-terminal-muted">
                      No products match that search.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-4 bg-[#282829] p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
                <p className="font-body text-sm text-terminal-muted">
                  Selected: <span className="font-mono text-terminal-text">{selectedRepository.label}</span>
                </p>
                <Button
                  className="min-h-11 bg-terminal-text text-terminal hover:bg-white"
                  onClick={() => void runScan()}
                  disabled={scanLoading}
                  icon={scanLoading ? <Loader2 className="animate-spin" size={16} /> : <WandSparkles size={16} />}
                >
                  {scanLoading ? "Reading product context..." : "Generate PM run packet"}
                </Button>
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-md border border-[#6b3c35] bg-[#241714] p-4">
                <p className="font-primary text-sm font-medium text-white">Onboarding needs attention</p>
                <p className="mt-1 font-body text-sm leading-relaxed text-terminal-muted">{error}</p>
              </div>
            ) : null}

            {scan ? (
              <InstallPanel
                scan={scan}
                onContinue={() => {
                  trackProductEvent("corvin_exec_md_accepted", {
                    repository: scan.repository.repo,
                    validationReady: scan.validation?.ready ?? true,
                    errorCount: scan.validation?.errors.length ?? 0,
                    warningCount: scan.validation?.warnings.length ?? 0,
                  });
                  setOnboardingComplete(true);
                }}
              />
            ) : null}
          </div>
        </section>

        <SetupAssistantPanel
          requester={requester}
          authMode={authMode}
          activeStep={activeStep}
          selectedRepository={selectedRepository}
          scan={scan}
        />
      </main>
    </div>
  );
}

function OnboardingIntro({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-screen bg-[#070707] text-terminal-text">
      <IntroTopBar />
      <main className="grid min-h-[calc(100vh-65px)] place-items-center px-4 py-12">
        <section className="w-full max-w-2xl">
          <div className="text-center">
            <h1 className="font-primary text-4xl font-medium leading-tight text-white md:text-5xl">
              PMs can ship
              <br />
              without setup drag.
            </h1>
            <p className="mt-4 font-default text-sm text-terminal-muted md:text-base">
              Make the call · Ask naturally · Review one clean PR
            </p>
          </div>

          <div className="mt-8 grid gap-4">
            <IntroStepCard
              icon={<Code2 size={23} />}
              index="1."
              title="Choose the product"
              body="Pick the Moriatz Labs app you want to improve. Corvin turns product context into an execution plan automatically."
            />
            <IntroStepCard
              icon={<Sparkles size={23} />}
              index="2."
              title="Corvin removes setup work"
              body="The run packet is generated for you so PMs are not blocked by scripts, env notes, or messy handoff docs."
            />
            <IntroStepCard
              icon={<GitPullRequest size={23} />}
              index="3."
              title="Review the decision as a PR"
              body="A product request becomes a branch, screenshot, summary, and pull request. Corvin never auto-merges judge changes."
            />
          </div>

          <div className="mt-8 text-center">
            <button className="inline-flex items-center gap-2 rounded-md px-3 py-2 font-default text-sm text-terminal-muted hover:text-white" type="button">
              <MessageCircle size={15} />
              Invite teammates
            </button>
          </div>

          <Button className="mt-4 min-h-12 w-full bg-terminal-text text-terminal hover:bg-white" onClick={onStart} icon={<ArrowRight size={16} />}>
            Get Started
          </Button>
        </section>
      </main>
    </div>
  );
}

function IntroTopBar() {
  return (
    <header className="border-b border-terminal-border bg-[#070707]">
      <div className="flex min-h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <img src="/corvin-logo.png" alt="Corvin" className="size-9 rounded-md object-cover" />
          <span className="font-primary text-2xl font-medium text-white">corvin</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            className="hidden min-h-9 items-center gap-2 rounded-md border border-terminal-border px-3 font-primary text-xs text-terminal-text transition-colors hover:bg-[#171719] sm:flex"
            href="/demo"
          >
            Demo archive
            <ArrowUpRight size={14} />
          </a>
          {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? <UserButton afterSignOutUrl="/" /> : null}
        </div>
      </div>
    </header>
  );
}

function IntroStepCard({ icon, index, title, body }: { icon: React.ReactNode; index: string; title: string; body: string }) {
  return (
    <div className="rounded-md border border-terminal-border bg-[#19191b] p-6">
      <div className="flex gap-5">
        <div className="grid size-12 shrink-0 place-items-center rounded-md border border-terminal-border bg-[#111113] text-terminal-muted">
          {icon}
        </div>
        <div>
          <h2 className="font-primary text-base font-medium text-white">
            <span className="mr-2 text-terminal-muted">{index}</span>
            {title}
          </h2>
          <p className="mt-2 font-body text-sm leading-relaxed text-terminal-muted">{body}</p>
        </div>
      </div>
    </div>
  );
}

function OnboardingTopBar({ activeStep, completed }: { activeStep: OnboardingStep; completed: OnboardingStep[] }) {
  return (
    <header className="sticky top-0 z-30 border-b border-terminal-border bg-[#070707]/95 backdrop-blur">
      <div className="grid min-h-16 grid-cols-[1fr_auto] items-center gap-4 px-4 md:grid-cols-[1fr_minmax(360px,520px)_1fr] md:px-6">
        <div className="flex items-center gap-3">
          <img src="/corvin-logo.png" alt="Corvin" className="size-9 rounded-md object-cover" />
          <span className="font-primary text-2xl font-medium tracking-normal text-white">corvin</span>
        </div>
        <div className="hidden items-center gap-3 md:flex">
          {(["connect", "scan", "install"] as OnboardingStep[]).map((step, index) => (
            <TopStep key={step} step={step} active={activeStep === step} complete={completed.includes(step)} showLine={index < 2} />
          ))}
        </div>
        <div className="flex items-center justify-end gap-3">
          <a
            className="hidden min-h-9 items-center gap-2 rounded-md border border-terminal-border px-3 font-primary text-xs text-terminal-text transition-colors hover:bg-[#171719] sm:flex"
            href="/demo"
          >
            Demo archive
            <ArrowUpRight size={14} />
          </a>
          {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? <UserButton afterSignOutUrl="/" /> : null}
        </div>
      </div>
    </header>
  );
}

function WorkbenchHeader({ activeStep }: { activeStep: OnboardingStep }) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
        <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:p-3" href="#request">
          Skip to request
        </a>
        <div className="flex items-center gap-3">
          <img src="/corvin-logo.png" alt="Corvin" className="size-10 rounded-md border border-border object-cover" />
          <div>
            <p className="font-primary text-lg font-medium">Corvin</p>
            <p className="font-body text-xs text-muted-foreground">Shelfmark PM workbench</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          {(["connect", "scan", "install"] as OnboardingStep[]).map((step) => (
            <Badge key={step} tone={activeStep === step ? "success" : "neutral"}>{step}</Badge>
          ))}
        </div>
        {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? <UserButton afterSignOutUrl="/" /> : null}
      </div>
    </header>
  );
}

function TopStep({ step, active, complete, showLine }: { step: OnboardingStep; active: boolean; complete: boolean; showLine: boolean }) {
  const label = step[0].toUpperCase() + step.slice(1);
  return (
    <>
      <div className="grid min-w-24 gap-1">
        <span className={cn("font-primary text-xs", active || complete ? "text-white" : "text-terminal-muted")}>{label}</span>
        <span className={cn("h-1 rounded-full", active || complete ? "bg-terminal-text" : "bg-terminal-border")} />
      </div>
      {showLine ? <span className="h-px w-8 bg-terminal-border" /> : null}
    </>
  );
}

function SetupHeroCard() {
  return (
    <div className="rounded-md border border-terminal-border bg-[#19191b] p-6">
      <div className="flex gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-md border border-terminal-border bg-[#111113] text-terminal-muted">
          <Code2 size={23} />
        </div>
        <div>
          <h2 className="font-primary text-lg font-medium text-white">Choose the product to improve</h2>
          <p className="mt-2 font-body text-sm leading-relaxed text-terminal-muted">
            Corvin reads the product workspace for you, then turns framework, commands, pages, and analytics needs into a setup packet PMs can use without engineering translation.
          </p>
        </div>
      </div>
    </div>
  );
}

function InstallPanel({ scan, onContinue }: { scan: OnboardingScanResult; onContinue: () => void }) {
  return (
    <div className="mt-8 grid gap-5 rounded-md border border-terminal-border bg-[#19191b] p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <DarkPill tone={scan.validation?.ready === false ? "warning" : "success"}>{scan.validation?.ready === false ? "Needs review" : "exec.md ready"}</DarkPill>
          <h2 className="mt-4 font-primary text-2xl font-medium text-white">Corvin generated the run packet.</h2>
          <p className="mt-2 max-w-prose font-body text-sm leading-relaxed text-terminal-muted">
            The PM does not need an engineering-authored setup file. Corvin saved `exec.md` from the product scan and can now use it as workspace context.
          </p>
        </div>
        <div className="grid size-12 shrink-0 place-items-center rounded-md border border-terminal-border bg-[#111113] text-terminal-muted">
          <FileText size={21} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <DarkFact icon={<Package size={16} />} label="Framework" value={scan.detected.framework} />
        <DarkFact icon={<Terminal size={16} />} label="Verification" value={`${scan.repository.testCommand} + ${scan.repository.buildCommand}`} />
        <DarkFact icon={<Database size={16} />} label="Analytics" value={scan.repository.novusInstalled ? "Novus/Pendo active" : "Analytics pending"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid content-start gap-3">
          {scan.steps.map((step) => (
            <div key={step.id} className="flex gap-3 rounded-md border border-terminal-border bg-[#111113] p-3">
              <div className="grid size-7 shrink-0 place-items-center rounded-full bg-terminal-text text-terminal">
                <Check size={14} />
              </div>
              <div>
                <p className="font-primary text-sm font-medium text-white">{step.label}</p>
                <p className="mt-1 font-body text-xs leading-relaxed text-terminal-muted">{step.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <pre className="max-h-72 overflow-auto rounded-md border border-terminal-border bg-[#0d0d0e] p-4 font-mono text-xs leading-relaxed text-terminal-muted">
          {scan.execMarkdown}
        </pre>
      </div>

      <div className="flex flex-col gap-3 border-t border-terminal-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-body text-sm text-terminal-muted">
          Next: judges can request fixes, features, and experiments for <span className="font-mono text-terminal-text">{scan.repository.label}</span>.
        </p>
        <Button className="min-h-11 bg-terminal-text text-terminal hover:bg-white" onClick={onContinue} icon={<ArrowRight size={16} />}>
          Open PM workbench
        </Button>
      </div>
    </div>
  );
}

function SetupAssistantPanel({
  requester,
  authMode,
  activeStep,
  selectedRepository,
  scan,
}: {
  requester: string;
  authMode: string;
  activeStep: OnboardingStep;
  selectedRepository: OnboardingRepository;
  scan: OnboardingScanResult | null;
}) {
  return (
    <aside className="border-t border-terminal-border bg-[#090909] lg:border-l lg:border-t-0">
      <div className="sticky top-16 grid min-h-[calc(100vh-65px)] content-between">
        <div className="p-5">
          <div className="flex items-center gap-3 border-b border-terminal-border pb-5">
            <img src="/corvin-logo.png" alt="" className="size-8 rounded-md object-cover" />
            <div>
              <p className="font-primary text-sm font-medium text-white">Corvin Setup Assistant</p>
              <p className="font-mono text-[11px] text-terminal-muted">{selectedRepository.label}</p>
            </div>
          </div>

          <div className="mt-5 rounded-md border border-terminal-border bg-[#111113] p-4">
            <div className="mb-3 grid size-9 place-items-center rounded-md bg-[#202022] text-terminal-muted">
              <Bot size={18} />
            </div>
            <p className="font-mono text-sm leading-relaxed text-terminal-text">
              Welcome. I will read the product context, prepare the run packet, and keep setup details out of the product decision.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <DarkQuestion text="Why connect GitHub?" />
              <DarkQuestion text="Who writes exec.md?" />
              <DarkQuestion text="What happens next?" />
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <AssistantRow active={activeStep === "connect"} complete={Boolean(scan)} icon={<Github size={16} />} title="Connect" body="Select the Moriatz Labs product PMs will improve." />
            <AssistantRow active={activeStep === "scan"} complete={Boolean(scan)} icon={<Search size={16} />} title="Scan" body="Infer framework, commands, health URL, pages, and env keys." />
            <AssistantRow active={activeStep === "install"} complete={Boolean(scan)} icon={<FileText size={16} />} title="Install" body="Write exec.md and unlock the PM change workbench." />
          </div>

          <div className="mt-5 rounded-md border border-terminal-border bg-[#111113] p-4">
            <p className="font-primary text-xs font-medium uppercase text-terminal-muted">Signed in as</p>
            <p className="mt-2 break-all font-mono text-xs text-terminal-text">{requester}</p>
            <p className="mt-2 font-body text-xs leading-relaxed text-terminal-muted">{authMode}</p>
          </div>
        </div>

        <div className="border-t border-terminal-border p-5">
          <div className="flex min-h-10 items-center gap-2 rounded-md border border-terminal-border bg-[#202022] px-3 text-terminal-muted">
            <MessageCircle size={15} />
            <span className="font-mono text-xs">Ask about this product...</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function DarkFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-terminal-border bg-[#111113] p-4">
      <div className="mb-3 text-terminal-muted">{icon}</div>
      <p className="font-primary text-xs text-terminal-muted">{label}</p>
      <p className="mt-1 font-mono text-xs leading-relaxed text-terminal-text">{value}</p>
    </div>
  );
}

function AssistantRow({ active, complete, icon, title, body }: { active: boolean; complete: boolean; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className={cn("flex gap-3 rounded-md border p-3", active || complete ? "border-terminal-muted bg-[#18181a]" : "border-terminal-border bg-[#0d0d0e]")}>
      <div className={cn("grid size-8 shrink-0 place-items-center rounded-md", complete ? "bg-terminal-text text-terminal" : "bg-[#202022] text-terminal-muted")}>
        {complete ? <Check size={15} /> : icon}
      </div>
      <div>
        <p className="font-primary text-sm font-medium text-white">{title}</p>
        <p className="mt-1 font-body text-xs leading-relaxed text-terminal-muted">{body}</p>
      </div>
    </div>
  );
}

function DarkPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-primary text-xs font-medium",
        tone === "success" && "border-[#235c55] bg-[#10231f] text-[#9ee5d7]",
        tone === "warning" && "border-[#6b5532] bg-[#241d11] text-[#e7ca8a]",
        tone === "neutral" && "border-terminal-border bg-[#202022] text-terminal-muted",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function DarkQuestion({ text }: { text: string }) {
  return <span className="rounded-md border border-terminal-border bg-[#202022] px-2 py-1 font-mono text-[11px] text-terminal-text">{text}</span>;
}

function JudgeConsole({ requester, authMode }: { requester: string; authMode: string }) {
  const [workspace, setWorkspace] = useState<ShelfmarkWorkspace>(fallbackWorkspace);
  const [githubReady, setGithubReady] = useState(false);
  const [recentRequests, setRecentRequests] = useState<ShelfmarkJudgeRequest[]>([]);
  const [requestBody, setRequestBody] = useState(starterRequest);
  const [result, setResult] = useState<ShelfmarkJudgeRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadWorkspace() {
      try {
        const payload = await api<ShelfmarkWorkspaceResponse>("/api/shelfmark/workspace");
        if (cancelled) return;
        setWorkspace(payload.workspace);
        setGithubReady(payload.githubReady);
        setRecentRequests(payload.requests);
        trackProductEvent("corvin_shelfmark_workspace_loaded", {
          repository: payload.workspace.repo,
          githubReady: payload.githubReady,
          novusInstalled: payload.workspace.novusInstalled,
          recentRequestCount: payload.requests.length,
        });
      } catch {
        if (!cancelled) {
          setWorkspace(fallbackWorkspace);
          setGithubReady(false);
        }
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  const latestRequest = result ?? recentRequests[0] ?? null;
  const canSubmit = requestBody.trim().length >= 12 && !loading;
  const statusTone = latestRequest?.status === "pr-open" ? "success" : latestRequest?.status === "failed" || latestRequest?.status === "blocked" ? "warning" : "neutral";

  async function submitRequest() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/shelfmark/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester, body: requestBody }),
      });
      const payload = (await response.json()) as ShelfmarkJudgeRequest;
      setResult(payload);
      setRecentRequests((current) => [payload, ...current.filter((request) => request.id !== payload.id)]);
      trackProductEvent("corvin_shelfmark_request_submitted", {
        requestLength: requestBody.trim().length,
        status: payload.status,
        hasCloudRun: Boolean(payload.cloudRunUrl),
        hasPullRequest: Boolean(payload.pullRequestUrl),
        changedFileCount: payload.changedFiles.length,
        verificationCount: payload.verification.length,
      });
      if (!response.ok) {
        setError(payload.blockedReason ?? payload.summary ?? "Corvin could not complete the Shelfmark request.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Corvin could not complete the Shelfmark request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:px-8 md:py-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="rounded-md border border-border bg-card p-6 md:p-8">
          <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge tone={githubReady ? "success" : "warning"}>{githubReady ? "GitHub ready" : "GitHub token needed"}</Badge>
                <Badge tone={workspace.novusInstalled ? "success" : "neutral"}>{workspace.novusInstalled ? "Novus installed" : "Novus pending"}</Badge>
                <Badge tone="info">exec.md generated</Badge>
                <Badge tone="info">PR-only review gate</Badge>
              </div>
              <h1 className="max-w-4xl font-primary text-4xl font-medium leading-tight md:text-6xl">
                Decide what Shelfmark should do better.
              </h1>
              <p className="mt-4 max-w-prose font-body text-base leading-relaxed text-muted-foreground">
                Describe the problem, feature, or experiment in plain language. Corvin turns it into a visible product change with checks, screenshot, summary, and pull request.
              </p>
            </div>
            <div className="rounded-md border border-border bg-background p-4">
              <p className="font-primary text-xs text-muted-foreground">Judge</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground">{requester}</p>
              <p className="mt-2 font-body text-xs leading-relaxed text-muted-foreground">{authMode}</p>
            </div>
          </div>

          <div id="request" className="grid gap-4">
            <label className="grid gap-2">
              <span className="font-primary text-sm font-medium">Product request</span>
              <textarea
                className="min-h-44 resize-y rounded-md border border-border bg-background p-4 font-body text-base leading-relaxed text-foreground outline-none transition-colors focus:border-primary"
                value={requestBody}
                onChange={(event) => setRequestBody(event.target.value)}
              />
            </label>
            <div className="grid gap-3 rounded-md border border-border bg-background p-4 md:grid-cols-3">
              <PlainStep icon={<FileText size={17} />} title="Write naturally" body="Ask for copy, flow, UI, empty-state, or clarity improvements." />
              <PlainStep icon={<GitBranch size={17} />} title="Corvin changes Shelfmark" body="The request becomes a visible product update behind a review gate." />
              <PlainStep icon={<GitPullRequest size={17} />} title="Review evidence" body="You get a PR, screenshot, summary, and verification checks for the proposed change." />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button className="min-h-12" onClick={() => void submitRequest()} disabled={!canSubmit} icon={loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}>
                {loading ? "Preparing evidence..." : "Create Shelfmark PR"}
              </Button>
              <p className="font-body text-sm text-muted-foreground">
                Corvin will not merge, deploy, read secrets, or edit environment files.
              </p>
            </div>
            {error ? (
              <div className="rounded-md border border-border bg-muted p-4">
                <p className="font-primary text-sm font-medium">Request needs attention</p>
                <p className="mt-1 font-body text-sm leading-relaxed text-muted-foreground">{error}</p>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Product workspace</CardTitle>
                <CardDescription>The app Corvin will change for judges.</CardDescription>
              </div>
              <div className="grid size-11 place-items-center rounded-md bg-muted text-muted-foreground">
                <BookmarkPlus size={19} />
              </div>
            </CardHeader>
            <div className="grid gap-3">
              <InfoRow label="Product" value={workspace.name} />
              <InfoRow label="Review gate" value="Pull request only" />
              <InfoRow label="Decision path" value="Request -> checks -> screenshot -> PR" />
              <InfoRow label="Checks" value={`${workspace.testCommand} + ${workspace.buildCommand}`} />
              <a className="mt-2 flex min-h-11 items-center justify-between rounded-md border border-border bg-background px-3 py-2 font-primary text-sm text-foreground hover:bg-muted" href={workspace.productionUrl} target="_blank" rel="noreferrer">
                Open Shelfmark
                <ArrowUpRight size={15} />
              </a>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>PM-safe boundaries</CardTitle>
                <CardDescription>Judges get evidence, not unchecked production power.</CardDescription>
              </div>
              <ShieldCheck size={20} className="text-muted-foreground" />
            </CardHeader>
            <div className="grid gap-3">
              <Boundary text="No automatic merge or deploy." />
              <Boundary text="No secret or environment-file changes." />
              <Boundary text="Every accepted request produces reviewable evidence." />
            </div>
          </Card>
        </aside>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Latest outcome</CardTitle>
              <CardDescription>What the judge receives after Corvin finishes the Shelfmark change.</CardDescription>
            </div>
            <Badge tone={statusTone}>{latestRequest?.status ?? "Waiting"}</Badge>
          </CardHeader>
          {latestRequest ? (
            <div className="grid gap-4">
              <OutcomeBlock icon={<FileText size={18} />} title="Summary" body={latestRequest.summary} />
              <div className="grid gap-3 md:grid-cols-3">
                <Metric label="Changed files" value={String(latestRequest.changedFiles.length)} />
                <Metric label="Screenshots" value={String(latestRequest.screenshots.length)} />
                <Metric label="Checks" value={String(latestRequest.verification.length)} />
              </div>
              {latestRequest.pullRequestUrl ? (
                <a className="flex min-h-12 items-center justify-between rounded-md border border-border bg-primary px-4 py-3 font-primary text-sm text-primary-text" href={latestRequest.pullRequestUrl} target="_blank" rel="noreferrer">
                  Open pull request
                  <ArrowUpRight size={16} />
                </a>
              ) : null}
              {latestRequest.cloudRunUrl ? (
                <a className="flex min-h-12 items-center justify-between rounded-md border border-border bg-background px-4 py-3 font-primary text-sm text-foreground hover:bg-muted" href={latestRequest.cloudRunUrl} target="_blank" rel="noreferrer">
                  Open cloud agent run
                  <ArrowUpRight size={16} />
                </a>
              ) : null}
              <div className="grid gap-2">
                {latestRequest.screenshots.map((screenshot) => (
                  <a key={screenshot} className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 font-primary text-sm text-foreground hover:bg-muted" href={screenshot} target="_blank" rel="noreferrer">
                    <Camera size={16} />
                    Screenshot evidence
                  </a>
                ))}
                {latestRequest.verification.map((item) => (
                  <p key={item} className="rounded-md border border-border bg-background p-3 font-mono text-xs text-muted-foreground">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <EmptyOutcome />
          )}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent judge requests</CardTitle>
              <CardDescription>Quick scan for repeated review attempts.</CardDescription>
            </div>
          </CardHeader>
          <div className="grid gap-3">
            {recentRequests.slice(0, 4).map((request) => (
              <div key={request.id} className="rounded-md border border-border bg-background p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge tone={request.status === "pr-open" ? "success" : request.status === "blocked" || request.status === "failed" ? "warning" : "neutral"}>
                    {request.status}
                  </Badge>
                  <span className="font-mono text-[11px] text-muted-foreground">{request.id}</span>
                </div>
                <p className="line-clamp-3 font-body text-sm leading-relaxed text-muted-foreground">{request.body}</p>
              </div>
            ))}
            {recentRequests.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-background p-4 font-body text-sm leading-relaxed text-muted-foreground">
                No judge requests yet. Submit one above to create review evidence.
              </p>
            ) : null}
          </div>
        </Card>
      </section>
    </main>
  );
}

function PlainStep({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-md bg-card text-muted-foreground">{icon}</div>
      <div>
        <p className="font-primary text-sm font-medium">{title}</p>
        <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="font-primary text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-mono text-xs text-foreground">{value}</p>
    </div>
  );
}

function Boundary({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 font-body text-sm leading-relaxed text-muted-foreground">
      <CheckCircle2 className="mt-0.5 shrink-0 text-foreground" size={16} />
      {text}
    </div>
  );
}

function OutcomeBlock({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-border bg-background p-4">
      <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">{icon}</div>
      <div>
        <p className="font-primary text-sm font-medium">{title}</p>
        <p className="mt-1 font-body text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <p className="font-primary text-2xl font-medium">{value}</p>
      <p className="mt-1 font-body text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyOutcome() {
  return (
    <div className="rounded-md border border-dashed border-border bg-background p-8 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-md bg-muted text-muted-foreground">
        <GitPullRequest size={20} />
      </div>
      <p className="mt-4 font-primary text-lg font-medium">No PR evidence yet</p>
      <p className="mx-auto mt-2 max-w-prose font-body text-sm leading-relaxed text-muted-foreground">
        Once a judge submits a request, Corvin will show the resulting pull request, screenshot, checks, and summary here.
      </p>
    </div>
  );
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (await response.json()) as T;
}
