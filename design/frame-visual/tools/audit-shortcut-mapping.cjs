const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const workspace = path.resolve(root, "../..");
const prefix = "design/frame-visual/";
const evidence = path.join(root, "evidence/shortcut-mapping");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "before-source-hashes.json"), "utf8"));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? (entry.name === "evidence" ? [] : walk(file)) : [file];
});
const relative = file => path.relative(workspace, file).replaceAll("\\", "/");
const hashes = directory => Object.fromEntries(walk(directory).map(file => [relative(file), hash(file)]));
const differences = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])]
  .filter(file => before[file] !== after[file]);
const current = hashes(root);
const edits = baseline.declaredEditPaths.map(name => prefix + name);
const additions = ["src/runtime/shortcut-keys.js", "src/runtime/shortcut-router.js", "tests/shortcut-mapping.test.js",
  "shortcut-mapping-plan.md", "shortcut-mapping.md", "tools/audit-shortcut-mapping.cjs"].map(name => prefix + name);
const changes = differences(baseline.sourceHashes, current);
const inspect = file => ({ file, before: baseline.sourceHashes[file] ?? null, after: current[file] ?? null });
const source = name => fs.readFileSync(path.join(root, name), "utf8").replaceAll("\r\n", "\n");
const before = name => fs.readFileSync(path.join(evidence, "before-source", name), "utf8").replaceAll("\r\n", "\n");
const count = (text, pattern) => (text.match(pattern) ?? []).length;
const original = hashes(path.join(workspace, "design/frame"));
const workbench = hashes(path.join(workspace, "apps/workbench"));
const provenance = JSON.parse(fs.readFileSync(path.join(root, "copy-provenance.json"), "utf8"));
const provenanceChanges = Object.entries(provenance.sourceHashes)
  .filter(([name, expected]) => original["design/frame/" + name] !== expected).map(([name]) => name);

// Hash protected surfaces against this batch's fresh baseline. External changes are recorded,
// never reverted here, and any protected change requires review before a clean audit result.
const protectedPath = file => /\/(?:styles|fixtures|src\/(?:fixtures|features|layout))\/|\.html$/.test(file)
  || ["src/shell/visual-workbench.js", "src/shell/shell.js", "src/host/sidebar-presentation.js",
    "src/host/sidebar-commands.js", "src/host/workspace-commands.js", "src/runtime/plugin-facets.js",
    "src/runtime/component-registry.js", "src/runtime/ui-contribution-catalog.js"].some(name => file === prefix + name);
const protectedChanges = changes.filter(protectedPath);
const ownsVisualFile = [...edits, ...additions].some(protectedPath);
const contextBody = text => text.slice(text.indexOf("  function contextFor("), text.indexOf("  function ensure("));
const permissionsUnchanged = contextBody(source("src/runtime/component-host.js")) === contextBody(before("src/runtime/component-host.js"));
const hintChangesOnly = source("src/shell/menubar.js") === before("src/shell/menubar.js")
  .replace("command?.keys?.[0]", "router.shortcuts.keysFor(item.command)[0]")
  && source("src/shell/frame-panels.js") === before("src/shell/frame-panels.js")
    .replace("const command = router.describe(`frame.dock.${side}`);", "const shortcut = router.shortcuts.keysFor(`frame.dock.${side}`)[0];")
    .replace("command?.keys?.[0]?.replace", "shortcut?.replace");

const entryReports = ["src/runtime-preview.js", "src/main.js"].map(file => {
  const entry = source(file), oldEntry = before(file);
  const registrations = text => text.match(/platform\.register\([^\n]*/g) ?? [];
  return { file, commandRouterInstances: count(entry, /\bcreateCommandRouter\s*\(/g),
    shortcutRouterInstances: count(entry, /\bcreateShortcutRouter\s*\(/g),
    keyboardBindings: count(entry, /\bbindKeyboard\s*\(/g), sharesInstance: entry.includes("createCommandRouter({ shortcuts })"),
    disposalWired: entry.includes("disposeKeyboard();"),
    platformRegistrationStatementsUnchanged: JSON.stringify(registrations(entry)) === JSON.stringify(registrations(oldEntry)) };
});
const command = source("src/runtime/command-router.js");
const mapping = source("src/runtime/shortcut-router.js");
const keyboard = source("src/host/keyboard.js");
const sourceFiles = [...edits, ...additions].filter(file => /\.(js|cjs)$/.test(file));
const forbiddenImports = sourceFiles.filter(file => /\b(?:from|import)\s*["'][^"']*(?:apps[\\/]workbench|brilliant-kernel|core-kernel)/
  .test(fs.readFileSync(path.join(workspace, file), "utf8")));
const integration = {
  entries: entryReports,
  keyboardDocumentListeners: count(keyboard, /addEventListener\("keydown"/g),
  standaloneShellWindowListeners: count(source("src/shell/visual-workbench.js"), /window\.addEventListener\("keydown"/g),
  commandMaps: [...command.matchAll(/const (\w+) = new Map\(/g)].map(match => match[1]),
  commandForDelegates: command.includes("commandFor: combo => shortcuts.resolve(combo)?.command ?? null"),
  keyboardUsesSharedMap: count(keyboard, /router\.shortcuts\.resolve\(/g) === 2,
  mappingHasNoPlatformRegistration: !/\b(?:createPluginPlatform|platform\.register|facets|contractVersion)\b/.test(mapping),
  hintChangesOnly, permissionsUnchanged,
};
const report = {
  generatedAt: new Date().toISOString(), baselineCapturedAt: baseline.capturedAt,
  baselineFiles: Object.keys(baseline.sourceHashes).length,
  existingFileEditsByThisBatch: edits.map(inspect), additionsByThisBatch: additions.map(inspect),
  concurrentChangesOutsideBatchScope: changes.filter(file => !edits.includes(file) && !additions.includes(file)).map(inspect),
  originalFrame: { files: Object.keys(original).length, changesSinceFreshBaseline: differences(baseline.originalHashes, original), provenanceChanges },
  abandonedWorkbench: { capturedFiles: Object.keys(baseline.workbenchHashes).length, changesSinceFreshBaseline: differences(baseline.workbenchHashes, workbench) },
  visualProtection: { protectedChanges, ownsVisualFile, forbiddenImports }, integration,
  limitations: [
    "Hashes record content, not editor identity; ownership is the declared scope of this batch.",
    "Static wiring checks complement actual module/entry tests, not a real browser or pixel review.",
    "The existing file:// access refusal remains; no alternative protocol or browser workaround was attempted.",
    "Default preview adds no shortcut gestures; the original Escape fallback remains outside the mapping API.",
    "User overrides are in memory; settings UI, persistence, multi-key sequences and kernel editing are not implemented.",
    "Menus and layout hints use current global keys when reconstructed, without live updates of open popovers.",
  ],
};
report.passed = edits.every(file => baseline.sourceHashes[file] !== undefined && current[file] !== undefined)
  && additions.every(file => baseline.sourceHashes[file] === undefined && current[file] !== undefined)
  && report.originalFrame.changesSinceFreshBaseline.length === 0 && provenanceChanges.length === 0
  && report.abandonedWorkbench.changesSinceFreshBaseline.length === 0 && protectedChanges.length === 0
  && !ownsVisualFile && forbiddenImports.length === 0 && hintChangesOnly && permissionsUnchanged
  && entryReports.every(entry => entry.commandRouterInstances === 1 && entry.shortcutRouterInstances === 1
    && entry.keyboardBindings === 1 && entry.sharesInstance && entry.disposalWired && entry.platformRegistrationStatementsUnchanged)
  && integration.keyboardDocumentListeners === 1 && integration.standaloneShellWindowListeners === 0
  && JSON.stringify(integration.commandMaps) === JSON.stringify(["commands"])
  && integration.commandForDelegates && integration.keyboardUsesSharedMap && integration.mappingHasNoPlatformRegistration;
fs.writeFileSync(path.join(evidence, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
assert.ok(report.passed, "Shortcut mapping audit failed; inspect fresh report without reverting concurrent work");
console.log(`PASS: ${edits.length} declared edits, ${additions.length} additions; shared mapping and unchanged permissions/visual surfaces; ${report.concurrentChangesOutsideBatchScope.length} external changes; original frame and workbench unchanged`);
