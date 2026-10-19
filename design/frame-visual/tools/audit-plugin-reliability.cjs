// Audit this runtime batch against its own baseline. Historical visual audits remain separate.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const workspace = path.resolve(root, "../..");
const prefix = "design/frame-visual/";
const evidence = path.join(root, "evidence/plugin-reliability");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "before-source-hashes.json"), "utf8")).sourceHashes;
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const relative = file => path.relative(workspace, file).replaceAll("\\", "/");
const current = Object.fromEntries(walk(root).filter(file => !relative(file).startsWith(prefix + "evidence/"))
  .map(file => [relative(file), hash(file)]));

const intendedModified = ["command-router.js", "component-host.js", "component-registry.js", "menu-registry.js",
  "plugin-facets.js", "plugin-installer.js", "ui-plugin-host.js"].map(name => prefix + "src/runtime/" + name);
const intendedAdded = ["src/runtime/runtime-support.js", "tests/plugin-reliability.test.js",
  "tools/audit-plugin-reliability.cjs", "plugin-reliability.md"].map(name => prefix + name);
// These were observed changing independently during this batch; no edits by this batch.
const concurrentPaths = ["README.md", "runtime-integration.md", "src/fixtures/structure-preview.js",
  "tools/horizontal-bands-contract.js"].map(name => prefix + name);
const modified = Object.keys(baseline).filter(file => current[file] !== undefined && baseline[file] !== current[file]);
const deleted = Object.keys(baseline).filter(file => current[file] === undefined);
const added = Object.keys(current).filter(file => baseline[file] === undefined);
const unclassified = [...modified.filter(file => !intendedModified.includes(file) && !concurrentPaths.includes(file)),
  ...added.filter(file => !intendedAdded.includes(file)), ...deleted];

const provenance = JSON.parse(fs.readFileSync(path.join(root, "copy-provenance.json"), "utf8"));
const original = path.resolve(workspace, provenance.source);
const originalFiles = walk(original).map(file => path.relative(original, file).replaceAll("\\", "/"));
const originalMismatches = Object.entries(provenance.sourceHashes)
  .filter(([name, expected]) => !fs.existsSync(path.join(original, name)) || hash(path.join(original, name)) !== expected)
  .map(([name]) => name);
const originalInventoryMatches = JSON.stringify(originalFiles.sort()) === JSON.stringify(Object.keys(provenance.sourceHashes).sort());
const describe = file => ({ file, before: baseline[file] ?? null, after: current[file] ?? null });
const report = {
  generatedAt: new Date().toISOString(),
  baselineFiles: Object.keys(baseline).length,
  intendedModified: modified.filter(file => intendedModified.includes(file)).map(describe),
  intendedAdded: added.filter(file => intendedAdded.includes(file)).map(describe),
  concurrentChanges: modified.filter(file => concurrentPaths.includes(file)).map(describe),
  unchangedBaselineFiles: Object.keys(baseline).filter(file => current[file] === baseline[file]).length,
  unclassifiedChanges: unclassified,
  originalFrame: { files: originalFiles.length, inventoryMatches: originalInventoryMatches, mismatches: originalMismatches },
  limitations: ["Hash deltas establish file changes; batch ownership is classified from the recorded edit history.",
    "No before/after content audit of apps/workbench was collected; this batch made no edits there.",
    "This does not repeat the visual matrix or assert historical inherited runtime hashes are unchanged."],
};
report.passed = unclassified.length === 0 && originalInventoryMatches && originalMismatches.length === 0
  && intendedModified.every(file => modified.includes(file)) && intendedAdded.every(file => added.includes(file));
fs.writeFileSync(path.join(evidence, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
assert.deepEqual(unclassified, [], "Unclassified source changes require review; do not overwrite them");
assert.ok(originalInventoryMatches, "Original frame inventory changed");
assert.deepEqual(originalMismatches, [], "Original frame source hashes changed");
assert.ok(report.passed, "Expected runtime changes or new batch files are missing");
console.log(`PASS: ${report.intendedModified.length} runtime changes, ${report.intendedAdded.length} batch files, ${report.concurrentChanges.length} concurrent changes; original frame ${originalFiles.length} files unchanged`);
