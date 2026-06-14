import {
  Check,
  ExternalLink,
  FileText,
  Github,
  LayoutDashboard,
  Loader2,
  QrCode,
  Settings,
  ShieldCheck,
  Terminal,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import DemoApp from "./DemoApp";
import { cn } from "./lib/utils";
import { createPublicInitialState } from "./shared/demo";
import { parseExecMarkdown, renderExecMarkdown } from "./shared/mvp";
import type { ExecDocument, ExecRepository, Integration, MvpState, PMRequest, WhatsAppConnect } from "./shared/types";

type PublicView = "settings" | "request";

const fallbackState = createPublicInitialState();

const views: Array<{ id: PublicView; label: string; icon: ReactNode }> = [
  { id: "settings", label: "Configure settings", icon: <Settings size={17} /> },
  { id: "request", label: "New request", icon: <FileText size={17} /> },
];

export default function App() {
  if (window.location.pathname.replace(/\/+$/, "") === "/demo") {
    return <DemoApp />;
  }

  return <PublicApp />;
}

function PublicApp() {
  const [state, setState] = useState<MvpState>(fallbackState);
  const [activeView, setActiveView] = useState<PublicView>("settings");
  const [loading, setLoading] = useState<string | null>(null);
  const [apiAvailable, setApiAvailable] = useState(false);
  const [requestBody, setRequestBody] = useState("Change the checkout headline to make the offer clearer.");
  const [requestType, setRequestType] = useState("Copy change");
  const [execMarkdown, setExecMarkdown] = useState(fallbackState.exec.markdown);
  const [whatsAppConnect, setWhatsAppConnect] = useState<WhatsAppConnect | null>(null);
  const [whatsAppQrOpen, setWhatsAppQrOpen] = useState(false);
  const [githubPolling, setGithubPolling] = useState(false);

  useEffect(() => {
    void refreshState();
  }, []);

  const execReady = state.exec.exists && state.exec.validation.ready;
  const connectorsReady = state.integrations.every((integration) =>
    integration.id === "docker" ? integration.status === "ready" || integration.status === "connected" : integration.status === "connected",
  );
  const flowReady = execReady && connectorsReady && state.validation.ready;

  async function refreshState() {
    try {
      const next = await api<MvpState>("/api/state");
      setApiAvailable(true);
      setState(next);
      setExecMarkdown(next.exec.markdown);
    } catch {
      setApiAvailable(false);
      setState(fallbackState);
      setExecMarkdown(fallbackState.exec.markdown);
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
        setWhatsAppQrOpen(!connect.connected);
      },
    );
  }

  useEffect(() => {
    if (whatsAppConnect?.connected) {
      setWhatsAppQrOpen(false);
    }
  }, [whatsAppConnect?.connected]);

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
      setWhatsAppQrOpen(false);
      await refreshState();
    }
  }

  async function refreshWhatsAppQr() {
    await runAction(
      "whatsapp-refresh",
      () => api<WhatsAppConnect>("/api/integrations/whatsapp/refresh", { method: "POST" }),
      (connect) => {
        setWhatsAppConnect(connect);
        setWhatsAppQrOpen(!connect.connected);
      },
    );
  }

  async function connectGitHub() {
    await runAction("github", async () => {
      const response = await api<{ configured: boolean; url?: string; message?: string }>("/api/integrations/github/authorize");
      if (response.configured && response.url) {
        window.open(response.url, "_blank", "noopener,noreferrer");
        setGithubPolling(true);
      } else {
        window.alert(response.message ?? "GitHub App OAuth is not configured.");
      }
      return response;
    });
  }

  useEffect(() => {
    if (!githubPolling) return;
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

  async function validateExecMarkdown() {
    await runAction(
      "exec-validate",
      () =>
        api<MvpState["exec"]>("/api/exec/validate", {
          method: "POST",
          body: JSON.stringify({ markdown: execMarkdown }),
        }),
      (exec) => setState((current) => ({ ...current, exec })),
    );
  }

  async function saveExecMarkdown() {
    setLoading("exec-save");
    try {
      const response = await fetch("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: execMarkdown }),
      });
      const exec = (await response.json()) as MvpState["exec"];
      setState((current) => ({ ...current, exec }));
      if (response.ok) {
        await refreshState();
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar
          activeView={activeView}
          setActiveView={setActiveView}
          workspaceName={state.workspace.name}
          flowReady={flowReady}
          apiAvailable={apiAvailable}
        />
        <main id="content" className="min-w-0">
          <section className="border-b border-border bg-card px-4 py-6 md:px-8 lg:px-10">
            <div className="mx-auto flex max-w-7xl flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge tone={flowReady ? "success" : "warning"}>{flowReady ? "Ready" : "Setup required"}</Badge>
                  <Badge tone={apiAvailable ? "success" : "neutral"}>{apiAvailable ? "API connected" : "Local fallback"}</Badge>
                </div>
                <h1 className="font-primary text-3xl font-medium leading-tight md:text-4xl">{viewTitle(activeView)}</h1>
                <p className="mt-2 max-w-prose font-body text-sm leading-relaxed text-muted-foreground">{viewDescription(activeView)}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="secondary" onClick={() => setActiveView("settings")} icon={<Settings size={16} />}>
                  Configure
                </Button>
                <Button onClick={() => setActiveView("request")} icon={<FileText size={16} />}>
                  New request
                </Button>
              </div>
            </div>
          </section>

          <section className="px-4 py-6 md:px-8 md:py-8 lg:px-10">
            <div className="mx-auto grid max-w-7xl gap-6">
              {activeView === "settings" ? (
                <SettingsView
                  state={state}
                  loading={githubPolling ? "github" : loading}
                  execReady={execReady}
                  connectorsReady={connectorsReady}
                  onWhatsApp={() => void connectWhatsApp()}
                  onGitHub={() => void connectGitHub()}
                  onStart={() => setActiveView("request")}
                  execMarkdown={execMarkdown}
                  onExecMarkdownChange={setExecMarkdown}
                  onValidateExec={() => void validateExecMarkdown()}
                  onSaveExec={() => void saveExecMarkdown()}
                />
              ) : null}

              {activeView === "request" ? (
                <RequestView
                  ready={flowReady}
                  requestBody={requestBody}
                  requestType={requestType}
                  loading={loading === "request"}
                  onBodyChange={setRequestBody}
                  onTypeChange={setRequestType}
                  onSubmit={() => void submitRequest()}
                  onSettings={() => setActiveView("settings")}
                />
              ) : null}

            </div>
          </section>
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

function Sidebar({
  activeView,
  setActiveView,
  workspaceName,
  flowReady,
  apiAvailable,
}: {
  activeView: PublicView;
  setActiveView: (view: PublicView) => void;
  workspaceName: string;
  flowReady: boolean;
  apiAvailable: boolean;
}) {
  return (
    <aside className="border-b border-border bg-card px-4 py-5 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5">
      <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:p-3" href="#content">
        Skip to content
      </a>
      <div className="flex items-center gap-3">
        <img src="/corvin-logo.png" alt="Corvin" className="size-11 rounded-md border border-border object-cover" />
        <div className="min-w-0">
          <p className="font-primary text-lg font-medium">Corvin</p>
          <p className="truncate font-body text-xs text-muted-foreground">{workspaceName}</p>
        </div>
      </div>

      <nav className="mt-8 grid gap-2" aria-label="Main">
        {views.map((view) => (
          <button
            key={view.id}
            className={cn(
              "flex min-h-12 items-center justify-between rounded-md px-3 py-2 text-left font-primary text-sm transition-colors",
              activeView === view.id ? "bg-primary text-primary-text" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => setActiveView(view.id)}
          >
            <span className="flex items-center gap-2">
              {view.icon}
              {view.label}
            </span>
            {activeView === view.id ? <Check size={15} /> : null}
          </button>
        ))}
      </nav>

      <div className="mt-8 grid gap-3 rounded-md border border-border bg-background p-4">
        <div>
          <p className="font-primary text-sm font-medium">Workspace status</p>
          <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">
            {flowReady ? "Requests can be captured." : "Finish connector and execution setup first."}
          </p>
        </div>
        <Badge tone={apiAvailable ? "success" : "neutral"}>{apiAvailable ? "Online" : "Offline"}</Badge>
      </div>

      <a
        className="mt-3 flex min-h-12 items-center justify-between rounded-md border border-border bg-background px-3 py-2 font-primary text-sm text-foreground transition-colors hover:bg-muted"
        href="/demo"
      >
        <span className="flex items-center gap-2">
          <LayoutDashboard size={17} />
          Demo mode
        </span>
        <ExternalLink size={15} />
      </a>
    </aside>
  );
}

function SettingsView({
  state,
  loading,
  execReady,
  connectorsReady,
  onWhatsApp,
  onGitHub,
  onStart,
  execMarkdown,
  onExecMarkdownChange,
  onValidateExec,
  onSaveExec,
}: {
  state: MvpState;
  loading: string | null;
  execReady: boolean;
  connectorsReady: boolean;
  onWhatsApp: () => void;
  onGitHub: () => void;
  onStart: () => void;
  execMarkdown: string;
  onExecMarkdownChange: (value: string) => void;
  onValidateExec: () => void;
  onSaveExec: () => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Connectors</CardTitle>
            <CardDescription>Connect the services Corvin needs before a job can start.</CardDescription>
          </div>
          <Badge tone={connectorsReady ? "success" : "warning"}>{connectorsReady ? "Ready" : "Needs setup"}</Badge>
        </CardHeader>
        <div className="grid gap-3">
          {state.integrations.map((integration) => (
            <ConnectorRow
              key={integration.id}
              integration={integration}
              loading={loading}
              onWhatsApp={onWhatsApp}
              onGitHub={onGitHub}
            />
          ))}
        </div>
        <div className="mt-6 border-t border-border pt-5">
          <ExecConnectorEditor
            state={state}
            markdown={execMarkdown}
            loading={loading}
            onMarkdownChange={onExecMarkdownChange}
            onValidate={onValidateExec}
            onSave={onSaveExec}
          />
        </div>
      </Card>

      <div className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Execution packet</CardTitle>
              <CardDescription>Engineering-owned run instructions for this workspace.</CardDescription>
            </div>
            <Badge tone={execReady ? "success" : "warning"}>{execReady ? "Validated" : "Required"}</Badge>
          </CardHeader>
          <div className="grid gap-2">
            {state.exec.runPlan?.commands.map((command) => (
              <p key={command} className="rounded-md border border-border bg-background p-3 font-mono text-xs">
                {command}
              </p>
            )) ?? <p className="font-body text-sm text-muted-foreground">No run plan has been saved yet.</p>}
          </div>
          <Button className="mt-5 w-full" onClick={onStart} disabled={!connectorsReady || !execReady}>
            New request
          </Button>
        </Card>
      </div>
    </div>
  );
}

function ExecConnectorEditor({
  state,
  markdown,
  loading,
  onMarkdownChange,
  onValidate,
  onSave,
}: {
  state: MvpState;
  markdown: string;
  loading: string | null;
  onMarkdownChange: (value: string) => void;
  onValidate: () => void;
  onSave: () => void;
}) {
  const parsed = useMemo(() => (markdown.trim() ? parseExecMarkdown(markdown) : null), [markdown]);
  const document = parsed?.ok ? parsed.document : null;
  const selectedRepositories = document?.repositories ?? [];
  const selectedRepoIds = new Set(selectedRepositories.map((repository) => repository.id));
  const githubReady = state.integrations.some((integration) => integration.id === "github" && integration.status === "connected");
  const hasRepositories = state.workspace.repositories.length > 0;

  function updateRepositories(nextRepositories: ExecRepository[]) {
    onMarkdownChange(renderExecMarkdown(createExecDocumentFromRepositories(state, nextRepositories)));
  }

  function toggleRepository(repositoryId: string) {
    if (selectedRepoIds.has(repositoryId)) {
      updateRepositories(selectedRepositories.filter((repository) => repository.id !== repositoryId));
      return;
    }

    const workspaceRepository = state.workspace.repositories.find((repository) => repository.id === repositoryId);
    if (!workspaceRepository) return;
    updateRepositories([...selectedRepositories, createExecRepositoryFromWorkspace(state, workspaceRepository)]);
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-primary text-sm font-medium">Repository selection</p>
          <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">
            Choose the GitHub repositories Corvin can use for request context.
          </p>
        </div>
        <Badge tone={state.exec.validation.ready ? "success" : "warning"}>
          {state.exec.validation.ready ? "Validated" : "Needs validation"}
        </Badge>
      </div>

      {!githubReady ? (
        <ConnectorEmptyState
          icon={<Github size={18} />}
          title="GitHub is not connected"
          body="Connect GitHub first. Repository selection belongs here after Corvin can see the workspace repositories."
        />
      ) : !hasRepositories ? (
        <ConnectorEmptyState
          icon={<FileText size={18} />}
          title="No repositories selected"
          body="This public setup flow is waiting for repository access. Demo repositories are available only from Demo mode."
        />
      ) : (
        <div className="grid gap-3">
          {state.workspace.repositories.map((workspaceRepository) => {
            const selected = selectedRepoIds.has(workspaceRepository.id);
            const execRepository = selectedRepositories.find((repository) => repository.id === workspaceRepository.id);
            return (
              <div key={workspaceRepository.id} className="rounded-md border border-border bg-card p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-primary text-sm font-medium">{workspaceRepository.label}</p>
                      <Badge tone={selected ? "success" : "neutral"}>{selected ? "Selected" : "Not selected"}</Badge>
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {workspaceRepository.sourceRef.replace(/^synced-repo:\/\//, "")}
                    </p>
                  </div>
                  <Button variant={selected ? "secondary" : "primary"} onClick={() => toggleRepository(workspaceRepository.id)}>
                    {selected ? "Remove" : "Select"}
                  </Button>
                </div>

                {selected && execRepository ? (
                  <div className="mt-4 grid gap-2 md:grid-cols-3">
                    <ReadOnlyCommand label="Install" value={execRepository.install} />
                    <ReadOnlyCommand label="Run" value={execRepository.dev} />
                    <ReadOnlyCommand label="Health" value={execRepository.health || "Not configured"} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {(state.exec.validation.errors.length > 0 || (parsed && !parsed.ok)) ? (
        <div className="mt-4 rounded-md border border-border bg-background p-3">
          <p className="font-primary text-xs font-medium text-foreground">Validation issues</p>
          <div className="mt-2 grid gap-1">
            {[...state.exec.validation.errors, ...(!parsed || parsed.ok ? [] : parsed.errors)].map((error) => (
              <p key={error.id} className="font-body text-xs text-muted-foreground">
                {error.label}: {error.detail}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" onClick={onValidate} disabled={loading !== null || selectedRepositories.length === 0}>
          {loading === "exec-validate" ? "Validating..." : "Validate exec.md"}
        </Button>
        <Button onClick={onSave} disabled={loading !== null || selectedRepositories.length === 0}>
          {loading === "exec-save" ? "Saving..." : "Save exec.md"}
        </Button>
      </div>
    </div>
  );
}

function ConnectorEmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background p-5">
      <div className="grid size-10 place-items-center rounded-md bg-muted text-muted-foreground">{icon}</div>
      <p className="mt-4 font-primary text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-prose font-body text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function ReadOnlyCommand({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-background p-3">
      <span className="font-primary text-xs text-muted-foreground">{label}</span>
      <code className="break-words font-mono text-xs text-foreground">{value}</code>
    </div>
  );
}

function createExecDocumentFromRepositories(state: MvpState, repositories: ExecRepository[]): ExecDocument {
  return {
    purpose: `Run ${state.workspace.name} locally for product requests.`,
    repositories,
    environment: {
      global: state.workspace.environment.required.map((key) => ({
        name: key,
        required: true,
        description: `Required to run ${state.workspace.name} locally.`,
      })),
      perRepo: {},
    },
    localRunNotes: state.workspace.executionScriptSummary || "Generated from the connected repository selection.",
  };
}

function createExecRepositoryFromWorkspace(
  state: MvpState,
  workspaceRepository: MvpState["workspace"]["repositories"][number],
): ExecRepository {
  const service = state.workspace.services.find((item) => item.repositoryId === workspaceRepository.id);
  const commands = splitStartupCommand(workspaceRepository.startupCommand ?? "");
  return {
    id: workspaceRepository.id,
    repo: workspaceRepository.sourceRef.replace(/^synced-repo:\/\//, ""),
    role: workspaceRepository.purpose ?? workspaceRepository.label,
    install: commands.install,
    dev: commands.dev,
    health: service?.healthUrl ?? "",
  };
}

function ConnectorRow({
  integration,
  loading,
  onWhatsApp,
  onGitHub,
}: {
  integration: Integration;
  loading: string | null;
  onWhatsApp: () => void;
  onGitHub: () => void;
}) {
  const ready = integration.id === "docker" ? integration.status === "ready" || integration.status === "connected" : integration.status === "connected";
  const icon = integration.id === "github" ? <Github size={18} /> : integration.id === "whatsapp" ? <ShieldCheck size={18} /> : <Terminal size={18} />;
  const action =
    ready
      ? undefined
      : integration.id === "whatsapp"
      ? { label: loading === "whatsapp" ? "Connecting..." : "Connect WhatsApp", onClick: onWhatsApp }
      : integration.id === "github"
        ? { label: loading === "github" ? "Connecting..." : "Connect GitHub", onClick: onGitHub }
        : { label: "Configured locally", onClick: undefined };

  return (
    <div className="grid gap-3 rounded-md border border-border bg-background p-4 md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex gap-3">
        <div className={cn("grid size-10 shrink-0 place-items-center rounded-md", ready ? "bg-primary text-primary-text" : "bg-muted text-muted-foreground")}>
          {icon}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-primary text-sm font-medium">{integration.label}</p>
            <Badge tone={ready ? "success" : "neutral"}>{ready ? "Connected" : "Empty"}</Badge>
          </div>
          <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">
            {ready ? readyConnectorText(integration.id) : emptyConnectorText(integration.id)}
          </p>
        </div>
      </div>
      {action?.onClick ? (
        <Button variant={ready ? "secondary" : "primary"} onClick={action.onClick} disabled={loading !== null}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

function RequestView({
  ready,
  requestBody,
  requestType,
  loading,
  onBodyChange,
  onTypeChange,
  onSubmit,
  onSettings,
}: {
  ready: boolean;
  requestBody: string;
  requestType: string;
  loading: boolean;
  onBodyChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onSubmit: () => void;
  onSettings: () => void;
}) {
  if (!ready) {
    return <EmptyGate title="New request is waiting on setup" onSettings={onSettings} />;
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>New request</CardTitle>
          <CardDescription>Capture the PM request once setup is ready.</CardDescription>
        </div>
        <Badge tone="success">Ready</Badge>
      </CardHeader>
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {["Copy change", "Bug fix", "Product idea"].map((type) => (
            <Button key={type} variant={type === requestType ? "primary" : "secondary"} onClick={() => onTypeChange(type)}>
              {type}
            </Button>
          ))}
        </div>
        <textarea
          className="min-h-32 resize-y rounded-md border border-border bg-card p-3 font-body text-sm leading-relaxed text-foreground outline-none focus:border-primary"
          value={requestBody}
          onChange={(event) => onBodyChange(event.target.value)}
        />
        <Button onClick={onSubmit} disabled={loading || !requestBody.trim()}>
          {loading ? "Capturing..." : "Create request"}
        </Button>
      </div>
    </Card>
  );
}

function EmptyGate({ title, onSettings }: { title: string; onSettings: () => void }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Configure connectors and execution settings before continuing.</CardDescription>
        </div>
        <Badge tone="warning">Blocked</Badge>
      </CardHeader>
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex gap-3 rounded-md border border-border bg-background p-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <WifiOff size={20} />
          </div>
          <div>
            <p className="font-primary text-sm font-medium">Connector empty state</p>
            <p className="mt-1 font-body text-sm leading-relaxed text-muted-foreground">Start by connecting the workspace services Corvin needs.</p>
          </div>
        </div>
        <Button onClick={onSettings} icon={<Wrench size={16} />}>
          Configure settings
        </Button>
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
            <p className="mt-1 font-body text-sm text-muted-foreground">{connect.connected ? "This WhatsApp account is connected" : connect.detail}</p>
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

function viewTitle(view: PublicView) {
  if (view === "settings") return "Workspace settings";
  return "New request";
}

function viewDescription(view: PublicView) {
  if (view === "settings") return "Configure connectors and execution settings before request intake.";
  return "Capture a focused product request and hand it to Corvin.";
}

function emptyConnectorText(id: Integration["id"]) {
  if (id === "whatsapp") return "Connect a WhatsApp inbox before PM messages can become requests.";
  if (id === "github") return "Connect GitHub before Corvin can resolve repositories and open pull requests.";
  return "The local runner must be ready before requests can run.";
}

function readyConnectorText(id: Integration["id"]) {
  if (id === "whatsapp") return "Listening to incoming text messages on the linked WhatsApp account, including direct chats and groups.";
  if (id === "github") return "GitHub is connected and repository context can be resolved.";
  return "The local runner is configured for this workspace.";
}

function splitStartupCommand(command: string) {
  const parts = command.split("&&").map((part) => part.trim()).filter(Boolean);
  return {
    install: parts[0] ?? "",
    dev: parts.slice(1).join(" && ") || parts[0] || "",
  };
}

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
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
