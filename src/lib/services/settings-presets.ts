import { DEFAULT_SETTINGS } from "../types/protocol";

export interface ServerPreset {
  id: string;
  label: string;
  description: string;
  url: string;
}

export const SERVER_PRESETS: ServerPreset[] = [
  {
    id: "loopback-mock",
    label: "Loopback (Mock)",
    description: "Lokaler Mock-Server ohne Pairing",
    url: "ws://127.0.0.1:8080/api/agodesk/ws?insecure_loopback=1",
  },
  {
    id: "loopback-default",
    label: "Loopback (Standard)",
    description: "Standard-Dev-URL aus den App-Einstellungen",
    url: DEFAULT_SETTINGS.serverUrl,
  },
  {
    id: "aurago-lan",
    label: "AuraGo LAN",
    description: "Produktiv mit TLS und Pairing",
    url: "wss://192.168.6.238:8443/api/agodesk/ws",
  },
];
