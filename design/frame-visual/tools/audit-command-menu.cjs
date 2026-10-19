const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, ".."), workspace = path.resolve(root, "../..");
const prefix = "design/frame-visual/", evidence = path.join(root, "evidence/command-menu");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "before-source-hashes.json"), "utf8"));
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? entry.name === "evidence" ? [] : walk(file) : [file];
});
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const hashes = directory => Object.fromEntries(walk(directory).map(file => [path.relative(workspace, file).replaceAll("\\", "/"), hash(file)]));
const differences = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]);
const edits = baseline.declaredEditPaths.map(name => prefix + name);
const additions = ["command-menu-plan.md", "command-menu.md", "src/host/workspace-menus.js", "src/shell/command-menu-bar.js",
  "styles/command-menu.css", "tests/command-menu.test.js", "tools/audit-command-menu.cjs"].map(name => prefix + name);
const current = hashes(root), changed = differences(baseline.sourceHashes, current);
const original = hashes(path.join(workspace, "design/frame")), workbench = hashes(path.join(workspace, "apps/workbench"));
const protectedNames = ["src/workspace-geometry.js", "src/layout/workspace-state.js", "src/layout/sidebar-composition-state.js",
  "src/layout/layout-edit-session.js", "src/layout/state-transaction.js", "src/host/workspace-commands.js", "src/host/sidebar-commands.js",
  "src/host/sidebar-presentation.js", "src/host/sidebar-content-read-port.js", "src/host/action-state-read-port.js",
  "src/host/keyboard.js", "src/host/focus-boundary.js", "src/host/stage-viewport.js", "index.html", "package.json"];
const protectedChanges = changed.filter(file => (/\/styles\/|\/fixtures\/|\/src\/runtime\//.test(file)
  && file !== prefix + "styles/command-menu.css") || protectedNames.some(name => file === prefix + name));
// Keep the baseline intact; known concurrent visual work has separate, exact snapshots.
const concurrent = JSON.parse(fs.readFileSync(path.join(evidence, "concurrent-work.json"), "utf8"));
const expectedConcurrentPaths = ["src/fixtures/content-hosting-state.js", "src/fixtures/content-hosting-view.js", "src/fixtures/structure-preview.js",
  "styles/content-hosting.css", "content-hosting.md"].map(name => prefix + name);
const confirmedConcurrentChanges = concurrent.changes.map(item => ({ ...item,
  snapshotVerified: expectedConcurrentPaths.includes(item.file) && (baseline.sourceHashes[item.file] ?? null) === item.before
    && hash(path.join(evidence, "concurrent-source", item.file.slice(prefix.length))) === item.after,
  matchesCurrent: current[item.file] === item.after,
}));
const unaccountedProtectedChanges = protectedChanges.filter(file => !confirmedConcurrentChanges.some(item => item.file === file && item.snapshotVerified && item.matchesCurrent));
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const normalize = text => text.replaceAll("\r\n", "\n");
const oldShell = normalize(fs.readFileSync(path.join(evidence, "before-source/src/shell/visual-workbench.js"), "utf8"));
const shell = normalize(read("src/shell/visual-workbench.js"));
const oldMenuBlock = oldShell.match(/  const menus = [\s\S]*?(?=  for \(const \[label, side, glyph\])/)[0];
const withoutMenuWiring = shell
  .replace(/^import \{ WORKSPACE_MENU_DEFINITIONS \} from .*;\n/m, "")
  .replace(/^import \{ createCommandMenuBar \} from .*;\n/m, "")
  .replace("presentationHints = {}, menuBinding", "presentationHints = {}")
  .replace(/  const menuView = [\s\S]*?(?=  for \(const \[label, side, glyph\])/, oldMenuBlock)
  .replace(/^[ \t]*menuView\?\.dispose\(\);\n/m, "");
const entry = read("src/runtime-preview.js"), binding = read("src/host/workspace-menus.js"), view = read("src/shell/command-menu-bar.js");
const sourceContracts = {
  oneExistingRouter: (entry.match(/createCommandRouter\(/g) ?? []).length === 1,
  noNewPlatformPlugin: (entry.match(/platform\.register\(/g) ?? []).length === 1 && entry.includes("platform.register(builtin)"),
  shellOutsideMenuWiringIsIdentical: withoutMenuWiring === oldShell,
  executeUsesExistingCommandsAndMembership: (binding.match(/router\.execute\(/g) ?? []).length === 1
    && binding.includes("registered().includes(item)") && binding.includes("router.execute(item.command, item.payload)")
    && !/router\.register\(|new Map\(/.test(binding),
  actualGlobalMenuWhitelist: binding.includes("commands: registered().map(item => item.command)") && binding.includes("sources: [layout]"),
  regionStateUsesOwner: binding.includes("layout.snapshot()[key]") && binding.includes("payload: { id: layoutPageId, toggle: false }"),
  noParameterizedShortcutClaim: binding.includes("item.payload && Object.keys(item.payload).length ? Object.freeze([]) : command.keys"),
  presentationHasNoRouterOrStateWrites: !/\brouter\.(?:execute|register|describe|shortcuts)|createCommandRouter|\.toggleRegion\(|\.selectPage\(/.test(view),
  sharedStatePopoverAndCleanup: view.includes("applyActionPresentation(") && view.includes("openPopover(")
    && view.includes("resources.add(binding.actions.subscribe(syncOpened))") && view.includes("scope.add(binding.menus.subscribe(update))"),
  menuSemanticsAndKeyboardProtection: view.includes('role: "menubar"') && view.includes('role: "menu"')
    && view.includes('role: "presentation"') && view.includes("isReservedKey(event)") && view.includes("syncTabStops()"),
  onlyNewPopupStyle: read("styles/command-menu.css").split("\n").filter(line => line.trim().endsWith("{")).every(line => line.startsWith(".v-menu-popup")),
  newStyleLoadedByDefaultEntry: read("runtime-preview.html").includes('href="styles/command-menu.css"'),
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
  limitations: ["New view menu behavior and popup styles are implemented; restricted dialogs and other business menus remain deferred.",
    "DOM doubles verify actual modules and supplied geometry, not browser pixels/native focus/pointer/IME.",
    "Existing file:// refusal remains; no protocol/browser workaround used.",
    "Parameterized entries hide generic payload-less shortcut hints; no new default key assignments.",
    "Historical audits and evidence were not rerun or overwritten; concurrent changes are listed without reverting them."],
};
report.passed = edits.every(file => baseline.sourceHashes[file] !== undefined && current[file] !== undefined && baseline.sourceHashes[file] !== current[file])
  && additions.every(file => baseline.sourceHashes[file] === undefined && current[file] !== undefined)
  && report.originalFrameChanges.length === 0 && report.abandonedWorkbenchChanges.length === 0
  && unaccountedProtectedChanges.length === 0 && confirmedConcurrentChanges.length === expectedConcurrentPaths.length
  && expectedConcurrentPaths.every(file => confirmedConcurrentChanges.some(item => item.file === file && item.snapshotVerified))
  && Object.values(sourceContracts).every(Boolean);
fs.writeFileSync(path.join(evidence, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
assert.ok(report.passed, "Menu audit failed; inspect without reverting concurrent work");
console.log("PASS: view menus use existing registry/action state/router/handlers; shell outside menu wiring, geometry/session/platform/ctx/protocol/original frame/workbench unchanged; "
  + report.concurrentChangesOutsideBatch.length + " concurrent changes listed; "
  + confirmedConcurrentChanges.length + " saved concurrent snapshots verified; no unaccounted protected changes");
