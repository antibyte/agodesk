import type { SpeechSettings, AgentMoodMetadata } from "../types/protocol";
import type { SpeechAgentContext } from "../types/speech";
import { get } from "svelte/store";
import { personaState } from "../stores/persona";
import { appendAgentMoodHint } from "./speech-mood";

export interface GeminiFunctionCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiFunctionResponse {
  id: string;
  name: string;
  response: Record<string, unknown>;
}

/** Canonical backend agent name — never invent variants in spoken replies. */
export const AURAGO_AGENT_NAME = "AuraGo";

/**
 * Spoken/ASR variants that almost always mean AuraGo (German/English mishearings).
 * Used in prompts so the model maps them instead of inventing a new agent name.
 */
export const AURAGO_NAME_ALIASES = [
  "AuraGo",
  "Aura Go",
  "Aurago",
  "Auramon",
  "Aura mon",
  "Orago",
  "Ora Go",
  "our ago",
  "the agent",
  "den Agenten",
  "Backend-Agent",
] as const;

const AGENT_TOOL_SPECS = [
  {
    name: "send_message_to_aurago",
    description:
      `Sendet eine Nachricht an ${AURAGO_AGENT_NAME} (agodesk Backend-Agent). ` +
      `IMMER nutzen, wenn der Nutzer ${AURAGO_AGENT_NAME} meint — auch bei Verhören wie „Auramon“, „Aura Go“, „Orago“. ` +
      `Für Fragen, Wetter, Aufträge, Screenshots, Desktop-Steuerung und alle Agent-Aktionen. ` +
      `Sage nie, dass du ${AURAGO_AGENT_NAME} nicht kennst.`,
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description:
            `Die Nachricht an ${AURAGO_AGENT_NAME} in klarer natürlicher Sprache. ` +
            `Inhalt der Nutzeranfrage; nicht den verhörten Falschnamen (z. B. Auramon) wörtlich übernehmen, wenn ${AURAGO_AGENT_NAME} gemeint ist.`,
        },
      },
      required: ["message"],
    },
  },
  {
    name: "get_client_status",
    description: "Liest den Verbindungs-, Session- und Remote-Control-Status von agodesk aus.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "stop_listening",
    description: "Beendet die aktive Sprachsession und schaltet das Mikrofon ab.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
] as const;

/** Gemini Live `tools` shape (functionDeclarations wrapper). */
export function buildAgentToolDeclarations(): Record<string, unknown>[] {
  return [
    {
      functionDeclarations: AGENT_TOOL_SPECS.map((spec) => ({
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
      })),
    },
  ];
}

/** Grok Voice Agent / OpenAI Realtime `session.tools` function entries. */
export function buildGrokAgentTools(): Record<string, unknown>[] {
  return AGENT_TOOL_SPECS.map((spec) => ({
    type: "function",
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
  }));
}

function resolvePersonaInstructionLead(fallback: string): string {
  const cachedPersona = get(personaState);
  if (cachedPersona.personaPrompt.trim()) {
    return cachedPersona.personaPrompt.trim();
  }
  if (cachedPersona.persona.trim()) {
    return `Du bist ${cachedPersona.persona.trim()}, der Sprach-Assistent in agodesk.`;
  }
  return fallback;
}

export function buildTranscriptionSystemInstruction(
  speech: SpeechSettings,
  usesAudioOutput = false,
  agentMood?: AgentMoodMetadata | null,
): string {
  const languageHint = speech.language.trim().length > 0 ? speech.language.trim() : "de-DE";

  if (usesAudioOutput && speech.voiceResponses) {
    const personaLead = resolvePersonaInstructionLead(
      `Du bist ein gesprochener Sprach-Assistent in ${languageHint}.`,
    );
    const base = `${personaLead} Höre dem Nutzer zu und antworte natürlich, klar und auf Deutsch (${languageHint}). Halte Antworten kurz und im Stil der Persona.`;
    return appendAgentMoodHint(base, agentMood);
  }

  if (usesAudioOutput) {
    return `Du unterstützt Live-Spracherkennung in ${languageHint}. Höre dem Nutzer zu. Antworte nicht gesprochen — die Transkription erfolgt über inputAudioTranscription.`;
  }

  return `Du bist ein Spracherkennungs-Assistent. Transkribiere gesprochene Sprache präzise in ${languageHint}. Antworte nur mit dem transkribierten Text, ohne Zusatzkommentare.`;
}

export function buildAgentSystemInstruction(
  speech: SpeechSettings,
  context: SpeechAgentContext,
  agentMood?: AgentMoodMetadata | null,
): string {
  const languageHint = speech.language.trim().length > 0 ? speech.language.trim() : "de-DE";

  const promptBody = resolvePersonaInstructionLead(
    "Du bist der Sprach-Assistent von agodesk. Der Nutzer spricht über das Mikrofon.",
  );

  const aliasList = AURAGO_NAME_ALIASES.join(", ");

  // Keep prompt short and explicit (Grok Voice works better with clear rules than long prose).
  const base = `${promptBody}

System:
- Dieses Desktop-System heißt agodesk.
- Der Backend-Agent heißt exakt „${AURAGO_AGENT_NAME}“ (Schreibweise: AuraGo, ein Wort, G groß).
- ${AURAGO_AGENT_NAME} erledigt Chat, Wetter/Infos, Screenshots, Desktop und Aufgaben.
- Du bist nur die Sprachschnittstelle. Deine Persona-Name ist nicht ${AURAGO_AGENT_NAME}.

Spracherkennung / Namen:
- Nutzer sagen oft „${AURAGO_AGENT_NAME}“. ASR kann das falsch hören als: ${aliasList}.
- Wenn der Nutzer den Backend-Agenten meint (auch bei Verhören wie „Auramon“): IMMER Tool send_message_to_aurago.
- Behaupte nie, du kenntest ${AURAGO_AGENT_NAME} / „Auramon“ nicht. Korrigiere still auf ${AURAGO_AGENT_NAME} und leite weiter.
- Sage in Bestätigungen „${AURAGO_AGENT_NAME}“, nicht den verhörten Falschnamen.

Status:
- Verbindung: ${context.connectionStatus}
- Session: ${context.sessionStatus}
- Remote Control aktiv: ${context.remoteControlActive ? "ja" : "nein"}
- Remote Control ausstehend: ${context.remoteControlPending ? "ja" : "nein"}
- Chat senden möglich: ${context.canSendChat ? "ja" : "nein"}

Tools:
- Agent-Anfragen (Fragen, Wetter, Screenshots, Desktop, Aufgaben) → send_message_to_aurago
- Client-Status → get_client_status
- Mikrofon aus → stop_listening
- Keine Desktop-Aktionen selbst ausführen — nur an ${AURAGO_AGENT_NAME} senden.
- Kurz auf ${languageHint} bestätigen, dann Tool.`;

  return appendAgentMoodHint(base, agentMood);
}

export { appendAgentMoodHint } from "./speech-mood";
