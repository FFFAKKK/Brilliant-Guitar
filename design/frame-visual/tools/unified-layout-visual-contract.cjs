const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

const base = path.resolve(__dirname, "..");
const evidence = path.join(base, "evidence/revision-08");
const report = JSON.parse(fs.readFileSync(path.join(evidence, "browser-review.json"), "utf8"));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 0.6, `${label}: ${a} / ${b}`);
const apart = (a, b) => !b.visible || a.x + a.width <= b.x + 0.6 || b.x + b.width <= a.x + 0.6 || a.y + a.height <= b.y + 0.6 || b.y + b.height <= a.y + 0.6;
const samePaper = (a, b) => { for (const key of ["x", "y", "width", "height"]) close(a.metrics.paper[key], b.metrics.paper[key], b.label + ": paper " + key); };
const flow = label => { const record = report.flows.find(item => item.label === label); assert.ok(record, label); return record; };
const layoutFields = ["arrangement", "topOpen", "leftOpen", "rightOpen", "voiceOpen", "leftWidth", "rightWidth", "topHeight", "voiceHeight", "presentation", "enabled", "widths", "iconOrder", "hiddenIcons", "preset", "custom"];
const sameLayout = (a, b) => { for (const key of layoutFields) assert.deepEqual(a.state[key], b.state[key], b.label + ": " + key); };

assert.equal(report.matrix.length, 8);
assert.equal(report.states.length, 24);
assert.equal(report.responsive.length, 24);
assert.equal(report.originalScenes.length, 96);
assert.equal(report.runtime.length, 5);
for (const r of [...report.matrix, ...report.states, ...report.responsive, ...report.flows, ...report.originalScenes]) {
  assert.equal(r.transparentCards, true, r.label + ": transparent ordinary edges");
  assert.equal(r.hiddenScrollbars, true, r.label + ": hidden scrollbars");
  assert.equal(r.independentEditors, 0, r.label + ": independent editor removed");
  assert.equal(r.state.editing, r.state.assembly, r.label + ": one mode");
  assert.ok(apart(r.metrics.stage, r.metrics.left) && apart(r.metrics.stage, r.metrics.right), r.label + ": no overlap");
  close(r.metrics.paper.x + r.metrics.paper.width / 2, r.viewport.width / 2, r.label + ": centered");
  assert.ok(r.metrics.stage.width >= 480 && r.metrics.stage.height >= 300, r.label + ": stage capacity");
  if (!r.state.assembly) {
    assert.equal(r.draggable, 0, r.label + ": no ordinary drag");
    assert.deepEqual(r.selected, [], r.label + ": no ordinary layout selection");
    assert.ok(r.grips.every(item => item.disabled), r.label + ": geometry locked");
  }
  const ids = r.inputValues.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, r.label + ": no duplicated inputs");
}

const normal = flow("normal-grid");
for (const label of ["normal-synthetic-guard", "library-navigates-only", "cancel-all"]) sameLayout(normal, flow(label));
assert.ok(flow("normal-library").library.every(item => item.disabled));
assert.equal(flow("library-navigates-only").state.assembly, false);
assert.equal(flow("edit-width-B").state.widths.B, "full");
assert.deepEqual(flow("edit-width-B").selected, ["B"]);
assert.equal(flow("edit-move-B").state.enabled[0], "B");
assert.equal(flow("edit-sizes").state.leftWidth, 280);
assert.equal(flow("edit-sizes").state.topHeight, 64);
assert.equal(flow("edit-sizes").state.rightWidth, 256);
assert.deepEqual(flow("edit-library").state.hiddenIcons, ["B"]);
assert.equal(flow("edit-library").state.iconOrder[0], "B");
assert.ok(!flow("edit-library").state.enabled.includes("E"));
assert.equal(flow("cancel-all").state.contentInputs.B, "本次输入应保留");
const confirmed = flow("confirm-all");
assert.equal(confirmed.state.presentation, "mixed");
assert.equal(confirmed.state.widths.B, "full");
assert.deepEqual(confirmed.state.hiddenIcons, ["A"]);
assert.ok(!confirmed.state.enabled.includes("E"));
assert.equal(confirmed.state.contentInputs.B, "本次输入应保留");
assert.equal(flow("escape-closes-layer").state.assembly, true);
sameLayout(confirmed, flow("escape-cancel-all"));
assert.deepEqual(flow("drag-after").state.enabled, ["B", "A", "C", "D", "E"]);
sameLayout(flow("drag-normal"), flow("drag-canceled"));
for (const r of report.flows.slice(0, 13)) samePaper(normal, r);
for (const label of ["drag-before", "drag-after", "drag-canceled"]) samePaper(flow("drag-normal"), flow(label));
for (const label of ["right-layout-navigation", "right-grid-selection", "right-edit-library-constraints", "right-canceled-content"]) samePaper(flow("right-mixed-normal"), flow(label));
assert.equal(flow("right-canceled-content").state.widths.B, undefined);
assert.equal(flow("right-canceled-content").state.contentInputs.A, "右侧页签保留输入");
assert.equal(flow("right-edit-library-constraints").library.find(item => item.id === "library-enable-D").disabled, true);
const reading = flow("tabs-reading-A");
assert.ok(reading.reviewScroll > 0);
for (const label of ["tabs-reading-A-restored", "tabs-reading-after-cancel"]) {
  close(reading.reviewScroll, flow(label).reviewScroll, label + ": reading retained");
  assert.equal(flow(label).state.contentInputs.A, "阅读位置与输入保留");
}
for (const r of report.flows.filter(item => item.label.startsWith("resize-after") || item.label === "resize-back-1280")) {
  for (const key of ["y", "width", "height"]) close(flow("resize-before-1440").metrics.paper[key], r.metrics.paper[key], r.label + ": retained " + key);
}
for (const r of report.flows.filter(item => item.label.startsWith("toggle-"))) samePaper(flow("resize-back-1280"), r);
const mixed = report.matrix.find(item => item.label === "left-mixed");
assert.deepEqual(mixed.sections.map(item => item.presentation), ["tabs", "grid", "list"]);
const owned = mixed.sections.flatMap(item => item.ids);
assert.equal(new Set(owned).size, owned.length);

const runtime = label => report.runtime.find(item => item.label === label);
for (const r of report.runtime) {
  for (const key of ["x", "y", "width", "height"]) close(runtime("normal").paper[key], r.paper[key], r.label + ": runtime paper " + key);
  assert.equal(r.independentEditors, 0);
  assert.equal(r.hiddenScrollbars, true);
  assert.ok(r.grips.every(item => item.disabled === !r.mode));
}
assert.deepEqual(runtime("normal").grips, runtime("normal-synthetic-guard").grips);
assert.deepEqual(runtime("normal").grips, runtime("canceled").grips);
assert.equal(runtime("confirmed").grips.find(item => item.id === "grip-left").value, "280");

const provenance = JSON.parse(fs.readFileSync(path.join(base, "copy-provenance.json"), "utf8"));
const original = path.resolve(base, "../..", provenance.source);
for (const [relative, expected] of Object.entries(provenance.sourceHashes)) assert.equal(hash(path.join(original, relative)), expected, relative + ": original unchanged");
const score = JSON.parse(fs.readFileSync(path.join(base, "fixtures/score-provenance.json"), "utf8"));
assert.equal(hash(score.source), score.sourceSHA256);
assert.equal(hash(path.join(base, "fixtures/approved-score.svg")), score.assetSHA256);
assert.equal(hash("E:/desktop/吉他打谱软件 · 界面框架方案（结构与布局）.md"), "cecc4ddb996fcd11252eec0621616249c209959ed092354109fc86af36705adf");
const sources = ["src/fixtures/structure-preview.js", "src/fixtures/sidebar-visuals.js", "src/fixtures/layout-edit-state.js", "src/fixtures/preview-scenarios.js", "src/features/workspace-layout-page.js", "src/shell/visual-workbench.js", "styles/sidebar-visuals.css", "styles/structure-preview.css", "structure-preview.html", "sidebar-review.html", "README.md", "tests/sidebar-visuals.test.js", "tests/layout-edit-state.test.js", "tests/sidebar-integration.test.js", "tools/unified-layout-visual-contract.cjs"];
const sourceHashes = Object.fromEntries(sources.map(relative => [relative, hash(path.join(base, relative))]));
const accepted = path.join(evidence, "source-hashes.json");
if (fs.existsSync(accepted)) assert.deepEqual(sourceHashes, JSON.parse(fs.readFileSync(accepted, "utf8")), "Source drift since revision-08 capture");
else fs.writeFileSync(accepted, JSON.stringify(sourceHashes, null, 2) + "\n");
for (const file of sources.filter(file => file.startsWith("src/fixtures/") && file.endsWith(".js"))) assert.ok(!/from\s*["'][^"']*(?:\/runtime\/|\/layout\/|apps[\\/]workbench)|\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(/.test(fs.readFileSync(path.join(base, file), "utf8")), file + ": pure visual boundary");
const outcome = { passed: true, matrix: report.matrix.length, states: report.states.length, responsive: report.responsive.length, originalScenes: report.originalScenes.length, flows: report.flows.length, runtime: report.runtime.length, baselineFiles: Object.keys(provenance.sourceHashes).length, sources: sources.length };
fs.writeFileSync(path.join(evidence, "verification.json"), JSON.stringify(outcome, null, 2) + "\n");
console.log(JSON.stringify(outcome, null, 2));
