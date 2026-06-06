import { agentMoodState } from "../stores/agent-mood";
import type {
  AgentMoodMetadata,
  ChatResponseMetadata,
  ChatResponsePayload,
} from "../types/protocol";
import { normalizeAgentMoodMetadata } from "../types/protocol";
import { applyAgentMoodToSpeechSession } from "./speech-flow";

export function extractAgentMoodFromMetadata(
  metadata: ChatResponseMetadata | undefined,
): AgentMoodMetadata | null {
  if (!metadata) {
    return null;
  }
  const raw = metadata.agent_mood;
  if (!raw) {
    return null;
  }
  return normalizeAgentMoodMetadata(raw);
}

export function handleChatResponseMood(payload: ChatResponsePayload): void {
  const mood = extractAgentMoodFromMetadata(payload.metadata);
  if (!mood) {
    return;
  }

  agentMoodState.setMood(payload.session_id, mood, payload.request_id);
  applyAgentMoodToSpeechSession(mood);
}

export function handleChatChunkMood(
  sessionId: string,
  requestId: string,
  metadata: ChatResponseMetadata | undefined,
): void {
  const mood = extractAgentMoodFromMetadata(metadata);
  if (!mood) {
    return;
  }

  agentMoodState.setMood(sessionId, mood, requestId);
  applyAgentMoodToSpeechSession(mood);
}
