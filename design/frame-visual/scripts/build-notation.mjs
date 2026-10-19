import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import ts from "../../../node_modules/typescript/lib/typescript.js";
import "./score-interaction-assets.mjs";

const source = new URL("../../../shared/notation/", import.meta.url);
const output = new URL("../src/vendor/shared-notation/", import.meta.url);
const check = process.argv.includes("--check");
const manifest = {};
if (!check) await fs.mkdir(output, { recursive: true });
for (const file of (await fs.readdir(source)).filter(file => file.endsWith(".ts")).sort()) {
  const input = await fs.readFile(new URL(file, source), "utf8");
  const code = "// Generated from shared/notation; run npm run notation:build.\n"
    + ts.transpileModule(input, {
      fileName: file,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText.replaceAll('.ts"', '.js"');
  const target = new URL(file.replace(/\.ts$/, ".js"), output);
  if (check) {
    if (await fs.readFile(target, "utf8") !== code) throw new Error(`Stale notation module: ${file}`);
  } else await fs.writeFile(target, code);
  manifest[file] = createHash("sha256").update(input).digest("hex");
}
const metadata = JSON.stringify({ source: "shared/notation", vexflow: "5.0.0", files: manifest }, null, 2) + "\n";
const manifestPath = new URL("source-manifest.json", output);
if (check) {
  if (await fs.readFile(manifestPath, "utf8") !== metadata) throw new Error("Stale notation source manifest");
} else await fs.writeFile(manifestPath, metadata);
console.log(`Shared notation ${check ? "verified" : "built"}: ${Object.keys(manifest).length} modules`);
