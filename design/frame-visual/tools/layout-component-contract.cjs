const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

const base = path.resolve(__dirname, "..");
const evidence = path.join(base, "evidence/revision-10");
const read = file => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const reportPath = path.join(evidence, "browser-review.json");
const report = read(reportPath);
assert.equal(report.rule, "workspace-always-available-content-transaction", "current user-approved rule");
const observedSources = read(path.join(evidence, "current-source-before.json"));
assert.deepEqual(read(path.join(evidence, "current-source-after.json")), observedSources, "sources stable across browser and Node verification");
for (const [relative, expected] of Object.entries(observedSources)) assert.equal(hash(path.join(base, relative)), expected, relative + ": observation matches current source");
const near = (a, b, label, tolerance = 0.6) => assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} / ${b}`);
const apart = (a, b) => !a.visible || !b.visible || a.right <= b.x + 0.6 || b.right <= a.x + 0.6 || a.bottom <= b.y + 0.6 || b.bottom <= a.y + 0.6;
const samePaper = (a, b, keys = ["x", "y", "width", "height"]) => {
  for (const key of keys) near(a.metrics.paper[key], b.metrics.paper[key], b.label + ": paper " + key, 0.02);
};
const find = (group, label) => {
  const row = report[group].find(item => item.label === label);
  assert.ok(row, group + ": " + label); return row;
};
const dimension = (row, side) => row.layout.dimensions.find(item => item.id === "layout-size-" + side);
const region = (row, side) => row.layout.regions.find(item => item.id === "layout-" + side);

for (const [group, count] of Object.entries({ flows: 16, states: 25, responsive: 10, runtime: 11, originalScenes: 96, scroll: 6 })) {
  assert.equal(report[group].length, count, group + ": complete records");
  assert.equal(new Set(report[group].map(row => row.label)).size, count, group + ": unique records");
}
const rows = ["flows", "states", "responsive", "runtime", "originalScenes", "scroll"].flatMap(group => report[group]);
for (const row of rows) {
  const m = row.metrics;
  assert.equal(row.hiddenScrollbars, true, row.label + ": hidden scrollbars");
  assert.equal(row.paperWhite, true, row.label + ": approved white paper");
  assert.ok(row.rootOverflow < 0.6, row.label + ": no root overflow");
  near(m.shell.width, row.viewport.width, row.label + ": actual shell width");
  near(m.shell.height, row.viewport.height, row.label + ": actual shell height");
  near(m.paper.x + m.paper.width / 2, row.viewport.width / 2, row.label + ": centered paper", 0.02);
  assert.ok(m.stage.width > 0 && m.stage.height > 0, row.label + ": positive stage");
  for (const key of ["top", "left", "right", "iconRail", "pageRail", "voice", "voiceTitle", "merge"]) {
    assert.ok(apart(m.stage, m[key]), row.label + ": stage separate from " + key);
  }
  for (const key of ["shell", "title", "start", "end", "top", "left", "right", "stage", "iconRail", "pageRail", "voice", "voiceTitle", "merge"]) {
    const rect = m[key];
    if (rect.visible) assert.ok(rect.x >= -0.6 && rect.y >= -0.6 && rect.right <= row.viewport.width + 0.6 && rect.bottom <= row.viewport.height + 0.6, row.label + ": " + key + " inside viewport");
  }
  for (const grip of row.grips) assert.ok(Number(grip.now) >= Number(grip.min) && Number(grip.now) <= Number(grip.max), row.label + ": grip within capacity");
  if (!row.layout) continue;
  assert.ok(row.layout.composerOverflow < 0.6, row.label + ": no component horizontal overflow");
  if (row.layout.regions.length) assert.deepEqual(row.layout.regions.map(item => item.label), ["上侧栏", "左侧栏", "右侧栏", "下侧栏"]);
  for (const entry of row.layout.regions) {
    assert.equal(entry.clipped, false, row.label + ": full region name");
    assert.equal(entry.disabled, false, row.label + ": workspace region always available");
  }
  for (const entry of row.layout.dimensions) {
    assert.equal(entry.disabled, false, row.label + ": workspace size always available");
    assert.ok(entry.help && entry.reason && entry.resetTitle, row.label + ": size range and reason");
    if (entry.value !== "" && entry.invalid !== "true") assert.ok(Number(entry.value) >= Number(entry.minimum) && Number(entry.value) <= Number(entry.maximum), row.label + ": legal displayed value");
  }
  for (const control of row.detail.controlsBorders) assert.equal(control.width, "0px", row.label + ": no decorative control border " + control.id);
  for (const control of row.detail.presentation) assert.equal(control.disabled, row.layout.editing !== "true", row.label + ": content presentation requires editing");
  if (row.actions) {
    assert.equal(row.actions.editVisible, row.layout.editing !== "true", row.label + ": sole edit entry visibility");
    for (const key of ["cancelVisible", "confirmVisible"]) assert.equal(row.actions[key], row.layout.editing === "true", row.label + ": " + key);
    for (const control of row.actions.arrangement) assert.equal(control.disabled, false, row.label + ": workspace arrangement always available");
  }
}

const normal = find("flows", "normal-1280");
for (const row of report.flows) { samePaper(normal, row); assert.equal(row.layout.changes, "0", row.label + ": workspace adjustment is not a content change"); }
assert.equal(find("flows", "entered-unmodified").layout.session, "编辑中 · 未修改");
assert.equal(find("flows", "editing-workspace-changed").layout.session, "编辑中 · 未修改");
assert.equal(dimension(find("flows", "ordinary-left-280"), "left").value, "280");
assert.equal(find("flows", "ordinary-left-280").layout.editing, "false");
assert.equal(dimension(find("flows", "ordinary-restored-left"), "left").value, "260");
assert.equal(dimension(find("flows", "ordinary-invalid-top-draft"), "top").invalid, "true");
assert.equal(dimension(find("flows", "ordinary-invalid-top-draft"), "top").value, "999");
assert.equal(dimension(find("flows", "ordinary-clamped-top"), "top").value, "160");
assert.equal(dimension(find("flows", "ordinary-empty-top-draft"), "top").value, "");
assert.equal(dimension(find("flows", "ordinary-empty-top-restored"), "top").value, "40");
for (const [group, label] of [["flows", "canceled-workspace-retained"], ["runtime", "runtime-canceled-workspace-retained"]]) {
  const row = find(group, label);
  assert.equal(row.layout.editing, "false");
  assert.equal(dimension(row, "left").value, "300");
  assert.equal(dimension(row, "top").value, "64");
  assert.equal(region(row, "top").pressed, "false");
  assert.equal(region(row, "voice").pressed, "true");
}
assert.equal(dimension(find("flows", "confirmed-workspace-retained"), "top").value, "80");
for (const side of ["left", "right"]) assert.equal(dimension(find("flows", "ordinary-compact"), side).value, "230");
assert.equal(find("flows", "ordinary-compact").layout.editing, "false");
assert.equal(dimension(find("responsive", "normal-922x720"), "right").help, "230 px · 暂无调整空间");
assert.match(dimension(find("responsive", "normal-922x720"), "left").resetTitle, /当前容量为 230 px/);

for (const row of report.responsive) {
  const match = row.label.match(/-(\d+)x(\d+)$/);
  assert.equal(row.viewport.width, Number(match[1])); assert.equal(row.viewport.height, Number(match[2]));
  samePaper(normal, row, ["y", "width", "height"]);
}
for (const row of report.scroll.filter(item => item.label.startsWith("tail-"))) {
  near(row.layout.scroll, row.layout.maximumScroll, row.label + ": capacity tail reached");
  near(row.layout.headerRect.y, row.layout.pageRect.y, row.label + ": sticky edit header");
  samePaper(find("responsive", row.label.replace("tail-", "editing-")), row);
}
const keyboardTail = find("scroll", "keyboard-tab-to-schemes-1440x900");
near(keyboardTail.layout.scroll, keyboardTail.layout.maximumScroll, "keyboard tail reached");
assert.equal(report.keyboard.length, 15);
assert.equal(report.keyboard.at(-1).id, "layout-schemes");

assert.deepEqual(find("states", "尚未选中").layout.selected, []);
for (const label of ["没有内容", "页签没有网格操作", "列表没有网格操作"]) {
  assert.equal(find("states", label).layout.target, undefined); assert.equal(find("states", label).layout.contentWidthDisabled, undefined);
  assert.ok(find("states", label).detail.emptyText);
}
assert.equal(find("states", "固定内容").detail.removeDisabled, true);
assert.equal(find("states", "固定内容").layout.contentWidthDisabled, true);
assert.match(find("states", "仅支持半行").detail.reason, /仅支持半行/);
assert.equal(find("states", "半行空间不足").layout.contentWidthDisabled, true);
assert.equal(find("states", "half-capacity-expanded").layout.contentWidthDisabled, false);
assert.equal(find("states", "half-capacity-expanded").detail.reasonHidden, true);
assert.match(find("states", "half-capacity-applied").layout.editorText, /示例 B半行/);
assert.match(find("states", "half-capacity-narrowed").detail.reason, /106 px.*128 px/);
assert.equal(dimension(find("states", "half-capacity-canceled-workspace-retained"), "left").value, "320");
const card = (label, id) => find("states", label).actions.cards.find(item => item.id === id);
assert.match(card("half-capacity-applied", "B").className, /\bhalf\b/);
assert.match(card("half-capacity-canceled-workspace-retained", "B").className, /\bfull\b/);
assert.match(card("content-width-confirmed", "B").className, /\bhalf\b/);
assert.equal(find("states", "half-capacity-expanded").layout.changes, "0");
assert.equal(find("states", "half-capacity-applied").layout.changes, "1");
assert.equal(find("states", "right-library-editing").layout.library.find(item => item.id === "library-enable-D").disabled, true);
assert.ok(find("states", "right-library-locked").layout.library.every(item => item.disabled));
for (const label of ["左侧分区混用", "right-mixed-layout"]) assert.match(find("states", label).layout.editorText, /网格区/);
for (const label of ["scheme-saved-draft", "scheme-renamed-draft", "scheme-delete-modal", "scheme-modal-escaped", "scheme-edit-escaped-workspace-retained"]) {
  const row = find("states", label);
  assert.equal(row.layout.inputValues.find(item => item.id === "content-input-A").value, "普通输入保留");
  samePaper(find("states", "content-normal-input"), row);
}
assert.equal(find("states", "scheme-renamed-draft").detail.scheme, "改名试验 · 自定义");
assert.equal(find("states", "scheme-modal-escaped").layout.editing, "true");
assert.equal(find("states", "scheme-edit-escaped-workspace-retained").layout.editing, "false");
assert.equal(find("states", "scheme-edit-escaped-workspace-retained").detail.scheme, "写谱 · 内置");
assert.equal(find("states", "scheme-edit-escaped-workspace-retained").detail.presentation.find(item => item.id === "layout-grid").pressed, "true");
assert.equal(dimension(find("states", "scheme-edit-escaped-workspace-retained"), "top").value, "64");
assert.equal(find("states", "content-list-draft").layout.changes, "1");
assert.equal(find("states", "scheme-renamed-draft").layout.changes, "2");

const runtimeNormal = find("runtime", "runtime-normal-1280");
for (const row of report.runtime) { samePaper(runtimeNormal, row); assert.equal(row.layout.changes, "0"); }
assert.equal(find("runtime", "runtime-entered-unmodified").layout.session, "编辑中 · 未修改");
assert.equal(dimension(find("runtime", "runtime-clamped-top"), "top").value, "160");
assert.equal(dimension(find("runtime", "runtime-confirmed-workspace-retained"), "top").value, "80");

const provenance = read(path.join(base, "copy-provenance.json"));
const original = path.resolve(base, "../..", provenance.source);
for (const [relative, expected] of Object.entries(provenance.sourceHashes)) assert.equal(hash(path.join(original, relative)), expected, relative + ": original baseline unchanged");
const score = read(path.join(base, "fixtures/score-provenance.json"));
assert.equal(hash(score.source), score.sourceSHA256, "approved source unchanged");
assert.equal(hash(path.join(base, "fixtures/approved-score.svg")), score.assetSHA256, "approved score unchanged");
assert.equal(hash("E:/desktop/吉他打谱软件 · 界面框架方案（结构与布局）.md"), "cecc4ddb996fcd11252eec0621616249c209959ed092354109fc86af36705adf", "structure document unchanged");
assert.equal(hash(path.join(base, "styles/structure-preview.css")), hash(path.join(evidence, "before-source/styles/structure-preview.css")), "outer shell CSS unchanged");
const syntax = read(path.join(evidence, "syntax-review.json")); assert.deepEqual(syntax.failures, []);
const nodeTests = fs.readFileSync(path.join(evidence, "node-tests.txt"), "utf8");
assert.match(nodeTests, /(?:ℹ|#) tests 165/); assert.match(nodeTests, /(?:ℹ|#) pass 165/); assert.match(nodeTests, /(?:ℹ|#) fail 0/);
const sources = ["src/shell/layout-visual-state.js", "src/shell/workspace-layout-visual.js", "src/features/workspace-layout-page.js", "src/fixtures/structure-preview.js", "src/fixtures/layout-edit-state.js", "src/fixtures/sidebar-visuals.js", "styles/workspace-layout.css", "styles/sidebar-visuals.css", "structure-preview.html", "runtime-preview.html", "layout-review.html", "tests/layout-component-visual.test.js", "tools/layout-component-contract.cjs", "README.md"];
const accepted = { rule: report.rule, sources: Object.fromEntries(sources.map(relative => [relative, hash(path.join(base, relative))])), observedSources, browserEvidence: hash(reportPath), nodeTests: hash(path.join(evidence, "node-tests.txt")), syntaxEvidence: hash(path.join(evidence, "syntax-review.json")) };
const seal = path.join(evidence, "source-hashes.json");
if (process.argv.includes("--record")) {
  assert.ok(!fs.existsSync(seal), "Do not overwrite an accepted evidence seal");
  fs.writeFileSync(seal, JSON.stringify(accepted, null, 2) + "\n");
} else if (fs.existsSync(seal)) assert.deepEqual(accepted, read(seal), "current responsibility sources match accepted evidence");
const verification = { revision: 10, rule: report.rule, result: "passed", geometryRecords: rows.length, groups: Object.fromEntries(["flows", "states", "responsive", "runtime", "originalScenes", "scroll"].map(group => [group, report[group].length])), keyboardFocusSteps: report.keyboard.length, nodeTests: 165, stableObservedFiles: Object.keys(observedSources).length, originalBaselineFiles: Object.keys(provenance.sourceHashes).length, responsibilitySources: sources.length, syntaxFiles: syntax.count, scope: "visual copy and current task; no product, business components or engine rewrite" };
fs.writeFileSync(path.join(evidence, "verification.json"), JSON.stringify(verification, null, 2) + "\n");
console.log(JSON.stringify(verification, null, 2));
