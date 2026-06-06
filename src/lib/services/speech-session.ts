import type { AgentMoodMetadata } from "../types/protocol";
import type { SpeechAgentContext } from "../types/speech";
import type {
  GeminiFunctionCall,
  GeminiFunctionResponse,
} from "./speech-tools";
import type { SpeechStatus } from "../types/speech";

export interface SpeechSessionCallbacks {
  onStatus?: (status: SpeechStatus) => void;
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onAssistantText?: (text: string) => void;
  onToolCalls?: (calls: GeminiFunctionCall[]) => Promise<GeminiFunctionResponse[]>;
  onError?: (message: string) => void;
}

/** Common surface for Gemini Live and local speech pipelines. */
export interface ActiveSpeechSession {
  connect(options?: { apiKey?: string }): Promise<void>;
  disconnect(): void;
  sendAudio?(base64Pcm: string): void;
  applyAgentMood(mood: AgentMoodMetadata | null): void;
  requestClientInterrupt(): void;
  readonly isAiSpeaking: boolean;
  getPlaybackAnalyser(): AnalyserNode | null;
}

export type { SpeechAgentContext };
