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

export function buildAgentToolDeclarations(): Record<string, unknown>[] {
  return [
    {
      functionDeclarations: [
        {
          name: "send_message_to_aurago",
          description:
            "Sendet eine Nachricht an den AuraGo-Agenten. Nutze dies für Fragen, Aufträge, Screenshots, Desktop-Steuerung und alle Agent-Aktionen.",
          parameters: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "Die Nachricht an AuraGo in natürlicher Sprache, präzise formuliert.",
              },
            },
            required: ["message"],
          },
        },
        {
          name: "get_client_status",
          description:
            "Liest den Verbindungs-, Session- und Remote-Control-Status von agodesk aus.",
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
      ],
    },
  ];
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

  const base = `${promptBody}

AuraGo ist der Backend-Agent für Chat, Screenshots und Desktop-Steuerung. Desktop-Befehle werden ausschließlich von AuraGo ausgelöst — du leitest Anfragen per Tool weiter.

Aktueller Client-Status:
- Verbindung: ${context.connectionStatus}
- Session: ${context.sessionStatus}
- Remote Control aktiv: ${context.remoteControlActive ? "ja" : "nein"}
- Remote Control ausstehend: ${context.remoteControlPending ? "ja" : "nein"}
- Chat senden möglich: ${context.canSendChat ? "ja" : "nein"}

Regeln:
- Für Agent-Anfragen (Fragen, Screenshots, Desktop, Aufgaben) IMMER send_message_to_aurago nutzen.
- Für Statusfragen get_client_status nutzen.
- Zum Beenden stop_listening nutzen.
- Bestätige Aktionen kurz auf Deutsch (${languageHint}), gesprochen und verständlich.
- Erfinde keine Desktop-Aktionen — sende stattdessen an AuraGo.`;

  return appendAgentMoodHint(base, agentMood);
}

export { appendAgentMoodHint } from "./speech-mood";
