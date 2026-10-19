const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const workspace = path.resolve(root, "../..");
const prefix = "design/frame-visual/";
const evidence = path.join(root, "evidence/style-boundaries");
const baseline = JSON.parse(fs.readFileSync(path.join(evidence, "before-source-hashes.json"), "utf8"));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? (entry.name === "evidence" ? [] : walk(file)) : [file];
});
const hashes = directory => Object.fromEntries(walk(directory).map(file => [path.relative(workspace, file).replaceAll("\\", "/"), hash(file)]));
const differences = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]);
const current = hashes(root);
const edits = baseline.declaredEditPaths.map(name => prefix + name);
const additions = ["src/runtime/style-boundary.js", "tests/style-boundaries.test.js", "style-boundaries-plan.md",
  "style-boundaries.md", "tools/audit-style-boundaries.cjs"].map(name => prefix + name);
const changed = differences(baseline.sourceHashes, current);
const inspect = file => ({ file, before: baseline.sourceHashes[file] ?? null, after: current[file] ?? null });
const read = name => fs.readFileSync(path.join(root, name), "utf8").replaceAll("\r\n", "\n");
const before = name => fs.readFileSync(path.join(evidence, "before-source", name), "utf8").replaceAll("\r\n", "\n");
// Known flat stylesheets only. This compares contracts; it is not a CSS/cascade engine.
const rules = text => [...text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@import[^;]+;/g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({ selector: selector.trim(), body: body.replace(/\s+/g, " ").trim() }));
const properties = text => Object.fromEntries([...text.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([,key,value]) => [key,value]));
const original = hashes(path.join(workspace, "design/frame"));
const workbench = hashes(path.join(workspace, "apps/workbench"));
const provenance = JSON.parse(read("copy-provenance.json"));
const provenanceChanges = Object.entries(provenance.sourceHashes).filter(([name, expected]) => original["design/frame/" + name] !== expected).map(([name]) => name);
const protectedChanges = changed.filter(file => /\/src\/(?:features|fixtures|layout)\/|\/fixtures\//.test(file)
  || ["src/workspace-geometry.js", "src/shell/visual-workbench.js", "src/runtime-preview.js", "src/main.js",
    "src/host/sidebar-presentation.js", "src/host/sidebar-commands.js", "src/host/workspace-commands.js", "src/host/keyboard.js",
    "src/runtime/command-router.js", "src/runtime/shortcut-router.js", "src/runtime/plugin-installer.js",
    "src/runtime/plugin-facets.js", "src/runtime/ui-plugin-contract.js"].some(name => file === prefix + name));
const cssReports = ["styles/base.css", "styles/scrollbars.css", "styles/structure-preview.css"].map(file => ({ file,
  declarationValuesUnchanged: JSON.stringify(rules(read(file)).map(rule => rule.body)) === JSON.stringify(rules(before(file)).map(rule => rule.body)),
}));
const tokenBefore = properties(before("styles/tokens.css")), tokenAfter = properties(read("styles/tokens.css"));
const themeAliases = Object.keys(tokenAfter).filter(key => !Object.hasOwn(tokenBefore, key));
const sourceOnlyMarking = {
  builder: read("src/shell/dom.js").replace('import { markFrameUi } from "../runtime/style-boundary.js";\n\n', "")
    .replace("markFrameUi(document.createElement(tag))", "document.createElement(tag)") === before("src/shell/dom.js"),
  componentHost: read("src/runtime/component-host.js").replace('import { markFrameUi } from "./style-boundary.js";\n', "")
    .replace('markFrameUi(document.createElement("section"))', 'document.createElement("section")')
    .replace('markFrameUi(document.createElement("p"))', 'document.createElement("p")') === before("src/runtime/component-host.js"),
  icons: read("src/shell/icons.js").replace('<svg data-frame-ui=""', "<svg") === before("src/shell/icons.js"),
  staticDocument: read("sidebar-review.html").replace("<body data-frame-document>", "<body>") === before("sidebar-review.html"),
  visualSelectorsOnlyMarked: read("styles/structure-preview.css").replaceAll(":where([data-frame-ui])", "") === before("styles/structure-preview.css"),
};
const precedingEvidence = path.join(root, "evidence/shortcut-mapping");
const precedingBaseline = JSON.parse(fs.readFileSync(path.join(precedingEvidence, "before-source-hashes.json"), "utf8"));
const precedingAudit = JSON.parse(fs.readFileSync(path.join(precedingEvidence, "source-audit.json"), "utf8"));
const previousSnapshot = { ...precedingBaseline.sourceHashes,
  ...Object.fromEntries([...precedingAudit.existingFileEditsByThisBatch, ...precedingAudit.additionsByThisBatch].map(item => [item.file, item.after])) };
const report = {
  generatedAt: new Date().toISOString(), baselineCapturedAt: baseline.capturedAt,
  baselineFiles: Object.keys(baseline.sourceHashes).length,
  existingFileEditsByThisBatch: edits.map(inspect), additionsByThisBatch: additions.map(inspect),
  changesAlreadyPresentInFreshBaselineSincePriorBatch: differences(previousSnapshot, baseline.sourceHashes),
  concurrentChangesAfterFreshBaselineOutsideBatch: changed.filter(file => !edits.includes(file) && !additions.includes(file)).map(inspect),
  originalFrame: { files: Object.keys(original).length, changesSinceFreshBaseline: differences(baseline.originalHashes, original), provenanceChanges },
  abandonedWorkbench: { files: Object.keys(workbench).length, changesSinceFreshBaseline: differences(baseline.workbenchHashes, workbench) },
  protection: { protectedChanges, sourceOnlyMarking },
  styles: { cssReports, themeAliases, originalTokenValuesUnchanged: Object.entries(tokenBefore).every(([key,value]) => tokenAfter[key] === value) },
  limitations: [
    "Hash differences track content, not editor identity. Concurrent work is recorded without reverting it.",
    "Per-node ownership and author CSS namespaces are conventions, not a third-party CSS/DOM security sandbox.",
    "Static declaration and DOM checks do not execute cascade, layout, native focus or system IME.",
    "The existing file:// refusal remains; no protocol or alternate browser workaround was attempted.",
    "No new layout policy, dimension API, popup host capability or platform plugin is implemented by this batch.",
  ],
};
report.passed = edits.every(file => baseline.sourceHashes[file] !== undefined && current[file] !== undefined)
  && additions.every(file => baseline.sourceHashes[file] === undefined && current[file] !== undefined)
  && report.originalFrame.changesSinceFreshBaseline.length === 0 && provenanceChanges.length === 0
  && report.abandonedWorkbench.changesSinceFreshBaseline.length === 0 && protectedChanges.length === 0
  && Object.values(sourceOnlyMarking).every(Boolean) && cssReports.every(item => item.declarationValuesUnchanged)
  && report.styles.originalTokenValuesUnchanged && themeAliases.length === 8 && themeAliases.every(key => key.startsWith("--ui-"));
fs.writeFileSync(path.join(evidence, "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
assert.ok(report.passed, "Style boundary audit failed; inspect report without reverting concurrent work");
console.log(`PASS: ${edits.length} declared edits, ${additions.length} additions; unchanged CSS values/tokens and runtime geometry; ${report.concurrentChangesAfterFreshBaselineOutsideBatch.length} external changes after baseline; original frame and workbench unchanged`);
