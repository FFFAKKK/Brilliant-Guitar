// Current control-band geometry. Browser actions and collection run through CUA only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourceHashes, readLayout, near, sameBox } from "./independent-regions-contract.js";
export { sourceHashes, readLayout };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function readChrome() {
  const rect = node => {
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const buttons = selector => [...document.querySelectorAll(selector)].map(node => {
    const image = node.querySelector("svg");
    return { id: node.id, label: node.getAttribute("aria-label"), ...rect(node),
      image: image ? rect(image) : null, pressed: node.getAttribute("aria-pressed"),
      disabled: node.disabled, tooltip: node.dataset.tooltip };
  }).filter(item => item.width > 0 && item.height > 0);
  const top = document.querySelector(".v-top");
  return { left: buttons(".v-icon-rail .v-rail-button"), right: buttons(".v-page-rail .v-rail-button"),
    topControls: buttons('.v-top button:not([role="separator"])'), bottomControls: buttons(".v-merge button"),
    topSize: getComputedStyle(document.querySelector(".visual-shell")).getPropertyValue("--top-h").replace("px", "") * 1,
    sizeInputs: Object.fromEntries(["left", "right", "top", "voice"].flatMap(side => {
      const node = document.querySelector("#layout-size-" + side);
      return node ? [[side, { value: node.value * 1, max: node.max * 1, focused: node === document.activeElement }]] : [];
    })),
    topGrip: (() => {
      const node = document.querySelector("#grip-top"), marker = getComputedStyle(node, "::after");
      return { ...rect(node), value: node.getAttribute("aria-valuenow") * 1, orientation: node.getAttribute("aria-orientation"),
        marker: { width: marker.width.replace("px", "") * 1, height: marker.height.replace("px", "") * 1, left: marker.left.replace("px", "") * 1, top: marker.top.replace("px", "") * 1 } };
    })(),
    voiceTrigger: rect(document.querySelector(".v-voice-trigger")),
    topVisible: top.getBoundingClientRect().height > 0,
    moduleCount: document.querySelectorAll(".v-module").length,
    edges: [...document.querySelectorAll(".v-panel-surface, .v-module")].map(node => {
      const style = getComputedStyle(node);
      return { node: node.className, widths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth] };
    }) };
}

export function checkChrome(sample) {
  const chrome = sample.chrome, b = sample.boxes;
  assert.ok(chrome, "control and icon observations are required");
  for (const [side, items] of [["left", chrome.left], ["right", chrome.right]]) {
    assert.ok(items.length >= (side === "left" ? 4 : 0), side + " has named entry points");
    for (const item of items) {
      near(item.width, 32, item.id + " control width");
      near(item.height, 32, item.id + " control height");
      near(item.image.width, 16, item.id + " icon width");
      near(item.image.height, 16, item.id + " icon height");
      near(item.x + item.width / 2, b[side === "left" ? "v-icon-rail" : "v-page-rail"].x + 20, item.id + " centered in rail");
      assert.ok(item.label && item.tooltip === item.label, item.id + " has a name and tooltip");
    }
  }
  near(chrome.voiceTrigger.height, 28, "voice trigger control space");
  assert.ok(chrome.topSize >= 40 && chrome.topSize <= 160, "top height has usable limits");
  const inputs = chrome.sizeInputs;
  for (const side of ["left", "right", "top"]) {
    if (inputs[side] && !inputs[side].focused) near(inputs[side].value, side === "top" ? chrome.topSize : sample.capacity[side], side + " input follows stored size");
  }
  if (inputs.voice && sample.regions.voice === "true" && !inputs.voice.focused) near(inputs.voice.value, b["v-voice-content"].height, "bottom input follows visible height");
  if (inputs.top && inputs.voice) {
    const capacity = sample.viewport.height - 34 - 32 - 40 - 300;
    near(inputs.top.max, Math.max(40, Math.min(160, capacity - inputs.voice.value)), "top input capacity stays current");
    near(inputs.voice.max, Math.max(80, Math.min(320, capacity - chrome.topSize)), "bottom input capacity stays current");
  }
  if (sample.regions.top === "true") {
    const grip = chrome.topGrip;
    assert.equal(grip.orientation, "horizontal");
    near(grip.value, chrome.topSize, "top grip follows stored height");
    near(grip.height, 8, "top grip hit area");
    near(grip.marker.width, 20, "short top marker width");
    near(grip.marker.height, 2, "short top marker height");
    near(grip.y + grip.marker.top + 1, b["v-top"].y + b["v-top"].height, "top marker touches the band edge");
    near(grip.x + grip.marker.left + 10, b["v-title"].width / 2, "top marker is centered");
  }
  for (const [band, items] of [["v-top", chrome.topControls], ["v-merge", chrome.bottomControls]]) {
    if (!b[band].visible) continue;
    for (const item of items) {
      assert.ok(item.height >= 27.9, item.label + " minimum control height");
      assert.ok(item.y >= b[band].y + 5.9 && item.y + item.height <= b[band].y + b[band].height - 5.9, item.label + " has vertical breathing room");
    }
  }
  const panel = chrome.left.find(item => item.id === "module-panel-trigger");
  assert.equal(panel.pressed, sample.regions.left, "left icon follows panel visibility");
  for (const edge of chrome.edges) assert.ok(edge.widths.every(value => value === "0px"), edge.node + " has a visible regular edge");
}

export function checkLayout(sample, { centered = false, symmetric = false } = {}) {
  const b = sample.boxes;
  // innerWidth is integer-rounded; the rendered window may retain a fractional CSS pixel.
  const canvas = b["v-title"].width;
  assert.ok(Math.abs(canvas - Math.max(1024, sample.viewport.width)) < .51, "frame matches the window width");
  const topHeight = sample.regions.top === "true" ? sample.chrome.topSize : 0;
  const middleY = 34 + topHeight;
  const middleHeight = sample.viewport.height - middleY - b["v-footer"].height - 40;
  const panels = ["v-title", "v-top", "v-icon-rail", "v-left", "v-right", "v-page-rail", "v-footer", "v-merge"];
  sameBox(b["v-paper-scroll"], b["v-stage"], "scroll viewport stays inside workbench");
  for (let index = 0; index < panels.length; index++) {
    const a = b[panels[index]];
    if (!a?.visible) continue;
    for (const key of ["v-stage", ...panels.slice(index + 1)]) {
      const other = b[key];
      if (!other?.visible) continue;
      const w = Math.max(0, Math.min(a.x + a.width, other.x + other.width) - Math.max(a.x, other.x));
      const h = Math.max(0, Math.min(a.y + a.height, other.y + other.height) - Math.max(a.y, other.y));
      assert.ok(w * h < .03, panels[index] + " overlaps " + key);
    }
  }
  for (const key of ["v-stage", "v-icon-rail", "v-left", "v-right", "v-page-rail"]) {
    if (!b[key].visible) continue;
    near(b[key].y, middleY, key + " follows top band");
    near(b[key].height, middleHeight, key + " follows bottom band");
  }
  for (const key of ["v-top", "v-footer", "v-merge"]) {
    if (!b[key].visible) continue;
    near(b[key].x, 0, key + " full-width start");
    near(b[key].width, canvas, key + " full width");
  }
  if (b["v-top"].visible) near(b["v-top"].height, sample.chrome.topSize, "top control space");
  near(b["v-voice-header"].height, 32, "voice title control space");
  near(b["v-merge"].height, 40, "permanent control space");
  near(b["v-footer"].height, 32 + b["v-voice-content"].height, "voice content belongs to bottom row");
  near(b["v-icon-rail"].width, 40, "left icon rail width");
  near(b["v-page-rail"].width, 40, "right icon rail width");
  near(b["v-merge"].y + b["v-merge"].height, sample.viewport.height, "bottom controls stay at window edge");
  assert.ok(b["v-stage"].width >= 479.9 && b["v-stage"].height >= 299.9, "minimum score workbench");
  assert.equal(sample.mergeParent, "visual-shell");
  assert.equal(b["v-merge"].background, "rgb(32, 33, 37)");
  if (b["v-right"].visible) assert.notEqual(b["v-page"].background, b["v-merge"].background, "horizontal and vertical surfaces are distinct");
  for (const bar of sample.scrollbars) {
    assert.equal(bar.width, "none", bar.node + " draws a scrollbar");
    assert.equal(bar.gutter, "auto", bar.node + " reserves a scrollbar gutter");
    assert.equal(bar.display, "none", bar.node + " draws a WebKit scrollbar");
  }
  assert.equal(b["v-paper"].background, "rgb(255, 255, 255)");
  near(b["v-paper"].height / b["v-paper"].width, 990 / 700, "paper aspect ratio");
  if (centered) near(b["v-paper"].x + b["v-paper"].width / 2, sample.viewport.width / 2, "window paper center");
  if (symmetric) near(sample.capacity.left, sample.capacity.right, "symmetric sidebar widths");
  assert.equal(sample.failedImages, 0);
  checkChrome(sample);
}

export function checkToggle(before, after, side) {
  checkLayout(after);
  sameBox(before.boxes["v-paper"], after.boxes["v-paper"], side + " keeps paper fixed");
  assert.deepEqual(after.capacity, before.capacity, "toggle changes stored sidebar capacities");
  near(before.chrome.topSize, after.chrome.topSize, "toggle changes stored top height");
  sameBox(before.boxes["v-title"], after.boxes["v-title"], "title stays fixed");
  sameBox(before.boxes["v-merge"], after.boxes["v-merge"], "controls stay fixed");
  for (const key of ["v-icon-rail", "v-page-rail", "v-left", "v-right"]) {
    if (key === ({ left: "v-left", right: "v-right" })[side]) continue;
    const a = before.boxes[key], b = after.boxes[key];
    assert.equal(a.visible, b.visible, side + " affects another region visibility");
    if (!a.visible) continue;
    near(a.x, b.x, side + " keeps " + key + " x");
    near(a.width, b.width, side + " keeps " + key + " width");
    if (side === "top") {
      const change = (after.regions.top === "true" ? after.chrome.topSize : 0) - (before.regions.top === "true" ? before.chrome.topSize : 0);
      near(b.y - a.y, change, "top band moves side panel start");
      near(a.height - b.height, change, "top band consumes side panel height");
    } else if (side === "voice") {
      const change = after.boxes["v-footer"].height - before.boxes["v-footer"].height;
      near(a.y, b.y, "voice expansion keeps side top");
      near(a.height - b.height, change, "voice band consumes side panel height");
    } else sameBox(a, b, side + " keeps other side region fixed");
  }
  for (const key of ["v-top", "v-footer"]) {
    if (key === ({ top: "v-top", voice: "v-footer" })[side]) continue;
    const a = before.boxes[key], b = after.boxes[key];
    assert.equal(a.visible, b.visible);
    if (a.visible) sameBox(a, b, side + " keeps the other horizontal band fixed");
  }
}

if (typeof process !== "undefined" && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = JSON.parse(fs.readFileSync(path.resolve(root, process.argv[2] ?? "evidence/revision-06/review.json"), "utf8"));
  assert.deepEqual(report.sourceHashes, sourceHashes(), "current browser evidence is stale");
  assert.equal(report.scenarios.length, 96);
  for (const record of report.scenarios) checkLayout(record.sample, { centered: true });
  for (const record of report.toggles) checkToggle(record.before, record.after, record.side);
  for (const record of report.arrangements) checkLayout(record.sample, { symmetric: true });
  assert.ok(report.toggles.length >= 64 && ["structure", "runtime"].every(entry => report.toggles.some(record => record.entry === entry)));
  assert.ok(report.scrollChecks.length >= 6 && report.scrollChecks.every(record => record.passed));
  assert.ok(report.heightChecks.length >= 32 && report.heightChecks.every(record => record.passed));
  for (const record of report.heightChecks) checkLayout(record.after);
  assert.equal(report.failures.length, 0);
  console.log(JSON.stringify({ passed: true, scenarios: report.scenarios.length, toggles: report.toggles.length, arrangements: report.arrangements.length, scrollChecks: report.scrollChecks.length, heightChecks: report.heightChecks.length }));
}
