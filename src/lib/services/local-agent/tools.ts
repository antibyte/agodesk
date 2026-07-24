import type { AppSettings, DesktopOperation } from "../../types/protocol";
import { shellAccessIsConfigured } from "../../types/protocol";
import { fileAccessIsConfigured } from "../file-access";

export type LocalToolCategory = "kernel" | "local" | "remote" | "handoff";

export interface LocalToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  category: LocalToolCategory;
  /** Desktop operation used for local execution (category "local"). */
  operation?: DesktopOperation;
  /** Whether this discoverable tool is currently usable (settings-based). */
  isAvailable?: (settings: AppSettings) => boolean;
}

function schema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: "object", properties, required };
}

const EMPTY_SCHEMA = schema({});

/** Always present in the system prompt. */
export const KERNEL_TOOLS: LocalToolSpec[] = [
  {
    name: "list_local_tools",
    description:
      "Listet zusätzlich verfügbare lokale Tools (Name + Kurzbeschreibung). Nutze dies, bevor du ein lokales Tool außerhalb des Kernels verwendest.",
    parameters: EMPTY_SCHEMA,
    category: "kernel",
  },
  {
    name: "describe_tool",
    description:
      "Lädt das vollständige Eingabeschema eines lokalen Tools und schaltet es für diesen Turn frei.",
    parameters: schema({ name: { type: "string", description: "Toolname" } }, ["name"]),
    category: "kernel",
  },
  {
    name: "memory_search",
    description: "Durchsucht das Gedächtnis von AuraGo nach relevanten Einträgen.",
    parameters: schema(
      {
        query: { type: "string", description: "Suchanfrage" },
        limit: { type: "number", description: "Max. Treffer (optional)" },
      },
      ["query"],
    ),
    category: "remote",
  },
  {
    name: "memory_get",
    description: "Lädt einen konkreten Gedächtniseintrag aus AuraGo per ID.",
    parameters: schema({ id: { type: "string", description: "Eintrags-ID" } }, ["id"]),
    category: "remote",
  },
  {
    name: "query_aurago",
    description:
      "Kurze, gezielte Rückfrage an AuraGo (Fakten/Wissen aus dem Backend). Nicht ablehnen — bei fehlendem lokalem Wissen lieber hier fragen. Für Aufgaben mit Web/Wetter/vollen Tools: ask_aurago.",
    parameters: schema(
      {
        question: { type: "string", description: "Die Frage an AuraGo" },
        context: { type: "string", description: "Optionaler Kontext" },
      },
      ["question"],
    ),
    category: "remote",
  },
  {
    name: "ask_aurago",
    description:
      "Übergibt die Aufgabe an AuraGo mit vollem Toolset (Web, Wetter, Integrationen, …). Pflicht, wenn du lokal nicht weiterkommst — z. B. Wetterprognosen, Websuche, Nachrichten, Online-APIs. Im selben Schritt kurzen content-Hinweis setzen (Persona, z. B. dass es einen Moment dauert). Nicht selbst absagen. Beendet den lokalen Turn; AuraGo antwortet danach dem Nutzer.",
    parameters: schema(
      {
        task: {
          type: "string",
          description: "Die Nutzeraufgabe möglichst unverändert / klar formuliert",
        },
        reason: {
          type: "string",
          description: "Kurzer Grund, z. B. needs_web / needs_weather / needs_full_toolset",
        },
      },
      ["task"],
    ),
    category: "handoff",
  },
  {
    name: "get_client_status",
    description: "Liefert Verbindungs-, Session- und Capability-Status von agodesk.",
    parameters: EMPTY_SCHEMA,
    category: "kernel",
  },
];

/** Revealed only via list_local_tools / describe_tool. */
export const DISCOVERABLE_TOOLS: LocalToolSpec[] = [
  {
    name: "file_list",
    description: "Listet Dateien/Ordner in einem freigegebenen Root.",
    parameters: schema({
      root_id: { type: "string" },
      path: { type: "string", description: "Pfad relativ zum Root (Standard: '.')" },
      recursive: { type: "boolean" },
    }),
    category: "local",
    operation: "file_list",
    isAvailable: (s) => fileAccessIsConfigured(s.fileAccess) && hasFileRoot(s, "read"),
  },
  {
    name: "file_read",
    description: "Liest den Inhalt einer Datei aus einem freigegebenen Root.",
    parameters: schema(
      {
        root_id: { type: "string" },
        path: { type: "string" },
        encoding: { type: "string", enum: ["utf-8", "base64", "auto"] },
      },
      ["path"],
    ),
    category: "local",
    operation: "file_read",
    isAvailable: (s) => fileAccessIsConfigured(s.fileAccess) && hasFileRoot(s, "read"),
  },
  {
    name: "file_search",
    description: "Sucht in Dateien (grep/glob) innerhalb eines freigegebenen Roots.",
    parameters: schema(
      {
        root_id: { type: "string" },
        operation: { type: "string", description: "grep | grep_recursive | glob" },
        pattern: { type: "string" },
        path: { type: "string" },
        glob: { type: "string" },
        output_mode: { type: "string" },
      },
      ["pattern"],
    ),
    category: "local",
    operation: "file_search",
    isAvailable: (s) => fileAccessIsConfigured(s.fileAccess) && hasFileRoot(s, "read"),
  },
  {
    name: "file_write",
    description: "Schreibt Inhalt in eine Datei in einem beschreibbaren Root.",
    parameters: schema(
      {
        root_id: { type: "string" },
        path: { type: "string" },
        content: { type: "string" },
        create_only: { type: "boolean" },
      },
      ["path", "content"],
    ),
    category: "local",
    operation: "file_write",
    isAvailable: (s) => fileAccessIsConfigured(s.fileAccess) && hasFileRoot(s, "write"),
  },
  {
    name: "file_patch",
    description: "Wendet Text-Patches (old_text/new_text) auf eine Datei an.",
    parameters: schema(
      {
        root_id: { type: "string" },
        path: { type: "string" },
        patches: {
          type: "array",
          items: schema(
            { old_text: { type: "string" }, new_text: { type: "string" } },
            ["old_text", "new_text"],
          ),
        },
        dry_run: { type: "boolean" },
      },
      ["path", "patches"],
    ),
    category: "local",
    operation: "file_patch",
    isAvailable: (s) => fileAccessIsConfigured(s.fileAccess) && hasFileRoot(s, "write"),
  },
  {
    name: "shell_exec",
    description: "Führt einen Shell-Befehl in einem freigegebenen Arbeitsverzeichnis aus.",
    parameters: schema(
      {
        command: { type: "string" },
        cwd_id: { type: "string" },
        timeout_ms: { type: "number" },
      },
      ["command"],
    ),
    category: "local",
    operation: "shell_exec",
    isAvailable: (s) => shellAccessIsConfigured(s.shellAccess),
  },
  {
    name: "desktop_screenshot",
    description: "Erstellt einen Screenshot des Desktops.",
    parameters: schema({ display_id: { type: "string" }, window_id: { type: "string" } }),
    category: "local",
    operation: "desktop_screenshot",
    isAvailable: (s) => s.desktopControlEnabled,
  },
  {
    name: "desktop_list_windows",
    description: "Listet offene Fenster.",
    parameters: EMPTY_SCHEMA,
    category: "local",
    operation: "desktop_list_windows",
    isAvailable: (s) => s.desktopControlEnabled,
  },
  {
    name: "desktop_active_window",
    description: "Liefert das aktuell aktive Fenster.",
    parameters: EMPTY_SCHEMA,
    category: "local",
    operation: "desktop_active_window",
    isAvailable: (s) => s.desktopControlEnabled,
  },
  {
    name: "desktop_host_info",
    description: "Liefert Host-Metadaten (OS, Displays).",
    parameters: EMPTY_SCHEMA,
    category: "local",
    operation: "desktop_host_info",
    isAvailable: (s) => s.desktopControlEnabled,
  },
  {
    name: "desktop_ui_tree",
    description: "Liefert den UI-Automation-Baum eines Fensters (lesend).",
    parameters: schema({ window_id: { type: "string" } }),
    category: "local",
    operation: "desktop_ui_tree",
    isAvailable: (s) => s.desktopControlEnabled,
  },
];

function hasFileRoot(settings: AppSettings, permission: "read" | "write"): boolean {
  return settings.fileAccess.roots.some((root) =>
    permission === "read" ? root.readEnabled : root.writeEnabled,
  );
}

const ALL_TOOLS: LocalToolSpec[] = [...KERNEL_TOOLS, ...DISCOVERABLE_TOOLS];

export function getToolSpec(name: string): LocalToolSpec | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name);
}

/** Discoverable tools currently usable given the settings. */
export function availableDiscoverableTools(settings: AppSettings): LocalToolSpec[] {
  return DISCOVERABLE_TOOLS.filter((tool) => tool.isAvailable?.(settings) ?? true);
}

/** OpenAI-style function tool declaration for a spec. */
export function toToolDeclaration(spec: LocalToolSpec): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
    },
  };
}
