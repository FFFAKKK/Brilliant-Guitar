const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

const base = path.resolve(__dirname, "..");
const evidence = path.join(base, "evidence/revision-13");
const read = file => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const report = read(path.join(evidence, "browser-review.json"));
const before = read(path.join(evidence, "current-source-before.json"));
const after = read(path.join(evidence, "current-source-after.json"));
assert.deepEqual(after, before, "source set stayed stable after browser capture");
for (const [file, value] of Object.entries(after)) assert.equal(hash(path.join(base, file)), value, `observed source: ${file}`);

for (const [group, count] of Object.entries({ flows: 46, capacity: 48, frames: 22, originalScenes: 96, keyboard: 8, attempts: 0 })) {
  assert.equal(report[group].length, count, `${group}: complete record set`);
}
const all = [...report.flows, ...report.capacity, ...report.frames, ...report.originalScenes];
const near = (a, b, label) => assert.ok(Math.abs(a - b) < .6, `${label}: ${a} / ${b}`);
const apart = (a, b) => !a || !b || !a.visible || !b.visible || a.right <= b.x + .6 || b.right <= a.x + .6 || a.bottom <= b.y + .6 || b.bottom <= a.y + .6;
for (const row of all) {
  assert.ok(row.rootOverflow < .6, `${row.label}: root fits`);
  assert.deepEqual(row.duplicateIds, [], `${row.label}: unique DOM ids`);
  assert.equal(row.paperWhite, "rgb(255, 255, 255)", `${row.label}: approved white paper`);
  near(row.metrics.shell.width, row.viewport.width, `${row.label}: real viewport`);
  near(row.metrics.paper.x + row.metrics.paper.width / 2, row.viewport.width / 2, `${row.label}: centered paper`);
  for (const key of ["left", "right", "top", "iconRail", "pageRail", "voice", "voiceTitle", "merge"]) assert.ok(apart(row.metrics.stage, row.metrics[key]), `${row.label}: stage separate from ${key}`);
  for (const area of row.scroll) {
    assert.equal(area.scrollbar, "none", `${row.label}: hidden scrollbar`);
    if (area.id !== "score-scroll") assert.ok(area.overflowX < .6, `${row.label}: no horizontal content overflow`);
  }
  for (const node of row.controls) {
    assert.equal(node.border, "0px", `${row.label}: transparent control ${node.id}`);
    assert.equal(node.animation, "0s", `${row.label}: no animation`);
    assert.equal(node.transition, "0s", `${row.label}: no transition`);
  }
}
for (const row of report.capacity) for (const slot of row.slots) assert.ok(slot.overflowX < .6, `${row.label}: slot ${slot.slot} fits`);
for (const row of [...report.frames, ...report.originalScenes]) assert.equal(row.neutral, false, `${row.label}: default has no neutral fixture`);
for (const step of report.keyboard) {
  assert.equal(step.focusVisible, true, "Tab focus visible");
  assert.equal(step.outline, "solid", "Tab focus outline");
  assert.equal(step.color, "rgb(143, 183, 255)", "Tab focus color");
  assert.equal(step.disabled, false, "Tab never lands on disabled contribution");
}
const dense = report.flows.find(row => row.label === "dense-normal");
const editing = report.flows.find(row => row.label === "editing-entered");
const opened = report.flows.find(row => row.label === "top-more-open");
const activated = report.flows.find(row => row.label === "top-more-activated");
const settled = report.flows.find(row => row.label === "voice-fixed-restored-settled");
assert.ok(dense && editing && opened && activated && settled, "key interaction rows present");
near(dense.metrics.paper.x, editing.metrics.paper.x, "editing keeps paper x");
near(dense.metrics.paper.y, editing.metrics.paper.y, "editing keeps paper y");
assert.ok(opened.layers.some(layer => layer.type === "context"), "top more opens context");
assert.equal(activated.focus.id, "more-top", "top more activation returns focus");
assert.ok(settled.scroll.some(area => area.id === "slot-voice-scroll" && area.scrollTop > 0), "voice reading end remains reachable");
assert.ok(settled.scroll.some(area => area.id === "slot-voice-fixed" && area.scrollTop > 0), "voice fixed end remains reachable");

const tests = fs.readFileSync(path.join(evidence, "node-tests.txt"), "utf8");
assert.match(tests, /tests 267/); assert.match(tests, /pass 267/); assert.match(tests, /fail 0/);
const syntax = read(path.join(evidence, "syntax-review.json")); assert.equal(syntax.passed, true); assert.equal(syntax.count, 116);

const acceptedSources = [
  "horizontal-slots-review.html", "horizontal-slots.md", "src/fixtures/horizontal-slots-state.js",
  "src/fixtures/horizontal-slots-view.js", "styles/horizontal-slots.css", "tests/horizontal-slots-visual.test.js",
  "src/fixtures/structure-preview.js", "structure-preview.html", "tools/horizontal-slots-contract.cjs",
];
const accepted = {
  sources: Object.fromEntries(acceptedSources.map(file => [file, hash(path.join(base, file))])),
  evidence: Object.fromEntries(["browser-review.json", "node-tests.txt", "syntax-review.json", "dom-sampler.js", "current-source-before.json", "current-source-after.json", "review.md"].map(file => [file, hash(path.join(evidence, file))])),
};
const seal = path.join(evidence, "source-hashes.json");
if (process.argv.includes("--record")) {
  assert.equal(fs.existsSync(seal), false, "never overwrite a historical revision-13 seal");
  fs.writeFileSync(seal, JSON.stringify(accepted, null, 2) + "\n");
} else assert.deepEqual(read(seal), accepted, "sealed sources and evidence unchanged");

const verification = { revision: 13, result: "passed", browserRecords: 212, flows: 46, capacity: 48, frames: 22, originalScenes: 96, keyboard: 8, nodeTests: 267, syntaxFiles: 116, stableSources: Object.keys(after).length, scope: "neutral in-memory framework visual review only; external plugin UI, scheduling, persistence and real Windows scaling remain separate" };
fs.writeFileSync(path.join(evidence, "verification.json"), JSON.stringify(verification, null, 2) + "\n");
console.log(JSON.stringify(verification));
