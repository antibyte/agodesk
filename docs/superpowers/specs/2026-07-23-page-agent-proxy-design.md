# Page-Agent Proxy Integration — Design

Status: implemented (v1)
Date: 2026-07-23

## Goal

Offer Alibaba [page-agent](https://github.com/alibaba/page-agent) as an
additional way to let an agent control the browser. The user talks to the page
directly through page-agent's own in-page panel (e.g. "navigate to the imprint
and summarise it", "fill in this form"); page-agent runs the full
observe-think-act loop itself. agodesk only acts as:

1. **Injector** — puts the vendored page-agent bundle + a bootstrap into the tab
   over CDP.
2. **LLM provider proxy** — routes page-agent's OpenAI-style LLM calls to AuraGo
   via the existing `local.agent.llm` channel.

No chat-transcript mirroring into AuraGo. The existing low-level
`desktop_browser_*` operations stay available unchanged.

## Why a CDP binding instead of a localhost HTTP proxy

page-agent's LLM client is OpenAI-compatible (`baseURL` + `apiKey`). A local
HTTP proxy on `127.0.0.1` fails on many HTTPS pages because of CSP `connect-src`
and mixed-content rules. Instead:

- page-agent is configured with `customFetch` (a first-class `LLMConfig` option).
  The injected `customFetch` never touches the network; it forwards the request
  body to agodesk through a CDP `Runtime.addBinding` function
  (`window.agodeskPageAgentLlm`).
- Each binding call raises `Runtime.bindingCalled`; the Rust CDP layer emits a
  Tauri event (`agodesk:page-agent-llm`). The frontend bridge proxies the request
  to AuraGo and resolves the pending in-page promise via
  `Runtime.evaluate(window.__agodeskPageAgentResolve(...))`.

This works regardless of the visited page's security policy.

## Flow

```
User → page-agent panel (in tab)
page-agent LLM client → customFetch(body)
customFetch → window.agodeskPageAgentLlm(JSON{id,body})   // CDP binding
Rust bindingCalled listener → emit "agodesk:page-agent-llm"
bridge.ts → parse OpenAI request → sendLocalAgentLlm() → AuraGo
AuraGo → local.agent.llm.result → toOpenAiChatCompletion()
bridge.ts → browser_page_agent_resolve(id, ok, completionJSON)
Rust → Runtime.evaluate(window.__agodeskPageAgentResolve(id, ok, json))
customFetch resolves Response → page-agent continues (DOM navigate/click/fill)
```

## Components

### Rust (`src-tauri/src/computer_use/browser/cdp.rs`)

- `page_agent_enable(app, bundle, bootstrap)` — `Runtime.addBinding`,
  `Page.addScriptToEvaluateOnNewDocument` (survives navigation / new documents),
  an immediate evaluate for the current document, and a `Runtime.bindingCalled`
  listener that forwards payloads to the frontend.
- `page_agent_resolve(request_id, ok, payload)` — fulfils/rejects the in-page
  promise.
- `page_agent_disable()` — removes the binding, the injected document script and
  the in-page instance.
- Tab switches (`select_tab` / `new_tab`) re-install on the newly active page.
  Same-tab navigation (the imprint case) is covered by the new-document hook and
  by the binding surviving reloads.

Commands: `browser_page_agent_enable` / `_resolve` / `_disable`.

### Frontend (`src/lib/services/page-agent/`)

- `vendor/page-agent.iife.js` — self-contained bundle exposing `window.PageAgent`
  (built by `scripts/build-page-agent-bundle.mjs`, no runtime CDN dependency).
- `bootstrap.ts` — the injected classic script: resolver map, `customFetch`,
  teardown, and PageAgent instantiation on DOM ready.
- `openai-map.ts` — pure OpenAI ↔ `local.agent.llm` mapping (unit-tested).
- `bridge.ts` — listens for binding events, proxies to AuraGo, resolves.
- `index.ts` — lifecycle (`enable`/`disable`) tied to browser connect/disconnect
  in `desktop.ts`.

### Settings

`pageAgentEnabled` (default `false`) under Desktop → Browser control; requires
`desktopControlEnabled` + `browserControlEnabled`.

## Backend contract note

page-agent forces tool calling. Requests forwarded over `local.agent.llm`
therefore carry a `tool_choice` field (typically `"required"`) which the backend
must pass through to the provider unchanged, and the response must include
`message.tool_calls`. Otherwise page-agent raises a `NO_TOOL_CALL` error.

## Out of scope (v1)

- Chat/transcript sync into AuraGo.
- page-agent's own Chrome extension / MCP server.
- AuraGo-initiated `page-agent.execute(...)` (possible later as
  `desktop_browser_page_agent_execute`).
- Replacing the existing low-level CDP actions.
- Multi-tab: only the active CDP tab is instrumented.
