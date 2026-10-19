import { build } from "esbuild";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classicNotationAssetPlugin } from "./classic-notation-asset.mjs";
import { createStartupCenterPage } from "./startup-center-page.mjs";
import { isWithin } from "./author-validation-kit.mjs";
const root = new URL("../", import.meta.url), check = process.argv.includes("--check");
if (process.argv.slice(2).some(value => value !== "--check")) throw new Error("Only --check is supported");
const result = await build({ absWorkingDir: fileURLToPath(root), entryPoints: [fileURLToPath(new URL("src/startup-center-product-entry.js", root))],
  bundle: true, format: "iife", target: "es2022", write: false, legalComments: "inline", plugins: [classicNotationAssetPlugin()],
  banner: { js: "// Generated backup startup center. Edit the shared source/template; run desktop:build." } });
for (const [name, value] of [["startup-center.html", await createStartupCenterPage({ product: true })], ["vendor/startup-center-product.js", result.outputFiles[0].text]]) {
  const path = new URL(name, root);
  if (check) { if (await readFile(path, "utf8") !== value) throw new Error(`Startup product asset is stale: ${name}`); }
  else {
    if (!isWithin(await realpath(root), await realpath(dirname(fileURLToPath(path))))) throw new Error("Output escapes preview root");
    try { if ((await lstat(path)).isSymbolicLink()) throw new Error("Refusing linked product output"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await writeFile(path, value);
  }
}
console.log(`Startup product ${check ? "verified" : "built"}: ${result.outputFiles[0].contents.length} bytes`);
