export type IconName =
  | "send"
  | "stop"
  | "attach"
  | "eye-open"
  | "eye-closed"
  | "warning"
  | "error"
  | "history"
  | "integrations"
  | "bell"
  | "sun"
  | "moon"
  | "system"
  | "settings"
  | "overflow"
  | "voice-on"
  | "voice-off"
  | "brand"
  | "close"
  | "copy";

export interface IconDefinition {
  paths: string;
  strokeWidth?: number;
  fill?: boolean;
}

export const ICONS: Record<IconName, IconDefinition> = {
  send: {
    paths: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
    strokeWidth: 2,
  },
  stop: {
    paths: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
    strokeWidth: 2,
  },
  attach: {
    paths:
      '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    strokeWidth: 2,
  },
  "eye-open": {
    paths: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    strokeWidth: 2,
  },
  "eye-closed": {
    paths:
      '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    strokeWidth: 2,
  },
  warning: {
    paths:
      '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    strokeWidth: 2,
  },
  error: {
    paths:
      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    strokeWidth: 2,
  },
  history: {
    paths: '<path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 3 3 9 9 9"/><path d="M12 7v5l3 2"/>',
    strokeWidth: 2,
  },
  integrations: {
    paths:
      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17h7"/><path d="M17.5 14v6"/>',
    strokeWidth: 2,
  },
  bell: {
    paths:
      '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    strokeWidth: 2,
  },
  sun: {
    paths:
      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    strokeWidth: 2,
  },
  moon: {
    paths: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    strokeWidth: 2,
  },
  system: {
    paths: '<circle cx="12" cy="12" r="10"/><path d="M12 2v20M12 2a10 10 0 0 1 0 20Z" fill="currentColor" stroke="none"/>',
    strokeWidth: 2,
  },
  settings: {
    paths:
      '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    strokeWidth: 2,
  },
  overflow: {
    paths: '<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>',
    fill: true,
    strokeWidth: 0,
  },
  "voice-on": {
    paths:
      '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    strokeWidth: 2,
  },
  "voice-off": {
    paths:
      '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
    strokeWidth: 2,
  },
  brand: {
    paths:
      '<path d="M12 3.5 5 7.5v9l7 4 7-4v-9L12 3.5Z" fill="currentColor" stroke="none"/><path d="M12 8.5 9.5 10v4L12 15.5 14.5 14v-4L12 8.5Z" fill="white" stroke="none"/>',
    fill: true,
    strokeWidth: 0,
  },
  close: {
    paths: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    strokeWidth: 2,
  },
  copy: {
    paths:
      '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    strokeWidth: 2,
  },
};

export function getIcon(name: IconName): IconDefinition {
  return ICONS[name];
}
