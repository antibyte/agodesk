import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../../types/protocol.ts";
import type { AppSettings } from "../../types/protocol.ts";
import {
  KERNEL_TOOLS,
  availableDiscoverableTools,
  getToolSpec,
  toToolDeclaration,
} from "./tools.ts";

test("kernel tools include discovery and escalation entries", () => {
  const names = KERNEL_TOOLS.map((tool) => tool.name);
  for (const expected of [
    "list_local_tools",
    "describe_tool",
    "memory_search",
    "query_aurago",
    "ask_aurago",
    "get_client_status",
  ]) {
    assert.ok(names.includes(expected), `kernel missing ${expected}`);
  }
});

test("default settings expose only desktop discoverable tools", () => {
  const available = availableDiscoverableTools(DEFAULT_SETTINGS).map((tool) => tool.name);
  assert.ok(available.includes("desktop_screenshot"));
  // file/shell require configured roots which defaults lack.
  assert.ok(!available.includes("file_read"));
  assert.ok(!available.includes("shell_exec"));
});

test("configured file + shell access reveals those tools", () => {
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    fileAccess: {
      ...DEFAULT_SETTINGS.fileAccess,
      enabled: true,
      roots: [
        {
          rootId: "r1",
          label: "Docs",
          canonicalPath: "/docs",
          pathDisplay: "/docs",
          readEnabled: true,
          writeEnabled: false,
        },
      ],
    },
    shellAccess: {
      ...DEFAULT_SETTINGS.shellAccess,
      enabled: true,
      allowedCwds: [{ cwdId: "c1", label: "Home", canonicalPath: "/home", pathDisplay: "/home" }],
    },
  };
  const available = availableDiscoverableTools(settings).map((tool) => tool.name);
  assert.ok(available.includes("file_read"));
  assert.ok(available.includes("file_search"));
  assert.ok(!available.includes("file_write"), "write root not enabled");
  assert.ok(available.includes("shell_exec"));
});

test("toToolDeclaration produces OpenAI function shape", () => {
  const spec = getToolSpec("memory_search");
  assert.ok(spec);
  const declaration = toToolDeclaration(spec!) as {
    type: string;
    function: { name: string; parameters: unknown };
  };
  assert.equal(declaration.type, "function");
  assert.equal(declaration.function.name, "memory_search");
  assert.ok(declaration.function.parameters);
});
