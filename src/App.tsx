import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/clerk-react";
import {
  ArrowUpRight,
  BookmarkPlus,
  Camera,
  CheckCircle2,
  FileText,
  GitBranch,
  GitPullRequest,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
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

const fallbackWorkspace: ShelfmarkWorkspace = {
  id: "shelfmark",
  name: "Shelfmark",
  repo: "Paul-M-Kallarackal/shelfmark",
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

export default function App() {
  if (window.location.pathname.replace(/\/+$/, "") === "/demo") {
    return <DemoApp />;
  }

  return <CorvinProductConsole />;
}

function CorvinProductConsole() {
  const clerkConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
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
        <JudgeConsole requester="judge@local" authMode="Local review mode. Configure Clerk before public judging." />
      )}
    </div>
  );
}

function SignedInConsole() {
  const { user } = useUser();
  const requester = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "judge@local";
  return <JudgeConsole requester={requester} authMode="Signed in with Clerk." />;
}

function Header() {
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
            <p className="font-body text-xs text-muted-foreground">PM change workbench</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            className="hidden min-h-10 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 font-primary text-sm text-foreground transition-colors hover:bg-muted sm:flex"
            href="/demo"
          >
            Demo archive
            <ArrowUpRight size={15} />
          </a>
          {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? <UserButton afterSignOutUrl="/" /> : null}
        </div>
      </div>
    </header>
  );
}

function SignedOutGate() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-5xl place-items-center px-4 py-16 md:px-8">
      <Card className="w-full max-w-2xl p-8">
        <CardHeader>
          <div>
            <Badge tone="warning">Judge sign-in required</Badge>
            <CardTitle className="mt-5 text-3xl">Request a real Shelfmark product change.</CardTitle>
            <CardDescription>
              Corvin needs your judge identity before it can create an auditable branch, screenshot, summary, and pull request.
            </CardDescription>
          </div>
          <div className="grid size-12 place-items-center rounded-md bg-muted text-muted-foreground">
            <Lock size={21} />
          </div>
        </CardHeader>
        <SignInButton mode="modal">
          <Button className="min-h-12" icon={<ShieldCheck size={16} />}>
            Sign in with Clerk
          </Button>
        </SignInButton>
      </Card>
    </main>
  );
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
                <Badge tone="info">PR-only review gate</Badge>
              </div>
              <h1 className="max-w-4xl font-primary text-4xl font-medium leading-tight md:text-6xl">
                Tell Corvin what Shelfmark should do better.
              </h1>
              <p className="mt-4 max-w-prose font-body text-base leading-relaxed text-muted-foreground">
                Corvin turns a product-manager request into a reviewable repository change: branch, checks, screenshot, summary, and pull request.
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
              <PlainStep icon={<GitBranch size={17} />} title="Corvin edits Shelfmark" body="The request lands in the real Shelfmark repository on a branch." />
              <PlainStep icon={<GitPullRequest size={17} />} title="Review evidence" body="You get a PR, screenshot, summary, and verification checks." />
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
              <InfoRow label="Repository" value={workspace.repo} />
              <InfoRow label="Branch base" value={workspace.defaultBranch} />
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
              <Boundary text="Every accepted request produces a reviewable PR." />
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
