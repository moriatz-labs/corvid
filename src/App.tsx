import {
  FileText,
  Github,
  Loader2,
  MessageCircle,
  QrCode,
  Rocket,
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
  const [activeSurface, setActiveSurface] = useState<"settings" | "job">("settings");

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

  async function applyJobChange() {
    const job = state.jobs[0];
    if (!job) return;
    await runAction(
      "apply-change",
      () =>
        api<MvpState["jobs"][number]>(`/api/jobs/${job.id}/apply-change`, {
          method: "POST",
          body: JSON.stringify({ feedback: reviewDecision === "needs-revision" ? "Apply requested review changes." : "" }),
        }),
      (nextJob) =>
        setState((current) => ({
          ...current,
          jobs: current.jobs.map((item) => (item.id === nextJob.id ? nextJob : item)),
        })),
    );
  }

  async function createJobPullRequest() {
    const job = state.jobs[0];
    if (!job) return;
    await runAction(
      "create-pr",
      () => api<MvpState["jobs"][number]>(`/api/jobs/${job.id}/pull-request`, { method: "POST" }),
      (nextJob) =>
        setState((current) => ({
          ...current,
          jobs: current.jobs.map((item) => (item.id === nextJob.id ? nextJob : item)),
        })),
    );
  }

  async function requestJobChanges() {
    const job = state.jobs[0];
    if (!job) {
      setReviewDecision("needs-revision");
      return;
    }
    await runAction(
      "request-changes",
      () =>
        api<MvpState["jobs"][number]>(`/api/jobs/${job.id}/request-changes`, {
          method: "POST",
          body: JSON.stringify({ feedback: "PM sent the review back for changes." }),
        }),
      (nextJob) => {
        setReviewDecision("needs-revision");
        setState((current) => ({
          ...current,
          jobs: current.jobs.map((item) => (item.id === nextJob.id ? nextJob : item)),
        }));
      },
    );
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
  const currentAction = getCurrentAction(state, reviewDecision);

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
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <img
              src="/corvin-logo.png"
              alt="Corvin"
              className="size-10 rounded-lg border border-border object-cover shadow-sm"
            />
            <div>
              <p className="font-primary text-base font-medium">Corvin</p>
              <p className="font-body text-xs text-muted-foreground">{state.workspace.name}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={activeSurface === "settings" ? "primary" : "secondary"}
              onClick={() => setActiveSurface("settings")}
            >
              Settings
            </Button>
            <Button
              variant={activeSurface === "job" ? "primary" : "secondary"}
              onClick={() => setActiveSurface("job")}
            >
              Current job
            </Button>
            <Button onClick={() => setActiveSurface("job")} disabled={!execReady}>
              Start a job
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1180px] gap-6 px-5 py-6 lg:px-8">
        <CurrentActionBanner action={currentAction} apiAvailable={apiAvailable} execReady={execReady} />

        {activeSurface === "settings" ? (
          <SettingsSurface
            state={state}
            loading={githubPolling ? "github" : loading}
            whatsAppConnect={whatsAppConnect}
            onConfigureExec={() => setShowExecSetup(true)}
            onWhatsApp={() => void connectWhatsApp()}
            onGitHub={() => void connectGitHub()}
            onOpenJob={() => setActiveSurface("job")}
          />
        ) : (
          <JobSurface
            state={state}
            requestBody={requestBody}
            requestType={requestType}
            loading={loading}
            ready={state.validation.ready && execReady}
            action={currentAction}
            reviewDecision={reviewDecision}
            onBodyChange={setRequestBody}
            onTypeChange={setRequestType}
            onSubmit={() => void submitRequest()}
            onPrepareContext={() => void runWorkspace()}
            onGeneratePlan={() => void generateOpenAIPlan()}
            onApplyChange={() => void applyJobChange()}
            onCreatePullRequest={() => void createJobPullRequest()}
            onStage={() => void deployStaging()}
            onProduction={() => void deployProduction()}
            onDemote={() => void requestJobChanges()}
            onStop={() => void stopWorkspace(false)}
          />
        )}
      </main>
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
        <div className="flex flex-wrap items-center justify-end gap-2 self-end">
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

type CurrentAction = {
  label: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
};

function getCurrentAction(state: MvpState, reviewDecision: "idle" | "needs-revision"): CurrentAction {
  const execReady = state.exec.exists && state.exec.validation.ready;
  const latestRequest = state.requests[0];
  const latestJob = state.jobs[0];
  const stagingReady = state.deployment.staging.status === "ready";
  const productionAccepted =
    stagingReady &&
    state.deployment.production.status === "live" &&
    state.deployment.production.headline === state.deployment.staging.headline;

  if (!execReady) {
    return {
      label: "Waiting for execution settings",
      detail: "Execution, WhatsApp, and GitHub setup must be ready before jobs can run.",
      tone: "warning",
    };
  }
  if (!latestRequest) {
    return {
      label: "Waiting for job",
      detail: "Start a job to request a copy change, product change, or bug fix.",
      tone: "neutral",
    };
  }
  if (latestJob?.status === "blocked") {
    return {
      label: latestJob.currentAction,
      detail: latestJob.logs[0] ?? "This job is blocked until setup is complete.",
      tone: "warning",
    };
  }
  if (latestJob?.status === "failed") {
    return {
      label: latestJob.currentAction,
      detail: latestJob.logs[0] ?? "This job failed while preparing the workspace.",
      tone: "danger",
    };
  }
  if (latestJob?.status === "cloning") {
    return {
      label: "Getting repository",
      detail: latestJob.currentAction,
      tone: "info",
    };
  }
  if (latestJob?.status === "branch-ready") {
    return {
      label: "Repository ready",
      detail: `${latestJob.plan.repositories.length} repositories are cloned on ${latestJob.plan.branchName}.`,
      tone: "success",
    };
  }
  if (latestJob?.status === "healthy") {
    return {
      label: "Showing it locally",
      detail: "Localhost services are healthy and ready for changes.",
      tone: "success",
    };
  }
  if (latestJob?.status === "waiting-for-approval") {
    return {
      label: "Waiting for approval",
      detail: `${latestJob.changedFiles.length} changed files are ready for review.`,
      tone: "warning",
    };
  }
  if (latestJob?.status === "waiting-for-changes") {
    return {
      label: "Waiting for changes",
      detail: latestJob.logs[0] ?? "Review feedback is ready for the next change iteration.",
      tone: "warning",
    };
  }
  if (latestJob?.status === "pr-open") {
    return {
      label: "Pull request open",
      detail: latestJob.pullRequests[0]?.url ?? "Review the opened pull request.",
      tone: "info",
    };
  }
  if (!state.running) {
    return {
      label: "Getting repository",
      detail: `${latestRequest.title} is captured. Corvin is ready to prepare the repo context for this job.`,
      tone: "info",
    };
  }
  if (!state.openAI.lastPlan || !stagingReady) {
    return {
      label: "Showing it locally",
      detail: "The agent is preparing local output and a reviewable preview for this job.",
      tone: "info",
    };
  }
  if (reviewDecision === "needs-revision") {
    return {
      label: "Waiting for changes",
      detail: "The review was sent back. The next run should prepare a revised preview.",
      tone: "warning",
    };
  }
  if (!productionAccepted) {
    return {
      label: "Waiting for approval",
      detail: "A preview is ready. Accept it or send it back from this job.",
      tone: "warning",
    };
  }
  return {
    label: "Approved",
    detail: "The reviewed change has been promoted for this job.",
    tone: "success",
  };
}

function CurrentActionBanner({
  action,
  apiAvailable,
  execReady,
}: {
  action: CurrentAction;
  apiAvailable: boolean;
  execReady: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="font-primary text-xs text-muted-foreground">Current action</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge tone={action.tone}>{action.label}</Badge>
          <p className="font-body text-sm text-muted-foreground">{action.detail}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone={apiAvailable ? "success" : "warning"}>
          {apiAvailable ? "Runner connected" : "Demo mode"}
        </Badge>
        <Badge tone={execReady ? "success" : "warning"}>{execReady ? "exec.md ready" : "exec.md required"}</Badge>
      </div>
    </div>
  );
}

function SettingsSurface({
  state,
  loading,
  whatsAppConnect,
  onConfigureExec,
  onWhatsApp,
  onGitHub,
  onOpenJob,
}: {
  state: MvpState;
  loading: string | null;
  whatsAppConnect: WhatsAppConnect | null;
  onConfigureExec: () => void;
  onWhatsApp: () => void;
  onGitHub: () => void;
  onOpenJob: () => void;
}) {
  const integrations = Object.fromEntries(state.integrations.map((integration) => [integration.id, integration]));
  const execReady = state.exec.exists && state.exec.validation.ready;
  const whatsApp = integrations.whatsapp;
  const github = integrations.github;
  const whatsAppConnected = whatsApp?.status === "connected" || whatsAppConnect?.connected;
  const githubConnected = github?.status === "connected";

  return (
    <section className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <SettingsCard
          icon={<FileText size={20} />}
          title="Execution"
          status={execReady ? "Ready" : "Required"}
          tone={execReady ? "success" : "warning"}
          detail={execReady ? "exec.md is valid and can package job setup." : "Create exec.md before jobs can run."}
          actionLabel="Configure execution"
          onAction={onConfigureExec}
        />
        <SettingsCard
          icon={<MessageCircle size={20} />}
          title="WhatsApp"
          status={whatsAppConnected ? "Connected" : "Not connected"}
          tone={whatsAppConnected ? "success" : "warning"}
          detail={whatsAppConnected ? "WhatsApp intake is connected." : "Connect WhatsApp for message-based jobs."}
          actionLabel={loading === "whatsapp" ? "Preparing..." : "Connect WhatsApp"}
          onAction={whatsAppConnected ? undefined : onWhatsApp}
        />
        <SettingsCard
          icon={<Github size={20} />}
          title="GitHub"
          status={githubConnected ? "Connected" : "Not connected"}
          tone={githubConnected ? "success" : "warning"}
          detail={githubConnected ? "Repository access is connected." : "Connect GitHub before repository jobs run."}
          actionLabel={loading === "github" ? "Connecting..." : "Connect GitHub"}
          onAction={githubConnected ? undefined : onGitHub}
        />
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Do you want to start a job?</CardTitle>
            <CardDescription>Create copy changes, product changes, and bug fixes from the job page.</CardDescription>
          </div>
          <Button onClick={onOpenJob} disabled={!execReady}>
            Start a job
          </Button>
        </div>
      </Card>
    </section>
  );
}

function SettingsCard({
  icon,
  title,
  status,
  tone,
  detail,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  status: string;
  tone: CurrentAction["tone"];
  detail: string;
  actionLabel: string;
  onAction?: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-md bg-muted text-foreground">{icon}</div>
          <div>
            <h2 className="font-primary text-base font-medium">{title}</h2>
            <p className="font-body text-xs text-muted-foreground">{detail}</p>
          </div>
        </div>
        <Badge tone={tone}>{status}</Badge>
      </div>
      {onAction ? (
        <Button className="mt-4 w-full" variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </Card>
  );
}

function JobSurface({
  state,
  requestBody,
  requestType,
  loading,
  ready,
  action,
  reviewDecision,
  onBodyChange,
  onTypeChange,
  onSubmit,
  onPrepareContext,
  onGeneratePlan,
  onApplyChange,
  onCreatePullRequest,
  onStage,
  onProduction,
  onDemote,
  onStop,
}: {
  state: MvpState;
  requestBody: string;
  requestType: string;
  loading: string | null;
  ready: boolean;
  action: CurrentAction;
  reviewDecision: "idle" | "needs-revision";
  onBodyChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onSubmit: () => void;
  onPrepareContext: () => void;
  onGeneratePlan: () => void;
  onApplyChange: () => void;
  onCreatePullRequest: () => void;
  onStage: () => void;
  onProduction: () => void;
  onDemote: () => void;
  onStop: () => void;
}) {
  const latestJob = state.jobs[0];
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-6">
        <RequestPanel
          requestBody={requestBody}
          requestType={requestType}
          onBodyChange={onBodyChange}
          onTypeChange={onTypeChange}
          onSubmit={onSubmit}
          loading={loading === "request"}
          disabled={!ready}
          ready={ready}
        />
        <JobControls
          state={state}
          loading={loading}
          onPrepareContext={onPrepareContext}
          onGeneratePlan={onGeneratePlan}
          onApplyChange={onApplyChange}
          onCreatePullRequest={onCreatePullRequest}
          onStage={onStage}
        />
        <DeploymentPanel
          deployment={state.deployment}
          loading={loading}
          onStage={onStage}
          onProduction={onProduction}
          onDemote={onDemote}
          reviewDecision={reviewDecision}
        />
      </div>
      <aside className="grid content-start gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Job logs</CardTitle>
              <CardDescription>Exactly what the agent is doing right now.</CardDescription>
            </div>
            <Badge tone={action.tone}>{action.label}</Badge>
          </CardHeader>
          <div className="mb-4 rounded-md border border-border bg-background p-3">
            <p className="font-primary text-sm font-medium">{action.label}</p>
            <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">{action.detail}</p>
          </div>
          {latestJob ? (
            <div className="mb-4 rounded-md border border-border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-primary text-sm font-medium">Workspace</p>
                <Badge tone={latestJob.status === "failed" ? "danger" : latestJob.status === "blocked" ? "warning" : "info"}>
                  {latestJob.status}
                </Badge>
              </div>
              <p className="break-all font-mono text-xs text-muted-foreground">{latestJob.plan.branchName}</p>
              <div className="mt-3 grid gap-2">
                {latestJob.plan.repositories.map((repository) => (
                  <div key={repository.id} className="rounded-md bg-muted p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-primary text-xs font-medium">{repository.id}</p>
                      <Badge tone={repository.status === "failed" ? "danger" : repository.status === "branch-ready" ? "success" : "neutral"}>
                        {repository.status}
                      </Badge>
                    </div>
                    <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{repository.localPath}</p>
                  </div>
                ))}
              </div>
              {latestJob.changedFiles.length > 0 ? (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="font-primary text-xs font-medium">Changed files</p>
                  <div className="mt-2 grid gap-1">
                    {latestJob.changedFiles.slice(0, 6).map((file) => (
                      <p key={`${file.repositoryId}-${file.path}`} className="break-all font-mono text-[11px] text-muted-foreground">
                        {file.repositoryId}: {file.status} {file.path}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
              {latestJob.pullRequests.length > 0 ? (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="font-primary text-xs font-medium">Pull requests</p>
                  <div className="mt-2 grid gap-1">
                    {latestJob.pullRequests.map((pullRequest) => (
                      <a
                        key={pullRequest.url}
                        className="break-all font-mono text-[11px] text-foreground underline"
                        href={pullRequest.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {pullRequest.repo}#{pullRequest.number}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="max-h-96 overflow-auto rounded-md bg-muted p-4 font-mono text-xs leading-relaxed text-foreground">
            {state.logs.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          {state.running ? (
            <Button className="mt-4 w-full" variant="secondary" onClick={onStop}>
              Stop job
            </Button>
          ) : null}
        </Card>
      </aside>
    </section>
  );
}

function JobControls({
  state,
  loading,
  onPrepareContext,
  onGeneratePlan,
  onApplyChange,
  onCreatePullRequest,
  onStage,
}: {
  state: MvpState;
  loading: string | null;
  onPrepareContext: () => void;
  onGeneratePlan: () => void;
  onApplyChange: () => void;
  onCreatePullRequest: () => void;
  onStage: () => void;
}) {
  const hasRequest = state.requests.length > 0;
  const latestJob = state.jobs[0];
  const canApplyChange = Boolean(latestJob && ["healthy", "branch-ready", "waiting-for-changes"].includes(latestJob.status));
  const canCreatePullRequest = Boolean(latestJob?.changedFiles.length);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Job actions</CardTitle>
          <CardDescription>Actions appear in the order this job needs them.</CardDescription>
        </div>
      </CardHeader>
      <div className="grid gap-3 md:grid-cols-5">
        <Button variant="secondary" onClick={onPrepareContext} disabled={!hasRequest || loading !== null || state.running}>
          {loading === "run" ? "Getting repository..." : "Get repository"}
        </Button>
        <Button variant="secondary" onClick={onGeneratePlan} disabled={!hasRequest || loading !== null}>
          {loading === "openai" ? "Planning..." : "Plan change"}
        </Button>
        <Button variant="secondary" onClick={onApplyChange} disabled={!canApplyChange || loading !== null}>
          {loading === "apply-change" ? "Applying..." : "Apply change"}
        </Button>
        <Button variant="secondary" onClick={onCreatePullRequest} disabled={!canCreatePullRequest || loading !== null}>
          {loading === "create-pr" ? "Opening PR..." : "Create PR"}
        </Button>
        <Button onClick={onStage} disabled={!hasRequest || loading !== null}>
          {loading === "staging" ? "Showing locally..." : "Show locally"}
        </Button>
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
