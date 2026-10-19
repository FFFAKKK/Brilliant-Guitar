const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, ".."), workspace = path.resolve(root, "../..");
const prefix = "design/frame-visual/", evidence = path.join(root, "evidence/command-dialog");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "before-source-hashes.json"), "utf8"));
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? entry.name === "evidence" ? [] : walk(file) : [file];
});
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const hashes = directory => Object.fromEntries(walk(directory).map(file => [path.relative(workspace, file).replaceAll("\\", "/"), hash(file)]));
const differences = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]);
const edits = baseline.declaredEditPaths.map(name => prefix + name);
const additions = ["command-dialog-plan.md", "command-dialog.md", "src/host/command-dialogs.js", "src/shell/command-dialog.js",
  "styles/command-dialog.css", "tests/command-dialog.test.js", "tools/audit-command-dialog.cjs"].map(name => prefix + name);
const current = hashes(root), changed = differences(baseline.sourceHashes, current);
const original = hashes(path.join(workspace, "design/frame")), workbench = hashes(path.join(workspace, "apps/workbench"));
const concurrent = JSON.parse(fs.readFileSync(path.join(evidence, "concurrent-work.json"), "utf8"));
const expectedConcurrentPaths = ["horizontal-slots-review.html", "horizontal-slots.md", "src/fixtures/horizontal-slots-state.js",
  "src/fixtures/horizontal-slots-view.js", "src/fixtures/structure-preview.js", "structure-preview.html",
  "styles/horizontal-slots.css", "tests/horizontal-slots-visual.test.js"].map(name => prefix + name);
const confirmedConcurrentChanges = concurrent.changes.map(item => ({ ...item,
  snapshotVerified: expectedConcurrentPaths.includes(item.file) && (baseline.sourceHashes[item.file] ?? null) === item.before
    && hash(path.join(evidence, "concurrent-source", item.file.slice(prefix.length))) === item.after,
  matchesCurrent: current[item.file] === item.after,
}));
const unaccountedChanges = changed.filter(file => !edits.includes(file) && !additions.includes(file)
  && !confirmedConcurrentChanges.some(item => item.file === file && item.snapshotVerified && item.matchesCurrent));
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const normalize = text => text.replaceAll("\r\n", "\n");
const oldHost = normalize(fs.readFileSync(path.join(evidence, "before-source/src/runtime/component-host.js"), "utf8"));
const host = normalize(read("src/runtime/component-host.js"));
const withoutOptionalDialogs = host
  .replace("notices, dialogs", "notices")
  .replace("    const context = {", "    return {")
  .replace(/    if \(dialogs\) \{[\s\S]*?    return context;\n/, "")
  .replace(/^[ \t]*if \(!visible\) record\.dialogs\?\.hide\(\);\n/m, "");
const entry = read("src/runtime-preview.js"), port = read("src/host/command-dialogs.js"), view = read("src/shell/command-dialog.js");
const sourceContracts = {
  oneExistingRouterAndPlatformPlugin: (entry.match(/createCommandRouter\(/g) ?? []).length === 1
    && (entry.match(/platform\.register\(/g) ?? []).length === 1 && entry.includes("platform.register(builtin)"),
  optionalComponentContextOutsideWiringIdentical: withoutOptionalDialogs === oldHost,
  permissionsAndSameExecute: host.includes("execute: context.execute") && port.includes("definition.permissions?.commands")
    && port.includes("!allowed.has(request.command)") && port.includes("execute(request.command, request.payload)")
    && !/router\.(?:execute|register)\(/.test(port),
  stateUsesExistingOwnerReadPort: port.includes("createActionStateReadPort({ router, commands: [...allowed]")
    && port.includes("componentId: definition.id, owner: definition.owner") && port.includes("const latest = state()"),
  requestIsCopiedData: port.includes('captureConfig(raw, "dialog")') && port.includes("requestKeys.includes(key)")
    && port.includes("isData(payload)") && port.includes("Number.isFinite(value)"),
  viewHasNoRouterOrRawRenderer: !/router\.(?:execute|register)|createCommandRouter|\.innerHTML\s*=|request\.mount/.test(view),
  nativeModalWithoutFakeFallback: view.includes("dialog.showModal()") && view.includes('error.code = "dialog.unsupported"')
    && view.includes('"aria-modal": "true"') && view.includes("closePopover({ restoreFocus: false })"),
  stateKeyboardAndSingleExecution: view.includes("pending = true; sync()") && view.includes("closed || pending")
    && view.includes("const plain = isPlainKey(event); event.preventDefault()") && view.includes("keys: []"),
  ownerLifecycleAndAsyncIsolation: host.includes("port.dispose({ restoreFocus: !disposed })") && host.includes("record.dialogs?.hide()")
    && port.includes("current?.owner === owner") && view.includes("if (closed) return") && view.includes("Promise.resolve(result).then"),
  nativeTabNoManualFocusTrap: !/key === "Tab"|key === 'Tab'|focusin|\.inert\s*=/.test(view),
  defaultWiringDisposesBeforeShell: entry.includes("notices, dialogs") && entry.includes("sources: [layout, composition.read]")
    && entry.indexOf("dialogs.dispose()") < entry.indexOf("shell.dispose()"),
  onlyFeedbackStyle: read("styles/command-dialog.css").split("\n").filter(line => line.trim().endsWith("}")).every(line => line.startsWith(".v-command-dialog")),
  newStyleLoaded: read("runtime-preview.html").includes('href="styles/command-dialog.css"'),
  allExistingTestsUnchanged: Object.keys(baseline.sourceHashes).filter(file => file.startsWith(prefix + "tests/"))
    .every(file => current[file] === baseline.sourceHashes[file]),
};
const inspect = file => ({ file, before: baseline.sourceHashes[file] ?? null, after: current[file] ?? null });
const report = {
  generatedAt: new Date().toISOString(), baselineCapturedAt: baseline.capturedAt,
  baselineFiles: Object.keys(baseline.sourceHashes).length, currentFiles: Object.keys(current).length,
  existingFileEdits: edits.map(inspect), additions: additions.map(inspect),
  concurrentChangesOutsideBatch: changed.filter(file => !edits.includes(file) && !additions.includes(file)).map(inspect),
  confirmedConcurrentChanges, unaccountedChanges, sourceContracts,
  originalFrameChanges: differences(baseline.originalHashes, original), abandonedWorkbenchChanges: differences(baseline.workbenchHashes, workbench),
  limitations: ["Native dialog methods are explicitly doubled in tests; real modality, background inertness, Tab/focus and IME are unverified.",
    "No default product button or forced confirmation was added; the actual runtime installs the optional component capability.",
    "Concurrent horizontal-slot work and its full-suite results are recorded separately without editing/reverting those files.",
    "Historical evidence and the initial baseline are preserved; existing file:// refusal was not bypassed.",
    "Finished/dispatched is a UI request outcome, not a domain rollback/cancellation or successful-handler guarantee."],
};
report.passed = edits.every(file => baseline.sourceHashes[file] !== undefined && current[file] !== undefined && baseline.sourceHashes[file] !== current[file])
  && additions.every(file => baseline.sourceHashes[file] === undefined && current[file] !== undefined)
  && report.originalFrameChanges.length === 0 && report.abandonedWorkbenchChanges.length === 0
  && unaccountedChanges.length === 0 && confirmedConcurrentChanges.length === expectedConcurrentPaths.length
  && expectedConcurrentPaths.every(file => confirmedConcurrentChanges.some(item => item.file === file && item.snapshotVerified && item.matchesCurrent))
  && Object.values(sourceContracts).every(Boolean);
fs.writeFileSync(path.join(evidence, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
assert.ok(report.passed, "Dialog audit failed; inspect without reverting concurrent work");
console.log("PASS: optional owner-scoped confirmation uses original ctx/router/state; component host outside wiring and all existing tests unchanged; "
  + confirmedConcurrentChanges.length + " concurrent visual artifacts verified separately; no unaccounted changes");
