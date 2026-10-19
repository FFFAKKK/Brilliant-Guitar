const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

const base = path.resolve(__dirname, "..");
const evidence = path.join(base, "evidence/revision-09");
const reportPath = path.join(evidence, "browser-review.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const close = (a, b, label, tolerance = 0.6) => assert.ok(Math.abs(a - b) < tolerance, `${label}: ${a} / ${b}`);
const apart = (a, b) => !a.visible || !b.visible || a.right <= b.x + 0.6 || b.right <= a.x + 0.6 || a.bottom <= b.y + 0.6 || b.bottom <= a.y + 0.6;
const inside = (r, row, label) => {
  if (!r.visible) return;
  assert.ok(r.x >= -0.6 && r.y >= -0.6 && r.right <= row.viewport.width + 0.6 && r.bottom <= row.viewport.height + 0.6, row.label + ": " + label + " inside viewport");
};
const getFlow = label => {
  const row = report.flows.find(item => item.label === label);
  assert.ok(row, label + ": captured flow");
  return row;
};
const samePaper = (a, b, keys = ["x", "y", "width", "height"]) => {
  for (const key of keys) close(a.metrics.paper[key], b.metrics.paper[key], b.label + ": retained paper " + key, 0.02);
};
const sizes = row => Object.fromEntries(row.grips.map(item => [item.id, item.now]));

for (const [section, count] of Object.entries({ originalScenes: 96, responsive: 21, presentations: 8, flows: 40, density: 4, limits: 2 })) {
  assert.equal(report[section].length, count, section + ": complete capture");
  assert.equal(new Set(report[section].map(row => row.label)).size, count, section + ": unique labels");
}

const rows = ["originalScenes", "responsive", "presentations", "flows", "density", "limits"].flatMap(key => report[key]);
for (const row of rows) {
  const m = row.metrics;
  assert.equal(row.hiddenScrollbars, true, row.label + ": hidden scrollbars");
  assert.equal(row.paperWhite, true, row.label + ": approved white paper");
  assert.ok(row.rootOverflow < 0.6, row.label + ": no root overflow");
  close(m.shell.width, row.viewport.width, row.label + ": actual shell width");
  close(m.shell.height, row.viewport.height, row.label + ": actual shell height");
  close(m.paper.x + m.paper.width / 2, row.viewport.width / 2, row.label + ": paper centered", 0.02);
  for (const key of ["shell", "title", "start", "end", "document", "status", "top", "left", "right", "stage", "iconRail", "pageRail", "voice", "voiceTitle", "merge"]) inside(m[key], row, key);
  if (m.document.visible) {
    assert.ok(apart(m.document, m.start) && apart(m.document, m.end), row.label + ": document leaves menus and controls clear");
  }
  assert.ok(apart(m.start, m.end), row.label + ": menus and controls separated");
  for (const key of ["top", "left", "right", "iconRail", "pageRail", "voice", "voiceTitle", "merge"]) {
    assert.ok(apart(m.stage, m[key]), row.label + ": stage separated from " + key);
  }
  assert.ok(m.stage.width > 0 && m.stage.height > 0, row.label + ": positive stage remainder");
  if (row.viewport.width >= 1024 && row.viewport.height >= 720) {
    assert.ok(m.stage.width >= 480 && m.stage.height >= 300, row.label + ": normal stage capacity");
  }
  for (const grip of row.grips) {
    assert.ok(Number(grip.now) >= Number(grip.min) && Number(grip.now) <= Number(grip.max), row.label + ": grip within capacity " + grip.id);
  }
}

for (const row of report.originalScenes) {
  assert.equal(row.viewport.width, 1280, row.label + ": original matrix width");
  assert.equal(row.viewport.height, 720, row.label + ": original matrix height");
}
for (const row of [...report.responsive, ...report.presentations, ...report.limits]) {
  const dimensions = row.label.match(/-(\d+)x(\d+)$/);
  if (dimensions) {
    assert.equal(row.viewport.width, Number(dimensions[1]), row.label + ": actual width matches label");
    assert.equal(row.viewport.height, Number(dimensions[2]), row.label + ": actual height matches label");
  } else if (row.label.startsWith("title-")) {
    const width = Number(row.label.match(/-(\d+)$/)[1]);
    assert.equal(row.viewport.width, width, row.label + ": actual title width");
    assert.equal(row.viewport.height, width === 800 ? 600 : width === 1440 ? 900 : 720, row.label + ": actual title height");
  }
}
for (const side of ["left", "right"]) {
  for (const presentation of ["tabs", "list", "grid", "mixed"]) {
    const row = report.presentations.find(item => item.label === `presentation-${side}-${presentation}-800x600`);
    assert.ok(row, side + ": " + presentation);
    const query = new URL(row.url).searchParams;
    assert.equal(query.get("contentSide"), side);
    assert.equal(query.get("presentation"), presentation);
  }
}

const fixtureNormal = getFlow("normal-922");
const runtimeNormal = getFlow("runtime-normal-922");
for (const row of report.flows) {
  if (row.label === "runtime-normal-1280") continue;
  samePaper(row.label.startsWith("runtime-") ? runtimeNormal : fixtureNormal, row);
  const editing = row.label === "edit-922-sizes" || row.label === "runtime-edit-922";
  assert.ok(row.grips.every(grip => grip.disabled === !editing), row.label + ": geometry only in layout mode");
  assert.ok(row.layoutValues.every(field => field.disabled === !editing), row.label + ": dimensions only in layout mode");
}
for (const prefix of ["", "runtime-"]) {
  const normal = getFlow(prefix + "normal-922");
  for (let combination = 0; combination < 16; combination++) {
    assert.deepEqual(sizes(getFlow(prefix + "toggle-922-" + combination)), {
      ...sizes(normal), ...(combination >= 8 ? { "grip-voice": "120" } : {})
    }, prefix + "toggle-" + combination + ": dimensions unchanged");
  }
  const canceled = getFlow(prefix + "cancel-922");
  for (const [id, value] of Object.entries(sizes(normal))) assert.equal(sizes(canceled)[id], value, prefix + "cancel: " + id);
}
assert.equal(sizes(getFlow("confirm-922"))["grip-top"], "48", "confirm retains top height");
for (const row of report.responsive.filter(item => item.label.startsWith("resize-"))) samePaper(getFlow("confirm-922"), row, ["y", "width", "height"]);
for (const row of report.responsive.filter(item => item.label.startsWith("runtime-resize-"))) samePaper(getFlow("runtime-normal-1280"), row, ["y", "width", "height"]);
samePaper(getFlow("runtime-normal-1280"), runtimeNormal, ["y", "width", "height"]);
for (const row of [fixtureNormal, runtimeNormal, getFlow("cancel-922"), getFlow("runtime-cancel-922")]) {
  assert.equal(sizes(row)["grip-left"], "230");
  assert.equal(sizes(row)["grip-right"], "230");
}
for (const row of report.density) {
  close(row.viewport.dpr, Number(row.label.replace("simulated-density-", "")), row.label + ": simulated DPR", 0.00001);
  assert.equal(row.viewport.width, 1280);
  assert.equal(row.viewport.height, 720);
}
for (const row of report.limits) {
  close(row.metrics.stage.height, 254, row.label + ": short stage remainder");
  assert.equal(sizes(row)["grip-top"], "40");
  assert.equal(sizes(row)["grip-voice"], "80");
}

const scrollPath = path.join(evidence, "scroll-review.json");
const scrolling = JSON.parse(fs.readFileSync(scrollPath, "utf8"));
assert.deepEqual(scrolling.map(row => row.label), ["small-before", "sidebar-tail", "paper-scroll", "paper-resize", "paper-toggle"]);
for (const row of scrolling) {
  assert.equal(row.geometry.hiddenScrollbars, true, row.label + ": scrolling without visible bars");
  assert.equal(row.geometry.paperWhite, true);
  assert.ok(apart(row.geometry.metrics.stage, row.geometry.metrics.left) && apart(row.geometry.metrics.stage, row.geometry.metrics.right), row.label + ": regions separated while browsing");
}
const tail = scrolling[1].offsets[".v-page-content"];
close(tail.y, tail.maximumY, "small sidebar tail reachable");
samePaper(scrolling[0].geometry, scrolling[1].geometry);
assert.ok(scrolling[2].offsets[".v-paper-scroll"].x > 0 && scrolling[2].offsets[".v-paper-scroll"].y > 0, "small paper scrolls on both axes");
samePaper(scrolling[2].geometry, scrolling[3].geometry, ["y", "width", "height"]);
close(scrolling[3].geometry.metrics.paper.x + scrolling[3].geometry.metrics.paper.width / 2, scrolling[3].geometry.viewport.width / 2, "scrolled paper centered on resize", 0.02);
samePaper(scrolling[3].geometry, scrolling[4].geometry);

const provenance = JSON.parse(fs.readFileSync(path.join(base, "copy-provenance.json"), "utf8"));
const original = path.resolve(base, "../..", provenance.source);
for (const [relative, expected] of Object.entries(provenance.sourceHashes)) assert.equal(hash(path.join(original, relative)), expected, relative + ": original baseline unchanged");
const score = JSON.parse(fs.readFileSync(path.join(base, "fixtures/score-provenance.json"), "utf8"));
assert.equal(hash(score.source), score.sourceSHA256, "approved source unchanged");
assert.equal(hash(path.join(base, "fixtures/approved-score.svg")), score.assetSHA256, "approved score unchanged");
assert.equal(hash("E:/desktop/吉他打谱软件 · 界面框架方案（结构与布局）.md"), "cecc4ddb996fcd11252eec0621616249c209959ed092354109fc86af36705adf", "structure document unchanged");
const sources = ["src/workspace-geometry.js", "styles/structure-preview.css", "src/fixtures/structure-preview.js", "src/shell/visual-workbench.js", "src/shell/visual-title.js", "tests/workspace-window-adaptation.test.js", "tools/window-adaptation-contract.cjs", "README.md"];
const accepted = { sources: Object.fromEntries(sources.map(relative => [relative, hash(path.join(base, relative))])), browserEvidence: hash(reportPath), scrollEvidence: hash(scrollPath) };
const seal = path.join(evidence, "source-hashes.json");
if (process.argv.includes("--record")) {
  assert.ok(!fs.existsSync(seal), "Do not overwrite an accepted evidence seal");
  fs.writeFileSync(seal, JSON.stringify(accepted, null, 2) + "\n");
} else assert.deepEqual(accepted, JSON.parse(fs.readFileSync(seal, "utf8")), "Source or browser evidence drift since revision-09 capture");
const outcome = { passed: true, records: rows.length, sections: Object.fromEntries(["originalScenes", "responsive", "presentations", "flows", "density", "limits"].map(key => [key, report[key].length])), scrolling: scrolling.length, baselineFiles: Object.keys(provenance.sourceHashes).length, responsibilitySources: sources.length, realWindowsScaling: "not measured" };
fs.writeFileSync(path.join(evidence, "verification.json"), JSON.stringify(outcome, null, 2) + "\n");
console.log(JSON.stringify(outcome, null, 2));
