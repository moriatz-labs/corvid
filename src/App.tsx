import {
  FileText,
  Github,
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
import type { ReactNode } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { createInitialState } from "./shared/demo";
import { parseExecMarkdown, renderExecMarkdown } from "./shared/mvp";
import type {
  AppEnvironment,
  DeploymentDemoState,
  ExecDocument,
  ExecRepository,
  ExecSetupState,
  Integration,
  MvpState,
  OpenAIChangePlan,
  PMRequest,
  WhatsAppConnect,
} from "./shared/types";

const fallbackState = createInitialState();

export default function App() {
  const [state, setState] = useState<MvpState>(fallbackState);
  const [loading, setLoading] = useState<string | null>(null);
  const [requestBody, setRequestBody] = useState("Change the checkout headline to make the offer clearer.");
  const [requestType, setRequestType] = useState("Copy change");
  const [apiAvailable, setApiAvailable] = useState(false);
  const [execMarkdown, setExecMarkdown] = useState(fallbackState.exec.markdown);
  const [showExecSetup, setShowExecSetup] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<"idle" | "needs-revision">("idle");
  const [whatsAppConnect, setWhatsAppConnect] = useState<WhatsAppConnect | null>(null);
  const [whatsAppQrOpen, setWhatsAppQrOpen] = useState(false);
  const [githubPolling, setGithubPolling] = useState(false);

  useEffect(() => {
    void refreshState();
  }, []);

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
    setLoading("run");
    try {
      const response = await fetch("/api/workspace/run", { method: "POST" });
      const result = await response.json();
      if (response.ok) {
        setState(result as MvpState);
      } else if (result.exec) {
        setState((current) => ({ ...current, exec: result.exec as ExecSetupState }));
      }
      await refreshState();
    } finally {
      setLoading(null);
    }
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
    setReviewDecision("idle");
  }

  async function deployProduction() {
    await runAction(
      "production",
      () => api<DeploymentDemoState>("/api/deploy/production", { method: "POST" }),
      (deployment) => setState((current) => ({ ...current, deployment })),
    );
    setReviewDecision("idle");
  }

  async function validateExecMarkdown() {
    await runAction(
      "exec-validate",
      async () => {
        const response = await api<ExecSetupState>("/api/exec/validate", {
          method: "POST",
          body: JSON.stringify({ markdown: execMarkdown }),
        });
        return response;
      },
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
      const exec = (await response.json()) as ExecSetupState;
      setState((current) => ({ ...current, exec }));
      if (response.ok) {
        await refreshState();
      }
    } finally {
      setLoading(null);
    }
  }

  const execReady = state.exec.exists && state.exec.validation.ready;
  const setupOpen = !execReady || showExecSetup;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {setupOpen ? (
        <ExecSetupModal
          state={state}
          markdown={execMarkdown}
          loading={loading}
          onMarkdownChange={setExecMarkdown}
          onValidate={() => void validateExecMarkdown()}
          onSave={() => void saveExecMarkdown()}
          onClose={execReady ? () => setShowExecSetup(false) : undefined}
        />
      ) : null}
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
              <p className="font-body text-xs text-muted-foreground">Agentic autonomy for PMs</p>
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
                <Badge tone={execReady ? "success" : "warning"}>
                  {execReady ? "exec.md ready" : "exec.md required"}
                </Badge>
              </div>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                Request a change, run the prepared workspace, and review the result without touching repo setup.
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
              <Button variant="secondary" icon={<FileText size={16} />} onClick={() => setShowExecSetup(true)} disabled={loading !== null}>
                Configure exec.md
              </Button>
              <Button icon={<Play size={16} />} onClick={() => void runWorkspace()} disabled={loading !== null || state.running}>
                {loading === "run" ? "Starting..." : "Run prepared workspace"}
              </Button>
            </div>
          </header>

          <div className="mx-auto grid max-w-[1180px] gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
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
              <RequestPanel
                requestBody={requestBody}
                requestType={requestType}
                onBodyChange={setRequestBody}
                onTypeChange={setRequestType}
                onSubmit={() => void submitRequest()}
                loading={loading === "request"}
                disabled={!apiAvailable || !state.validation.ready || !execReady}
                ready={state.validation.ready && execReady}
              />
              <DeploymentPanel
                deployment={state.deployment}
                loading={loading}
                onStage={() => void deployStaging()}
                onProduction={() => void deployProduction()}
                onDemote={() => setReviewDecision("needs-revision")}
                reviewDecision={reviewDecision}
              />
              <OpenAIPanel
                state={state}
                loading={loading === "openai"}
                onGenerate={() => void generateOpenAIPlan()}
              />
            </section>

            <aside className="grid content-start gap-6">
              <WorkspaceStatusPanel state={state} onConfigure={() => setShowExecSetup(true)} />

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Run logs</CardTitle>
                <CardDescription>Recent local runner events.</CardDescription>
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

function ExecSetupModal({
  state,
  markdown,
  loading,
  onMarkdownChange,
  onValidate,
  onSave,
  onClose,
}: {
  state: MvpState;
  markdown: string;
  loading: string | null;
  onMarkdownChange: (value: string) => void;
  onValidate: () => void;
  onSave: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-foreground/40 p-4 backdrop-blur-sm">
      <div className="mx-auto my-6 max-w-[1180px] rounded-md border border-border bg-card p-5 shadow-xl">
        <div className="mb-5 flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <FileText size={18} />
              <p className="font-primary text-sm text-muted-foreground">First-time workspace setup</p>
            </div>
            <h2 className="font-primary text-2xl font-medium">Create exec.md before Corvin runs locally</h2>
            <p className="mt-2 max-w-3xl font-body text-sm leading-relaxed text-muted-foreground">
              Corvin needs an engineering-owned exec.md file with selected repositories, env vars, install commands,
              dev commands, and health checks. The PM workflow stays blocked until this file validates.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={state.exec.exists && state.exec.validation.ready ? "success" : "warning"}>
              {state.exec.exists && state.exec.validation.ready ? "Ready" : "Setup required"}
            </Badge>
            {onClose ? (
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            ) : null}
          </div>
        </div>
        <ExecSetupEditor
          state={state}
          markdown={markdown}
          loading={loading}
          onMarkdownChange={onMarkdownChange}
          onValidate={onValidate}
          onSave={onSave}
        />
      </div>
    </div>
  );
}

export function ExecSetupPanel({
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
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>exec.md local setup</CardTitle>
          <CardDescription>
            Engineering selects linked repositories, envs, and run commands; Corvin packages the local workflow at runtime.
          </CardDescription>
        </div>
        <Badge tone={state.exec.exists && state.exec.validation.ready ? "success" : "warning"}>
          {state.exec.exists && state.exec.validation.ready ? "Valid" : "Required"}
        </Badge>
      </CardHeader>
      <ExecSetupEditor
        state={state}
        markdown={markdown}
        loading={loading}
        onMarkdownChange={onMarkdownChange}
        onValidate={onValidate}
        onSave={onSave}
      />
    </Card>
  );
}

function ExecSetupEditor({
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
  const parsed = useMemo(() => parseExecMarkdown(markdown), [markdown]);
  const document = parsed.ok ? parsed.document : null;
  const validation = state.exec.validation;
  const repoOptions = state.workspace.repositories.map((repository) => ({
    id: repository.id,
    repo: repository.sourceRef.replace(/^synced-repo:\/\//, ""),
    label: repository.label,
    role: repository.purpose ?? repository.label,
    health: state.workspace.services.find((service) => service.repositoryId === repository.id)?.healthUrl ?? "",
  }));

  function updateDocument(next: ExecDocument) {
    onMarkdownChange(renderExecMarkdown(next));
  }

  function updateRepository(index: number, patch: Partial<ExecRepository>) {
    if (!document) return;
    updateDocument({
      ...document,
      repositories: document.repositories.map((repository, itemIndex) =>
        itemIndex === index ? { ...repository, ...patch } : repository,
      ),
    });
  }

  function selectRepository(index: number, repo: string) {
    const option = repoOptions.find((item) => item.repo === repo);
    if (!option) return;
    updateRepository(index, {
      id: option.id,
      repo: option.repo,
      role: option.role,
      health: option.health,
    });
  }

  function addRepository() {
    if (!document) return;
    const used = new Set(document.repositories.map((repository) => repository.repo));
    const option = repoOptions.find((item) => !used.has(item.repo)) ?? repoOptions[0];
    if (!option) return;
    updateDocument({
      ...document,
      repositories: [
        ...document.repositories,
        {
          id: option.id,
          repo: option.repo,
          role: option.role,
          install: "",
          dev: "",
          health: option.health,
        },
      ],
    });
  }

  function updateGlobalEnv(index: number, patch: Partial<ExecDocument["environment"]["global"][number]>) {
    if (!document) return;
    updateDocument({
      ...document,
      environment: {
        ...document.environment,
        global: document.environment.global.map((variable, itemIndex) =>
          itemIndex === index ? { ...variable, ...patch } : variable,
        ),
      },
    });
  }

  function addGlobalEnv() {
    if (!document) return;
    updateDocument({
      ...document,
      environment: {
        ...document.environment,
        global: [
          ...document.environment.global,
          {
            name: "NEW_ENV_VAR",
            required: true,
            description: "Describe where this value comes from.",
          },
        ],
      },
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="grid gap-4">
        <div className="rounded-md border border-border bg-background p-4">
          <p className="font-primary text-sm font-medium">Survey setup</p>
          <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">
            Pick linked GitHub repositories and document exactly how each one installs, starts, and proves health.
          </p>

          {document ? (
            <div className="mt-4 grid gap-4">
              <label className="grid gap-2">
                <span className="font-primary text-xs font-medium text-muted-foreground">Purpose</span>
                <input
                  className="min-h-10 rounded-md border border-border bg-card px-3 font-body text-sm outline-none focus:border-primary"
                  value={document.purpose}
                  onChange={(event) => updateDocument({ ...document, purpose: event.target.value })}
                />
              </label>

              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-primary text-xs font-medium text-muted-foreground">Repositories</p>
                  <Button variant="secondary" onClick={addRepository} disabled={repoOptions.length === 0}>
                    Add repo
                  </Button>
                </div>
                {document.repositories.map((repository, index) => (
                  <div key={`${repository.id}-${index}`} className="grid gap-3 rounded-md border border-border bg-muted p-3">
                    <label className="grid gap-2">
                      <span className="font-primary text-xs text-muted-foreground">GitHub repository</span>
                      <select
                        className="min-h-10 rounded-md border border-border bg-card px-3 font-primary text-sm outline-none focus:border-primary"
                        value={repository.repo}
                        onChange={(event) => selectRepository(index, event.target.value)}
                      >
                        {repoOptions.map((option) => (
                          <option key={option.repo} value={option.repo}>
                            {option.repo}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <ExecInput label="Install" value={repository.install} onChange={(value) => updateRepository(index, { install: value })} />
                      <ExecInput label="Dev" value={repository.dev} onChange={(value) => updateRepository(index, { dev: value })} />
                    </div>
                    <ExecInput label="Health URL" value={repository.health} onChange={(value) => updateRepository(index, { health: value })} />
                  </div>
                ))}
              </div>

              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-primary text-xs font-medium text-muted-foreground">Global env vars</p>
                  <Button variant="secondary" onClick={addGlobalEnv}>
                    Add env
                  </Button>
                </div>
                {document.environment.global.map((variable, index) => (
                  <div key={`${variable.name}-${index}`} className="grid gap-3 rounded-md border border-border bg-muted p-3 md:grid-cols-[0.8fr_1.2fr]">
                    <ExecInput label="Name" value={variable.name} onChange={(value) => updateGlobalEnv(index, { name: value })} />
                    <ExecInput
                      label="Description"
                      value={variable.description}
                      onChange={(value) => updateGlobalEnv(index, { description: value })}
                    />
                  </div>
                ))}
              </div>

              <label className="grid gap-2">
                <span className="font-primary text-xs font-medium text-muted-foreground">Local run notes</span>
                <textarea
                  className="min-h-24 resize-y rounded-md border border-border bg-card p-3 font-body text-sm leading-relaxed outline-none focus:border-primary"
                  value={document.localRunNotes}
                  onChange={(event) => updateDocument({ ...document, localRunNotes: event.target.value })}
                />
              </label>
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 font-body text-sm text-red-700">
              Fix the Markdown preview so the structured YAML blocks can be parsed.
            </div>
          )}
        </div>

        <ValidationPanel validation={validation} parseErrors={parsed.ok ? [] : parsed.errors} />
      </div>

      <div className="grid gap-4">
        <div className="rounded-md border border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="font-primary text-sm font-medium">Editable exec.md preview</p>
              <p className="mt-1 font-body text-xs text-muted-foreground">
                Teams can edit this file directly in the workspace root.
              </p>
            </div>
            <Badge tone={parsed.ok ? "success" : "danger"}>{parsed.ok ? "Parseable" : "Invalid"}</Badge>
          </div>
          <textarea
            className="min-h-[520px] w-full resize-y rounded-md border border-border bg-muted p-4 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary"
            value={markdown}
            onChange={(event) => onMarkdownChange(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onValidate} disabled={loading !== null}>
            {loading === "exec-validate" ? "Checking..." : "Check exec.md"}
          </Button>
          <Button icon={<FileText size={16} />} onClick={onSave} disabled={loading !== null || !parsed.ok}>
            {loading === "exec-save" ? "Saving..." : "Save exec.md"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExecInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2">
      <span className="font-primary text-xs text-muted-foreground">{label}</span>
      <input
        className="min-h-10 rounded-md border border-border bg-card px-3 font-mono text-xs outline-none focus:border-primary"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ValidationPanel({
  validation,
  parseErrors,
}: {
  validation: ExecSetupState["validation"];
  parseErrors: ExecSetupState["validation"]["errors"];
}) {
  const errors = parseErrors.length > 0 ? parseErrors : validation.errors;
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-primary text-sm font-medium">Validation</p>
        <Badge tone={errors.length === 0 ? "success" : "danger"}>{errors.length === 0 ? "Ready" : "Blocked"}</Badge>
      </div>
      <div className="grid gap-2">
        {errors.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">No blocking errors. Warnings can be fixed later.</p>
        ) : (
          errors.map((issue) => (
            <div key={issue.id} className="rounded-md bg-red-50 p-3">
              <p className="font-primary text-xs font-medium text-red-700">{issue.label}</p>
              <p className="mt-1 font-body text-xs leading-relaxed text-red-700">{issue.detail}</p>
            </div>
          ))
        )}
        {validation.warnings.map((issue) => (
          <div key={issue.id} className="rounded-md bg-amber-50 p-3">
            <p className="font-primary text-xs font-medium text-amber-700">{issue.label}</p>
            <p className="mt-1 font-body text-xs leading-relaxed text-amber-700">{issue.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PMStoryPanel({ state }: { state: MvpState }) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-md bg-primary font-primary text-base text-primary-text">
            {state.pm.avatarInitials}
          </div>
          <div>
            <p className="font-primary text-xs text-muted-foreground">Current requester</p>
            <h2 className="font-primary text-lg font-medium">{state.pm.name}</h2>
            <p className="font-body text-xs text-muted-foreground">
              {state.pm.role}, {state.pm.team}
            </p>
          </div>
        </div>
        <p className="max-w-xl font-body text-sm leading-relaxed text-muted-foreground">{state.pm.currentIntent}</p>
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
          <CardTitle>OpenAI change plan</CardTitle>
          <CardDescription>Generate the implementation plan after the workspace is runnable.</CardDescription>
        </div>
        <Badge tone={state.openAI.configured ? "success" : "warning"}>
          {state.openAI.configured ? state.openAI.model : "Demo mode"}
        </Badge>
      </CardHeader>
      <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="rounded-md border border-border bg-background p-4">
          <p className="font-primary text-sm font-medium">Planner</p>
          <p className="mt-2 font-body text-sm text-muted-foreground">
            {state.openAI.provider} routes this request through {state.openAI.model}.
          </p>
          <Button className="mt-4 w-full" onClick={onGenerate} disabled={loading}>
            {loading ? "Planning..." : "Generate plan"}
          </Button>
        </div>
        <div className="rounded-md border border-border bg-background p-4">
          <p className="font-primary text-sm font-medium">{plan?.summary ?? "No plan generated yet."}</p>
          {plan?.recommendedHeadline ? (
            <p className="mt-3 rounded-md bg-muted p-3 font-body text-sm">{plan.recommendedHeadline}</p>
          ) : null}
          {plan?.steps?.length ? (
            <ol className="mt-4 grid gap-2">
              {plan.steps.slice(0, 3).map((step, index) => (
                <li key={step} className="flex gap-2 font-body text-sm text-muted-foreground">
                  <span className="font-mono text-foreground">{index + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          ) : null}
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
  onDemote,
  reviewDecision,
}: {
  deployment: DeploymentDemoState;
  loading: string | null;
  onStage: () => void;
  onProduction: () => void;
  onDemote: () => void;
  reviewDecision: "idle" | "needs-revision";
}) {
  const stagingReady = deployment.staging.status === "ready";
  const productionAccepted =
    stagingReady && deployment.production.status === "live" && deployment.production.headline === deployment.staging.headline;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Review build</CardTitle>
          <CardDescription>Promote only after the prepared preview is ready.</CardDescription>
        </div>
        <Badge tone={productionAccepted ? "success" : stagingReady ? "info" : "neutral"}>
          {productionAccepted ? "Accepted" : stagingReady ? "Ready to review" : "No review yet"}
        </Badge>
      </CardHeader>
      <div className="grid gap-3 xl:grid-cols-2">
        <EnvironmentPreview env={stagingReady ? deployment.staging : deployment.local} />
        <EnvironmentPreview env={deployment.production} compact />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {!stagingReady ? (
          <Button onClick={onStage} disabled={loading !== null}>
            {loading === "staging" ? "Preparing..." : "Prepare review"}
          </Button>
        ) : null}
        {stagingReady && !productionAccepted && reviewDecision === "idle" ? (
          <>
            <Button icon={<Rocket size={16} />} onClick={onProduction} disabled={loading !== null}>
              {loading === "production" ? "Accepting..." : "Accept to production"}
            </Button>
            <Button variant="secondary" onClick={onDemote} disabled={loading !== null}>
              Send back
            </Button>
          </>
        ) : null}
        {stagingReady && reviewDecision === "needs-revision" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="warning">Sent back for revision</Badge>
            <Button variant="secondary" onClick={onStage} disabled={loading !== null}>
              Prepare revised review
            </Button>
          </div>
        ) : null}
      </div>
      <div className="mt-5 rounded-md bg-muted p-3">
        <ul className="mt-2 grid gap-1 font-mono text-xs text-foreground">
          {deployment.auditTrail.slice(-3).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function EnvironmentPreview({ env, compact = false }: { env: AppEnvironment; compact?: boolean }) {
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
        {!compact ? <p className="mt-2 font-body text-sm leading-relaxed text-muted-foreground">{env.subcopy}</p> : null}
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
    <div className="grid gap-4 md:grid-cols-2">
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
  icon: ReactNode;
  integration?: Integration;
  actionLabel: string;
  onAction?: () => void;
}) {
  const connected = integration?.status === "connected" || integration?.status === "ready";
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-md bg-muted text-foreground">{icon}</div>
          <div>
            <h2 className="font-primary text-base font-medium">{integration?.label}</h2>
            <p className="font-body text-xs text-muted-foreground">{connected ? "Connected" : "Not connected"}</p>
          </div>
        </div>
        <Badge tone={connected ? "success" : "warning"}>{connected ? "Connected" : "Connect"}</Badge>
      </div>
      {!connected ? (
        <Button className="mt-4 w-full" variant="secondary" onClick={onAction} disabled={!onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </Card>
  );
}

function WorkspaceStatusPanel({ state, onConfigure }: { state: MvpState; onConfigure: () => void }) {
  const execReady = state.exec.exists && state.exec.validation.ready;
  const healthyServices = state.workspace.services.filter((service) => service.status === "healthy").length;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Local setup status.</CardDescription>
        </div>
        <Badge tone={execReady ? "success" : "warning"}>{execReady ? "Ready" : "Blocked"}</Badge>
      </CardHeader>
      <div className="grid gap-3">
        <StatusRow label="exec.md" value={execReady ? "Valid" : "Required"} tone={execReady ? "success" : "warning"} />
        <StatusRow label="Repos" value={`${state.exec.runPlan?.commands.length ?? state.workspace.repositories.length} configured`} />
        <StatusRow label="Services" value={`${healthyServices}/${state.workspace.services.length} healthy`} />
        <StatusRow label="Runner" value={state.running ? "Running" : "Stopped"} tone={state.running ? "success" : "neutral"} />
        <Button variant="secondary" icon={<FileText size={16} />} onClick={onConfigure}>
          Configure exec.md
        </Button>
      </div>
    </Card>
  );
}

function StatusRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
      <p className="font-primary text-sm text-muted-foreground">{label}</p>
      <Badge tone={tone}>{value}</Badge>
    </div>
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
  ready,
}: {
  requestBody: string;
  requestType: string;
  onBodyChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  disabled: boolean;
  ready: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Request a change</CardTitle>
          <CardDescription>Capture the PM request once setup is ready.</CardDescription>
        </div>
        <Badge tone={ready ? "success" : "warning"}>{ready ? "Ready" : "Setup required"}</Badge>
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
