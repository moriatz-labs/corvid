import {
  CheckCircle2,
  Database,
  ExternalLink,
  Github,
  Globe2,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  QrCode,
  Rocket,
  Play,
  RefreshCw,
  ScrollText,
  Settings,
  Square,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Progress } from "./components/ui/progress";
import { createInitialState } from "./shared/demo";
import type {
  AppEnvironment,
  BlueprintStep,
  DeploymentDemoState,
  Integration,
  MvpState,
  OpenAIChangePlan,
  PMRequest,
  ServiceConfig,
  WhatsAppConnect,
} from "./shared/types";

const fallbackState = createInitialState();

export default function App() {
  const [state, setState] = useState<MvpState>(fallbackState);
  const [loading, setLoading] = useState<string | null>(null);
  const [requestBody, setRequestBody] = useState("Change the checkout headline to make the offer clearer.");
  const [requestType, setRequestType] = useState("Copy change");
  const [apiAvailable, setApiAvailable] = useState(false);
  const [whatsAppConnect, setWhatsAppConnect] = useState<WhatsAppConnect | null>(null);
  const [whatsAppQrOpen, setWhatsAppQrOpen] = useState(false);
  const [githubPolling, setGithubPolling] = useState(false);

  const completedSteps = useMemo(
    () => state.steps.filter((step) => step.status === "succeeded").length,
    [state.steps],
  );
  const progress = Math.round((completedSteps / state.steps.length) * 100);

  useEffect(() => {
    void refreshState();
  }, []);

  async function refreshState() {
    try {
      const next = await api<MvpState>("/api/state");
      setApiAvailable(true);
      setState(next);
    } catch {
      setApiAvailable(false);
      setState(fallbackState);
    }
  }

  async function runAction<T>(label: string, action: () => Promise<T>, onSuccess?: (result: T) => void) {
    setLoading(label);
    try {
      const result = await action();
      onSuccess?.(result);
      await refreshState();
    } finally {
      setLoading(null);
    }
  }

  async function connectWhatsApp() {
    await runAction(
      "whatsapp",
      () => api<WhatsAppConnect>("/api/integrations/whatsapp/connect"),
      (connect) => {
        setWhatsAppConnect(connect);
        setWhatsAppQrOpen(true);
      },
    );
  }

  useEffect(() => {
    if (!whatsAppConnect || whatsAppConnect.connected || !["connecting", "qr"].includes(whatsAppConnect.status)) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshWhatsAppStatus();
    }, 2000);

    return () => window.clearInterval(timer);
  }, [whatsAppConnect]);

  async function refreshWhatsAppStatus() {
    const next = await api<WhatsAppConnect>("/api/integrations/whatsapp/status");
    setWhatsAppConnect(next);
    if (next.connected) {
      await refreshState();
    }
  }

  async function refreshWhatsAppQr() {
    await runAction(
      "whatsapp-refresh",
      () => api<WhatsAppConnect>("/api/integrations/whatsapp/refresh", { method: "POST" }),
      (connect) => {
        setWhatsAppConnect(connect);
        setWhatsAppQrOpen(true);
      },
    );
  }

  async function connectGitHub() {
    await runAction("github", async () => {
      const response = await api<{ configured: boolean; url?: string; message?: string }>(
        "/api/integrations/github/authorize",
      );
      if (response.configured && response.url) {
        window.open(response.url, "_blank", "noopener,noreferrer");
        setGithubPolling(true);
        return response;
      }
      window.alert(response.message ?? "GitHub App OAuth is not configured.");
      return response;
    });
  }

  useEffect(() => {
    if (!githubPolling) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshGitHubStatus();
    }, 2000);

    return () => window.clearInterval(timer);
  }, [githubPolling]);

  async function refreshGitHubStatus() {
    const status = await api<{ connected: boolean; error?: string }>("/api/integrations/github/status");
    if (status.connected || status.error) {
      setGithubPolling(false);
      await refreshState();
    }
  }

  async function runWorkspace() {
    await runAction("run", () => api<MvpState>("/api/workspace/run", { method: "POST" }), setState);
  }

  async function stopWorkspace(removeVolumes = false) {
    if (removeVolumes) {
      const confirmed = window.confirm("Stop workspace and remove local volumes? This is destructive.");
      if (!confirmed) {
        return;
      }
    }
    await runAction("stop", () => api<MvpState>("/api/workspace/stop", { method: "POST" }), setState);
  }

  async function submitRequest() {
    await runAction("request", () =>
      api<PMRequest>("/api/requests", {
        method: "POST",
        body: JSON.stringify({
          title: requestType,
          body: requestBody,
          requester: "pm@acme.local",
        }),
      }),
    );
  }

  async function generateOpenAIPlan() {
    await runAction(
      "openai",
      () =>
        api<OpenAIChangePlan>("/api/openai/change-plan", {
          method: "POST",
          body: JSON.stringify({ requestBody }),
        }),
      (plan) => setState((current) => ({ ...current, openAI: { ...current.openAI, lastPlan: plan } })),
    );
  }

  async function deployStaging() {
    await runAction(
      "staging",
      () =>
        api<DeploymentDemoState>("/api/deploy/staging", {
          method: "POST",
          body: JSON.stringify({
            requestId: state.requests[0]?.id,
            headline: state.openAI.lastPlan?.recommendedHeadline,
          }),
        }),
      (deployment) => setState((current) => ({ ...current, deployment })),
    );
  }

  async function deployProduction() {
    await runAction(
      "production",
      () => api<DeploymentDemoState>("/api/deploy/production", { method: "POST" }),
      (deployment) => setState((current) => ({ ...current, deployment })),
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-r border-border bg-card px-4 py-5 lg:min-h-screen">
          <div className="mb-8 flex items-center gap-3">
            <img
              src="/corvin-logo.png"
              alt="Corvin"
              className="size-10 rounded-lg border border-border object-cover shadow-sm"
            />
            <div>
              <p className="font-primary text-base font-medium">Corvin</p>
              <p className="font-body text-xs text-muted-foreground">Agentic autonomy for PM's</p>
            </div>
          </div>
          <nav className="grid gap-1">
            {[
              ["Workspaces", LayoutDashboard],
              ["Runs", Play],
              ["Instructions", ScrollText],
              ["Integrations", Github],
              ["Settings", Settings],
            ].map(([label, Icon]) => (
              <button
                key={String(label)}
                className="flex min-h-10 items-center gap-3 rounded-md px-3 text-left font-primary text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Icon size={17} />
                {String(label)}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">
          <header className="flex min-h-14 flex-col justify-between gap-4 border-b border-border bg-background px-5 py-4 md:flex-row md:items-center lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-primary text-2xl font-medium">{state.workspace.name}</h1>
                <Badge tone={apiAvailable ? "success" : "warning"}>
                  {apiAvailable ? "Local runner connected" : "Frontend demo mode"}
                </Badge>
              </div>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                PM-visible demo: request a change, review it locally or on staging, then push it to production.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                icon={<RefreshCw size={16} />}
                onClick={() => void refreshState()}
                disabled={loading !== null}
              >
                Refresh
              </Button>
              <Button icon={<Play size={16} />} onClick={() => void runWorkspace()} disabled={loading !== null || state.running}>
                {loading === "run" ? "Starting..." : "Run workspace"}
              </Button>
            </div>
          </header>

          <div className="mx-auto grid max-w-[1280px] gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
            <section className="grid gap-6">
              <IntegrationStrip
                integrations={state.integrations}
                loading={githubPolling ? "github" : loading}
                onWhatsApp={() => void connectWhatsApp()}
                onGitHub={() => void connectGitHub()}
              />
              {whatsAppConnect ? (
                <WhatsAppConnectPanel
                  connect={whatsAppConnect}
                  loading={loading === "whatsapp" || loading === "whatsapp-refresh"}
                  onRefresh={() => void refreshWhatsAppStatus()}
                  onNewQr={() => void refreshWhatsAppQr()}
                  onOpenQr={() => setWhatsAppQrOpen(true)}
                />
              ) : null}
              <PMStoryPanel state={state} />
              <OpenAIPanel
                state={state}
                loading={loading === "openai"}
                onGenerate={() => void generateOpenAIPlan()}
              />
              <DeploymentPanel
                deployment={state.deployment}
                loading={loading}
                onStage={() => void deployStaging()}
                onProduction={() => void deployProduction()}
              />
              <ServiceGrid services={state.workspace.services} />
              <SetupPanel state={state} />
              <RequestPanel
                requestBody={requestBody}
                requestType={requestType}
                onBodyChange={setRequestBody}
                onTypeChange={setRequestType}
                onSubmit={() => void submitRequest()}
                loading={loading === "request"}
                disabled={!apiAvailable}
              />
            </section>

            <aside className="grid content-start gap-6">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>10-step MVP flow</CardTitle>
                    <CardDescription>{completedSteps} of {state.steps.length} steps complete</CardDescription>
                  </div>
                  <Badge tone="info">{progress}%</Badge>
                </CardHeader>
                <Progress value={progress} />
                <div className="mt-5 grid gap-4">
                  {state.steps.map((step, index) => (
                    <StepRow key={step.id} step={step} index={index + 1} />
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Run logs</CardTitle>
                    <CardDescription>Safe runner output and integration events</CardDescription>
                  </div>
                </CardHeader>
                <div className="max-h-72 overflow-auto rounded-md bg-muted p-4 font-mono text-xs leading-relaxed text-foreground">
                  {state.logs.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" icon={<Square size={16} />} onClick={() => void stopWorkspace(false)}>
                    Stop
                  </Button>
                  <Button variant="danger" onClick={() => void stopWorkspace(true)}>
                    Stop and remove volumes
                  </Button>
                </div>
              </Card>
            </aside>
          </div>
        </main>
      </div>
      {whatsAppConnect && whatsAppQrOpen ? (
        <WhatsAppQrModal
          connect={whatsAppConnect}
          loading={loading === "whatsapp" || loading === "whatsapp-refresh"}
          onClose={() => setWhatsAppQrOpen(false)}
          onRefresh={() => void refreshWhatsAppStatus()}
          onNewQr={() => void refreshWhatsAppQr()}
        />
      ) : null}
    </div>
  );
}

function PMStoryPanel({ state }: { state: MvpState }) {
  return (
    <Card>
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-md bg-primary font-primary text-lg text-primary-text">
            {state.pm.avatarInitials}
          </div>
          <div>
            <p className="font-primary text-sm text-muted-foreground">Visible product manager</p>
            <h2 className="font-primary text-xl font-medium">{state.pm.name}</h2>
            <p className="font-body text-sm text-muted-foreground">
              {state.pm.role}, {state.pm.team}
            </p>
          </div>
        </div>
        <div className="max-w-xl rounded-md border border-border bg-background p-4">
          <p className="font-primary text-sm font-medium">Demo intent</p>
          <p className="mt-1 font-body text-sm leading-relaxed text-muted-foreground">{state.pm.currentIntent}</p>
        </div>
      </div>
    </Card>
  );
}

function OpenAIPanel({
  state,
  loading,
  onGenerate,
}: {
  state: MvpState;
  loading: boolean;
  onGenerate: () => void;
}) {
  const plan = state.openAI.lastPlan;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>OpenAI change planning</CardTitle>
          <CardDescription>All AI-based planning in this MVP is routed through OpenAI only</CardDescription>
        </div>
        <Badge tone={state.openAI.configured ? "success" : "warning"}>
          {state.openAI.configured ? "OpenAI live" : "OpenAI demo mode"}
        </Badge>
      </CardHeader>
      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-md border border-border bg-background p-4">
          <p className="font-primary text-sm font-medium">Provider policy</p>
          <div className="mt-3 grid gap-2 font-body text-sm text-muted-foreground">
            <p>Provider: {state.openAI.provider}</p>
            <p>Model: <span className="font-mono">{state.openAI.model}</span></p>
            <p>No non-OpenAI AI providers are configured in this app.</p>
          </div>
          <Button className="mt-4 w-full" onClick={onGenerate} disabled={loading}>
            {loading ? "Asking OpenAI..." : "Ask OpenAI for change plan"}
          </Button>
        </div>
        <div className="rounded-md border border-border bg-background p-4">
          <p className="font-primary text-sm font-medium">Plan for PM review</p>
          <p className="mt-2 font-body text-sm leading-relaxed text-muted-foreground">{plan?.summary}</p>
          <p className="mt-4 font-primary text-sm font-medium">Recommended visible copy</p>
          <p className="mt-1 rounded-md bg-muted p-3 font-body text-sm">{plan?.recommendedHeadline}</p>
          <ol className="mt-4 grid gap-2">
            {plan?.steps.map((step, index) => (
              <li key={step} className="flex gap-2 font-body text-sm text-muted-foreground">
                <span className="font-mono text-foreground">{index + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Card>
  );
}

function DeploymentPanel({
  deployment,
  loading,
  onStage,
  onProduction,
}: {
  deployment: DeploymentDemoState;
  loading: string | null;
  onStage: () => void;
  onProduction: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Visible local, staging, and production apps</CardTitle>
          <CardDescription>The PM can see the requested change before and after production push</CardDescription>
        </div>
      </CardHeader>
      <div className="grid gap-3 xl:grid-cols-3">
        <EnvironmentPreview env={deployment.local} />
        <EnvironmentPreview env={deployment.staging} />
        <EnvironmentPreview env={deployment.production} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button icon={<Globe2 size={16} />} onClick={onStage} disabled={loading !== null}>
          {loading === "staging" ? "Deploying staging..." : "Run local + staging preview"}
        </Button>
        <Button variant="secondary" icon={<Rocket size={16} />} onClick={onProduction} disabled={loading !== null}>
          {loading === "production" ? "Pushing..." : "Push to production app"}
        </Button>
      </div>
      <div className="mt-5 rounded-md bg-muted p-4">
        <p className="font-primary text-sm font-medium">Deployment audit</p>
        <ul className="mt-2 grid gap-1 font-mono text-xs text-foreground">
          {deployment.auditTrail.slice(-4).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function EnvironmentPreview({ env }: { env: AppEnvironment }) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="font-primary text-sm font-medium">{env.label}</p>
          <a className="font-mono text-xs text-muted-foreground underline" href={env.url} target="_blank" rel="noreferrer">
            {env.url.replace("https://", "").replace("http://", "")}
          </a>
        </div>
        <Badge tone={env.status === "live" || env.status === "ready" ? "success" : "neutral"}>{env.status}</Badge>
      </div>
      <div className="rounded-md border border-border bg-card p-4">
        <p className="font-primary text-xs text-muted-foreground">Checkout preview</p>
        <h3 className="mt-2 font-primary text-lg font-medium leading-tight">{env.headline}</h3>
        <p className="mt-2 font-body text-sm leading-relaxed text-muted-foreground">{env.subcopy}</p>
        <Button className="mt-4 w-full" variant={env.id === "production" ? "primary" : "secondary"}>
          Continue to payment
        </Button>
      </div>
      <p className="mt-3 font-body text-xs text-muted-foreground">Updated by {env.lastUpdatedBy}</p>
    </div>
  );
}

function IntegrationStrip({
  integrations,
  loading,
  onWhatsApp,
  onGitHub,
}: {
  integrations: Integration[];
  loading: string | null;
  onWhatsApp: () => void;
  onGitHub: () => void;
}) {
  const map = Object.fromEntries(integrations.map((integration) => [integration.id, integration]));
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <IntegrationCard
        icon={<MessageCircle size={20} />}
        integration={map.whatsapp}
        actionLabel={loading === "whatsapp" ? "Preparing..." : map.whatsapp?.status === "connected" ? "View QR" : "Connect WhatsApp"}
        onAction={onWhatsApp}
      />
      <IntegrationCard
        icon={<Github size={20} />}
        integration={map.github}
        actionLabel={loading === "github" ? "Connecting..." : "Connect GitHub"}
        onAction={onGitHub}
      />
      <IntegrationCard icon={<Database size={20} />} integration={map.docker} actionLabel="Ready" />
    </div>
  );
}

function WhatsAppConnectPanel({
  connect,
  loading,
  onRefresh,
  onNewQr,
  onOpenQr,
}: {
  connect: WhatsAppConnect;
  loading: boolean;
  onRefresh: () => void;
  onNewQr: () => void;
  onOpenQr: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>WhatsApp thread pairing</CardTitle>
          <CardDescription>{connect.connected ? "This WhatsApp account is connected" : connect.detail}</CardDescription>
        </div>
        <Badge tone={connect.connected ? "success" : "info"}>{connect.connected ? "Connected" : "Ready"}</Badge>
      </CardHeader>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="grid content-start gap-4">
          <div className="rounded-md border border-border bg-background p-4">
            <div className="mb-2 flex items-center gap-2 font-primary text-sm font-medium">
              <QrCode size={16} />
              Linked device setup
            </div>
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              Scan the QR pop-up from WhatsApp linked devices. Once connected, Corvin sends Connected to your WhatsApp account.
            </p>
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <p className="font-primary text-sm font-medium">After scanning</p>
            <ol className="mt-3 grid gap-2 font-body text-sm leading-relaxed text-muted-foreground">
              <li>1. Wait for this panel to show Connected.</li>
              <li>2. Send a request in any WhatsApp chat available to the linked account.</li>
              <li>3. Corvin captures the message and replies in that same chat from the linked account.</li>
            </ol>
          </div>
          <div className="grid gap-2 font-body text-sm text-muted-foreground">
            <p>Webhook: <span className="font-mono text-foreground">{connect.webhookUrl}</span></p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Button onClick={onOpenQr} disabled={loading || connect.connected}>
            {connect.connected ? "Connected" : "Show QR"}
          </Button>
          <Button variant="secondary" onClick={onRefresh} disabled={loading || connect.connected}>
            Refresh status
          </Button>
          <Button variant="secondary" onClick={onNewQr} disabled={loading || connect.connected}>
            {loading ? "Refreshing..." : "New QR code"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function WhatsAppQrModal({
  connect,
  loading,
  onClose,
  onRefresh,
  onNewQr,
}: {
  connect: WhatsAppConnect;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onNewQr: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <div className="w-full max-w-2xl rounded-md border border-border bg-card p-5 shadow-xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-primary text-xl font-medium">Connect WhatsApp</h2>
            <p className="mt-1 font-body text-sm text-muted-foreground">
              {connect.connected ? "This WhatsApp account is connected" : connect.detail}
            </p>
          </div>
          <button
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close WhatsApp QR"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-5 md:grid-cols-[380px_minmax(0,1fr)]">
          <div className="grid place-items-center rounded-md border border-border bg-background p-4">
            {connect.qrImageUrl ? (
              <img src={connect.qrImageUrl} alt="WhatsApp pairing QR" className="size-[360px] max-w-full" />
            ) : (
              <div className="grid size-[360px] max-w-full place-items-center rounded-md bg-muted text-muted-foreground">
                <Loader2 className="animate-spin" size={24} />
              </div>
            )}
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <div className="mb-2 flex items-center gap-2 font-primary text-sm font-medium">
              <QrCode size={16} />
              Linked device QR
            </div>
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              In WhatsApp, open Settings or Menu, choose Linked devices, tap Link a device, then scan this code.
            </p>
            {connect.qrUpdatedAt ? (
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                QR refreshed {new Date(connect.qrUpdatedAt).toLocaleTimeString()}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button onClick={onRefresh} disabled={loading || connect.connected}>
              {connect.connected ? "Connected" : "Refresh status"}
            </Button>
            <Button variant="secondary" onClick={onNewQr} disabled={loading || connect.connected}>
              {loading ? "Refreshing..." : "New QR code"}
            </Button>
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({
  icon,
  integration,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  integration?: Integration;
  actionLabel: string;
  onAction?: () => void;
}) {
  return (
    <Card className="min-h-40">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="grid size-10 place-items-center rounded-md bg-muted text-foreground">{icon}</div>
        <Badge tone={integration?.status === "connected" || integration?.status === "ready" ? "success" : "warning"}>
          {integration?.status ?? "unknown"}
        </Badge>
      </div>
      <h2 className="font-primary text-base font-medium">{integration?.label}</h2>
      <p className="mt-2 min-h-10 font-body text-sm leading-relaxed text-muted-foreground">{integration?.detail}</p>
      <Button className="mt-4 w-full" variant={onAction ? "secondary" : "ghost"} onClick={onAction} disabled={!onAction}>
        {actionLabel}
      </Button>
    </Card>
  );
}

function ServiceGrid({ services }: { services: ServiceConfig[] }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Service health</CardTitle>
          <CardDescription>Preview links and health checks from the workspace blueprint</CardDescription>
        </div>
      </CardHeader>
      <div className="grid gap-3 md:grid-cols-3">
        {services.map((service) => (
          <div key={service.id} className="rounded-md border border-border bg-background p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-primary text-sm font-medium">{service.label}</h3>
              <Badge tone={service.status === "healthy" ? "success" : service.status === "failed" ? "danger" : "neutral"}>
                {service.status}
              </Badge>
            </div>
            <p className="font-mono text-xs text-muted-foreground">:{service.port}</p>
            <a
              className="mt-3 inline-flex items-center gap-1 break-all font-primary text-sm text-foreground underline decoration-border underline-offset-4"
              href={service.healthUrl}
              target="_blank"
              rel="noreferrer"
            >
              {service.healthUrl}
              <ExternalLink size={13} />
            </a>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SetupPanel({ state }: { state: MvpState }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Setup instructions</CardTitle>
          <CardDescription>Engineering-authored blueprint converted into a local Compose preview</CardDescription>
        </div>
        <Badge tone={state.validation.ready ? "success" : "warning"}>
          {state.validation.ready ? "Ready" : "Needs attention"}
        </Badge>
      </CardHeader>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid gap-2">
          {state.validation.checks.map((check) => (
            <div key={check.id} className="flex items-start gap-3 rounded-md border border-border bg-background p-3">
              <CheckCircle2
                className={check.status === "passed" ? "text-green-600" : "text-amber-600"}
                size={18}
              />
              <div>
                <p className="font-primary text-sm font-medium">{check.label}</p>
                <p className="font-body text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 font-mono text-xs leading-relaxed text-foreground">
          {state.compose}
        </pre>
      </div>
    </Card>
  );
}

function RequestPanel({
  requestBody,
  requestType,
  onBodyChange,
  onTypeChange,
  onSubmit,
  loading,
  disabled,
}: {
  requestBody: string;
  requestType: string;
  onBodyChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Request a change</CardTitle>
          <CardDescription>Capture the PM request with the currently running workspace context</CardDescription>
        </div>
      </CardHeader>
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {["Copy change", "Bug fix", "Product idea"].map((type) => (
            <Button
              key={type}
              variant={type === requestType ? "primary" : "secondary"}
              onClick={() => onTypeChange(type)}
            >
              {type}
            </Button>
          ))}
        </div>
        <textarea
          className="min-h-28 resize-y rounded-md border border-border bg-card p-3 font-body text-sm leading-relaxed text-foreground outline-none focus:border-primary"
          value={requestBody}
          onChange={(event) => onBodyChange(event.target.value)}
        />
        <Button onClick={onSubmit} disabled={disabled || loading || !requestBody.trim()}>
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              Capturing
            </>
          ) : (
            "Capture request"
          )}
        </Button>
      </div>
    </Card>
  );
}

function StepRow({ step, index }: { step: BlueprintStep; index: number }) {
  return (
    <div className="flex gap-3">
      <div className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-background font-mono text-xs">
        {index}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-primary text-sm font-medium">{step.label}</p>
          <Badge tone={step.status === "succeeded" ? "success" : step.status === "running" ? "info" : "neutral"}>
            {step.status}
          </Badge>
        </div>
        <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">{step.summary}</p>
      </div>
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
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}
