import {
  ArrowRight,
  Check,
  ClipboardCheck,
  ExternalLink,
  Eye,
  Github,
  LayoutDashboard,
  QrCode,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { useMemo, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { cn } from "./lib/utils";
import { createDemoModeState } from "./shared/demo";
import type { Integration, JobRunState, MvpState } from "./shared/types";

type DemoStage = "connect" | "request" | "jobs" | "review";

const stageOrder: DemoStage[] = ["connect", "request", "jobs", "review"];

const stageLabels: Record<DemoStage, string> = {
  connect: "Connect",
  request: "Request",
  jobs: "Jobs",
  review: "Review",
};

const screenshotPairs = [
  {
    label: "Before",
    title: "Original checkout page",
    detail: "The headline explained who the product was for, but not what the customer would see before paying.",
    src: "/demo/checkout-before.png",
    alt: "Checkout page before the requested headline change",
  },
  {
    label: "After",
    title: "Updated checkout page",
    detail: "The revised headline makes the payment review moment clear before the customer completes checkout.",
    src: "/demo/checkout-preview.png",
    alt: "Checkout page after the requested headline change",
  },
];

const demoExecMarkdown = `# exec.md

## Purpose
Run Corvin Demo App locally for PM review of the checkout headline request.

## Repositories
\`\`\`yaml
repositories:
  - id: frontend
    repo: Paul-M-Kallarackal/corvin-demo-app-frontend
    role: React/Vite customer checkout and PM-visible product surface for the demo app.
    install: npm install
    dev: npm run dev -- --host 0.0.0.0
    health: http://localhost:5173
  - id: backend
    repo: Paul-M-Kallarackal/corvin-demo-app-backend
    role: Express/Node checkout summary and health API for the demo app.
    install: npm install
    dev: npm run dev
    health: http://localhost:3000/health
\`\`\`

## Environment
\`\`\`yaml
global:
  - name: VITE_API_BASE_URL
    required: true
    description: Local backend API URL used by the frontend app.
  - name: PORT
    required: true
    description: Local backend API port.
  - name: WHATSAPP_VERIFY_TOKEN
    required: true
    description: WhatsApp webhook verification token.
perRepo: {}
\`\`\`

## Local Run Notes
This demo packet is already approved for the checkout headline walkthrough. Corvin uses it to sync the public frontend and backend repositories, check environment readiness, start services, and package before-and-after evidence for PM review.`;

export default function App() {
  const demoState = useMemo(() => createDemoModeState(), []);
  const [connectedCards, setConnectedCards] = useState<Integration["id"][]>([]);
  const [activeStage, setActiveStage] = useState<DemoStage>("connect");
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const [whatsAppStatus, setWhatsAppStatus] = useState<"loading" | "scanning" | "connected">("loading");
  const [whatsAppQrImage, setWhatsAppQrImage] = useState("");
  const [githubOpen, setGithubOpen] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set(["frontend", "backend"]));

  const activeStageIndex = stageOrder.indexOf(activeStage);
  const jobVisible = activeStageIndex >= stageOrder.indexOf("jobs");
  const connectedSet = new Set(activeStageIndex > 0 ? demoState.integrations.map((item) => item.id) : connectedCards);
  const visibleState: MvpState = jobVisible ? demoState : { ...demoState, jobs: [] };
  const latestJob = visibleState.jobs[0];
  const nextStage = stageOrder[Math.min(activeStageIndex + 1, stageOrder.length - 1)];
  const nextLabel = activeStage === "review" ? "End of demo" : `Next: ${stageLabels[nextStage]}`;
  const canAdvance = activeStage !== "connect" || connectedSet.size === demoState.integrations.length;

  function connectCard(id: Integration["id"]) {
    if (connectedSet.has(id)) return;
    if (id === "whatsapp") {
      setWhatsAppOpen(true);
      setWhatsAppStatus("loading");
      void loadWhatsAppQr();
      window.setTimeout(() => {
        setWhatsAppStatus("connected");
        setConnectedCards((current) => (current.includes("whatsapp") ? current : [...current, "whatsapp"]));
      }, 3000);
      return;
    }
    if (id === "github") {
      setGithubOpen(true);
      setGithubConnected(false);
      return;
    }
    setConnectedCards((current) => (current.includes(id) ? current : [...current, id]));
  }

  async function loadWhatsAppQr() {
    const fallback = await QRCode.toDataURL(`${window.location.origin}/webhooks/whatsapp?demo=corvin`, {
      margin: 2,
      width: 320,
    });
    setWhatsAppQrImage(fallback);
    setWhatsAppStatus("scanning");

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 1800);
      const response = await fetch("/api/integrations/whatsapp/connect", { signal: controller.signal });
      window.clearTimeout(timeout);
      if (!response.ok) return;
      const connect = (await response.json()) as { qrImageUrl?: string };
      if (connect.qrImageUrl) {
        setWhatsAppQrImage(connect.qrImageUrl);
      }
    } catch {
      // The demo falls back to the live webhook QR when the linked-device QR is not available.
    }
  }

  function authorizeGithub() {
    if (selectedRepos.size === 0) return;
    setGithubConnected(true);
    setConnectedCards((current) => (current.includes("github") ? current : [...current, "github"]));
  }

  function toggleRepository(repositoryId: string) {
    setSelectedRepos((current) => {
      const next = new Set(current);
      if (next.has(repositoryId)) {
        next.delete(repositoryId);
      } else {
        next.add(repositoryId);
      }
      return next;
    });
  }

  function goNext() {
    if (!canAdvance) return;
    const nextIndex = Math.min(stageOrder.indexOf(activeStage) + 1, stageOrder.length - 1);
    setActiveStage(stageOrder[nextIndex]);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar activeStage={activeStage} setActiveStage={setActiveStage} />
        <main id="content" className="min-w-0">
          <section className="border-b border-border bg-card px-4 py-8 md:px-8 lg:px-10">
            <div className="mx-auto flex max-w-7xl flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Badge tone="success">Demo route</Badge>
                  <Badge tone="info">{`Step ${activeStageIndex + 1} of ${stageOrder.length}`}</Badge>
                </div>
                <h1 className="font-primary text-4xl font-medium leading-tight md:text-6xl">
                  Corvin request flow walkthrough.
                </h1>
                <p className="mt-4 max-w-prose font-body text-base leading-relaxed text-muted-foreground md:text-lg">
                  Follow one prepared PM request from connected channels to a visual before-and-after review.
                  The walkthrough keeps the implementation details in the background and shows the product impact.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row xl:justify-end">
                <Button
                  data-testid="next-demo-step"
                  className="min-h-12"
                  onClick={goNext}
                  disabled={activeStage === "review" || !canAdvance}
                  icon={<ArrowRight size={17} />}
                >
                  {nextLabel}
                </Button>
              </div>
            </div>
          </section>

          <section className="px-4 py-8 md:px-8 md:py-10 lg:px-10">
            <div className="mx-auto grid max-w-7xl gap-8">
              <StageTabs activeStage={activeStage} setActiveStage={setActiveStage} />

              {activeStage === "connect" ? (
                <ConnectStage
                  state={demoState}
                  connectedSet={connectedSet}
                  onConnect={connectCard}
                />
              ) : null}

              {activeStage === "request" ? (
                <RequestStage state={demoState} />
              ) : null}

              {activeStage === "jobs" ? <JobsStage latestJob={latestJob} /> : null}

              {activeStage === "review" ? <ReviewStage state={visibleState} latestJob={latestJob} /> : null}
            </div>
          </section>
        </main>
      </div>
      {whatsAppOpen ? (
        <WhatsAppDemoModal
          qrImage={whatsAppQrImage}
          status={whatsAppStatus}
          onClose={() => setWhatsAppOpen(false)}
        />
      ) : null}
      {githubOpen ? (
        <GitHubDemoModal
          repositories={demoState.workspace.repositories}
          selectedRepos={selectedRepos}
          connected={githubConnected}
          onToggleRepository={toggleRepository}
          onAuthorize={authorizeGithub}
          onClose={() => setGithubOpen(false)}
        />
      ) : null}
    </div>
  );
}

function Sidebar({
  activeStage,
  setActiveStage,
}: {
  activeStage: DemoStage;
  setActiveStage: (stage: DemoStage) => void;
}) {
  const activeStageIndex = stageOrder.indexOf(activeStage);

  return (
    <aside className="border-b border-border bg-card px-4 py-5 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5">
      <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:p-3" href="#content">
        Skip to content
      </a>
      <div className="flex items-center gap-3">
        <img src="/corvin-logo.png" alt="Corvin" className="size-11 rounded-md border border-border object-cover" />
        <div>
          <p className="font-primary text-lg font-medium">Corvin</p>
          <p className="font-body text-xs text-muted-foreground">Request demo</p>
        </div>
      </div>

      <nav className="mt-8 grid gap-2" aria-label="Sidebar">
        <button
          className="flex min-h-12 items-center justify-between rounded-md bg-primary px-3 py-2 text-left font-primary text-sm text-primary-text"
          onClick={() => setActiveStage("connect")}
        >
          <span className="flex items-center gap-2">
            <LayoutDashboard size={17} />
            Demo
          </span>
          {activeStageIndex > 0 ? <Check size={15} /> : null}
        </button>
        {stageOrder.map((stage) => (
          <button
            key={stage}
            data-testid={`sidebar-${stage}`}
            className={cn(
              "flex min-h-12 items-center justify-between rounded-md px-3 py-2 text-left font-primary text-sm transition-colors",
              activeStage === stage ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => setActiveStage(stage)}
          >
            <span>{stageLabels[stage]}</span>
            {stageOrder.indexOf(stage) < activeStageIndex ? <Check size={15} /> : null}
          </button>
        ))}
      </nav>

      <div className="mt-8 rounded-md border border-border bg-background p-4">
        <p className="font-primary text-sm font-medium">Demo route</p>
        <p className="mt-2 font-body text-xs leading-relaxed text-muted-foreground">
          Use Next to move through the prepared request review.
        </p>
      </div>
    </aside>
  );
}

function StageTabs({
  activeStage,
  setActiveStage,
}: {
  activeStage: DemoStage;
  setActiveStage: (stage: DemoStage) => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-border bg-card p-2 md:grid-cols-4">
      {stageOrder.map((stage, index) => (
        <button
          key={stage}
          className={cn(
            "flex min-h-12 items-center justify-between rounded-md px-4 py-3 text-left font-primary text-sm transition-colors",
            activeStage === stage ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          onClick={() => setActiveStage(stage)}
        >
          <span>{stageLabels[stage]}</span>
          <span className="font-mono text-xs">{String(index + 1).padStart(2, "0")}</span>
        </button>
      ))}
    </div>
  );
}

function ConnectStage({
  state,
  connectedSet,
  onConnect,
}: {
  state: MvpState;
  connectedSet: Set<Integration["id"]>;
  onConnect: (id: Integration["id"]) => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Connectors</CardTitle>
            <CardDescription>Match the main app setup: connect the sources Corvin needs before reviewing the request.</CardDescription>
          </div>
          <Badge tone={connectedSet.size === state.integrations.length ? "success" : "warning"}>
            {connectedSet.size === state.integrations.length ? "Ready" : "Needs setup"}
          </Badge>
        </CardHeader>
        <div className="grid gap-3">
          {state.integrations.map((integration) => (
            <DemoConnectorRow
              key={integration.id}
              integration={integration}
              connected={connectedSet.has(integration.id)}
              onConnect={() => onConnect(integration.id)}
            />
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>What this unlocks</CardTitle>
            <CardDescription>The request can be reviewed visually once the sources are connected.</CardDescription>
          </div>
        </CardHeader>
        <img
          src="/demo/workflow-summary.png"
          alt="PM-friendly workflow summary showing request captured, preview prepared, review ready, and deployment handoff"
          className="w-full rounded-md border border-border bg-background object-cover"
          loading="lazy"
        />
        <div className="mt-5 grid gap-3">
          <OutcomeRow label="Request source" value="WhatsApp message captured from the PM channel." />
          <OutcomeRow label="Product context" value="The relevant checkout context is attached behind the scenes." />
          <OutcomeRow label="Review format" value="The walkthrough shows screenshots and outcomes instead of internal details." />
        </div>
        <div className="mt-5 border-t border-border pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-primary text-sm font-medium">Demo execution packet</p>
            <Badge tone="info">Hardcoded</Badge>
          </div>
          <div className="grid gap-2">
            {state.workspace.repositories.map((repository) => (
              <div key={repository.id} className="rounded-md border border-border bg-background p-3">
                <p className="font-primary text-xs font-medium">{repository.label}</p>
                <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
                  {repository.sourceRef.replace(/^synced-repo:\/\//, "")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function DemoConnectorRow({
  integration,
  connected,
  onConnect,
}: {
  integration: Integration;
  connected: boolean;
  onConnect: () => void;
}) {
  const icon = integration.id === "github" ? <Github size={18} /> : integration.id === "whatsapp" ? <ShieldCheck size={18} /> : <Terminal size={18} />;
  return (
    <button
      data-testid={`connect-${integration.id}`}
      className="grid gap-3 rounded-md border border-border bg-background p-4 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:grid-cols-[1fr_auto] md:items-center"
      onClick={onConnect}
    >
      <div className="flex gap-3">
        <div className={cn("grid size-10 shrink-0 place-items-center rounded-md", connected ? "bg-primary text-primary-text" : "bg-muted text-muted-foreground")}>
          {icon}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-primary text-sm font-medium">{integration.label}</p>
            <Badge tone={connected ? "success" : "neutral"}>{connected ? "Connected" : "Empty"}</Badge>
          </div>
          <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">
            {connected ? connectorReadyText(integration.id) : connectorEmptyText(integration.id)}
          </p>
        </div>
      </div>
      <span className="font-primary text-xs text-muted-foreground">{connected ? "Ready" : "Connect"}</span>
    </button>
  );
}

function RequestStage({
  state,
}: {
  state: MvpState;
}) {
  const request = state.requests[0];
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="grid min-w-0 gap-6">
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Execution packet</CardTitle>
              <CardDescription>
                The demo starts with a prepared exec.md so the request already has repository, environment, and run context.
              </CardDescription>
            </div>
            <Badge tone="success">Loaded</Badge>
          </CardHeader>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
          <OutcomeRow label="Repos" value="Frontend and backend repositories are already mapped to the checkout workspace." />
            <OutcomeRow label="Setup" value="Required environment keys and health checks are listed before the job starts." />
            <OutcomeRow label="Preview" value="Corvin can prepare the before-and-after review without asking the PM for setup details." />
          </div>
          <pre className="max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted p-4 font-mono text-xs leading-relaxed text-foreground">
            <code>{demoExecMarkdown}</code>
          </pre>
        </Card>

        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Prepared change request</CardTitle>
              <CardDescription>This is the request used for the walkthrough. It is read-only because the demo job is already prepared.</CardDescription>
            </div>
            <Badge tone="success">Job complete</Badge>
          </CardHeader>
          <label className="grid gap-2">
            <span className="font-primary text-xs font-medium text-muted-foreground">Request type</span>
            <input
              className="rounded-md border border-border bg-muted px-3 py-3 font-primary text-sm text-foreground"
              value={request.title}
              readOnly
            />
          </label>
          <label className="mt-4 grid gap-2">
            <span className="font-primary text-xs font-medium text-muted-foreground">Requested change</span>
            <textarea
              className="min-h-36 resize-none rounded-md border border-border bg-muted p-3 font-body text-sm leading-relaxed text-foreground"
              value={request.body}
              readOnly
            />
          </label>
          <Button data-testid="request-complete" className="mt-5 w-full" disabled>
            Request already completed
          </Button>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Starting point</CardTitle>
            <CardDescription>The before screenshot shows the checkout page before the requested copy update.</CardDescription>
          </div>
          <Badge tone="warning">Before</Badge>
        </CardHeader>
        <ScreenshotCard image={screenshotPairs[0]} />
        <div className="mt-5 grid gap-3">
          <OutcomeRow label="Request" value="Change the checkout headline so customers know they can review charges before paying." />
          <OutcomeRow label="Context loaded" value="The prepared exec.md gives Corvin the repo and run context before any job evidence is shown." />
          <OutcomeRow label="Next review" value="The next step shows the visual change, job status, and before-and-after screenshots." />
        </div>
      </Card>
    </div>
  );
}

function JobsStage({
  latestJob,
}: {
  latestJob?: JobRunState;
}) {
  if (!latestJob) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Job evidence is waiting</CardTitle>
            <CardDescription>Use Next from the request stage to reveal the prepared visual preview and review notes.</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Visual change prepared</CardTitle>
            <CardDescription>The job is already complete. Review the visible page impact before looking at the handoff.</CardDescription>
          </div>
          <Badge tone="success">{latestJob.status}</Badge>
        </CardHeader>
        <ScreenshotCompare />
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <OutcomeCard title="Request captured" detail="The PM asked for clearer checkout copy around reviewing charges before payment." />
        <OutcomeCard title="Preview prepared" detail="Corvin prepared a visible checkout preview with the revised headline." />
        <OutcomeCard title="Ready to review" detail="The job output is packaged as screenshots and a short product summary." />
      </div>
    </div>
  );
}

function ScreenshotCompare() {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {screenshotPairs.map((image) => (
        <ScreenshotCard key={image.label} image={image} />
      ))}
    </div>
  );
}

function ScreenshotCard({ image }: { image: (typeof screenshotPairs)[number] }) {
  return (
    <figure className="overflow-hidden rounded-md border border-border bg-background">
      <img src={image.src} alt={image.alt} className="w-full object-cover" loading="lazy" />
      <figcaption className="border-t border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="font-primary text-sm font-medium">{image.title}</p>
          <Badge tone={image.label === "After" ? "success" : "warning"}>{image.label}</Badge>
        </div>
        <p className="font-body text-xs leading-relaxed text-muted-foreground">{image.detail}</p>
      </figcaption>
    </figure>
  );
}

function OutcomeCard({ title, detail }: { title: string; detail: string }) {
  return (
    <Card>
      <div className="mb-4 grid size-10 place-items-center rounded-md bg-muted text-foreground">
        <ClipboardCheck size={18} />
      </div>
      <p className="font-primary text-sm font-medium">{title}</p>
      <p className="mt-2 font-body text-sm leading-relaxed text-muted-foreground">{detail}</p>
    </Card>
  );
}

function ReviewStage({
  state,
  latestJob,
}: {
  state: MvpState;
  latestJob?: JobRunState;
}) {
  if (!latestJob) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Final steps are waiting</CardTitle>
            <CardDescription>Use Next from the job stage to populate review evidence and deployment status.</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Final review</CardTitle>
              <CardDescription>The requested checkout copy is ready to review visually before handoff.</CardDescription>
            </div>
            <Badge tone="success">Ready</Badge>
          </CardHeader>
          <ScreenshotCompare />
        </Card>

        <div className="grid gap-6 md:grid-cols-3">
          <OutcomeCard title="Before" detail="The original page positioned checkout for teams, but did not explain the payment review moment." />
          <OutcomeCard title="After" detail="The updated page explains that charges can be reviewed before the customer pays." />
          <OutcomeCard title="Status" detail="The preview is ready for PM review and engineering handoff." />
        </div>
      </div>

      <div className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Review notes</CardTitle>
              <CardDescription>Plain-language summary for the PM review.</CardDescription>
            </div>
          </CardHeader>
          <div className="grid gap-3">
            <OutcomeRow label="What changed" value={latestJob.reviewPackage?.fixed ?? "The checkout headline now explains the charge review step."} />
            <OutcomeRow label="What to check" value="Confirm that the new headline matches the customer-facing promise before release." />
            <OutcomeRow label="Handoff" value="The prepared change can move to engineering review after PM sign-off." />
            {latestJob.pullRequests[0] ? (
              <a
                className="group grid gap-3 rounded-md border border-primary bg-primary p-4 text-primary-text shadow-sm transition-colors hover:bg-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                href={latestJob.pullRequests[0].url}
                target="_blank"
                rel="noreferrer"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 font-primary text-sm font-medium">
                    <Github size={17} />
                    GitHub PR demo
                  </span>
                  <ExternalLink size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
                <span className="font-body text-xs leading-relaxed text-primary-text/80">
                  Open the prepared PR with the checkout copy change and review handoff.
                </span>
              </a>
            ) : null}
          </div>
        </Card>
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Deployment state</CardTitle>
              <CardDescription>Where the prepared change is visible in the walkthrough.</CardDescription>
            </div>
          </CardHeader>
          <div className="grid gap-3">
            {[state.deployment.local, state.deployment.staging, state.deployment.production].map((environment) => (
              <div key={environment.id} className="rounded-md border border-border bg-background p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="font-primary text-sm font-medium">{environment.label}</p>
                  <Badge tone={environment.status === "live" || environment.status === "ready" ? "success" : "neutral"}>
                    {environment.status}
                  </Badge>
                </div>
                <p className="font-body text-xs leading-relaxed text-muted-foreground">{environment.headline}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function WhatsAppDemoModal({
  qrImage,
  status,
  onClose,
}: {
  qrImage: string;
  status: "loading" | "scanning" | "connected";
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <div className="w-full max-w-2xl rounded-md border border-border bg-card p-5 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 font-primary text-sm text-muted-foreground">
              <QrCode size={16} />
              WhatsApp linked device
            </div>
            <h2 className="font-primary text-xl font-medium">Scan the demo QR</h2>
            <p className="mt-1 font-body text-sm leading-relaxed text-muted-foreground">
              The connector waits briefly on this screen before marking the inbox connected.
            </p>
          </div>
          <button
            className="grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close WhatsApp demo QR"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-5 md:grid-cols-[360px_minmax(0,1fr)]">
          <div className="grid min-h-[360px] place-items-center rounded-md border border-border bg-background p-4">
            {qrImage ? (
              <img src={qrImage} alt="WhatsApp demo QR code" className="size-[320px] max-w-full rounded-md bg-white p-3" />
            ) : (
              <div className="grid size-[320px] place-items-center rounded-md bg-muted font-primary text-sm text-muted-foreground">
                Loading QR
              </div>
            )}
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <Badge tone={status === "connected" ? "success" : "info"}>
              {status === "connected" ? "Connected" : status === "loading" ? "Loading QR" : "Waiting for scan"}
            </Badge>
            <div className="mt-5 grid gap-3">
              <OutcomeRow label="Step 1" value="Open WhatsApp linked devices." />
              <OutcomeRow label="Step 2" value="Scan the QR shown here." />
              <OutcomeRow
                label="Step 3"
                value={status === "connected" ? "Inbox connected for the walkthrough." : "The demo marks this connected after 3 seconds."}
              />
            </div>
            {status === "connected" ? (
              <Button className="mt-5 w-full" onClick={onClose}>
                Continue
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function GitHubDemoModal({
  repositories,
  selectedRepos,
  connected,
  onToggleRepository,
  onAuthorize,
  onClose,
}: {
  repositories: MvpState["workspace"]["repositories"];
  selectedRepos: Set<string>;
  connected: boolean;
  onToggleRepository: (repositoryId: string) => void;
  onAuthorize: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <div className="w-full max-w-3xl rounded-md border border-border bg-card p-5 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 font-primary text-sm text-muted-foreground">
              <Github size={16} />
              GitHub OAuth
            </div>
            <h2 className="font-primary text-xl font-medium">Authorize repository access</h2>
            <p className="mt-1 font-body text-sm leading-relaxed text-muted-foreground">
              Pick the repositories Corvin can read for this prepared checkout request.
            </p>
          </div>
          <button
            className="grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close GitHub OAuth demo"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="grid gap-3">
            {repositories.map((repository) => {
              const checked = selectedRepos.has(repository.id);
              return (
                <label
                  key={repository.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-md border border-border bg-background p-4 transition-colors hover:bg-muted",
                    checked && "border-primary",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleRepository(repository.id)}
                    className="mt-1 size-4 accent-primary"
                  />
                  <div>
                    <p className="font-primary text-sm font-medium">{repository.sourceRef.replace("synced-repo://", "")}</p>
                    <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">{repository.purpose}</p>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <Badge tone={connected ? "success" : "info"}>{connected ? "Connected" : "OAuth review"}</Badge>
            <div className="mt-5 grid gap-3">
              <OutcomeRow label="Account" value={connected ? "Connected as maya-product" : "Continue as maya-product"} />
              <OutcomeRow label="Scope" value="Read repository context and prepare review handoff." />
              <OutcomeRow label="Selected" value={`${selectedRepos.size} repositories selected.`} />
            </div>
            <Button
              className="mt-5 w-full"
              onClick={connected ? onClose : onAuthorize}
              disabled={!connected && selectedRepos.size === 0}
              icon={connected ? undefined : <ExternalLink size={16} />}
            >
              {connected ? "Continue" : "Authorize selected repositories"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OutcomeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-border bg-background p-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-foreground">
        <Eye size={15} />
      </div>
      <div>
        <p className="font-primary text-xs font-medium text-foreground">{label}</p>
        <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

function connectorEmptyText(id: Integration["id"]) {
  if (id === "whatsapp") return "Connect a WhatsApp inbox so PM messages can become requests.";
  if (id === "github") return "Connect GitHub so Corvin can attach product context.";
  return "Enable the runner so the prepared preview can be reviewed.";
}

function connectorReadyText(id: Integration["id"]) {
  if (id === "whatsapp") return "WhatsApp request source is ready for the walkthrough.";
  if (id === "github") return "Repository context is attached for the checkout surface.";
  return "Preview runner is ready for the prepared request.";
}
