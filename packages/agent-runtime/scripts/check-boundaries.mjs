import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const forbidden = /(?:apps[\\/]workbench|@tauri|react|vexflow|score-read-port|score-change-set-port|\.kernel)/;
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) check(path);
    else if (/\.(?:ts|js)$/.test(path)) {
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(/(?:from\s+|import\s*\()(["'])([^"']+)\1/g)) {
        const target = match[2];
        if (forbidden.test(target) || (target.startsWith(".") && !resolve(dirname(path), target).startsWith(root))) throw new Error(`Invalid Agent dependency: ${path} -> ${target}`);
      }
    }
  }
}
check(resolve(root, "src"));
check(resolve(root, "dist"));
for (const name of Object.keys(JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).dependencies)) {
  if (forbidden.test(name)) throw new Error(`Invalid Agent dependency: ${name}`);
}
console.log("Agent source/build dependency boundaries passed.");
