import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(root, "..", "src", "lib", "i18n", "messages");
const de = JSON.parse(fs.readFileSync(path.join(dir, "de.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(dir, "en.json"), "utf8"));

for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".json"))) {
  if (file === "de.json") {
    continue;
  }
  const filePath = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let changed = false;
  for (const [key, value] of Object.entries(de)) {
    if (typeof data[key] !== "string" || data[key].length === 0) {
      data[key] = en[key] ?? value;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    process.stdout.write(`updated ${file}\n`);
  }
}
