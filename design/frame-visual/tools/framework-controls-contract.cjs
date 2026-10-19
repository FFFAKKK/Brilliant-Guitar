// Rechecks saved CUA observations; does not launch a browser or qualify new source without recapture.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const base = path.resolve(__dirname, "..");
const evidence = path.join(base, "evidence/revision-11");
const read = file => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const report = read(path.join(evidence, "browser-review.json"));
const before = read(path.join(evidence, "current-source-before.json"));
assert.deepEqual(read(path.join(evidence, "current-source-after.json")), before, "observation and tests saw stable sources");
for (const [file, value] of Object.entries(before)) assert.equal(hash(path.join(base, file)), value, file + ": current source matches observation");
const baseline = read(path.join(evidence, "source-baseline.json"));
const concurrent = read(path.join(evidence,"concurrent-changes.json"));
assert.deepEqual(Object.keys(concurrent).sort(), ["src/features/builtin-pages.js","src/features/workspace-layout-page.js","src/runtime-preview.js","src/shell/sidebar-content-settings.js","src/shell/workspace-layout-visual.js"].sort(), "explicit concurrent differences against initial baseline; two observed files returned to their initial hashes");
for (const [file, value] of Object.entries(baseline)) {
  const expected = concurrent[file]?.after ?? value;
  assert.equal(hash(path.join(base, file)), expected, file + ": existing source preserved or known concurrent source adopted");
  if (concurrent[file]) { assert.equal(concurrent[file].before,value); assert.equal(hash(path.join(evidence,"concurrent-source",file)),expected); }
}
const get = (group, label) => { const row = report[group].find(r => r.label === label); assert.ok(row, label); return row; };
const control = (row, id) => { const result = row.controls.find(n => n.id === id); assert.ok(result, row.label + ": " + id); return result; };
const near = (a, b, label) => assert.ok(Math.abs(a - b) < .1, label + ": " + a + " / " + b);
const apart = (a, b) => !a.visible || !b.visible || a.right <= b.x + .6 || b.right <= a.x + .6 || a.bottom <= b.y + .6 || b.bottom <= a.y + .6;
for (const [group, count] of Object.entries({ controls: 21, capacity: 28, frames: 19, originalScenes: 96, keyboard: 8 })) assert.equal(report[group].length, count, group + ": complete record set");
for (const row of [...report.controls, ...report.capacity]) {
  assert.ok(row.rootOverflow < .6, row.label + ": no root overflow");
  assert.deepEqual(row.duplicateIds, [], row.label + ": unique IDs");
  for (const size of row.sizes) {
    assert.ok(size.overflowX < .6, row.label + ": no horizontal overflow in " + size.name);
    assert.equal(size.scrollbar, "none", row.label + ": hidden scrollbar");
  }
  for (const n of row.controls) {
    assert.equal(n.style.border, "0px", row.label + ": transparent control edge " + n.label);
    assert.equal(n.style.animation, "0s", row.label + ": no animation");
    assert.equal(n.style.transition, "0s", row.label + ": no transition");
  }
  for (const n of row.privateNodes) assert.equal(n.marked, false, row.label + ": private node not opted in");
}
for (const [width, height] of [[1280,720],[1024,720],[800,600],[640,480]]) {
  for (const view of ["actions","inputs","selection","hosting"]) {
    const row = get("capacity", view + "-" + width + "x" + height);
    assert.equal(row.viewport.width, width, row.label + ": real viewport width");
    assert.equal(row.viewport.height, height, row.label + ": real viewport height");
  }
}
for (const width of [200,260,360]) for (const height of [40,64,96]) {
  const row = get("capacity", "host-" + width + "-" + height);
  near(row.sizes.find(n=>n.name === "fc-sidebar").rect.width, width, row.label + ": sidebar width");
  for (const band of row.sizes.filter(n=>n.name === "fc-band")) near(band.rect.height, height, row.label + ": band height");
}
const numberDraft = control(get("controls", "number-invalid-draft"), "number-live");
assert.equal(numberDraft.value, "999"); assert.equal(numberDraft.invalid, "true");
assert.equal(numberDraft.style.color, "rgb(217, 131, 131)", "error is text, not a decorative edge");
assert.equal(control(get("controls", "number-clamped"), "number-live").value, "360");
assert.equal(control(get("controls", "number-empty-draft"), "number-live").value, "");
assert.equal(control(get("controls", "number-empty-restored"), "number-live").value, "260");
assert.equal(control(get("controls", "search-cleared"), "search-1").value, "");
const readonly = control(get("controls", "readonly-unchanged"), "input-readonly");
assert.equal(readonly.readOnly, true); assert.equal(readonly.value, "右侧栏 · 工作区布局");
assert.equal(control(get("controls", "actions-normal"), "action-disabled").disabled, true);
assert.equal(control(get("controls", "primary-hover"), "action-confirm").hover, true);
assert.equal(control(get("controls", "primary-active"), "action-confirm").active, true);
assert.equal(control(get("controls", "primary-hover"), "action-confirm").style.background, "rgb(44, 103, 197)");
assert.equal(get("controls", "primary-keyboard-focus").focus.outlineColor, "rgb(143, 183, 255)");
assert.equal(control(get("controls", "last-page"), "page-next").disabled, true);
assert.equal(get("controls", "last-page").focus.page, "3 / 3");
assert.equal(get("controls", "previous-page").focus.page, "2 / 3");
assert.equal(get("controls", "tab-arrow-hosting").activeTab, "tab-hosting");
assert.equal(get("controls", "private-action").focus.privateInput, "私有输入保留");
assert.equal(get("controls", "private-action").focus.privateStatus, "私有操作已响应");
assert.equal(control(get("controls", "custom-glyph-selected"), "custom-entry-1").pressed, "true");
assert.deepEqual(report.privateComparison.before, report.privateComparison.after, "framework skin does not change private computed styles");
assert.deepEqual(report.keyboard.slice(0,7).map(n=>n.label), ["搜索框架内容","清除搜索框架内容","方案名称","完整名称","侧栏宽度","超限侧栏宽度","只读当前区域"]);
for (const entry of report.keyboard.slice(0,7)) {
  assert.equal(entry.focusVisible, true, entry.label + ": actual Tab focus"); assert.equal(entry.disabled, false);
  assert.ok(entry.outlineStyle === "solid" || entry.wrapper?.outlineStyle === "solid", entry.label + ": visible focus or focus container");
}
assert.ok(get("capacity", "inputs-after-wheel-at800").sizes[0].scrollTop > get("capacity", "inputs-before-wheel-at800").sizes[0].scrollTop, "real wheel retains browsing");

for (const row of [...report.frames, ...report.originalScenes]) {
  assert.ok(row.rootOverflow < .6 && row.composerOverflow < .6, row.label + ": no frame overflow");
  assert.equal(row.paperWhite, "rgb(255, 255, 255)", row.label + ": approved white paper");
  assert.ok(row.metrics.stage.width > 0 && row.metrics.stage.height > 0, row.label + ": positive stage");
  near(row.metrics.shell.width, row.viewport.width, row.label + ": shell uses real viewport");
  near(row.metrics.paper.x + row.metrics.paper.width / 2, row.viewport.width / 2, row.label + ": centered paper");
  for (const key of ["left","right","top","iconRail","pageRail","voice","voiceTitle","merge"]) assert.ok(apart(row.metrics.stage, row.metrics[key]), row.label + ": stage separate from " + key);
  for (const scroll of row.scroll) assert.equal(scroll.scrollbar, "none", row.label + ": hidden frame scrollbar");
  for (const n of row.controls) assert.equal(n.border, "0px", row.label + ": no control frame " + n.id);
}
for (const prefix of ["structure", "runtime"]) {
  const origin = get("frames", prefix + "-normal");
  for (const row of report.frames.filter(r=>r.label.startsWith(prefix + "-") && !r.label.includes("resize"))) {
    for (const key of ["x","y","width","height"]) near(row.metrics.paper[key], origin.metrics.paper[key], row.label + ": fixed paper " + key);
  }
  const opened = get("frames", prefix + "-left-open"); near(opened.metrics.left.width, opened.metrics.right.width, prefix + ": default symmetric widths");
  const canceled = get("frames", prefix + "-cancel-workspace-retained");
  assert.equal(canceled.editing, "false"); assert.equal(control(canceled, "layout-size-left").value, "300"); assert.equal(control(canceled, "layout-size-top").value, "64");
}
const resizeOrigin = get("frames", "runtime-cancel-workspace-retained");
for (const row of report.frames.filter(r=>r.label.startsWith("runtime-resize"))) for (const key of ["width","height","y"]) near(row.metrics.paper[key], resizeOrigin.metrics.paper[key], row.label + ": preserve paper " + key);

const provenance = read(path.join(base, "copy-provenance.json"));
const original = path.resolve(base, "../..", provenance.source);
for (const [file, value] of Object.entries(provenance.sourceHashes)) assert.equal(hash(path.join(original,file)), value, "original baseline: " + file);
const score = read(path.join(base, "fixtures/score-provenance.json"));
assert.equal(hash(score.source), score.sourceSHA256, "approved source unchanged");
assert.equal(hash(path.join(base,"fixtures/approved-score.svg")), score.assetSHA256, "approved score unchanged");
assert.equal(hash("E:/desktop/吉他打谱软件 · 界面框架方案（结构与布局）.md"), "cecc4ddb996fcd11252eec0621616249c209959ed092354109fc86af36705adf", "structure document unchanged");
const tests = fs.readFileSync(path.join(evidence,"node-tests.txt"),"utf8"); assert.match(tests,/tests 204/); assert.match(tests,/pass 204/); assert.match(tests,/fail 0/);
const syntax = read(path.join(evidence,"syntax-review.json")); assert.equal(syntax.passed,true);
const sources = ["controls-review.html","src/fixtures/controls-review.js","styles/framework-controls.css","styles/controls-review.css","structure-preview.html","runtime-preview.html","framework-controls.md","README.md","tools/framework-controls-contract.cjs"];
const accepted = { sources: Object.fromEntries(sources.map(file=>[file,hash(path.join(base,file))])), browser: hash(path.join(evidence,"browser-review.json")), tests:hash(path.join(evidence,"node-tests.txt")), syntax:hash(path.join(evidence,"syntax-review.json")), samplers:hash(path.join(evidence,"dom-samplers.js")), concurrent:hash(path.join(evidence,"concurrent-changes.json")) };
const sealPath=path.join(evidence,"source-hashes.json");
if(process.argv.includes("--record")) { assert.ok(!fs.existsSync(sealPath),"do not overwrite a valid historical seal"); fs.writeFileSync(sealPath,JSON.stringify(accepted,null,2)+"\n"); }
else assert.deepEqual(read(sealPath),accepted,"sealed responsibility sources and evidence unchanged");
const verification={revision:11,result:"passed",browserRecords:164,controls:21,capacity:28,frames:19,originalScenes:96,keyboardSteps:8,nodeTests:204,syntaxFiles:syntax.count,stableSources:Object.keys(before).length,unchangedExistingSources:Object.keys(baseline).length-Object.keys(concurrent).length,preservedConcurrentSources:Object.keys(concurrent).length,originalFiles:Object.keys(provenance.sourceHashes).length,scope:"framework visual copy only; private plugin style remains autonomous; system scaling not tested"};
fs.writeFileSync(path.join(evidence,"verification.json"),JSON.stringify(verification,null,2)+"\n");
console.log(JSON.stringify(verification));
