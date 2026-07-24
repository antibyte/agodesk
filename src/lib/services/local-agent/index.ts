import { get } from "svelte/store";
import { settings } from "../../stores/settings";
import { sessionState } from "../../stores/session";
import { hasAdvertisedLocalAgent } from "../../types/protocol";

export {
  runLocalAgentTurn,
  cancelLocalAgentTurn,
  localAgentTurnActive,
  type RunLocalAgentTurnOptions,
  type LocalAgentTurnResult,
} from "./loop";
export {
  handleLocalAgentRemoteToolResult,
  handleLocalAgentLlmResult,
  rejectAllLocalAgentWaiters,
} from "./remote-bridge";

/**
 * The local agent handles a chat turn only when it is enabled in settings AND the
 * backend advertised the `local.agent` capability. Otherwise agodesk falls back to
 * the normal remote chat flow.
 */
export function localAgentReady(): boolean {
  const appSettings = get(settings);
  if (!appSettings.localAgent.enabled) {
    return false;
  }
  return hasAdvertisedLocalAgent(get(sessionState).advertisedCapabilities);
}
