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
  /** Cosmetic model label for page-agent's OpenAI client (never sent to AuraGo). */
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
  var documentId = Array.from(crypto.getRandomValues(new Uint8Array(16)), function (byte) {
    return byte.toString(16).padStart(2, "0");
  }).join("");
  window.__agodeskPageAgentDocumentId = documentId;
  var authorizedUntil = 0;
  window.__agodeskPageAgentTaskActive = false;
  window.__agodeskPageAgentAuthorize = function () { authorizedUntil = Date.now() + 1000; };
  function guardPanelEvent(event) {
    var root = document.getElementById("page-agent-runtime_agent-panel");
    if (!root || !event.composedPath().includes(root)) return;
    if (!event.isTrusted) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return;
    }
    if (event.type === "click" || event.type === "keydown") {
      window.__agodeskPageAgentAuthorize();
    }
  }
  ["click", "keydown", "submit", "input"].forEach(function (name) {
    window.addEventListener(name, guardPanelEvent, true);
  });

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

  function callBridge(bodyText, signal, navigation) {
    return new Promise(function (resolve, reject) {
      if (!window.__agodeskPageAgentTaskActive || bodyText.length > 524288 || Object.keys(pending).length >= 8) {
        reject(new Error("No active task or request limit exceeded."));
        return;
      }
      var id = "pa-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
      pending[id] = { resolve: resolve, reject: reject };
      var timer = setTimeout(function () {
        if (pending[id]) {
          var entry = pending[id];
          delete pending[id];
          entry.reject(new Error("Page-agent request timed out."));
        }
      }, 120000);
      var originalResolve = resolve;
      var originalReject = reject;
      function onAbort() {
        var entry = pending[id];
        if (!entry) return;
        delete pending[id];
        entry.reject(new DOMException("Aborted", "AbortError"));
      }
      function cleanup() {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
      }
      pending[id].resolve = function (value) { cleanup(); originalResolve(value); };
      pending[id].reject = function (error) { cleanup(); originalReject(error); };
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
      try {
        var bridge = window[CONFIG.binding];
        if (typeof bridge !== "function") {
          throw new Error("agodesk page-agent bridge is not available.");
        }
        bridge(JSON.stringify(navigation
          ? { id: id, navigate: navigation.navigate, resumeTask: navigation.resumeTask, documentId: documentId }
          : { id: id, body: bodyText, documentId: documentId }));
      } catch (error) {
        var entry = pending[id];
        delete pending[id];
        if (entry) entry.reject(error);
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

  function revealPanel(forceInput) {
    var agent = window.__agodeskPageAgent;
    if (!agent || !agent.panel) { return false; }
    try {
      if (typeof agent.panel.show === "function") {
        agent.panel.show();
      }
      var running = agent.status === "running";
      var finished =
        agent.status === "completed" ||
        agent.status === "error" ||
        agent.status === "stopped";
      var hasHistory = !!(agent.history && agent.history.length > 0);
      // panel.reset() rebuilds + collapses history — that hides the done/summary
      // text. Only reset on a blank idle panel (first boot / empty state).
      if (
        !running &&
        !finished &&
        !hasHistory &&
        forceInput &&
        typeof agent.panel.reset === "function"
      ) {
        agent.panel.reset();
        agent.panel.show();
      } else if ((!running || forceInput) && finished && typeof agent.panel.expand === "function") {
        // Keep the done card visible after a finished task.
        agent.panel.expand();
      }
      // Belt-and-suspenders: CSS module hashes the "hidden" class; strip it from
      // the input wrapper if native status handling did not unhide it.
      if (!running || forceInput) {
        var root = agent.panel.wrapper || document.getElementById("page-agent-runtime_agent-panel");
        if (root) {
          var nodes = root.querySelectorAll("[class*=\\"inputSectionWrapper\\"]");
          for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var classes = el.className.split(/\\s+/);
            for (var j = 0; j < classes.length; j++) {
              if (classes[j] && classes[j].indexOf("hidden") !== -1) {
                el.classList.remove(classes[j]);
              }
            }
          }
        }
      }
      return true;
    } catch (error) {
      console.error("[agodesk] page-agent reveal failed", error);
      return false;
    }
  }

  function boot() {
    if (window.__agodeskPageAgent) { return; }
    if (typeof window.PageAgent !== "function") {
      console.error("[agodesk] page-agent bundle is not loaded.");
      return;
    }
    try {
      var customTools = Object.create(null);
      var toolFactory = window.PageAgentTool;
      var z = window.PageAgentZod;
      // page-agent has no built-in URL navigation (in-page only). We add go_to_url
      // via CDP: stash the task, ask agodesk to Page.navigate, then resume after
      // the new document reinjects the agent.
      if (typeof toolFactory === "function" && z && z.object && z.string) {
        customTools.go_to_url = toolFactory({
          description:
            "Navigate the current tab to an absolute http(s) URL. Use this to open websites " +
            "(e.g. https://www.amazon.de). Prefer https. Do not ask the user to type URLs " +
            "into the browser chrome when this tool is available.",
          inputSchema: z.object({
            url: z.string().describe("Absolute or host URL, e.g. https://www.amazon.de or amazon.de"),
          }),
          execute: async function (input) {
            if (!window.__agodeskPageAgentTaskActive) throw new Error("No active page-agent task.");
            var raw = input && typeof input.url === "string" ? input.url.trim() : "";
            if (!raw) {
              throw new Error("go_to_url requires a non-empty url.");
            }
            var url = /^https?:\\/\\//i.test(raw) ? raw : ("https://" + raw.replace(/^\\/+/, ""));
            var bridge = window[CONFIG.binding];
            if (typeof bridge !== "function") {
              throw new Error("agodesk page-agent bridge is not available for navigation.");
            }
            // Cross-origin navigations wipe this JS context; agodesk resumes the
            // task via CDP after reinjecting page-agent on the new document.
            var resumeTask = "";
            try {
              resumeTask =
                (this && this.task) ||
                (window.__agodeskPageAgent && window.__agodeskPageAgent.task) ||
                "";
            } catch (error) {
              resumeTask = "";
            }
            if (typeof resumeTask !== "string") {
              resumeTask = "";
            }
            await callBridge("{}", undefined, {
              navigate: url,
              resumeTask: resumeTask,
            });
            // Successful navigation destroys this context; failures reject the tool.
            return "Navigating to " + url;
          },
        });
      }

      var agent = new window.PageAgent({
        model: CONFIG.model,
        apiKey: CONFIG.apiKey,
        baseURL: CONFIG.baseURL,
        language: CONFIG.language,
        maxSteps: CONFIG.maxSteps,
        customFetch: agodeskFetch,
        // Model-generated scripts must not gain access to the isolated bridge.
        experimentalScriptExecutionTool: false,
        customTools: customTools,
        instructions: {
          system:
            "To open or change websites you MUST call go_to_url. Never use " +
            "execute_javascript / location.assign / location.href / window.open to navigate — " +
            "that destroys the agent. On about:blank or empty pages, call go_to_url first. " +
            "Never ask the user to type a URL into the address bar.",
        },
        onAfterTask: function () {
          window.__agodeskPageAgentTaskActive = false;
          // Native statuschange already expands history (with done text) and
          // shows the next-task input. Only reinforce that — never reset().
          revealPanel(false);
          try {
            if (agent.panel && typeof agent.panel.expand === "function") {
              agent.panel.expand();
            }
          } catch (error) {
            /* ignore */
          }
        },
      });
      var execute = agent.execute.bind(agent);
      agent.execute = function (task) {
        if (Date.now() > authorizedUntil || window.__agodeskPageAgentTaskActive) {
          return Promise.reject(new Error("A trusted user action is required to start a task."));
        }
        authorizedUntil = 0;
        window.__agodeskPageAgentTaskActive = true;
        return Promise.resolve(execute(task)).finally(function () {
          window.__agodeskPageAgentTaskActive = false;
        });
      };
      window.__agodeskPageAgent = agent;
      window.__agodeskPageAgentReveal = revealPanel;
  // Panel starts hidden (page-agent default); reveal so the task input is usable.
      // forceInput+empty history → reset is safe here (no done card to wipe).
      revealPanel(true);
    } catch (error) {
      console.error("[agodesk] page-agent init failed", error);
    }
  }

  window.__agodeskPageAgentTeardown = function () {
    window.__agodeskPageAgentTaskActive = false;
    authorizedUntil = 0;
    ["click", "keydown", "submit", "input"].forEach(function (name) {
      window.removeEventListener(name, guardPanelEvent, true);
    });
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
