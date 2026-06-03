import { DEFAULT_SETTINGS } from "../types/protocol";

export interface ServerPreset {
  id: string;
  labelKey: string;
  descriptionKey: string;
  url: string;
}

export const SERVER_PRESETS: ServerPreset[] = [
  {
    id: "loopback-mock",
    labelKey: "settingsPreset.loopbackMock.label",
    descriptionKey: "settingsPreset.loopbackMock.description",
    url: "ws://127.0.0.1:8080/api/agodesk/ws?insecure_loopback=1",
  },
  {
    id: "loopback-default",
    labelKey: "settingsPreset.loopbackDefault.label",
    descriptionKey: "settingsPreset.loopbackDefault.description",
    url: DEFAULT_SETTINGS.serverUrl,
  },
  {
    id: "aurago-lan",
    labelKey: "settingsPreset.auragoLan.label",
    descriptionKey: "settingsPreset.auragoLan.description",
    url: "wss://192.168.6.238:8443/api/agodesk/ws",
  },
];
