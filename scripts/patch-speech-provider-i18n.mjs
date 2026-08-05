import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "i18n",
  "messages",
);

/** @type {Record<string, Record<string, string>>} */
const byLocale = {
  de: {
    "settings.speech.voiceResponses.gemini_live": "Gesprochene Antworten von Gemini (Stimme)",
    "settings.speech.voiceResponses.grok_voice": "Gesprochene Antworten von Grok (Stimme)",
    "settings.speech.voiceResponsesHelp.gemini_live":
      "Native-Audio-Modelle können per Stimme antworten (24 kHz PCM). Der Text der Antwort erscheint zusätzlich als Chat-Nachricht.",
    "settings.speech.voiceResponsesHelp.grok_voice":
      "Grok Voice antwortet per Stimme (PCM). Der Text der Antwort erscheint zusätzlich als Chat-Nachricht.",
    "settings.speech.modeExclusionHelp.gemini_live":
      "Auto-Send und Sprach-Agent schließen sich aus: Entweder rohe Transkripte an AuraGo senden, oder Gemini entscheidet per Tool, wann und was gesendet wird.",
    "settings.speech.modeExclusionHelp.grok_voice":
      "Auto-Send und Sprach-Agent schließen sich aus: Entweder rohe Transkripte an AuraGo senden, oder Grok entscheidet per Tool, wann und was gesendet wird.",
    "settings.speech.modeExclusionHelp.hybrid":
      "Auto-Send und Sprach-Agent schließen sich aus: Entweder rohe Transkripte an AuraGo senden, oder der Cloud-Sprach-Agent entscheidet per Tool (nur Gemini Live / Grok Voice).",
    "settings.speech.modeExclusionHelp.offline":
      "Auto-Send und Sprach-Agent schließen sich aus: Entweder rohe Transkripte an AuraGo senden, oder der Cloud-Sprach-Agent entscheidet per Tool (nur Gemini Live / Grok Voice).",
    "settings.speech.agentModeHelp.gemini_live":
      "Im Agent-Modus erkennt Gemini Befehle und sendet sie per Tool an AuraGo (Screenshots, Desktop-Aktionen, Chat).",
    "settings.speech.agentModeHelp.grok_voice":
      "Im Agent-Modus erkennt Grok Voice Befehle und sendet sie per Tool an AuraGo (Screenshots, Desktop-Aktionen, Chat).",
    "settings.speech.agentModeHelp.hybrid":
      "Sprach-Agent mit Tool-Use funktioniert mit Cloud-Live-Providern (Gemini Live oder Grok Voice). Hybrid sendet Transkripte an AuraGo; wähle Auto-Send oder wechsle den Provider.",
    "settings.speech.agentModeHelp.offline":
      "Sprach-Agent mit Tool-Use funktioniert mit Cloud-Live-Providern (Gemini Live oder Grok Voice). Offline sendet Transkripte an AuraGo; wähle Auto-Send oder wechsle den Provider.",
    "settings.speech.voiceName.label.gemini_live": "Gemini-Stimme",
    "settings.speech.voiceName.label.grok_voice": "Grok-Stimme",
    "speechFlow.error.noApiKey.gemini_live":
      "Kein Gemini API-Key hinterlegt. Bitte in den Einstellungen speichern.",
    "speechFlow.error.noApiKey.grok_voice":
      "Kein xAI API-Key hinterlegt. Bitte in den Einstellungen speichern.",
    // Keep legacy keys as Gemini aliases so old lookups still work.
    "settings.speech.voiceResponses": "Gesprochene Antworten von Gemini (Stimme)",
    "settings.speech.voiceResponsesHelp":
      "Native-Audio-Modelle können per Stimme antworten (24 kHz PCM). Der Text der Antwort erscheint zusätzlich als Chat-Nachricht.",
    "settings.speech.modeExclusionHelp":
      "Auto-Send und Sprach-Agent schließen sich aus: Entweder rohe Transkripte an AuraGo senden, oder das Cloud-Sprachmodell entscheidet per Tool, wann und was gesendet wird.",
    "settings.speech.agentModeHelp":
      "Im Agent-Modus erkennt das Cloud-Sprachmodell Befehle und sendet sie per Tool an AuraGo (Screenshots, Desktop-Aktionen, Chat).",
    "settings.speech.voiceName.label": "Stimme",
    "speechFlow.error.noApiKey": "Kein API-Key hinterlegt. Bitte in den Einstellungen speichern.",
  },
  en: {
    "settings.speech.voiceResponses.gemini_live": "Spoken replies from Gemini (voice)",
    "settings.speech.voiceResponses.grok_voice": "Spoken replies from Grok (voice)",
    "settings.speech.voiceResponsesHelp.gemini_live":
      "Native-audio models can reply by voice (24 kHz PCM). Reply text also appears as a chat message.",
    "settings.speech.voiceResponsesHelp.grok_voice":
      "Grok Voice replies by voice (PCM). Reply text also appears as a chat message.",
    "settings.speech.modeExclusionHelp.gemini_live":
      "Auto-send and speech agent are mutually exclusive: either send raw transcripts to AuraGo, or let Gemini decide via tools what and when to send.",
    "settings.speech.modeExclusionHelp.grok_voice":
      "Auto-send and speech agent are mutually exclusive: either send raw transcripts to AuraGo, or let Grok decide via tools what and when to send.",
    "settings.speech.modeExclusionHelp.hybrid":
      "Auto-send and speech agent are mutually exclusive: either send raw transcripts to AuraGo, or use a cloud speech agent with tools (Gemini Live / Grok Voice).",
    "settings.speech.modeExclusionHelp.offline":
      "Auto-send and speech agent are mutually exclusive: either send raw transcripts to AuraGo, or use a cloud speech agent with tools (Gemini Live / Grok Voice).",
    "settings.speech.agentModeHelp.gemini_live":
      "In agent mode, Gemini recognizes commands and sends them to AuraGo via tools (screenshots, desktop actions, chat).",
    "settings.speech.agentModeHelp.grok_voice":
      "In agent mode, Grok Voice recognizes commands and sends them to AuraGo via tools (screenshots, desktop actions, chat).",
    "settings.speech.agentModeHelp.hybrid":
      "Speech agent with tool use works with cloud live providers (Gemini Live or Grok Voice). Hybrid sends transcripts to AuraGo — enable auto-send or switch provider.",
    "settings.speech.agentModeHelp.offline":
      "Speech agent with tool use works with cloud live providers (Gemini Live or Grok Voice). Offline sends transcripts to AuraGo — enable auto-send or switch provider.",
    "settings.speech.voiceName.label.gemini_live": "Gemini voice",
    "settings.speech.voiceName.label.grok_voice": "Grok voice",
    "speechFlow.error.noApiKey.gemini_live":
      "No Gemini API key stored. Please save one in Settings.",
    "speechFlow.error.noApiKey.grok_voice": "No xAI API key stored. Please save one in Settings.",
    "settings.speech.voiceResponses": "Spoken replies from Gemini (voice)",
    "settings.speech.voiceResponsesHelp":
      "Native-audio models can reply by voice (24 kHz PCM). Reply text also appears as a chat message.",
    "settings.speech.modeExclusionHelp":
      "Auto-send and speech agent are mutually exclusive: either send raw transcripts to AuraGo, or let the cloud speech model decide via tools what and when to send.",
    "settings.speech.agentModeHelp":
      "In agent mode, the cloud speech model recognizes commands and sends them to AuraGo via tools (screenshots, desktop actions, chat).",
    "settings.speech.voiceName.label": "Voice",
    "speechFlow.error.noApiKey": "No API key stored. Please save one in Settings.",
  },
};

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const locale = path.basename(file, ".json");
  const full = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(full, "utf8"));
  Object.assign(data, byLocale[locale] ?? byLocale.en);
  const sorted = Object.fromEntries(
    Object.keys(data)
      .sort()
      .map((k) => [k, data[k]]),
  );
  fs.writeFileSync(full, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log("updated", file);
}
