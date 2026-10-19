const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, ".."), workspace = path.resolve(root, "../..");
const prefix = "design/frame-visual/", evidence = path.join(root, "evidence/layout-boundaries-correction");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "before-source-hashes.json"), "utf8"));
const extension = JSON.parse(fs.readFileSync(path.join(evidence, "scope-extension.json"), "utf8"));
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? (entry.name === "evidence" ? [] : walk(file)) : [file];
});
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const hashes = directory => Object.fromEntries(walk(directory).map(file => [path.relative(workspace, file).replaceAll("\\", "/"), hash(file)]));
const differences = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]);
const current = hashes(root), changed = differences(baseline.sourceHashes, current);
const edits = [...baseline.declaredEditPaths, ...extension.paths].map(name => prefix + name);
const additions = ["layout-boundaries-correction.md", "tools/audit-layout-boundaries.cjs"].map(name => prefix + name);
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const original = hashes(path.join(workspace, "design/frame")), workbench = hashes(path.join(workspace, "apps/workbench"));
const protectedChanges = changed.filter(file => /\/styles\/|\/fixtures\/(?:approved-score|score-provenance)/.test(file)
  || ["src/workspace-geometry.js", "src/runtime-preview.js", "src/runtime/command-router.js", "src/runtime/shortcut-router.js",
    "src/runtime/component-host.js", "src/runtime/component-registry.js", "src/runtime/plugin-installer.js",
    "src/runtime/plugin-facets.js", "src/runtime/ui-plugin-contract.js", "src/runtime/ui-contribution-catalog.js",
    "src/layout/sidebar-composition-state.js", "src/host/sidebar-commands.js", "src/host/keyboard.js", "src/host/stage-viewport.js"]
    .some(name => file === prefix + name));
const sourceContracts = {
  ordinaryCommandBindingsHaveNoEditPredicate: !read("src/host/workspace-commands.js").includes("edit.canConfigure"),
  workspaceHasNoEditGeometryBaseline: !read("src/layout/workspace-state.js").includes("let before") && !read("src/layout/workspace-state.js").includes("...restored"),
  shellRespectsActualTopOpen: read("src/shell/visual-workbench.js").includes("const topVisible = state.topOpen;"),
  shellGripsAreOrdinary: !read("src/shell/visual-workbench.js").includes("!layout.snapshot().adjusting")
    && read("src/shell/visual-workbench.js").includes("node.disabled = false"),
  layoutPageUsesOrdinaryCommands: read("src/features/workspace-layout-page.js").includes("region: side => ctx.execute(C.region, { region: side })")
    && read("src/features/workspace-layout-page.js").includes("resize: (side, value) => ctx.execute(C.resize, { side, value })"),
  layoutPageCanFinishWithTopClosed: read("src/features/workspace-layout-page.js").includes("finish: confirm => editLayout(C.finish, { confirm })")
    && read("src/shell/workspace-layout-visual.js").includes('id: "layout-confirm"') && read("src/shell/workspace-layout-visual.js").includes('id: "layout-cancel"'),
  componentPolicyRetained: read("src/host/sidebar-commands.js").includes("enabled: editSession.canConfigure")
    && read("src/layout/layout-edit-session.js").includes('fail("edit-required")'),
  fixtureRespectsActualTopOpen: read("src/fixtures/structure-preview.js").includes("function topVisible() { return state.topOpen; }"),
  genericLowerSidebarNames: ["src/shell/visual-workbench.js", "src/shell/layout-visual-state.js", "src/fixtures/structure-preview.js"]
    .every(name => !/正文内容|声部内容|声部与音轨|声部面板|底部内容/.test(read(name))),
};
const inspect = file => ({ file, before: baseline.sourceHashes[file] ?? null, after: current[file] ?? null });
const report = {
  generatedAt: new Date().toISOString(), baselineCapturedAt: baseline.capturedAt,
  baselineFiles: Object.keys(baseline.sourceHashes).length, currentFiles: Object.keys(current).length,
  existingFileEdits: edits.map(inspect), additions: additions.map(inspect),
  concurrentChangesOutsideBatch: changed.filter(file => !edits.includes(file) && !additions.includes(file)).map(inspect),
  originalFrameChanges: differences(baseline.originalHashes, original), abandonedWorkbenchChanges: differences(baseline.workbenchHashes, workbench),
  protectedChanges, sourceContracts,
  limitations: ["Source assertions prove scope, not browser pixels.", "DOM doubles do not prove native focus, pointer capture or IME.",
    "Existing file:// refusal remains; no protocol/browser workaround.", "Old audit evidence retains its previous scope and policy."],
};
report.passed = edits.every(file => current[file] !== undefined && baseline.sourceHashes[file] !== undefined)
  && additions.every(file => current[file] !== undefined && baseline.sourceHashes[file] === undefined)
  && report.originalFrameChanges.length === 0 && report.abandonedWorkbenchChanges.length === 0
  && protectedChanges.length === 0 && Object.values(sourceContracts).every(Boolean);
fs.writeFileSync(path.join(evidence, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
assert.ok(report.passed, "Sidebar boundary audit failed; inspect without reverting concurrent work");
console.log("PASS: ordinary sidebar controls, component-only editing, generic names; CSS/geometry/router/ctx/platform/original frame/workbench unchanged; "
  + report.concurrentChangesOutsideBatch.length + " concurrent changes listed");
