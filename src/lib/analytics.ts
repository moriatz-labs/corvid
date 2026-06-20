type AnalyticsProperties = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    pendo?: {
      initialize?: (input: unknown) => void;
      identify?: (input: unknown) => void;
      updateOptions?: (input: unknown) => void;
      pageLoad?: () => void;
      track?: (name: string, properties?: AnalyticsProperties) => void;
      trackAgent?: (name: string, properties?: AnalyticsProperties) => void;
    };
  }
}

export function initializeProductAnalytics(visitor: { id: string; email?: string; name?: string } | null) {
  const apiKey = import.meta.env.VITE_NOVUS_PENDO_API_KEY as string | undefined;
  if (!apiKey || typeof window === "undefined") return;

  if (!window.pendo) {
    installPendoSnippet(apiKey);
  }

  window.pendo?.initialize?.({
    visitor: visitor
      ? {
          id: visitor.id,
          email: visitor.email,
          full_name: visitor.name,
        }
      : undefined,
    account: {
      id: "corvin-public",
      name: "Corvin",
    },
  });
}

export function trackProductEvent(name: string, properties: AnalyticsProperties = {}) {
  if (typeof window === "undefined") return;
  window.pendo?.track?.(name, {
    app: "corvin",
    ...Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined)),
  });
}

function installPendoSnippet(apiKey: string) {
  const methods = ["initialize", "identify", "updateOptions", "pageLoad", "track", "trackAgent"];
  const pendoStub: Record<string, unknown> = {};
  for (const method of methods) {
    pendoStub[method] = (...args: unknown[]) => {
      const queue = (pendoStub._q as unknown[]) ?? [];
      queue.push([method, ...args]);
      pendoStub._q = queue;
    };
  }

  window.pendo = pendoStub as Window["pendo"];
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://cdn.pendo.io/agent/static/${apiKey}/pendo.js`;
  document.head.appendChild(script);
}
