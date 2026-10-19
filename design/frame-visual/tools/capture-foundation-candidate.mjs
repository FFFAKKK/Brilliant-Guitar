import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { readDesktopAssetPlan } from "../scripts/desktop-assets.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const auditRoot = join(root, "design/frame-visual/evidence/infrastructure-foundation-audit-20261007");
const label = process.argv[2];
if (!label || !/^[a-z][a-z0-9-]*$/.test(label)) throw new Error("Provide a bounded audit snapshot label");
const baseline = JSON.parse((await readFile(join(auditRoot, "baseline.json"), "utf8")).replace(/^\uFEFF/, ""));
const paths = new Set(baseline.files.map(file => file.path));
async function walk(path) {
  for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) await walk(file); else if (entry.isFile()) paths.add(file);
  }
}
await walk("design/frame-visual/src");
await walk("apps/workbench/src/plugins");
await walk("apps/workbench/src/ui");
for (const path of ["package-lock.json", "apps/workbench/package-lock.json", "design/frame-visual/package-lock.json",
  "apps/workbench/src/ui/notify-observers.ts", "apps/workbench/test/plugin-foundation.test.ts",
  "apps/workbench/test/fixtures/plugin-foundation-probe.ts", "design/frame-visual/tests/infrastructure-foundation.test.js",
  "design/frame-visual/tests/support/infrastructure-foundation-probe.js", "design/frame-visual/tests/infrastructure-author-trials.test.js",
  "design/frame-visual/plugin-mount-contract-v4.md", ".trellis/spec/frontend/plugin-protocol-convergence-contract.md"])
  paths.add(path);
await walk("design/frame-visual/examples/foundation");
const assets = await readDesktopAssetPlan({ sourceRoot: join(root, "design/frame-visual") });
for (const path of assets.assets.keys()) if (path !== "index.html") paths.add(`design/frame-visual/${path}`);
const files = [], absent = [];
for (const path of [...paths].sort()) {
  try {
    const bytes = await readFile(join(root, path));
    files.push({ path, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
  } catch (error) { if (error.code === "ENOENT") absent.push(path); else throw error; }
}
const snapshot = { at: new Date().toISOString(), label,
  scope: "Selected baseline, backup source/loaded assets, formal plugins/UI, example/tests and locks. Not a full repository or all native/Agent dependencies freeze.", files, absent };
const target = join(auditRoot, `${label}.json`);
await writeFile(target, JSON.stringify(snapshot, null, 2) + "\n");
console.log(`${files.length} fingerprints -> ${relative(root, target).replaceAll("\\", "/")}`);
