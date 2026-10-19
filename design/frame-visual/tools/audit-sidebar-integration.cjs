const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const workspace = path.resolve(root, "../..");
const prefix = "design/frame-visual/";
const evidence = path.join(root, "evidence/sidebar-integration");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "before-source-hashes.json"), "utf8")).sourceHashes;
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? (entry.name === "evidence" ? [] : walk(file)) : [file];
});
const relative = file => path.relative(workspace, file).replaceAll("\\", "/");
const current = Object.fromEntries(walk(root).map(file => [relative(file), hash(file)]));
const edits = ["src/runtime-preview.js", "src/host/workspace-commands.js", "src/shell/visual-workbench.js",
  "src/layout/workspace-state.js", "src/runtime/component-host.js", "plugin-authoring.md", "sidebar-composition.md",
  "sidebar-composition-plan.md"].map(name => prefix + name);
const additions = ["src/host/sidebar-presentation.js", "src/host/sidebar-commands.js", "tests/sidebar-integration.test.js",
  "tests/support/dom-test-environment.js", "sidebar-integration-plan.md", "sidebar-integration.md",
  "tools/audit-sidebar-integration.cjs"].map(name => prefix + name);
const changes = Object.keys(baseline).filter(file => current[file] !== baseline[file]);
const protectedPaths = Object.keys(baseline).filter(file => !edits.includes(file) && (
  file.startsWith(prefix + "src/runtime/") || file.startsWith(prefix + "src/features/")
  || file.startsWith(prefix + "src/layout/") || file.startsWith(prefix + "src/host/")
  || file.startsWith(prefix + "tests/") || file === prefix + "copy-provenance.json"));
const protectedChanges = changes.filter(file => protectedPaths.includes(file));
const otherChanges = changes.filter(file => !edits.includes(file));
const visualPaths = Object.keys(baseline).filter(file => file.startsWith(prefix + "styles/")
  || file.startsWith(prefix + "fixtures/") || file.startsWith(prefix + "src/fixtures/")
  || ["src/workspace-geometry.js", "runtime-preview.html", "index.html"].some(name => file === prefix + name));
const visualChanges = changes.filter(file => visualPaths.includes(file));
const provenance = JSON.parse(fs.readFileSync(path.join(root, "copy-provenance.json"), "utf8"));
const original = path.resolve(workspace, provenance.source);
const originalFiles = walk(original).map(file => path.relative(original, file).replaceAll("\\", "/"));
const mismatches = Object.entries(provenance.sourceHashes).filter(([file, expected]) =>
  !fs.existsSync(path.join(original, file)) || hash(path.join(original, file)) !== expected).map(([file]) => file);
const inventoryMatches = JSON.stringify(originalFiles.sort()) === JSON.stringify(Object.keys(provenance.sourceHashes).sort());
const entry = fs.readFileSync(path.join(root, "src/runtime-preview.js"), "utf8");
const routerInstances = (entry.match(/\bcreateCommandRouter\s*\(/g) ?? []).length;
const inspect = file => ({ file, before: baseline[file] ?? null, after: current[file] ?? null });
const importProblems = [...edits, ...additions].filter(file => /\.(js|cjs)$/.test(file)).filter(file =>
  /\bfrom\s*["'][^"']*(?:apps[\\/]workbench|core-kernel|brilliant-kernel)|\brequire\s*\(["'][^"']*apps[\\/]workbench/.test(fs.readFileSync(path.join(workspace, file), "utf8")));
const report = { generatedAt: new Date().toISOString(), baselineFiles: Object.keys(baseline).length,
  existingFileEditsByThisBatch: edits.map(inspect), additionsByThisBatch: additions.map(inspect),
  concurrentChangesOutsideBatchScope: otherChanges.map(inspect),
  otherAdditions: Object.keys(current).filter(file => baseline[file] === undefined && !additions.includes(file)).map(inspect),
  protectedPaths, protectedChanges, visualAssetChangesObserved: visualChanges.map(inspect),
  originalFrame: { files: originalFiles.length, inventoryMatches, mismatches },
  uiRouter: { instancesCreatedByDefaultEntry: routerInstances, independentRouterPluginAdded: false },
  importProblems,
  browserVerification: { completed: false, reason: "Browser policy refused the file:// protocol; no alternate protocol or browser workaround attempted." },
  limitations: ["Ownership comes from the declared edit history; hashes do not identify an editor.",
    "Actual shell DOM comparison uses a test double, not browser pixel layout.",
    "Default builtin panels remain right-only; cross-region movement uses a separately authorized test declaration.",
    "The registration wire format and compatible currentPage selection preference remain; no formal package release or kernel integration is claimed."] };
report.passed = protectedChanges.length === 0 && inventoryMatches && mismatches.length === 0 && routerInstances === 1 && importProblems.length === 0
  && edits.every(file => baseline[file] !== undefined && current[file] !== undefined)
  && additions.every(file => baseline[file] === undefined && current[file] !== undefined);
fs.writeFileSync(path.join(evidence, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
assert.deepEqual(protectedChanges, [], "Protected sources changed; inspect without reverting concurrent work");
assert.ok(report.passed, "Sidebar integration scope or original frame integrity failed");
console.log(`PASS: ${edits.length} declared edits, ${additions.length} additions, ${otherChanges.length} other changes; one UI router; original frame ${originalFiles.length} files unchanged`);
