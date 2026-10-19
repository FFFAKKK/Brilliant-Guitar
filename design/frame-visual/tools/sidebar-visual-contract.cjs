const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

const base = path.resolve(__dirname, "..");
const evidence = path.join(base, "evidence/revision-07");
const report = JSON.parse(fs.readFileSync(path.join(evidence, "browser-review.json"), "utf8"));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const close = (a, b, note) => assert.ok(Math.abs(a - b) < 0.6, note + ` (${a}, ${b})`);
const noIntersection = (a, b) => !b.visible || a.x + a.width <= b.x + 0.6 || b.x + b.width <= a.x + 0.6 || a.y + a.height <= b.y + 0.6 || b.y + b.height <= a.y + 0.6;

assert.equal(report.matrix.length, 6);
assert.equal(report.states.length, 18);
assert.equal(report.responsive.length, 18);
assert.equal(report.originalScenes.length, 96);
for (const record of [...report.matrix, ...report.states, ...report.responsive, ...report.flows]) {
  assert.ok(record.transparentCards, record.label + ": ordinary content edges");
  assert.ok(record.hiddenScrollbars, record.label + ": scrollbars");
  assert.ok(noIntersection(record.stage, record.left) && noIntersection(record.stage, record.right), record.label + ": sidebar/stage overlap");
  close(record.paper.x + record.paper.width / 2, record.viewport.width / 2, record.label + ": page center");
}
for (const record of report.originalScenes) {
  const m = record.metrics;
  assert.ok(record.scrollbars, record.scene + ": scrollbars");
  assert.ok(m.stage.width >= 480 && m.stage.height >= 300, record.scene + ": stage minimum");
  assert.ok(noIntersection(m.stage, m.left) && noIntersection(m.stage, m.right), record.scene + ": regions overlap");
  close(m.paper.x + m.paper.width / 2, 640, record.scene + ": initial center");
}
const flow = label => {
  const record = report.flows.find(entry => entry.label === label);
  assert.ok(record, "Missing flow: " + label);
  return record;
};
const samePaper = (first, second) => {
  for (const key of ["x", "y", "width", "height"]) close(first.paper[key], second.paper[key], second.label + ": retained " + key);
};
const baseline = flow("empty");
for (const record of report.flows.slice(0, 25)) samePaper(baseline, record);
assert.deepEqual(flow("join-B").enabled, ["B"]);
assert.deepEqual(flow("hide-B-icon").enabled, ["B"]);
assert.ok(!flow("hide-B-icon").rail.includes("rail-B"));
assert.ok(flow("restore-and-sort-B").rail.includes("rail-B"));
assert.equal(flow("restore-and-sort-B").iconOrder[0], "B");
assert.equal(flow("library-close-focus").focus, "library-trigger");
assert.deepEqual(flow("edit-select-B").selectedCards, ["B"]);
assert.equal(flow("edit-width-B").widths.B, "full");
assert.deepEqual(flow("keyboard-move-B").enabled, ["A", "B", "C"]);
assert.equal(flow("editing-finished").editing, false);
assert.deepEqual(flow("editing-finished").selectedCards, []);
assert.equal(flow("editing-finished").focus, "editing-trigger");
assert.equal(flow("editing-finished").inputs.B, "保留的示例名称");
assert.deepEqual(flow("drag-after").enabled, ["B", "A", "C", "D", "E"]);
assert.equal(flow("tabs-A-restored").inputValues[0].value, "页签中的保留输入");
assert.ok(flow("tabs-A-scrolled").reviewScroll > 0);
close(flow("tabs-A-scrolled").reviewScroll, flow("tabs-A-restored").reviewScroll, "tab reading position");
assert.ok(!flow("tabs-hidden-active-icon").rail.includes("rail-A"));
assert.equal(flow("tabs-next-with-hidden-icon").active, "B");
assert.equal(flow("tabs-previous-with-hidden-icon").active, "A");
assert.equal(flow("return-to-right-content").inputs.A, "页签中的保留输入");
assert.equal(flow("list-collapsed-after-management").expanded.A, false);
const beforeResize = flow("resize-before-1440");
for (const label of ["resize-after-1024", "resize-after-1280"]) {
  const record = flow(label);
  close(beforeResize.paper.y, record.paper.y, "resize keeps Y");
  close(beforeResize.paper.width, record.paper.width, "resize keeps width");
  close(beforeResize.paper.height, record.paper.height, "resize keeps height");
}
for (const record of report.flows.filter(entry => entry.label.startsWith("toggle-"))) samePaper(flow("resize-after-1280"), record);
for (const key of ["leftOnlyDisabled", "unavailableDisabled", "firstOrderDisabled", "lastOrderDisabled"]) assert.equal(report.libraryChecks[key], true);
assert.equal(report.libraryChecks.layoutInLibrary, false);
assert.ok(report.libraryChecks.reasonText.includes("仅允许左侧栏") && report.libraryChecks.reasonText.includes("暂不可用"));

const provenance = JSON.parse(fs.readFileSync(path.join(base, "copy-provenance.json"), "utf8"));
const project = path.resolve(base, "../..");
const original = path.resolve(project, provenance.source);
for (const [relative, expected] of Object.entries(provenance.sourceHashes)) assert.equal(hash(path.join(original, relative)), expected, "Original baseline changed: " + relative);
const score = JSON.parse(fs.readFileSync(path.join(base, "fixtures/score-provenance.json"), "utf8"));
assert.equal(hash(score.source), score.sourceSHA256);
assert.equal(hash(path.join(base, "fixtures/approved-score.svg")), score.assetSHA256);
assert.equal(hash("E:/desktop/吉他打谱软件 · 界面框架方案（结构与布局）.md"), "cecc4ddb996fcd11252eec0621616249c209959ed092354109fc86af36705adf");
const sourceFiles = ["src/fixtures/structure-preview.js", "src/fixtures/sidebar-visuals.js", "styles/sidebar-visuals.css", "styles/structure-preview.css", "structure-preview.html", "sidebar-review.html", "tests/sidebar-visuals.test.js"];
const sourceHashes = Object.fromEntries(sourceFiles.map(relative => [relative, hash(path.join(base, relative))]));
const accepted = path.join(evidence, "source-hashes.json");
if (fs.existsSync(accepted)) assert.deepEqual(sourceHashes, JSON.parse(fs.readFileSync(accepted, "utf8")), "Visual source drift after capture");
else fs.writeFileSync(accepted, JSON.stringify(sourceHashes, null, 2) + "\n");
for (const relative of sourceFiles.filter(file => file.endsWith(".js"))) {
  const source = fs.readFileSync(path.join(base, relative), "utf8");
  assert.ok(!/from\s*["'][^"']*(?:\/runtime\/|\/layout\/|apps[\\/]workbench)|\blocalStorage\b|\bsessionStorage\b|\bfetch\s*\(/.test(source), "Visual-only boundary: " + relative);
}
console.log(JSON.stringify({ passed: true, presentations: 6, states: 18, responsive: 18, flows: report.flows.length, originalScenes: 96, originalBaselineFiles: Object.keys(provenance.sourceHashes).length, sourceFiles: sourceFiles.length }, null, 2));
