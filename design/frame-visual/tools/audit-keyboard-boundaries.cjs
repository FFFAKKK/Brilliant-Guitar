const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const workspace = path.resolve(root, "../..");
const prefix = "design/frame-visual/";
const evidence = path.join(root, "evidence/keyboard-boundaries");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "before-source-hashes.json"), "utf8"));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? (entry.name === "evidence" ? [] : walk(file)) : [file];
});
const relative = file => path.relative(workspace, file).replaceAll("\\", "/");
const hashes = directory => Object.fromEntries(walk(directory).map(file => [relative(file), hash(file)]));
const current = hashes(root);
const edits = baseline.declaredEditPaths.map(name => prefix + name);
const additions = ["src/host/focus-boundary.js", "tests/keyboard-boundaries.test.js", "keyboard-boundaries-plan.md",
  "keyboard-boundaries.md", "tools/audit-keyboard-boundaries.cjs"].map(name => prefix + name);
const differences = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])]
  .filter(file => before[file] !== after[file]);
const changes = differences(baseline.sourceHashes, current);
const inspect = file => ({ file, before: baseline.sourceHashes[file] ?? null, after: current[file] ?? null });
const original = hashes(path.join(workspace, "design/frame"));
const workbench = hashes(path.join(workspace, "apps/workbench"));
const provenance = JSON.parse(fs.readFileSync(path.join(root, "copy-provenance.json"), "utf8"));
const provenanceChanges = Object.entries(provenance.sourceHashes).filter(([name, expected]) => original["design/frame/" + name] !== expected).map(([name]) => name);
const unchangedRuntimePaths = ["src/runtime/command-router.js", "src/runtime/plugin-installer.js", "src/runtime/ui-plugin-contract.js",
  "src/runtime/component-registry.js", "src/runtime/ui-contribution-catalog.js", "src/layout/sidebar-composition-state.js", "src/host/sidebar-commands.js"];
const protocolChanges = unchangedRuntimePaths.filter(name => baseline.sourceHashes[prefix + name] !== current[prefix + name]);
const entry = fs.readFileSync(path.join(root, "src/runtime-preview.js"), "utf8");
const shell = fs.readFileSync(path.join(root, "src/shell/visual-workbench.js"), "utf8");
const keyboard = fs.readFileSync(path.join(root, "src/host/keyboard.js"), "utf8");
const count = (source, pattern) => (source.match(pattern) ?? []).length;
const ownsVisualFile = [...edits, ...additions].some(file => /\/(?:styles|fixtures|src\/fixtures)\/|\/workspace-geometry\.js$|\.html$/.test(file));
const sourceFiles = [...edits, ...additions].filter(file => /\.(js|cjs)$/.test(file));
const forbiddenImports = sourceFiles.filter(file => /\b(?:from|import)\s*["'][^"']*(?:apps[\\/]workbench|brilliant-kernel|core-kernel)/.test(fs.readFileSync(path.join(workspace, file), "utf8")));
const report = { generatedAt: new Date().toISOString(), baselineCapturedAt: baseline.capturedAt,
  baselineFiles: Object.keys(baseline.sourceHashes).length, existingFileEditsByThisBatch: edits.map(inspect), additionsByThisBatch: additions.map(inspect),
  concurrentChangesOutsideBatchScope: changes.filter(file => !edits.includes(file) && !additions.includes(file)).map(inspect),
  originalFrame: { files: Object.keys(original).length, changesSinceFreshBaseline: differences(baseline.originalHashes, original), provenanceChanges },
  abandonedWorkbench: { capturedFiles: Object.keys(baseline.workbenchHashes).length, changesSinceFreshBaseline: differences(baseline.workbenchHashes, workbench) },
  compatibility: { protocolChanges, ownsVisualFile, forbiddenImports },
  keyboard: { defaultRouterInstances: count(entry, /\bcreateCommandRouter\s*\(/g),
    defaultKeyboardBindings: count(entry, /\bbindKeyboard\s*\(/g), keyboardDocumentListeners: count(keyboard, /addEventListener\("keydown"/g),
    standaloneShellWindowListeners: count(shell, /window\.addEventListener\("keydown"/g),
    disposalWired: entry.includes("disposeKeyboard();"), independentRouterPluginAdded: false },
  limitations: ["Hashes record content, not editor identity; declared ownership comes from this batch's edits.",
    "DOM tests simulate keyboard propagation and focus; they do not execute browser layout or qualify pixels.",
    "The existing file:// browser access refusal remains; no alternate protocol or browser workaround attempted.",
    "The score image remains read-only; keyboard boundaries do not implement score editing or a background score context.",
    "Global shortcut declarations retain their existing uniqueness rule; local hooks are instance-scoped and synchronous."] };
report.passed = edits.every(file => baseline.sourceHashes[file] !== undefined && current[file] !== undefined)
  && additions.every(file => baseline.sourceHashes[file] === undefined && current[file] !== undefined)
  && report.originalFrame.changesSinceFreshBaseline.length === 0 && provenanceChanges.length === 0
  && report.abandonedWorkbench.changesSinceFreshBaseline.length === 0 && protocolChanges.length === 0
  && !ownsVisualFile && forbiddenImports.length === 0 && report.keyboard.defaultRouterInstances === 1
  && report.keyboard.defaultKeyboardBindings === 1 && report.keyboard.keyboardDocumentListeners === 1
  && report.keyboard.standaloneShellWindowListeners === 0 && report.keyboard.disposalWired;
fs.writeFileSync(path.join(evidence, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
assert.ok(report.passed, "Keyboard scope/integrity audit failed; inspect report without reverting concurrent work");
console.log(`PASS: ${edits.length} declared edits, ${additions.length} additions; one default router and keyboard binding; ${report.concurrentChangesOutsideBatchScope.length} external changes; original frame and workbench unchanged`);
