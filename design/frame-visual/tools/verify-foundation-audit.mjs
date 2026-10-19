import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const evidence = join(root, "design/frame-visual/evidence/infrastructure-foundation-audit-20261007");
const docs = ["design/frame-visual/plugin-authoring.md", "design/frame-visual/plugin-mount-contract-v4.md",
  "design/frame-visual/infrastructure-acceptance-v0.1.md", "design/frame-visual/desktop-entry-v0.1.md",
  "design/frame-visual/examples/foundation/README.md", "design/frame-visual/research/infrastructure-foundation-map-20261007.md",
  "design/frame-visual/research/infrastructure-foundation-audit-20261007.md",
  ".trellis/spec/frontend/plugin-protocol-convergence-contract.md"];
let checkedLinks = 0;
const missingLinks = [];
for (const path of docs) {
  const text = (await readFile(join(root, path), "utf8")).replace(/```[\s\S]*?```/g, "");
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = match[1]; if (/^(?:https?:|app:|codex:|#)/.test(raw)) continue;
    const target = raw.replace(/^<|>$/g, "").split("#")[0]; if (!target) continue;
    checkedLinks++;
    try { await stat(resolve(dirname(join(root, path)), target)); }
    catch { missingLinks.push({ path, target }); }
  }
}
const files = ["apps/workbench/src/ui/notify-observers.ts", "apps/workbench/test/plugin-foundation.test.ts",
  "apps/workbench/test/fixtures/plugin-foundation-probe.ts", "design/frame-visual/tests/infrastructure-foundation.test.js",
  "design/frame-visual/tests/support/infrastructure-foundation-probe.js", "design/frame-visual/tests/infrastructure-author-trials.test.js",
  "design/frame-visual/examples/foundation/panel-plugin.js", "design/frame-visual/examples/foundation/command-plugin.js",
  "design/frame-visual/examples/foundation/readonly-view-plugin.js", "design/frame-visual/tools/audit-foundation-boundaries.mjs",
  "design/frame-visual/tools/capture-foundation-candidate.mjs", "design/frame-visual/tools/verify-foundation-audit.mjs", ...docs];
const whitespace = [];
for (const path of files) {
  const text = await readFile(join(root, path), "utf8");
  text.split(/\r?\n/).forEach((line, index) => { if (/[\t ]+$/.test(line)) whitespace.push({ path, line: index + 1 }); });
}
const log = await readFile(join(evidence, "backup-full.log"), "utf8");
const lifecycle = [...log.matchAll(/^.*?(\{"trial":.+\})\s*$/gm)].map(match => JSON.parse(match[1]));
assert.equal(lifecycle.length, 3);
for (const trial of lifecycle) assert.equal(trial.cycles.length, 100);
await writeFile(join(evidence, "lifecycle-trials.json"), JSON.stringify({ trials: lifecycle,
  scope: "Controlled subscriptions/cells/directories/mappings/root/window listeners and async acceptance, not JS heap/native tracks or commercial capacity." }, null, 2) + "\n");
const results = [];
for (const filename of ["formal-full.log", "backup-full.log", "backup-post-drift.log", "settings-parser-after.log", "lifecycle-after.log"]) {
  const text = await readFile(join(evidence, filename), "utf8");
  const count = key => Number(text.match(new RegExp(`(?:ℹ|#) ${key} (\\d+)`))?.[1] ?? NaN);
  const result = { filename, tests: count("tests"), pass: count("pass"), fail: count("fail"), skipped: count("skipped") };
  assert.ok(Number.isSafeInteger(result.tests)); assert.equal(result.pass, result.tests); assert.equal(result.fail, 0); assert.equal(result.skipped, 0);
  results.push(result);
}
const drift = JSON.parse((await readFile(join(evidence, "post-drift-comparison.json"), "utf8")).replace(/^\uFEFF/, ""));
assert.deepEqual(drift.changed, []);
const output = { at: new Date().toISOString(), documentFiles: docs.length, checkedLinks, missingLinks,
  whitespaceCheckedFiles: files.length, whitespace, results,
  currentScopedCandidate: { snapshot: "post-drift-end.json", stableVerificationWindow: drift,
    backupResult: "backup-post-drift.log", desktopCheck: "post-drift-desktop-check.log" },
  overallFoundationQualification: "pending", remaining: ["app-level single writer", "independent author trial",
    "capacity thresholds and measurements", "same-candidate native acceptance", "parallel layout handoff"],
  artifactScope: "Static desktop assets rebuilt; no native EXE rebuild or new browser/native acceptance." };
await writeFile(join(evidence, "verification.json"), JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
assert.deepEqual(missingLinks, []); assert.deepEqual(whitespace, []);
