import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, lstat, rm, writeFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { readDesktopAssetPlan } from "./desktop-assets.mjs";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const check = process.argv.includes("--check");
async function generate(script) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...(check ? ["--check"] : [])], { cwd: sourceRoot, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${script} failed: ${signal ?? code}`)));
  });
}

await generate("scripts/build-notation.mjs");
await generate("scripts/build-plugin-startup.mjs");
await generate("scripts/build-startup-center-product.mjs");
// Validate the entire asset closure before removing any previous generated output.
const { sourceRoot: root, assets } = await readDesktopAssetPlan({ sourceRoot });
const output = join(root, "dist", "desktop");
const manifest = JSON.stringify({ format: 1, assets: [...assets].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => ({
  path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
})) }, null, 2) + "\n";

if (check) {
  async function files(path, prefix = "") {
    const result = [];
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("Generated desktop output must not contain symlinks");
      const key = prefix + entry.name;
      result.push(...(entry.isDirectory() ? await files(join(path, entry.name), key + "/") : [key]));
    }
    return result;
  }
  const expected = [...assets.keys(), "asset-manifest.json"].sort(), actual = (await files(output)).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("Desktop output asset set is stale; run npm run desktop:build");
  for (const [path, bytes] of assets) if (!(await readFile(join(output, path))).equals(bytes)) throw new Error(`Desktop asset is stale: ${path}`);
  if (await readFile(join(output, "asset-manifest.json"), "utf8") !== manifest) throw new Error("Desktop asset manifest is stale");
} else {
  // This is the one generated destination. Reject reparse points before recursive deletion.
  await mkdir(dirname(output), { recursive: true });
  if (await realpath(dirname(output)) !== join(root, "dist")) throw new Error("Desktop output parent must stay inside the source root");
  try {
    if ((await lstat(output)).isSymbolicLink() || await realpath(output) !== output) throw new Error("Desktop output must not be a symlink/junction");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const [path, bytes] of assets) { const destination = resolve(output, path); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes); }
  await writeFile(join(output, "asset-manifest.json"), manifest);
}
console.log(`Backup desktop assets ${check ? "verified" : "built"}: ${assets.size} files → ${output}`);
