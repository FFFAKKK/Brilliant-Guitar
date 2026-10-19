// This batch changes shared component lifecycle additively, but leaves the default
// preview integration and existing layout state in place. Never overwrite past audits.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const workspace = path.resolve(root, "../..");
const prefix = "design/frame-visual/";
const evidence = path.join(root, "evidence/sidebar-contract");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "before-source-hashes.json"), "utf8")).sourceHashes;
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? (entry.name === "evidence" ? [] : walk(file)) : [file];
});
const relative = file => path.relative(workspace, file).replaceAll("\\", "/");
const current = Object.fromEntries(walk(root).map(file => [relative(file), hash(file)]));
const edits = ["src/runtime/ui-plugin-contract.js", "src/runtime/ui-contribution-catalog.js", "src/runtime/component-host.js",
  "tests/plugin-authoring.test.js", "plugin-authoring.md", "sidebar-composition-plan.md"].map(name => prefix + name);
const additions = ["src/layout/sidebar-composition-state.js", "tests/sidebar-composition.test.js",
  "tools/audit-sidebar-contract.cjs", "sidebar-composition.md"].map(name => prefix + name);
const changes = Object.keys(baseline).filter(file => current[file] !== baseline[file]);
const protectedPaths = Object.keys(baseline).filter(file => !edits.includes(file) && (
  file.startsWith(prefix + "src/runtime/") || file.startsWith(prefix + "src/features/") || file.startsWith(prefix + "src/host/")
  || ["src/runtime-preview.js", "src/layout/workspace-state.js", "src/layout/layout-model.js", "src/layout/persistence.js",
    "tests/plugin-platform.test.js", "tests/plugin-reliability.test.js", "tests/workspace-runtime.test.js", "tests/stage-viewport.test.js"]
    .some(name => file === prefix + name)));
const protectedChanges = changes.filter(file => protectedPaths.includes(file));
const otherChanges = changes.filter(file => !edits.includes(file));
const otherAdditions = Object.keys(current).filter(file => baseline[file] === undefined && !additions.includes(file));
const visualPaths = Object.keys(baseline).filter(file => file.startsWith(prefix + "styles/") || file.startsWith(prefix + "src/shell/")
  || file.startsWith(prefix + "src/fixtures/") || ["src/workspace-geometry.js", "runtime-preview.html", "index.html"].some(name => file === prefix + name));
const provenance = JSON.parse(fs.readFileSync(path.join(root, "copy-provenance.json"), "utf8"));
const original = path.resolve(workspace, provenance.source);
const originalFiles = walk(original).map(file => path.relative(original, file).replaceAll("\\", "/"));
const mismatches = Object.entries(provenance.sourceHashes).filter(([file, expected]) =>
  !fs.existsSync(path.join(original, file)) || hash(path.join(original, file)) !== expected).map(([file]) => file);
const inventoryMatches = JSON.stringify(originalFiles.sort()) === JSON.stringify(Object.keys(provenance.sourceHashes).sort());
const describe = file => ({ file, before: baseline[file] ?? null, after: current[file] ?? null });
const report = { generatedAt: new Date().toISOString(), baselineFiles: Object.keys(baseline).length,
  existingFileEditsByThisBatch: edits.map(describe), additionsByThisBatch: additions.map(describe),
  concurrentChangesOutsideBatchScope: otherChanges.map(describe), otherAdditions: otherAdditions.map(describe),
  protectedPaths, protectedChanges, visualChangesObserved: changes.filter(file => visualPaths.includes(file)).map(describe),
  originalFrame: { files: originalFiles.length, inventoryMatches, mismatches },
  limitations: ["The declared edit list records ownership; hashes alone do not identify an editor.",
    "Independent design changes are preserved and reported, not visually qualified by this audit.",
    "Sidebar composition is verified with isolated integration tests and is not connected to the default shell.",
    "Visibility notifications do not automatically control DOM or pause arbitrary plugin resources."] };
report.passed = protectedChanges.length === 0 && inventoryMatches && mismatches.length === 0
  && edits.every(file => baseline[file] !== undefined && current[file] !== undefined)
  && additions.every(file => baseline[file] === undefined && current[file] !== undefined);
fs.writeFileSync(path.join(evidence, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
assert.deepEqual(protectedChanges, [], "Default integration or protected contracts changed; inspect without reverting other work");
assert.ok(report.passed, "Sidebar batch scope or original frame integrity check failed");
console.log(`PASS: ${edits.length} declared edits, ${additions.length} additions, ${otherChanges.length} other changes; original frame ${originalFiles.length} files unchanged`);
