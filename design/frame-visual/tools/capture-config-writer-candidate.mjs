import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const evidence = join(root, "design/frame-visual/evidence/config-writer-lease-20261007");
const label = process.argv[2];
if (!label || !/^[a-z][a-z0-9-]*$/.test(label)) throw new Error("Provide a bounded snapshot label");
const paths = new Set();
async function walk(path) {
  for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile()) paths.add(file);
  }
}
for (const path of ["design/frame-visual/src", "design/frame-visual/vendor", "design/frame-visual/dist/desktop",
  "apps/workbench/src/plugins", "apps/workbench/src/ui", "apps/workbench/src/services",
  "apps/desktop/src-tauri/src", "shared/notation", "crates"])
  await walk(path);
for (const path of ["apps/desktop/src-tauri/Cargo.toml", "apps/desktop/src-tauri/Cargo.lock",
  "apps/desktop/src-tauri/tauri.conf.json", "apps/desktop/src-tauri/tauri.backup.conf.json",
  "apps/desktop/src-tauri/build.rs", "design/frame-visual/package-lock.json", "apps/workbench/package-lock.json",
  "design/frame-visual/tests/config-writer.test.js"])
  paths.add(path);
const files = [];
for (const path of [...paths].sort()) {
  const bytes = await readFile(join(root, path));
  files.push({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
await writeFile(join(evidence, `${label}.json`), JSON.stringify({ at: new Date().toISOString(), label,
  scope: "Selected UI/desktop/native/core sources, loaded/generated resources and locks; not a whole-repository freeze or native WebView acceptance.", files }, null, 2) + "\n");
console.log(`${files.length} candidate fingerprints captured: ${label}`);
