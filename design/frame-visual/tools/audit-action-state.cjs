const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, ".."), workspace = path.resolve(root, "../..");
const prefix = "design/frame-visual/", evidence = path.join(root, "evidence/action-state");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "before-source-hashes.json"), "utf8"));
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? entry.name === "evidence" ? [] : walk(file) : [file];
});
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const hashes = directory => Object.fromEntries(walk(directory).map(file => [path.relative(workspace, file).replaceAll("\\", "/"), hash(file)]));
const differences = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]);
const edits = baseline.declaredEditPaths.map(name => prefix + name);
const additions = ["action-state-plan.md", "action-state.md", "src/host/action-state-read-port.js", "src/shell/action-presentation.js",
  "tests/action-state.test.js", "tools/audit-action-state.cjs"].map(name => prefix + name);
const current = hashes(root), changed = differences(baseline.sourceHashes, current);
const original = hashes(path.join(workspace, "design/frame")), workbench = hashes(path.join(workspace, "apps/workbench"));
const protectedNames = ["src/shell/visual-workbench.js", "src/workspace-geometry.js", "src/layout/workspace-state.js",
  "src/layout/sidebar-composition-state.js", "src/layout/layout-edit-session.js", "src/layout/state-transaction.js",
  "src/host/workspace-commands.js", "src/host/sidebar-commands.js", "src/host/sidebar-presentation.js",
  "src/host/sidebar-content-read-port.js", "src/host/keyboard.js", "src/host/focus-boundary.js", "src/host/stage-viewport.js",
  "runtime-preview.html", "index.html", "package.json"];
const protectedChanges = changed.filter(file => /\/styles\/|\/fixtures\/|\/src\/runtime\//.test(file)
  || protectedNames.some(name => file === prefix + name));
// Preserve the initial baseline and separately verify exact saved concurrent artifacts.
const concurrent = JSON.parse(fs.readFileSync(path.join(evidence, "concurrent-work.json"), "utf8"));
const expectedConcurrentPaths = ["src/fixtures/controls-review.js", "tools/framework-controls-contract.cjs"].map(name => prefix + name);
const confirmedConcurrentChanges = concurrent.changes.map(item => ({ ...item,
  snapshotVerified: expectedConcurrentPaths.includes(item.file) && (baseline.sourceHashes[item.file] ?? null) === item.before
    && hash(path.join(evidence, "concurrent-source", item.file.slice(prefix.length))) === item.after,
  matchesCurrent: current[item.file] === item.after,
}));
const unaccountedProtectedChanges = protectedChanges.filter(file => !confirmedConcurrentChanges.some(item => item.file === file && item.snapshotVerified && item.matchesCurrent));
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const entry = read("src/runtime-preview.js"), port = read("src/host/action-state-read-port.js"), page = read("src/features/workspace-layout-page.js");
const sourceContracts = {
  oneExistingRouter: (entry.match(/createCommandRouter\(/g) ?? []).length === 1,
  noNewPlatformPlugin: (entry.match(/platform\.register\(/g) ?? []).length === 1 && entry.includes("platform.register(builtin)"),
  actualPermissionsAndContext: entry.includes("commands: layoutDefinition.permissions.commands")
    && entry.includes("context: { componentId: layoutDefinition.id, owner: layoutDefinition.owner }")
    && entry.includes("sources: [layout, composition.read]"),
  readPortIsDataOnly: port.includes("Object.freeze({ snapshot, subscribe(listener)")
    && !/\.execute\(|\.register\(|\.setKeys\(|document\.|new Map\(/.test(port),
  existingRegistryAndShortcutDirectory: port.includes("router.describe(id)")
    && port.includes("router.shortcuts.keysFor(id, shortcutContext)") && port.includes("router.subscribe(publish)"),
  isolatedSynchronousStateRead: port.includes('typeof enabled !== "boolean"')
    && port.includes('reason: "command.state-error"') && port.includes("Promise.resolve(value).catch"),
  pageWritesUseRestrictedContext: (page.match(/ctx\.execute\(/g) ?? []).length === 1
    && page.includes("panel?.available ? executeAction(command, payload)") && page.includes("actionState(actions?.snapshot(), command)"),
  subscriptionsHaveOwnerCleanup: page.includes("ctx.onDispose?.(() => scope.dispose())")
    && port.includes("rollback(scope, error)") && port.includes("scope.dispose()"),
  standaloneCompatibility: read("src/features/builtin-pages.js").includes("...(contents ? Object.values(S) : [])")
    && read("src/shell/action-presentation.js").includes("if (!snapshot) return;"),
};
const inspect = file => ({ file, before: baseline.sourceHashes[file] ?? null, after: current[file] ?? null });
const report = {
  generatedAt: new Date().toISOString(), baselineCapturedAt: baseline.capturedAt,
  baselineFiles: Object.keys(baseline.sourceHashes).length, currentFiles: Object.keys(current).length,
  existingFileEdits: edits.map(inspect), additions: additions.map(inspect),
  concurrentChangesOutsideBatch: changed.filter(file => !edits.includes(file) && !additions.includes(file)).map(inspect),
  originalFrameChanges: differences(baseline.originalHashes, original), abandonedWorkbenchChanges: differences(baseline.workbenchHashes, workbench),
  protectedChanges, confirmedConcurrentChanges, unaccountedProtectedChanges,
  concurrentArtifactsChangedSinceCapture: confirmedConcurrentChanges.filter(item => !item.matchesCurrent).map(item => item.file), sourceContracts,
  limitations: ["This step wires read-only action state and layout controls; menu activation/live refresh and restricted dialogs remain deferred.",
    "DOM doubles verify actual modules but do not prove browser pixels, native focus, pointer or IME.",
    "Existing file:// refusal remains; no protocol/browser workaround.",
    "State callback isolation is in the read port; the original router execution contract is unchanged.",
    "Old evidence retains its original scope; concurrent work is listed without reverting it."],
};
report.passed = edits.every(file => baseline.sourceHashes[file] !== undefined && current[file] !== undefined && baseline.sourceHashes[file] !== current[file])
  && additions.every(file => baseline.sourceHashes[file] === undefined && current[file] !== undefined)
  && report.originalFrameChanges.length === 0 && report.abandonedWorkbenchChanges.length === 0
  && unaccountedProtectedChanges.length === 0 && confirmedConcurrentChanges.length === expectedConcurrentPaths.length
  && confirmedConcurrentChanges.every(item => item.snapshotVerified) && Object.values(sourceContracts).every(Boolean);
fs.writeFileSync(path.join(evidence, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
assert.ok(report.passed, "Action state audit failed; inspect without reverting concurrent work");
console.log("PASS: action data uses existing permissions/router/shortcut directory; CSS/shell/session/platform/ctx/author protocol/handlers/original frame/workbench unchanged; "
  + report.concurrentChangesOutsideBatch.length + " concurrent changes preserved and listed; "
  + confirmedConcurrentChanges.length + " saved concurrent snapshots verified; "
  + report.concurrentArtifactsChangedSinceCapture.length + " non-protected concurrent artifacts continued updating after capture");
