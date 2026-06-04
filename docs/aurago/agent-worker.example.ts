/**
 * Reference agent worker for AuraGo — Plan / Act / Observe with agodesk Computer-Use.
 * NOT part of agodesk build. Adapt to your AuraGo transport layer.
 */
import type {
  DesktopCommandPayload,
  DesktopResultPayload,
  SendDesktopCommand,
} from "./agodesk-remote-client.interface";

export interface ComputerUseContext {
  sendCommand: SendDesktopCommand;
  deviceId: string;
  capabilities: string[];
}

function hasCapability(caps: string[], cap: string): boolean {
  return caps.includes(cap);
}

function uuid(): string {
  return crypto.randomUUID();
}

async function runCommand(
  ctx: ComputerUseContext,
  operation: DesktopCommandPayload["operation"],
  params: Record<string, unknown> = {},
): Promise<DesktopResultPayload> {
  return ctx.sendCommand(ctx.deviceId, {
    command_id: uuid(),
    operation,
    params,
  });
}

/** Recommended observe step before planning. */
export async function observeDesktop(ctx: ComputerUseContext) {
  const [active, host] = await Promise.all([
    runCommand(ctx, "desktop_active_window"),
    runCommand(ctx, "desktop_host_info"),
  ]);

  let uiTree: DesktopResultPayload | null = null;
  if (hasCapability(ctx.capabilities, "remote.desktop.ui_automation")) {
    const windowId =
      active.success && active.data && typeof active.data.id === "string"
        ? active.data.id
        : undefined;
    uiTree = await runCommand(ctx, "desktop_ui_tree", {
      ...(windowId ? { window_id: windowId } : {}),
    });
  }

  return { active, host, uiTree };
}

/** Semantic click on element_id from ui tree. Queues until user approves banner. */
export async function actUiClick(
  ctx: ComputerUseContext,
  elementId: string,
  windowId?: string,
): Promise<DesktopResultPayload> {
  let result = await runCommand(ctx, "desktop_ui_action", {
    action: "click",
    element_id: elementId,
    ...(windowId ? { window_id: windowId } : {}),
  });

  if (
    !result.success &&
    (result.error_code === "DESKTOP_INPUT_NOT_APPROVED" ||
      result.error_code === "DESKTOP_SESSION_NOT_APPROVED")
  ) {
    await runCommand(ctx, "desktop_permission_request");
    // User must click "Freigeben" in agodesk — retry same command after approval event.
    result = await runCommand(ctx, "desktop_ui_action", {
      action: "click",
      element_id: elementId,
      ...(windowId ? { window_id: windowId } : {}),
    });
  }

  return result;
}

/** Vision fallback: screenshot after action for verification. */
export async function verifyWithScreenshot(
  ctx: ComputerUseContext,
  displayId?: string,
): Promise<DesktopResultPayload> {
  return runCommand(ctx, "desktop_screenshot", {
    format: "jpeg",
    quality: 75,
    ...(displayId ? { display_id: displayId } : {}),
  });
}

/** Full Computer-Use loop (AuraGo orchestrates reasoning between steps). */
export async function computerUseLoop(ctx: ComputerUseContext) {
  const observation = await observeDesktop(ctx);

  if (!observation.active.success) {
    return { phase: "observe", error: observation.active };
  }

  // Agent reasoning in AuraGo picks element_id from observation.uiTree...
  const elementId = "elem-0"; // placeholder — from LLM / planner

  if (hasCapability(ctx.capabilities, "remote.desktop.ui_automation")) {
    const action = await actUiClick(
      ctx,
      elementId,
      typeof observation.active.data?.id === "string"
        ? observation.active.data.id
        : undefined,
    );
    if (!action.success) {
      return { phase: "act", error: action };
    }
  }

  const screenshot = await verifyWithScreenshot(ctx);
  return { phase: "verify", observation, screenshot };
}
