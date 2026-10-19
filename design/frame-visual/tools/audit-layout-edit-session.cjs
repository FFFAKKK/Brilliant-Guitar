const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, ".."), workspace = path.resolve(root, "../..");
const prefix = "design/frame-visual/", evidence = path.join(root, "evidence/layout-edit-session");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "before-source-hashes.json"), "utf8"));
const concurrent = JSON.parse(fs.readFileSync(path.join(evidence, "concurrent-source-hashes.json"), "utf8"));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? (entry.name === "evidence" ? [] : walk(file)) : [file];
});
const hashes = directory => Object.fromEntries(walk(directory).map(file => [path.relative(workspace, file).replaceAll("\\", "/"), hash(file)]));
const differences = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]);
const current = hashes(root), changed = differences(baseline.sourceHashes, current);
const edits = baseline.declaredEditPaths.map(name => prefix + name);
const additions = ["layout-edit-session-plan.md", "layout-edit-session.md", "src/layout/state-transaction.js",
  "src/layout/layout-edit-session.js", "tests/layout-edit-session.test.js", "tools/audit-layout-edit-session.cjs"].map(name => prefix + name);
const inspect = file => ({ file, before: baseline.sourceHashes[file] ?? null, after: current[file] ?? null });
const read = name => fs.readFileSync(path.join(root, name), "utf8").replaceAll("\r\n", "\n");
const before = name => fs.readFileSync(path.join(evidence, "before-source", name), "utf8").replaceAll("\r\n", "\n");
const original = hashes(path.join(workspace, "design/frame")), workbench = hashes(path.join(workspace, "apps/workbench"));
const provenance = JSON.parse(read("copy-provenance.json"));
const provenanceChanges = Object.entries(provenance.sourceHashes).filter(([name, expected]) => original["design/frame/" + name] !== expected).map(([name]) => name);
const protectedChanges = changed.filter(file => /\/styles\/|\/fixtures\//.test(file)
  || ["src/workspace-geometry.js", "src/main.js", "src/host/stage-viewport.js", "src/host/sidebar-presentation.js",
    "src/host/keyboard.js", "src/host/focus-boundary.js", "src/runtime/command-router.js", "src/runtime/shortcut-router.js",
    "src/runtime/component-host.js", "src/runtime/component-registry.js", "src/runtime/plugin-installer.js",
    "src/runtime/plugin-facets.js", "src/runtime/ui-plugin-contract.js", "src/runtime/ui-contribution-catalog.js"].some(name => file === prefix + name));
// These exact reversals audit source scope only; runtime behavior has separate tests.
const narrowPresentationEdits = {
  shellOnlyDerivesEditChrome: read("src/shell/visual-workbench.js")
    .replace("    const topVisible = state.adjusting || state.topOpen;\n", "")
    .replace("(topVisible ? state.topHeight : 0)", "(state.topOpen ? state.topHeight : 0)")
    .replace("top.hidden = !topVisible", "top.hidden = !state.topOpen") === before("src/shell/visual-workbench.js"),
  builtinOnlyChangesConfigurationPermission: read("src/features/builtin-pages.js").replace("C.configureRegion", "C.region") === before("src/features/builtin-pages.js"),
};
const page = read("src/features/workspace-layout-page.js");
const concurrentIntegration = {
  layoutPageMatchesReviewedConcurrentAdapter: current[prefix + "src/features/workspace-layout-page.js"] === concurrent.sourceHashes[prefix + "src/features/workspace-layout-page.js"],
  pageRetainsExplicitConfigurationCommand: page.includes("editLayout(C.configureRegion, { region: side, open: !layout.snapshot()[LAYOUT_REGIONS.find(entry => entry.side === side).key] })"),
  pageConsumesReadPortAndPermittedContext: page.includes("layout.subscribe(update)") && page.includes("ctx.execute(command, payload)")
    && !/\b(?:store|composition|router|editSession)\./.test(page),
  reviewedVisualSourcesPreserved: Object.entries(concurrent.sourceHashes).every(([file, expected]) => current[file] === expected),
};
const entry = read("src/runtime-preview.js");
const sharedArchitecture = {
  singleEditSessionInEntry: (entry.match(/createLayoutEditSession\(\{/g) ?? []).length === 1,
  singleCommandRouterInEntry: (entry.match(/createCommandRouter\(\{/g) ?? []).length === 1,
  singleShortcutRouterInEntry: (entry.match(/createShortcutRouter\(\)/g) ?? []).length === 1,
  singleKeyboardEntry: (entry.match(/bindKeyboard\(router/g) ?? []).length === 1,
  singleBuiltinPackage: (entry.match(/platform\.register\(builtin\)/g) ?? []).length === 1,
  workspaceSharesEditSession: entry.includes("bindWorkspaceCommands({ router, store, editSession,"),
  sidebarSharesEditSession: entry.includes("bindSidebarCommands({ router, editSession })"),
  existingSubscriptionsRetained: entry.includes("const unsubscribe = layout.subscribe(") && entry.includes("const unsubscribeComposition = composition.read.subscribe("),
  cleanupAfterSubscriptionsBeforePlatform: entry.indexOf("editSession.dispose();") > entry.indexOf("unsubscribeComposition();")
    && entry.indexOf("editSession.dispose();") < entry.indexOf("platform.dispose();"),
  unchangedGeometryDefaults: read("src/layout/workspace-state.js").match(/const DEFAULT_GEOMETRY = Object\.freeze\(\{[\s\S]*?\}\);/)[0]
    === before("src/layout/workspace-state.js").match(/const DEFAULT_GEOMETRY = Object\.freeze\(\{[\s\S]*?\}\);/)[0],
  existingCommandIdsRetained: read("src/host/workspace-commands.js").match(/export const WORKSPACE_COMMANDS = Object\.freeze\(\{[\s\S]*?\}\);/)[0]
    .replace('  configureRegion: "frame.workspace.region.configure",\n', "")
    === before("src/host/workspace-commands.js").match(/export const WORKSPACE_COMMANDS = Object\.freeze\(\{[\s\S]*?\}\);/)[0],
};
const report = {
  generatedAt: new Date().toISOString(), baselineCapturedAt: baseline.capturedAt,
  baselineFiles: Object.keys(baseline.sourceHashes).length, currentFiles: Object.keys(current).length,
  existingFileEditsByThisBatch: edits.filter(file => file !== prefix + "src/features/workspace-layout-page.js").map(inspect),
  overlappingFileChanges: [{ ...inspect(prefix + "src/features/workspace-layout-page.js"), note: "Configuration command edit plus concurrent visual-component migration; retained and separately reviewed." }],
  declaredEditPaths: edits, additionsByThisBatch: additions.map(inspect),
  concurrentChangesAfterFreshBaselineOutsideBatch: changed.filter(file => !edits.includes(file) && !additions.includes(file)).map(inspect),
  originalFrame: { files: Object.keys(original).length, changesSinceFreshBaseline: differences(baseline.originalHashes, original), provenanceChanges },
  abandonedWorkbench: { files: Object.keys(workbench).length, changesSinceFreshBaseline: differences(baseline.workbenchHashes, workbench) },
  protection: { protectedChanges,
    concurrentProtectedChanges: protectedChanges.filter(file => concurrent.sourceHashes[file] === current[file]),
    unreviewedProtectedChanges: protectedChanges.filter(file => concurrent.sourceHashes[file] !== current[file]),
    narrowPresentationEdits, concurrentIntegration, sharedArchitecture },
  concurrentSnapshotCapturedAt: concurrent.capturedAt,
  intentionalBehaviorChanges: [
    "Configuration commands require the existing adjusting mode; ordinary fold/navigation/zoom remain available.",
    "Geometry and sidebar placements share confirmation/cancellation; failure restores original snapshots.",
    "Edit chrome derives from adjusting || topOpen; actual top visibility survives confirmation.",
    "Workspace observer exceptions are isolated and reentrant snapshots are queued.",
    "Sidebar command binders now require a shared internal editSession; author/v1 manifests and ctx stay unchanged.",
  ],
  limitations: [
    "Hashes audit content, not editor identity; concurrent work is listed without reverting it.",
    "Static source reversals and DOM doubles do not establish browser cascade, layout, pixels, native focus or IME.",
    "The existing file:// refusal remains; no protocol or alternate browser workaround was attempted.",
    "Owner batches are synchronous and internal, not asynchronous document transactions or a second command bus.",
    "Two existing subscriptions can each render the same final restored state; this audit does not claim a single render.",
    "Real content-management UI, sidebar styles, persistence and kernel editing remain planned.",
  ],
};
report.passed = edits.every(file => baseline.sourceHashes[file] !== undefined && current[file] !== undefined && baseline.sourceHashes[file] !== current[file])
  && additions.every(file => baseline.sourceHashes[file] === undefined && current[file] !== undefined)
  && report.originalFrame.changesSinceFreshBaseline.length === 0 && provenanceChanges.length === 0
  && report.abandonedWorkbench.changesSinceFreshBaseline.length === 0 && report.protection.unreviewedProtectedChanges.length === 0
  && Object.values(narrowPresentationEdits).every(Boolean) && Object.values(sharedArchitecture).every(Boolean)
  && Object.values(concurrentIntegration).every(Boolean);
fs.writeFileSync(path.join(evidence, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
assert.ok(report.passed, "Layout edit session audit failed; inspect report without reverting concurrent work");
console.log("PASS: " + edits.length + " declared edits (1 overlapping visual migration), " + additions.length + " additions; "
  + report.concurrentChangesAfterFreshBaselineOutsideBatch.length + " external changes recorded, "
  + report.protection.concurrentProtectedChanges.length + " concurrent CSS/fixture changes preserved; geometry constants/ctx/platform and original frame/workbench unchanged");
