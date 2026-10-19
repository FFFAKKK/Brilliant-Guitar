import { build } from "esbuild";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isWithin } from "./author-validation-kit.mjs";
import { createStartupCenterPage } from "./startup-center-page.mjs";

const root = fileURLToPath(new URL("../", import.meta.url)), check = process.argv.includes("--check");
if (process.argv.slice(2).some(value => value !== "--check")) throw new Error("Only --check is supported");
const html = await createStartupCenterPage();
const result = await build({ absWorkingDir: root, entryPoints: [join(root, "src/startup-center-entry.js")],
  bundle: true, format: "iife", target: "es2022", write: false, metafile: true, legalComments: "inline",
  banner: { js: "// Generated visual preview. Edit src/startup-center-preview.js and tools/startup-center-page.html." } });
if (Object.keys(result.metafile.inputs).some(path => /plugin-platform|backup-ui-runtime|desktop-plugin-settings/.test(path))) {
  throw new Error("Visual candidate must not carry a platform/editor/desktop storage implementation");
}
const outputs = new Map([["startup-center-static-preview.html", html], ["vendor/startup-center-preview.js", result.outputFiles[0].text]]);
for (const [name, value] of outputs) {
  const path = join(root, name);
  if (check) {
    if (await readFile(path, "utf8") !== value) throw new Error(`Startup center asset is stale: ${name}`);
  } else {
    await mkdir(dirname(path), { recursive: true });
    if (!isWithin(await realpath(root), await realpath(dirname(path)))) throw new Error("Output escapes preview root");
    try { if ((await lstat(path)).isSymbolicLink()) throw new Error("Refusing linked preview output"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await writeFile(path, value);
  }
}
console.log(`Startup center ${check ? "verified" : "built"}; original manager shell, view and controller reused; no platform activated.`);
