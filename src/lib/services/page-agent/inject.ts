import { invoke } from "@tauri-apps/api/core";
// Vendored, self-contained page-agent IIFE (exposes window.PageAgent).
// Regenerate with: node scripts/build-page-agent-bundle.mjs
import pageAgentBundle from "./vendor/page-agent.iife.js?raw";
import {
  buildPageAgentBootstrap,
  resolvePageAgentLanguage,
  type PageAgentBootstrapConfig,
} from "./bootstrap";

/** Global function name exposed in the page; must match `PAGE_AGENT_BINDING` in Rust (cdp.rs). */
export const PAGE_AGENT_BINDING = "agodeskPageAgentLlm";
/** Tauri event carrying page-agent LLM requests; must match `PAGE_AGENT_EVENT` in Rust (cdp.rs). */
export const PAGE_AGENT_EVENT = "agodesk:page-agent-llm";
/** Fired after top-level page loads so we can soft-ensure the in-page agent survived. */
export const PAGE_AGENT_PAGE_READY_EVENT = "agodesk:page-agent-page-ready";
/** Sentinel base URL; the injected customFetch intercepts every call to it. */
export const PAGE_AGENT_BASE_URL = "https://agodesk.pageagent.local/v1";
/**
 * Cosmetic model id for page-agent's OpenAI client only. The bridge never
 * forwards this to AuraGo (AuraGo uses the provider's configured default).
 */
export const PAGE_AGENT_COSMETIC_MODEL = "agodesk-proxy";
const DEFAULT_MAX_STEPS = 40;

export interface EnablePageAgentInjectionOptions {
  /**
   * Cosmetic model label for page-agent's client. Prefer
   * {@link PAGE_AGENT_COSMETIC_MODEL}; never pass a real AuraGo provider id.
   */
  model?: string;
  /** App UI locale (mapped to page-agent's supported languages). */
  locale?: string;
  maxSteps?: number;
}

function buildBootstrapConfig(options: EnablePageAgentInjectionOptions): PageAgentBootstrapConfig {
  return {
    bindingName: PAGE_AGENT_BINDING,
    baseUrl: PAGE_AGENT_BASE_URL,
    model: options.model?.trim() || PAGE_AGENT_COSMETIC_MODEL,
    language: resolvePageAgentLanguage(options.locale),
    maxSteps: options.maxSteps && options.maxSteps > 0 ? options.maxSteps : DEFAULT_MAX_STEPS,
  };
}

/** Installs the vendored bundle + bootstrap into the active tab via the Rust CDP layer. */
export async function invokePageAgentEnable(
  options: EnablePageAgentInjectionOptions,
): Promise<void> {
  const bootstrap = buildPageAgentBootstrap(buildBootstrapConfig(options));
  await invoke("browser_page_agent_enable", {
    bundle: pageAgentBundle,
    bootstrap,
  });
}

/** Fulfills or rejects a pending in-page LLM request. */
export async function invokePageAgentResolve(
  requestId: string,
  ok: boolean,
  payload: string,
): Promise<void> {
  await invoke("browser_page_agent_resolve", { requestId, ok, payload });
}

/** Starts/resumes a page-agent task in the active tab (after navigation reinject). */
export async function invokePageAgentExecute(task: string): Promise<void> {
  await invoke("browser_page_agent_execute", { task });
}

/** CDP navigate for page-agent (skips desktop input approval, soft-ensures after load). */
export async function invokePageAgentNavigate(url: string): Promise<void> {
  await invoke("browser_page_agent_navigate", { url });
}

/** Soft-ensure page-agent is present and the panel input is visible after navigation. */
export async function invokePageAgentEnsure(prefill?: string): Promise<void> {
  await invoke("browser_page_agent_ensure", {
    prefill: prefill?.trim() ? prefill.trim() : null,
  });
}

/** Removes the binding, injected scripts and in-page instance. */
export async function invokePageAgentDisable(): Promise<void> {
  await invoke("browser_page_agent_disable");
}
