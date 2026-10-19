/* Browser collection is performed through CUA; this module only reads DOM and validates evidence. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_FILES = ["structure-preview.html", "review.html", "styles/tokens.css", "styles/base.css", "styles/structure-preview.css", "src/fixtures/structure-preview.js", "src/fixtures/preview-scenarios.js", "src/fixtures/preview-icons.js", "fixtures/approved-score.svg", "tools/revision-02-contract.js"];

function sourceHashes() {
  return Object.fromEntries(SOURCE_FILES.map(file => [file, crypto.createHash("sha256").update(fs.readFileSync(path.resolve(toolDirectory, "..", file))).digest("hex")]));
}

// Serialize this function for tab.playwright.evaluate(). It does not call preview state hooks.
function readDom() {
  const visible = node => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const box = selector => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const r = node.getBoundingClientRect(), c = getComputedStyle(node);
    return { x: r.x, y: r.y, width: r.width, height: r.height, visible: visible(node),
      background: c.backgroundColor, backgroundImage: c.backgroundImage, radius: c.borderRadius,
      scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
      scrollHeight: node.scrollHeight, clientHeight: node.clientHeight };
  };
  const nodes = [...document.querySelectorAll(".visual-shell *,.v-overlay,.v-overlay *,.v-modal,.v-modal *")].filter(n => !n.closest("svg") && visible(n));
  const edges = nodes.flatMap(n => {
    const c = getComputedStyle(n);
    return ["borderTop", "borderRight", "borderBottom", "borderLeft", "outline"].flatMap(key =>
      c[key + "Style"] !== "none" && c[key + "Width"] !== "0px" && c[key + "Color"] !== "rgba(0, 0, 0, 0)"
        ? [{ node: n.id || n.className, edge: key, color: c[key + "Color"] }] : []);
  });
  return {
    scene: document.querySelector(".visual-shell").dataset.scene,
    variant: document.querySelector(".visual-shell").dataset.variant,
    viewport: { width: innerWidth, height: innerHeight },
    boxes: Object.fromEntries(["visual-shell", "v-title", "v-top", "v-icon-rail", "v-left", "v-left-surface", "v-region-header", "v-page-header", "v-composer", "v-stage", "v-paper-scroll", "v-paper", "v-right", "v-page", "v-page-rail", "v-footer", "v-voice-header", "v-voice-content", "v-merge"].map(s => [s, box("." + s)])),
    composerParent: document.querySelector(".v-composer").parentElement.className,
    composerCount: document.querySelectorAll(".v-composer").length,
    paperViewport: {
      position: getComputedStyle(document.querySelector(".v-paper-scroll")).position,
      scrollX: document.querySelector(".v-paper-scroll").scrollLeft,
      scrollY: document.querySelector(".v-paper-scroll").scrollTop,
    },
    composerInRight: !!document.querySelector(".v-right .v-page-content .v-composer"),
    composerAvailableWidth: document.querySelector(".v-page-content").clientWidth,
    composerInStage: !!document.querySelector(".v-stage .v-composer"),
    sizeControls: [...document.querySelectorAll(".v-layout-size input")].map(n => ({label: n.getAttribute("aria-label"), value: n.value, min: n.min, max: n.max})),
    composerInLeft: !!document.querySelector(".v-left .v-composer"),
    composerControls: [...document.querySelectorAll(".v-layout-control")].map(n => ({ label: n.getAttribute("aria-label"), pressed: n.getAttribute("aria-pressed"), disabled: n.disabled })),
    composerHasScoreAssembly: !!document.querySelector(".v-assembly,.v-score-unit"),
    leftLabel: document.querySelector(".v-left .v-region-name")?.textContent ?? "",
    arrangement: document.querySelector(".visual-shell").dataset.arrangement,
    presetRows: document.querySelectorAll(".v-preset-row").length,
    defaultClutter: document.querySelector(".visual-shell").textContent.includes("写谱"),
    moduleCount: document.querySelectorAll(".v-module").length,
    modules: [...document.querySelectorAll(".v-module")].map(n => {
      const edge = getComputedStyle(n, "::after");
      return { id: n.dataset.module, editing: n.dataset.editing, selected: n.dataset.selected,
        edge: edge.borderTopStyle === "none" || edge.borderTopWidth === "0px" ? "rgba(0, 0, 0, 0)" : edge.borderTopColor };
    }),
    ghosts: [...document.querySelectorAll(".v-page-ghost")].filter(visible).length,
    layers: [...document.querySelectorAll(".v-overlay,dialog")].map(n => { const r = n.getBoundingClientRect(); return {role: n.dataset.layer || "modal", x: r.x, y: r.y, width: r.width, height: r.height}; }),
    unnamed: [...document.querySelectorAll(".visual-shell button")].filter(n => !n.disabled && !n.getAttribute("aria-label") && !n.textContent.trim()).length,
    objectLeak: document.body.textContent.includes("[object HTML"),
    motion: nodes.some(n => {const c = getComputedStyle(n);return c.animationName !== "none" || c.transitionDuration !== "0s";}),
    failedImages: [...document.images].filter(n => !n.complete || !n.naturalWidth).length,
    edges,
  };
}

function checkWorkbench(snapshot) {
  const b = snapshot.boxes, stage = b["v-stage"];
  assert.equal(snapshot.paperViewport.position, "relative", "paper viewport stays inside the workbench");
  for (const dimension of ["x", "y", "width", "height"]) {
    assert.ok(Math.abs(b["v-paper-scroll"][dimension] - stage[dimension]) < .02, "paper viewport differs from workbench on " + dimension);
  }
  for (const side of ["v-title", "v-left", "v-right", "v-top", "v-footer", "v-icon-rail", "v-page-rail"]) {
    const panel = b[side];
    if (!panel.visible) continue;
    const width = Math.max(0, Math.min(stage.x + stage.width, panel.x + panel.width) - Math.max(stage.x, panel.x));
    const height = Math.max(0, Math.min(stage.y + stage.height, panel.y + panel.height) - Math.max(stage.y, panel.y));
    assert.ok(width * height < .02, side + " overlaps the score workbench");
  }
}

function checkSnapshot(record) {
  const { snapshot: s, expected: e } = record;
  const b = s.boxes, near = (a, value) => assert.ok(Math.abs(a - value) < 1.1, `${s.scene}/${s.variant}: ${a} differs from ${value}`);
  const blue = "rgb(82, 143, 238)", clear = "rgba(0, 0, 0, 0)";
  assert.equal(s.scene, record.id); assert.equal(s.variant, record.variant);
  near(b["v-title"].height, 34); near(b["v-icon-rail"].width, 44); near(b["v-page-rail"].width, 40);
  near(b["v-top"].height, e.topContributed && e.topOpen ? 36 : 0);
  near(b["v-footer"].height, 60 + (e.voiceOpen ? Math.max(80, Math.min(e.voiceHeight, 320, s.viewport.height - 394 - (e.topContributed && e.topOpen ? 36 : 0))) : 0));
  assert.ok(b["v-stage"].width >= 479.9 && b["v-stage"].height >= 299.9, "minimum stage");
  assert.ok(b["visual-shell"].width <= Math.max(1024, s.viewport.width) + 1, "shell fits supported design canvas");
  if (e.leftOpen) assert.ok(b["v-left"].width >= 199.9, "left sidebar retains a readable range");
  if (e.rightOpen) assert.ok(b["v-right"].width >= 259.9, "right sidebar retains minimum width");
  assert.equal(b["v-paper"].background, "rgb(255, 255, 255)");
  assert.ok(Math.abs(b["v-paper"].height / b["v-paper"].width - 990 / 700) < 0.002, "paper ratio preserved");
  if (record.initialView && e.zoom === "fit") {
    const paper = b["v-paper"], stage = b["v-stage"];
    assert.ok(paper.x >= stage.x + 19.9 && paper.y >= stage.y + 19.9, "initial fit origin is inside the workbench");
    assert.ok(paper.x + paper.width <= stage.x + stage.width - 19.9 && paper.y + paper.height <= stage.y + stage.height - 19.9, "initial fit page is fully visible");
  }
  if (record.initialView || record.resizedView) {
    assert.ok(Math.abs(b["v-paper"].x + b["v-paper"].width / 2 - s.viewport.width / 2) < .02, "paper is not centered in the current window");
  }
  assert.equal(s.composerParent, "v-page-content"); assert.equal(s.composerInLeft, false); assert.equal(s.presetRows, 0);
  assert.equal(s.composerInRight, true); assert.equal(s.composerInStage, false);
  assert.equal(s.composerCount, 1, "one special layout component in the framework");
  assert.equal(s.composerHasScoreAssembly, false, "layout component does not contain score composition");
  assert.equal(s.composerControls.length, 7, "layout component exposes region and arrangement controls");
  assert.equal(s.composerControls.slice(0, 4).map(control => control.label).join("|"), "顶部|左栏|右栏|底部");
  assert.ok(s.leftLabel.includes("左侧栏"), "left sidebar range is explicitly labeled");
  assert.equal(s.arrangement, e.arrangement ?? "balanced");
  assert.equal(s.sizeControls.length, 3, "layout page exposes left/right/bottom dimensions");
  assert.equal(b["v-composer"].visible, e.rightOpen && e.pageCount > 3 && e.rightPage === 3);
  if (b["v-composer"].visible) {
    near(b["v-composer"].width, s.composerAvailableWidth);
    assert.ok(b["v-composer"].x >= b["v-page"].x && b["v-composer"].x + b["v-composer"].width <= b["v-page"].x + b["v-page"].width + 1, "layout occupies right page");
  }
  checkWorkbench(s);
  assert.equal(b["v-left"].background, b["v-right"].background, "matching sidebar foundations");
  assert.equal(b["v-left-surface"].background, b["v-page"].background, "shared sidebar surface");
  assert.equal(b["v-left-surface"].backgroundImage, "none");
  assert.equal(b["v-region-header"].backgroundImage, "none");
  if (e.leftOpen) near(b["v-region-header"].height, 32);
  for (const module of s.modules) assert.equal(module.edge, module.editing === "true" && module.selected === "true" ? blue : clear);
  for (const edge of s.edges) assert.ok([blue, "rgb(44, 103, 197)", "rgb(143, 183, 255)"].includes(edge.color), "unexpected visible border: " + JSON.stringify(edge));
  for (const layer of s.layers) assert.ok(layer.x >= 7 && layer.y >= 41 && layer.x + layer.width <= s.viewport.width - 7 && layer.y + layer.height <= s.viewport.height - 7, "overlay within safe area");
  assert.equal(s.ghosts, e.rightOpen ? Math.min(2, Math.max(0, e.pageCount - e.rightPage - 1)) : 0);
  assert.equal(s.unnamed, 0); assert.equal(s.objectLeak, false); assert.equal(s.motion, false); assert.equal(s.failedImages, 0);
  if (record.id === "S01") { assert.equal(s.moduleCount, 0); assert.equal(s.defaultClutter, false); }
  return true;
}

function validateEvidence() {
  const report = JSON.parse(fs.readFileSync(path.resolve(toolDirectory, "../evidence/revision-02/review.json"), "utf8"));
  assert.deepEqual(report.sourceHashes, sourceHashes(), "evidence is stale relative to preview source");
  assert.equal(report.scenarios.length, 96);
  for (const record of [...report.scenarios, ...report.viewports]) checkSnapshot(record);
  assert.ok(report.interactions.length >= 7 && report.interactions.every(check => check.passed), "interaction evidence incomplete");
  const cameraChecks = report.interactions.filter(check => check.paperBefore && check.paperAfter);
  assert.ok(cameraChecks.length >= 16, "absolute paper position interaction evidence incomplete");
  for (const check of cameraChecks) {
    assert.equal(check.workbenchOverlap, false, check.name + ": sidebar overlaps the workbench");
    checkWorkbench(check.snapshotAfter);
    assert.ok(Math.abs(check.paperBefore.y - check.paperAfter.y) < .02, check.name + ": paper moved on y");
    if (check.explicitZoom) {
      assert.ok(Math.abs(check.paperBefore.x + check.paperBefore.width / 2 - check.paperAfter.x - check.paperAfter.width / 2) < .02, check.name + ": zoom changed paper center");
    } else assert.ok(Math.abs(check.paperBefore.x - check.paperAfter.x) < .02, check.name + ": paper moved on x");
    if (!check.explicitZoom) for (const dimension of ["width", "height"]) assert.ok(Math.abs(check.paperBefore[dimension] - check.paperAfter[dimension]) < .02, check.name + ": paper size changed");
  }
  const recovery = report.interactions.find(check => check.name === "recover both scroll axes after zoom and panel close");
  assert.ok(recovery?.passed && recovery.userScrollBefore.scrollX > 0 && recovery.userScrollBefore.scrollY > 0, "two-axis recovery was not exercised");
  assert.equal(recovery.userScrollAfter.scrollX, 0); assert.equal(recovery.userScrollAfter.scrollY, 0);
  assert.ok(report.viewports.filter(record => record.resizedView).length >= 5, "live window resize centering evidence incomplete");
  assert.equal(report.failures.length, 0); assert.equal(report.passed, true);
  return { passed: true, evidence: "revision-02/review.json", scenarios: report.scenarios.length, viewports: report.viewports.length, interactions: report.interactions.length, mode: "Validate saved CUA evidence; does not launch a browser" };
}

export { sourceHashes, readDom, checkSnapshot, validateEvidence };
