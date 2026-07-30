import { get } from "svelte/store";
import { settings } from "../../stores/settings";
import { sessionState } from "../../stores/session";
import { connectionStatus } from "../../stores/connection";
import type {
  LocalAgentToolTraceEntry,
  LocalAgentTranscriptEntry,
  LocalAgentTurnStatus,
} from "../../types/local-agent-protocol";
import { toRfc3339 } from "../../types/local-agent-protocol";
import {
  rejectAllLocalAgentWaiters,
  sendHandoff,
  sendRemoteTool,
  sendTurnSync,
  type LocalAgentSend,
} from "./remote-bridge";
import { runLlmStep, type LlmMessage, type LlmToolCall } from "./llm-client";
import { buildLocalAgentSystemPrompt } from "./prompt";
import {
  KERNEL_TOOLS,
  availableDiscoverableTools,
  getToolSpec,
  toToolDeclaration,
} from "./tools";
import { dispatchLocalDesktopOperation } from "./dispatch";
import { emitLocalActivity } from "../agent-activity-inbound";
import type { AppSettings, DesktopOperation } from "../../types/protocol";

export interface RunLocalAgentTurnOptions {
  send: LocalAgentSend;
  sessionId: string;
  conversationId?: string;
  /** Stable id for cancel/handoff correlation; defaults to a new UUID. */
  requestId?: string;
  userText: string;
  onAssistantMessage: (text: string) => void;
  onSystemNotice?: (text: string) => void;
  onApprovalPrompt?: (operation: string) => void;
}

export interface LocalAgentTurnResult {
  status: LocalAgentTurnStatus;
  assistantText: string;
  handedOff: boolean;
  requestId: string;
}

let activeTurn = false;
let cancelRequested = false;

export function localAgentTurnActive(): boolean {
  return activeTurn;
}

/** Requests cancellation of the running local agent turn (wired to chat.cancel). */
export function cancelLocalAgentTurn(): void {
  if (!activeTurn) {
    return;
  }
  cancelRequested = true;
  rejectAllLocalAgentWaiters(new Error("Local agent turn cancelled."));
}

interface ToolCallOutcome {
  result: unknown;
  trace: LocalAgentToolTraceEntry;
  handoff?: boolean;
}

function toWireToolCalls(toolCalls: LlmToolCall[]): unknown[] {
  return toolCalls.map((call) => ({
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: JSON.stringify(call.arguments) },
  }));
}

export async function runLocalAgentTurn(
  options: RunLocalAgentTurnOptions,
): Promise<LocalAgentTurnResult> {
  activeTurn = true;
  cancelRequested = false;

  const startedAt = toRfc3339();
  const appSettings = get(settings);
  const localAgent = appSettings.localAgent;
  const maxSteps = Math.max(1, localAgent.maxSteps || 8);
  const requestId = options.requestId?.trim() || `local-${crypto.randomUUID()}`;

  const revealed = new Set<string>();
  const toolTrace: LocalAgentToolTraceEntry[] = [];
  const transcript: LocalAgentTranscriptEntry[] = [{ role: "user", content: options.userText }];
  const messages: LlmMessage[] = [
    { role: "system", content: buildLocalAgentSystemPrompt() },
    { role: "user", content: options.userText },
  ];

  let assistantText = "";
  let handedOff = false;
  let status: LocalAgentTurnStatus = "completed";

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      if (cancelRequested) {
        status = "cancelled";
        break;
      }

      const tools = [
        ...KERNEL_TOOLS.map(toToolDeclaration),
        ...[...revealed]
          .map((name) => getToolSpec(name))
          .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec))
          .map(toToolDeclaration),
      ];

      let stepResult;
      try {
        stepResult = await runLlmStep({
          send: options.send,
          sessionId: options.sessionId,
          // Unique per step so backend correlation cannot collide with turn sync.
          requestId: `${requestId}:llm:${step}`,
          settings: localAgent,
          messages,
          tools,
        });
      } catch (error) {
        if (cancelRequested) {
          status = "cancelled";
          assistantText = "";
          break;
        }
        status = "failed";
        assistantText = error instanceof Error ? error.message : String(error);
        break;
      }

      if (cancelRequested) {
        status = "cancelled";
        break;
      }

      if (stepResult.toolCalls.length === 0) {
        assistantText = stepResult.content.trim();
        messages.push({ role: "assistant", content: assistantText });
        break;
      }

      messages.push({
        role: "assistant",
        content: stepResult.content ?? "",
        tool_calls: toWireToolCalls(stepResult.toolCalls),
      });

      const willHandoff = stepResult.toolCalls.some(
        (call) => getToolSpec(call.name)?.category === "handoff",
      );
      if (willHandoff) {
        // Show wait hint immediately (same LLM step as ask_aurago), before AuraGo runs.
        const waitHint =
          stepResult.content.trim() || "Einen Moment, ich kümmere mich darum…";
        assistantText = waitHint;
        transcript.push({ role: "assistant", content: waitHint });
        options.onAssistantMessage(waitHint);
      }

      let endLoop = false;
      for (const call of stepResult.toolCalls) {
        const outcome = await executeToolCall(call, {
          options,
          requestId,
          revealed,
          appSettings,
          transcript,
        });
        toolTrace.push(outcome.trace);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.name,
          content: JSON.stringify(outcome.result ?? {}),
        });
        if (outcome.handoff) {
          handedOff = true;
          endLoop = true;
          break;
        }
        if (cancelRequested) {
          status = "cancelled";
          endLoop = true;
          break;
        }
      }

      if (endLoop) {
        break;
      }
    }
  } finally {
    activeTurn = false;
  }

  const finishedAt = toRfc3339();

  if (!handedOff) {
    if (status === "completed" && assistantText) {
      transcript.push({ role: "assistant", content: assistantText });
      options.onAssistantMessage(assistantText);
    } else if (status === "failed") {
      options.onSystemNotice?.(assistantText || "Lokaler Agent-Fehler.");
    }
  }

  await sendTurnSync(options.send, {
    session_id: options.sessionId,
    conversation_id: options.conversationId,
    request_id: requestId,
    status,
    user_message: options.userText,
    assistant_message: assistantText,
    provider: {
      source: localAgent.providerSource,
      provider_id: localAgent.auragoProviderId,
      model:
        localAgent.providerSource === "ollama"
          ? localAgent.ollamaProvider?.model
          : localAgent.localProvider?.model,
    },
    tool_trace: toolTrace,
    started_at: startedAt,
    finished_at: finishedAt,
  }).catch(() => {
    // Journal sync is best-effort; never fail the user-facing turn on it.
  });

  return { status, assistantText, handedOff, requestId };
}

interface ToolCallContext {
  options: RunLocalAgentTurnOptions;
  requestId: string;
  revealed: Set<string>;
  appSettings: AppSettings;
  transcript: LocalAgentTranscriptEntry[];
}

async function executeToolCall(
  call: LlmToolCall,
  ctx: ToolCallContext,
): Promise<ToolCallOutcome> {
  const spec = getToolSpec(call.name);
  if (!spec) {
    return {
      result: { success: false, error: `Unbekanntes Tool: ${call.name}` },
      trace: { tool: call.name, status: "error", error_code: "UNKNOWN_TOOL" },
    };
  }

  if (call.name === "list_local_tools") {
    const available = availableDiscoverableTools(ctx.appSettings).map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
    return {
      result: { success: true, tools: available },
      trace: { tool: call.name, status: "success" },
    };
  }

  if (call.name === "describe_tool") {
    const name = String(call.arguments.name ?? "").trim();
    const target = getToolSpec(name);
    if (!target || target.category !== "local") {
      return {
        result: { success: false, error: `Kein lokales Tool namens ${name}.` },
        trace: { tool: call.name, target: name, status: "error", error_code: "UNKNOWN_TOOL" },
      };
    }
    if (!(target.isAvailable?.(ctx.appSettings) ?? true)) {
      return {
        result: { success: false, error: `${name} ist nicht freigegeben (Einstellungen prüfen).` },
        trace: { tool: call.name, target: name, status: "error", error_code: "TOOL_UNAVAILABLE" },
      };
    }
    ctx.revealed.add(name);
    return {
      result: { success: true, name: target.name, parameters: target.parameters },
      trace: { tool: call.name, target: name, status: "success" },
    };
  }

  if (call.name === "get_client_status") {
    const session = get(sessionState);
    return {
      result: {
        success: true,
        connectionStatus: get(connectionStatus),
        sessionStatus: session.status,
        sessionId: session.sessionId || null,
        advertisedCapabilities: session.advertisedCapabilities,
        localAgentProvider: ctx.appSettings.localAgent.providerSource,
      },
      trace: { tool: call.name, status: "success" },
    };
  }

  if (spec.category === "remote") {
    return executeRemoteTool(call, ctx);
  }

  if (spec.category === "handoff") {
    const task = String(call.arguments.task ?? ctx.options.userText).trim();
    const reason = String(call.arguments.reason ?? "").trim() || undefined;
    await sendHandoff(ctx.options.send, {
      session_id: ctx.options.sessionId,
      conversation_id: ctx.options.conversationId,
      request_id: ctx.requestId,
      user_message: task || ctx.options.userText,
      reason,
      transcript: ctx.transcript,
    });
    return {
      result: { success: true, handed_off: true },
      trace: { tool: call.name, status: "success" },
      handoff: true,
    };
  }

  // Local execution — only after progressive discovery (describe_tool).
  if (spec.category === "local") {
    if (!ctx.revealed.has(call.name)) {
      return {
        result: {
          success: false,
          error: `Tool „${call.name}“ ist noch nicht freigeschaltet. Zuerst describe_tool aufrufen.`,
        },
        trace: {
          tool: call.name,
          status: "error",
          error_code: "TOOL_NOT_REVEALED",
        },
      };
    }
    if (!(spec.isAvailable?.(ctx.appSettings) ?? true)) {
      return {
        result: {
          success: false,
          error: `${call.name} ist nicht freigegeben (Einstellungen prüfen).`,
        },
        trace: {
          tool: call.name,
          status: "error",
          error_code: "TOOL_UNAVAILABLE",
        },
      };
    }
    if (!spec.operation) {
      return {
        result: { success: false, error: `Tool „${call.name}“ hat keine lokale Operation.` },
        trace: { tool: call.name, status: "error", error_code: "TOOL_MISCONFIGURED" },
      };
    }
    return executeLocalTool(call, spec.operation, ctx);
  }

  return {
    result: { success: false, error: `Unbekannte Tool-Kategorie für ${call.name}.` },
    trace: { tool: call.name, status: "error", error_code: "UNKNOWN_TOOL" },
  };
}

async function executeRemoteTool(
  call: LlmToolCall,
  ctx: ToolCallContext,
): Promise<ToolCallOutcome> {
  try {
    const result = await sendRemoteTool(ctx.options.send, {
      session_id: ctx.options.sessionId,
      conversation_id: ctx.options.conversationId,
      request_id: `${ctx.requestId}-${crypto.randomUUID()}`,
      tool: call.name,
      arguments: call.arguments,
    });
    return {
      result: result.success
        ? { success: true, result: result.result }
        : { success: false, error: result.error_message || "Remote-Tool fehlgeschlagen." },
      trace: {
        tool: call.name,
        status: result.success ? "success" : "error",
        ...(result.error_code ? { error_code: result.error_code } : {}),
      },
    };
  } catch (error) {
    return {
      result: { success: false, error: error instanceof Error ? error.message : String(error) },
      trace: { tool: call.name, status: "error", error_code: "REMOTE_TOOL_FAILED" },
    };
  }
}

async function executeLocalTool(
  call: LlmToolCall,
  operation: DesktopOperation,
  ctx: ToolCallContext,
): Promise<ToolCallOutcome> {
  const target = extractTarget(call.arguments);
  const activityId = `local-agent:${call.id}`;
  emitLocalActivity({
    activity_id: activityId,
    request_id: ctx.requestId,
    kind: mapActivityKind(operation),
    phase: "started",
    title: call.name,
    summary: target,
    started_at: new Date().toISOString(),
  });

  const dispatch = await dispatchLocalDesktopOperation(
    operation,
    call.arguments,
    ctx.options.onApprovalPrompt,
  );

  emitLocalActivity({
    activity_id: activityId,
    request_id: ctx.requestId,
    kind: mapActivityKind(operation),
    phase: dispatch.success ? "completed" : "failed",
    title: call.name,
    summary: target,
    finished_at: new Date().toISOString(),
    ...(dispatch.error_code ? { error_code: dispatch.error_code } : {}),
  });

  return {
    result: dispatch.success
      ? { success: true, data: dispatch.data }
      : {
          success: false,
          error: dispatch.error_message || "Lokales Tool fehlgeschlagen.",
          ...(dispatch.waiting_approval ? { waiting_approval: true } : {}),
        },
    trace: {
      tool: call.name,
      ...(target ? { target } : {}),
      status: dispatch.success ? "success" : dispatch.waiting_approval ? "waiting_approval" : "error",
      ...(dispatch.error_code ? { error_code: dispatch.error_code } : {}),
    },
  };
}

function extractTarget(args: Record<string, unknown>): string | undefined {
  const path = typeof args.path === "string" ? args.path : undefined;
  const command = typeof args.command === "string" ? args.command : undefined;
  const value = path ?? command;
  return value ? value.slice(0, 120) : undefined;
}

function mapActivityKind(operation: DesktopOperation): "shell" | "file_read" | "file_edit" | "desktop" {
  if (operation.startsWith("shell")) {
    return "shell";
  }
  if (operation === "file_write" || operation === "file_patch") {
    return "file_edit";
  }
  if (operation.startsWith("file")) {
    return "file_read";
  }
  return "desktop";
}
