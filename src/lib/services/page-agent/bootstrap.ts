/**
 * page-agent only ships UI languages en-US and zh-CN. We map the app locale to
 * the closest supported value and default to English.
 */
export type PageAgentLanguage = "en-US" | "zh-CN";

export interface PageAgentBootstrapConfig {
  /** Global function name exposed via CDP Runtime.addBinding (must match Rust). */
  bindingName: string;
  /** Sentinel base URL; customFetch intercepts every call, so it never hits the network. */
  baseUrl: string;
  /** Cosmetic model label forwarded to AuraGo (provider is chosen by provider_id). */
  model: string;
  language: PageAgentLanguage;
  /** Max agent steps per task (page-agent default is 40). */
  maxSteps: number;
}

export function resolvePageAgentLanguage(locale: string | undefined): PageAgentLanguage {
  return typeof locale === "string" && locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

/**
 * Produces the classic-script bootstrap that agodesk injects (alongside the
 * vendored bundle) into the controlled tab. It wires page-agent's `customFetch`
 * to the CDP binding, exposes a resolver the Rust side calls with the proxied
 * completion, and instantiates the in-page agent (with its own Panel UI) once
 * the DOM is ready.
 */
export function buildPageAgentBootstrap(config: PageAgentBootstrapConfig): string {
  const settings = JSON.stringify({
    binding: config.bindingName,
    baseURL: config.baseUrl,
    model: config.model,
    apiKey: "agodesk-proxy",
    language: config.language,
    maxSteps: config.maxSteps,
  });

  return `
(function () {
  // Only run in the top document; the new-document hook also fires for iframes.
  try { if (window.top !== window.self) { return; } } catch (error) { return; }
  if (window.__agodeskPageAgentInstalled) { return; }
  window.__agodeskPageAgentInstalled = true;

  var CONFIG = ${settings};
  var pending = Object.create(null);

  window.__agodeskPageAgentResolve = function (id, ok, payload) {
    var entry = pending[id];
    if (!entry) { return; }
    delete pending[id];
    if (ok) {
      entry.resolve(payload);
    } else {
      entry.reject(new Error(typeof payload === "string" && payload ? payload : "page-agent LLM proxy error"));
    }
  };

  function callBridge(bodyText, signal) {
    return new Promise(function (resolve, reject) {
      var id = "pa-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
      pending[id] = { resolve: resolve, reject: reject };
      if (signal) {
        if (signal.aborted) {
          delete pending[id];
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", function () {
          if (pending[id]) {
            delete pending[id];
            reject(new DOMException("Aborted", "AbortError"));
          }
        }, { once: true });
      }
      try {
        var bridge = window[CONFIG.binding];
        if (typeof bridge !== "function") {
          throw new Error("agodesk page-agent bridge is not available.");
        }
        bridge(JSON.stringify({ id: id, body: bodyText }));
      } catch (error) {
        delete pending[id];
        reject(error);
      }
    });
  }

  function agodeskFetch(input, init) {
    var body = init && typeof init.body === "string" ? init.body : "{}";
    var signal = init && init.signal ? init.signal : undefined;
    return callBridge(body, signal).then(function (jsonText) {
      return new Response(jsonText, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
  }

  function boot() {
    if (window.__agodeskPageAgent) { return; }
    if (typeof window.PageAgent !== "function") {
      console.error("[agodesk] page-agent bundle is not loaded.");
      return;
    }
    try {
      window.__agodeskPageAgent = new window.PageAgent({
        model: CONFIG.model,
        apiKey: CONFIG.apiKey,
        baseURL: CONFIG.baseURL,
        language: CONFIG.language,
        maxSteps: CONFIG.maxSteps,
        customFetch: agodeskFetch,
      });
    } catch (error) {
      console.error("[agodesk] page-agent init failed", error);
    }
  }

  window.__agodeskPageAgentTeardown = function () {
    try {
      var instance = window.__agodeskPageAgent;
      if (instance) {
        if (typeof instance.stop === "function") { instance.stop(); }
        if (typeof instance.dispose === "function") { instance.dispose(); }
        if (instance.panel && typeof instance.panel.destroy === "function") {
          instance.panel.destroy();
        }
      }
    } catch (error) {
      /* best effort */
    }
    window.__agodeskPageAgent = null;
    for (var key in pending) {
      try { pending[key].reject(new Error("page-agent stopped")); } catch (error) { /* ignore */ }
      delete pending[key];
    }
    window.__agodeskPageAgentInstalled = false;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
`;
}
