import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import * as stores from "svelte/store";

export { stores };
export const noop = () => {};
export const i18n = { getTranslateFn: () => (key) => key };

// Exercise the real orchestrators while keeping native, network and audio I/O inert.
export function loadModule(relative, mocks = {}, globals = {}) {
  const code = transformSync(readFileSync(new URL("../" + relative, import.meta.url), "utf8"), {
    loader: "ts",
    format: "cjs",
    target: "es2022",
    define: { "import.meta.env": '{"DEV":false,"BASE_URL":"/"}' },
  }).code;
  const module = { exports: {} };
  const require = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unexpected dependency ${name} from ${relative}`);
  };
  new Function("require", "module", "exports", ...Object.keys(globals), code)(
    require,
    module,
    module.exports,
    ...Object.values(globals),
  );
  return module.exports;
}

export const protocol = loadModule("src/lib/types/protocol.ts", {
  "./providers-protocol": loadModule("src/lib/types/providers-protocol.ts"),
});
