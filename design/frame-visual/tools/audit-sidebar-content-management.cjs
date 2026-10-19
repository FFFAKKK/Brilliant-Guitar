const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, ".."), workspace = path.resolve(root, "../..");
const prefix = "design/frame-visual/", evidence = path.join(root, "evidence/sidebar-content-management");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "before-source-hashes.json"), "utf8"));
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? entry.name === "evidence" ? [] : walk(file) : [file];
});
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const hashes = directory => Object.fromEntries(walk(directory).map(file => [path.relative(workspace, file).replaceAll("\\", "/"), hash(file)]));
const differences = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]);
const edits = baseline.declaredEditPaths.map(name => prefix + name);
const additions = ["sidebar-content-management-plan.md", "sidebar-content-management.md",
  "src/host/sidebar-content-read-port.js", "src/shell/sidebar-content-settings.js",
  "tests/sidebar-content-management.test.js", "tools/audit-sidebar-content-management.cjs"].map(name => prefix + name);
const current = hashes(root), changed = differences(baseline.sourceHashes, current);
const original = hashes(path.join(workspace, "design/frame")), workbench = hashes(path.join(workspace, "apps/workbench"));
const protectedChanges = changed.filter(file => /\/styles\/|\/fixtures\/|\/src\/runtime\//.test(file)
  || ["src/shell/visual-workbench.js", "src/workspace-geometry.js", "src/layout/workspace-state.js",
    "src/layout/sidebar-composition-state.js", "src/layout/state-transaction.js", "src/host/workspace-commands.js",
    "src/host/sidebar-commands.js", "src/host/sidebar-presentation.js", "src/host/keyboard.js", "src/host/focus-boundary.js",
    "src/host/stage-viewport.js", "runtime-preview.html", "index.html"]
    .some(name => file === prefix + name));
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const sourceContracts = {
  oneExistingRouter: (read("src/runtime-preview.js").match(/createCommandRouter\(/g) ?? []).length === 1,
  onlyExistingSidebarCommands: !read("src/shell/sidebar-content-settings.js").includes("router.register")
    && ["S.enabled", "S.move", "S.reorder"].every(name => read("src/shell/sidebar-content-settings.js").includes(name)),
  readPortIsDataOnly: read("src/host/sidebar-content-read-port.js").includes("Object.freeze({ snapshot, subscribe(listener)")
    && !/\.setEnabled\(|\.move\(|\.reorder\(|document\./.test(read("src/host/sidebar-content-read-port.js")),
  fixedEntryUsesSameSessionPolicy: read("src/layout/layout-edit-session.js").includes('fail("reserved-panel")')
    && read("src/runtime-preview.js").includes("reservedPanelIds = Object.freeze([LAYOUT_PAGE_ID])"),
  existingBaselineOwnsDifferences: read("src/layout/layout-edit-session.js").includes("baseline.snapshot.panels.map")
    && read("src/runtime-preview.js").includes("changes: editSession.changes"),
  pageWritesUseRestrictedContext: read("src/features/workspace-layout-page.js").includes("panel?.available ? ctx.execute(command, payload)")
    && read("src/features/workspace-layout-page.js").includes("ctx.onDispose?.(() => scope.dispose())"),
  standaloneCompatibility: read("src/features/builtin-pages.js").includes("...(contents ? Object.values(S) : [])"),
};
const inspect = file => ({ file, before: baseline.sourceHashes[file] ?? null, after: current[file] ?? null });
const report = {
  generatedAt: new Date().toISOString(), baselineCapturedAt: baseline.capturedAt,
  baselineFiles: Object.keys(baseline.sourceHashes).length, currentFiles: Object.keys(current).length,
  existingFileEdits: edits.map(inspect), additions: additions.map(inspect),
  concurrentChangesOutsideBatch: changed.filter(file => !edits.includes(file) && !additions.includes(file)).map(inspect),
  originalFrameChanges: differences(baseline.originalHashes, original), abandonedWorkbenchChanges: differences(baseline.workbenchHashes, workbench),
  protectedChanges, sourceContracts,
  limitations: ["DOM doubles verify actual modules but do not prove browser pixels, native focus, pointer or IME.",
    "Existing file:// refusal remains; no protocol/browser workaround.", "Hot install/uninstall, upper/lower content and persistence are deferred.",
    "Old evidence retains its original scope; concurrent work is listed without reverting it."],
};
report.passed = edits.every(file => baseline.sourceHashes[file] !== undefined && current[file] !== undefined)
  && additions.every(file => baseline.sourceHashes[file] === undefined && current[file] !== undefined)
  && report.originalFrameChanges.length === 0 && report.abandonedWorkbenchChanges.length === 0
  && protectedChanges.length === 0 && Object.values(sourceContracts).every(Boolean);
fs.writeFileSync(path.join(evidence, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
assert.ok(report.passed, "Content management audit failed; inspect without reverting concurrent work");
console.log("PASS: real content management uses existing permissions/router/session; CSS/shell/geometry/platform/ctx/author slots/original frame/workbench unchanged; "
  + report.concurrentChangesOutsideBatch.length + " concurrent changes listed");
