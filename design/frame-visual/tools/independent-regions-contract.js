// Read-only CUA collection and offline verification for the current visual revision.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function sourceHashes() {
  const files = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
  const sources = ["src", "styles", "tests", "tools"].flatMap(dir => files(path.join(root, dir)))
    .concat(["structure-preview.html", "runtime-preview.html", "review.html", "index.html", "fixtures/approved-score.svg"].map(file => path.join(root, file)));
  return Object.fromEntries(sources.map(file => [path.relative(root, file).replaceAll("\\", "/"),
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")]));
}

export function readLayout() {
  const box = selector => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const r = node.getBoundingClientRect(), c = getComputedStyle(node);
    return { x: r.x, y: r.y, width: r.width, height: r.height, visible: r.width > 0 && r.height > 0,
      background: c.backgroundColor, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
      scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, scrollX: node.scrollLeft, scrollY: node.scrollTop };
  };
  const selectors = [".v-title", ".v-top", ".v-icon-rail", ".v-left", ".v-left-surface", ".v-stage", ".v-paper-scroll", ".v-paper", ".v-right", ".v-page", ".v-page-rail", ".v-footer", ".v-voice-header", ".v-voice-content", ".v-merge"];
  const shell = document.querySelector(".visual-shell"), css = getComputedStyle(shell);
  const nodes = [...document.querySelectorAll("*")].filter(node => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  return {
    viewport: { width: innerWidth, height: innerHeight },
    scene: shell.dataset.scene, variant: shell.dataset.variant, runtime: shell.dataset.runtime,
    boxes: Object.fromEntries(selectors.map(selector => [selector.slice(1), box(selector)])),
    capacity: { left: css.getPropertyValue("--left-capacity").trim().replace("px", "") * 1,
      right: css.getPropertyValue("--right-capacity").trim().replace("px", "") * 1 },
    regions: Object.fromEntries(["top", "left", "right", "voice"].map(side => [side, document.querySelector("#region-" + side).getAttribute("aria-pressed")])),
    scrollbars: nodes.filter(node => !node.closest("svg")).map(node => {
      const c = getComputedStyle(node), bar = getComputedStyle(node, "::-webkit-scrollbar");
      return { node: node.id || node.className || node.tagName, width: c.scrollbarWidth, gutter: c.scrollbarGutter,
        display: bar.display, barWidth: bar.width, barHeight: bar.height,
        overflowing: node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight };
    }),
    failedImages: [...document.images].filter(node => !node.complete || !node.naturalWidth).length,
    mergeParent: document.querySelector(".v-merge").parentElement.className,
  };
}

export function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < .03, message + ": " + actual + " / " + expected);
}
export function sameBox(a, b, message) {
  for (const key of ["x", "y", "width", "height"]) near(a[key], b[key], message + "/" + key);
}
export function checkLayout(sample, { centered = false } = {}) {
  const b = sample.boxes, stage = b["v-stage"], height = sample.viewport.height;
  const panels = ["v-title", "v-icon-rail", "v-left", "v-right", "v-page-rail", "v-top", "v-footer", "v-merge"];
  sameBox(b["v-paper-scroll"], stage, "scroll viewport stays inside workbench");
  for (let i = 0; i < panels.length; i++) {
    const a = b[panels[i]];
    if (!a.visible) continue;
    for (const key of ["v-stage", ...panels.slice(i + 1)]) {
      const other = b[key];
      if (!other.visible) continue;
      const w = Math.max(0, Math.min(a.x + a.width, other.x + other.width) - Math.max(a.x, other.x));
      const h = Math.max(0, Math.min(a.y + a.height, other.y + other.height) - Math.max(a.y, other.y));
      assert.ok(w * h < .03, panels[i] + " overlaps " + key);
    }
  }
  for (const key of ["v-icon-rail", "v-left", "v-right", "v-page-rail"]) {
    if (!b[key].visible) continue;
    near(b[key].y, 34, key + " fixed top");
    near(b[key].height, height - 34 - 32, key + " fixed height");
  }
  for (const key of ["v-top", "v-footer"]) if (b[key].visible) {
    near(b[key].x, 44 + sample.capacity.left, key + " central start");
    near(b[key].width, Math.max(1024, sample.viewport.width) - 44 - 40 - sample.capacity.left - sample.capacity.right, key + " stable central width");
  }
  near(stage.y, 70, "reserved top tool slot");
  assert.ok(stage.width >= 479.9 && stage.height >= 299.9, "minimum score workbench");
  near(b["v-merge"].height, 32, "permanent transport height");
  assert.equal(sample.mergeParent, "visual-shell");
  for (const bar of sample.scrollbars) {
    assert.equal(bar.width, "none", bar.node + " draws a scrollbar");
    assert.equal(bar.gutter, "auto", bar.node + " reserves a scrollbar gutter");
    assert.equal(bar.display, "none", bar.node + " draws a WebKit scrollbar");
  }
  assert.equal(b["v-paper"].background, "rgb(255, 255, 255)");
  near(b["v-paper"].height / b["v-paper"].width, 990 / 700, "paper aspect ratio");
  if (centered) near(b["v-paper"].x + b["v-paper"].width / 2, sample.viewport.width / 2, "window paper center");
  assert.equal(sample.failedImages, 0);
}

export function checkToggle(before, after, side) {
  checkLayout(after);
  sameBox(before.boxes["v-paper"], after.boxes["v-paper"], side + " keeps the paper fixed");
  for (const key of ["v-title", "v-icon-rail", "v-page-rail", "v-merge", "v-left", "v-right", "v-top", "v-footer"]) {
    if (key === ({ left: "v-left", right: "v-right", top: "v-top", voice: "v-footer" })[side]) continue;
    const a = before.boxes[key], b = after.boxes[key];
    if (a.visible && b.visible) sameBox(a, b, side + " keeps " + key + " fixed");
    else assert.equal(a.visible, b.visible, side + " affects another region's visibility");
  }
  assert.deepEqual(after.capacity, before.capacity, "toggle changes reserved side capacities");
}

if (typeof process !== "undefined" && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = JSON.parse(fs.readFileSync(path.resolve(root, "evidence/revision-03/review.json"), "utf8"));
  assert.deepEqual(report.sourceHashes, sourceHashes(), "current browser evidence is stale");
  assert.equal(report.scenarios.length, 96);
  for (const record of report.scenarios) checkLayout(record.sample, { centered: true });
  for (const record of report.toggles) checkToggle(record.before, record.after, record.side);
  assert.ok(report.toggles.length >= 64 && ["structure", "runtime"].every(entry => report.toggles.some(record => record.entry === entry)));
  assert.ok(report.scrollChecks.length >= 6 && report.scrollChecks.every(record => record.passed));
  assert.equal(report.failures.length, 0);
  console.log(JSON.stringify({ passed: true, scenarios: report.scenarios.length, toggles: report.toggles.length, scrollChecks: report.scrollChecks.length }));
}
