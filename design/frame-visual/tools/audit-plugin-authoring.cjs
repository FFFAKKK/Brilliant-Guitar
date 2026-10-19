// This batch adds an adapter and a query only. Record concurrent design changes separately.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const workspace = path.resolve(root, "../..");
const prefix = "design/frame-visual/";
const evidence = path.join(root, "evidence/plugin-authoring");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "before-source-hashes.json"), "utf8")).sourceHashes;
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const relative = file => path.relative(workspace, file).replaceAll("\\", "/");
const current = Object.fromEntries(walk(root).filter(file => !relative(file).startsWith(prefix + "evidence/"))
  .map(file => [relative(file), hash(file)]));
const addedByBatch = ["src/runtime/ui-plugin-contract.js", "src/runtime/ui-contribution-catalog.js",
  "tests/plugin-authoring.test.js", "plugin-authoring.md", "tools/audit-plugin-authoring.cjs"].map(name => prefix + name);
const protectedPaths = Object.keys(baseline).filter(file => file.startsWith(prefix + "src/runtime/")
  || ["src/runtime-preview.js", "src/features/builtin-pages.js", "src/features/workspace-layout-page.js",
    "src/host/workspace-commands.js", "tests/plugin-platform.test.js", "tests/plugin-reliability.test.js"].some(name => file === prefix + name));
const changes = Object.keys(baseline).filter(file => current[file] !== baseline[file]);
const protectedChanges = changes.filter(file => protectedPaths.includes(file));
const concurrentChanges = changes.filter(file => !protectedPaths.includes(file));
const unknownAdditions = Object.keys(current).filter(file => baseline[file] === undefined && !addedByBatch.includes(file));
const provenance = JSON.parse(fs.readFileSync(path.join(root, "copy-provenance.json"), "utf8"));
const original = path.resolve(workspace, provenance.source);
const originalFiles = walk(original).map(file => path.relative(original, file).replaceAll("\\", "/"));
const originalMismatches = Object.entries(provenance.sourceHashes)
  .filter(([file, expected]) => !fs.existsSync(path.join(original, file)) || hash(path.join(original, file)) !== expected).map(([file]) => file);
const inventoryMatches = JSON.stringify(originalFiles.sort()) === JSON.stringify(Object.keys(provenance.sourceHashes).sort());
const describe = file => ({ file, before: baseline[file] ?? null, after: current[file] ?? null });
const report = { generatedAt: new Date().toISOString(), baselineFiles: Object.keys(baseline).length,
  additionsByThisBatch: addedByBatch.map(describe), existingFileEditsByThisBatch: [],
  concurrentChanges: concurrentChanges.map(describe), otherAdditions: unknownAdditions.map(describe),
  protectedPaths, protectedChanges, unchangedBaselineFiles: Object.keys(baseline).filter(file => current[file] === baseline[file]).length,
  originalFrame: { files: originalFiles.length, inventoryMatches, mismatches: originalMismatches },
  limitations: ["Ownership classification uses this batch's recorded edit history; hashes alone cannot identify an editor.",
    "Concurrent layout changes are observed and preserved; this audit does not qualify their visual behavior.",
    "No browser visual matrix was repeated because this batch adds unconnected runtime interfaces only."] };
report.passed = protectedChanges.length === 0 && inventoryMatches && originalMismatches.length === 0
  && addedByBatch.every(file => baseline[file] === undefined && current[file] !== undefined);
fs.writeFileSync(path.join(evidence, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
assert.deepEqual(protectedChanges, [], "Existing runtime or integration sources changed; review without overwriting");
assert.ok(report.passed, "Authoring batch scope or original frame integrity check failed");
console.log(`PASS: ${addedByBatch.length} added batch files, existing runtime unchanged, ${concurrentChanges.length} concurrent file changes; original frame ${originalFiles.length} files unchanged`);
