const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const repo = path.resolve(root, "../..");
const evidence = path.join(root, "evidence/runtime-composition");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "baseline.json"), "utf8"));
const concurrent = JSON.parse(fs.readFileSync(path.join(evidence, "concurrent-changes.json"), "utf8"));
const digest = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
function hashes(base, excluded = []) {
  const result = {};
  function visit(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (excluded.includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) result[path.relative(base, file).replaceAll("\\", "/")] = digest(file);
    }
  }
  visit(base); return result;
}
const differences = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])]
  .filter(file => before[file] !== after[file]).sort();
const current = hashes(root, ["evidence"]);
const changed = differences(baseline.baseline, current);
const inspect = file => ({ file, before: baseline.baseline[file] ?? null, after: current[file] ?? null });
const existingEdits = baseline.owned.filter(file => baseline.baseline[file]);
const additions = baseline.owned.filter(file => !baseline.baseline[file]);
const confirmedConcurrentChanges = concurrent.map(item => ({ ...inspect(item.file),
  baselineHashVerified: item.baselineHash === baseline.baseline[item.file],
  snapshotVerified: digest(path.join(evidence, "concurrent-source", item.file)) === item.snapshotHash,
  matchesCurrent: current[item.file] === item.snapshotHash,
  beforeSourceVerified: item.beforeRecoveredFromPreviousEvidence
    ? digest(path.join(evidence, "concurrent-before", item.file)) === baseline.baseline[item.file] : null,
}));
const unaccountedChanges = changed.filter(file => !baseline.owned.includes(file) && !concurrent.some(item => item.file === file));
const originalFrameChanges = differences(baseline.protected["design/frame"], hashes(path.join(repo, "design/frame"), ["node_modules", "dist", ".git"]));
const abandonedWorkbenchChanges = differences(baseline.protected["apps/workbench"], hashes(path.join(repo, "apps/workbench"), ["node_modules", "dist", ".git"]));

const entry = read("src/runtime-preview.js"), factory = read("src/host/workspace-runtime.js"), shell = read("src/shell/visual-workbench.js");
const assertionLines = source => source.split(/\r?\n/).filter(line => line.includes("assert.")).map(line => line.trim());
const testNames = source => source.split(/\r?\n/).filter(line => line.trim().startsWith("test(")).map(line => line.trim());
const historyTests = existingEdits.filter(file => file.startsWith("tests/"));
const unchanged = file => baseline.baseline[file] === current[file];
const sourceContracts = {
  thinPreview: entry.split(/\r?\n/).filter(line => line.trim()).length === 2 && entry.includes("createWorkspaceRuntime({ root:"),
  explicitFactory: factory.includes("export function createWorkspaceRuntime") && factory.includes("activeRoots.has(root)"),
  originalSingleRouters: (factory.match(/createCommandRouter\(/g) ?? []).length === 1 && (factory.match(/createShortcutRouter\(/g) ?? []).length === 1
    && unchanged("src/runtime/command-router.js") && unchanged("src/runtime/shortcut-router.js"),
  unchangedOwnerContracts: ["src/runtime/component-host.js", "src/runtime/plugin-installer.js", "src/runtime/ui-plugin-contract.js",
    "src/host/workspace-commands.js", "src/host/sidebar-commands.js", "src/host/keyboard.js", "src/host/command-dialogs.js",
    "src/features/builtin-pages.js", "src/features/workspace-layout-page.js", "src/layout/layout-edit-session.js",
    "src/layout/sidebar-composition-state.js", "src/host/sidebar-presentation.js"].every(unchanged),
  startupChecksActualInstallResults: factory.includes("platform.start().filter(record => !record.active)") && factory.includes("rollback(lifetime, error)"),
  observedBeforeOwnersRelease: factory.indexOf("lifetime.add(() => resources.dispose())") < factory.indexOf("lifetime.add(() => bindings.dispose())")
    && factory.includes("bindings.add(() => dialogs.dispose())"),
  windowListenersOwned: factory.includes('window.removeEventListener("resize", resize)') && factory.includes('window.removeEventListener("pagehide", pagehide)')
    && factory.includes("if (!event.persisted) lifetime.dispose()"),
  shellConstructionRollback: shell.includes("buildWorkbench(options, scope)") && shell.includes("rollback(scope, error)")
    && shell.includes("scope.add(() => shell.remove())"),
  deadApplicationPortGuarded: factory.includes('code: "runtime.disposed"') && factory.includes("if (active && !disposed) listener(state)"),
  visualStylesAndGeometryPreserved: Object.keys(baseline.baseline).filter(file => file.startsWith("styles/")
    || ["runtime-preview.html", "src/workspace-geometry.js", "src/layout/workspace-state.js", "fixtures/approved-score.svg"].includes(file)).every(unchanged),
  legacyAssertionsPreserved: historyTests.length === 5 && historyTests.every(file => {
    const before = fs.readFileSync(path.join(evidence, "before-source", file), "utf8");
    return JSON.stringify(assertionLines(before)) === JSON.stringify(assertionLines(read(file)))
      && JSON.stringify(testNames(before)) === JSON.stringify(testNames(read(file)));
  }),
  otherExistingTestsPreserved: Object.keys(baseline.baseline).filter(file => file.startsWith("tests/")
    && !historyTests.includes(file) && !concurrent.some(item => item.file === file)).every(unchanged),
  existingOriginalsPreserved: existingEdits.every(file => digest(path.join(evidence, "before-source", file)) === baseline.baseline[file]),
  originalLineEndingsPreserved: existingEdits.every(file =>
    fs.readFileSync(path.join(evidence, "before-source", file), "utf8").includes("\r\n") === read(file).includes("\r\n")),
};
const report = {
  generatedAt: new Date().toISOString(), baselineFiles: Object.keys(baseline.baseline).length, currentFiles: Object.keys(current).length,
  existingFileEdits: existingEdits.map(inspect), additions: additions.map(inspect),
  confirmedConcurrentChanges, unaccountedChanges, originalFrameChanges, abandonedWorkbenchChanges, sourceContracts,
  limitations: ["DOM comparison uses the saved original entry and Shell; no browser pixel/native focus/IME verification.",
    "Factory only consumes sidebar panels; view/slotItem authorship is not complete runtime hosting.",
    "Fixed startup set and current browser document only; no hot installation, persistence, formal SDK or kernel edit flow.",
    "Concurrent horizontal-slot edits are snapshotted and preserved; historic evidence is not overwritten."],
};
report.passed = existingEdits.every(file => current[file] && current[file] !== baseline.baseline[file])
  && additions.every(file => current[file] && !baseline.baseline[file])
  && confirmedConcurrentChanges.every(item => item.baselineHashVerified && item.beforeSourceVerified !== false && item.snapshotVerified && item.matchesCurrent)
  && unaccountedChanges.length === 0 && originalFrameChanges.length === 0 && abandonedWorkbenchChanges.length === 0
  && Object.values(sourceContracts).every(Boolean);
fs.writeFileSync(path.join(evidence, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
assert.ok(report.passed, "Runtime composition audit failed; inspect source-audit.json without reverting concurrent work");
console.log(`PASS: ${existingEdits.length} owned edits, ${additions.length} additions, ${confirmedConcurrentChanges.length} preserved concurrent files; original frame/workbench unchanged`);
