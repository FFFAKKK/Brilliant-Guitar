import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createFrameRegionPresentation } from "../src/host/frame-region-presentation.js";
import { createAnimationService } from "../src/runtime/animation-service.js";
import { applyWorkspaceShellGeometry } from "../src/shell/workspace-shell-geometry.js";
import { createStageViewport } from "../src/host/stage-viewport.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const sides = ["left", "right", "top", "voice"];
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
// The frame keeps one static canvas beneath an in-flight reveal. Its visible
// viewport is the canvas minus the complementary clip, not its bounding box.
function visibleStage(stage) {
  const rect = stage.getBoundingClientRect();
  const inset = stage.style.clipPath.match(/^inset\((.*?)\)$/)?.[1].split(/\s+/).map(parseFloat) ?? [0, 0, 0, 0];
  const [top, right, bottom, left] = inset;
  return { x: rect.x + left, y: rect.y + top, width: rect.width - left - right, height: rect.height - top - bottom };
}
function fixture({ provider = true, frameClock = false } = {}) {
  const pending = new Map(); let frameId = 0;
  if (frameClock) {
    window.requestAnimationFrame = callback => { pending.set(++frameId, callback); return frameId; };
    window.cancelAnimationFrame = id => pending.delete(id);
    window.getComputedStyle = node => node.style;
  }
  const root = document.createElement("main"), shell = document.createElement("div"), stage = document.createElement("main");
  document.body.append(root); root.append(shell); shell.append(stage);
  const value = key => parseFloat(shell.style.getPropertyValue(key)) || 0;
  const stageBox = () => ({ x: 40 + value("--left-w"), y: 34 + value("--visible-top"),
    width: 1360 - value("--left-w") - value("--right-w"), height: 794 - value("--visible-top") - value("--voice-content") });
  stage.getBoundingClientRect = () => stage.style.position === "fixed" ? {
    x: parseFloat(stage.style.left), y: parseFloat(stage.style.top), width: parseFloat(stage.style.width), height: parseFloat(stage.style.height),
  } : stageBox();
  const regions = Object.fromEntries(sides.map(side => {
    const element = document.createElement("section"), content = document.createElement("div"); shell.append(element); element.append(content);
    element.getBoundingClientRect = () => {
      const s = stageBox();
      return side === "left" ? { x: 40, y: s.y, width: value("--left-w"), height: s.height }
        : side === "right" ? { x: s.x + s.width, y: s.y, width: value("--right-w"), height: s.height }
        : side === "top" ? { x: 0, y: 34, width: 1440, height: value("--visible-top") }
        : { x: 0, y: s.y + s.height + 32, width: 1440, height: value("--voice-content") };
    };
    return [side, { element, content }];
  }));
  const jobs = [], issues = [];
  const service = createAnimationService({ provider: provider ? { start(args) { const control = { stop() {} }; jobs.push({ ...args, control }); return control; } } : null,
    onIssue: issue => issues.push(issue) });
  let state = { leftOpen: true, rightOpen: true, topOpen: true, voiceOpen: true,
    leftWidth: 260, rightWidth: 260, topHeight: 120, voiceHeight: 120, arrangement: "balanced", currentPage: "layout" };
  let viewport, settlements = 0;
  const frame = createFrameRegionPresentation({ root: shell, workspaceRoot: root, regions, stage, service,
    onGeometrySettled(settle) { settlements++; viewport?.preserve(() => {
      settle?.();
      applyWorkspaceShellGeometry(shell, frame.beforeRender(state) ?? state); frame.settleGeometry();
    }); } });
  function render(patch = {}, options = {}) {
    state = { ...state, ...patch };
    const projected = frame.beforeRender(state, options) ?? state;
    applyWorkspaceShellGeometry(shell, projected);
    frame.update(state, options);
  }
  render();
  const scroll = document.createElement("div"), paper = document.createElement("div"); stage.append(scroll); scroll.append(paper);
  scroll.scrollLeft = 17.5; scroll.scrollTop = 91.5;
  Object.defineProperties(scroll, { clientWidth: { get: () => stage.getBoundingClientRect().width }, clientHeight: { get: () => stage.getBoundingClientRect().height } });
  paper.getBoundingClientRect = () => { const s = stage.getBoundingClientRect(), width = value("--paper-width"); return {
    x: s.x + value("--paper-left") + value("--paper-pan-x") - scroll.scrollLeft,
    y: s.y + value("--paper-top") + value("--paper-pan-y") - scroll.scrollTop, width, height: width * 990 / 700 }; };
  viewport = createStageViewport({ shell, stage, scroll, paper }); viewport.initialize(); viewport.zoom(100);
  return { root, shell, stage, regions, jobs, issues, service, frame, paper,
    tick() { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback()); },
    state: () => state, settlements: () => settlements,
    update(patch, options = { pointer: true }) { viewport.preserve(() => render(patch, options)); },
    dispose() { frame.dispose(); viewport.dispose(); service.dispose(); root.remove(); } };
}

for (const side of sides) test(`${side}: retain complete exit lane until motion ends; preserve paper in both geometry phases`, () => withTestDocument(async () => {
  const f = fixture();
  try {
    const region = f.regions[side], originalContent = region.content, before = f.stage.getBoundingClientRect(), paper = f.paper.getBoundingClientRect();
    f.update({ [side + "Open"]: false });
    assert.equal(f.state()[side + "Open"], false, "business acceptance does not wait for presentation");
    assert.deepEqual(visibleStage(f.stage), before, "outgoing region keeps its original safe lane, rather than vanishing into permanent chrome");
    assert.deepEqual(f.paper.getBoundingClientRect(), paper);
    assert.equal(region.element.hidden, false); assert.equal(region.element.inert, true);
    assert.equal(region.element.style.clipPath, "inset(0px)", "full original content remains visible; never a 12px remnant");
    const x = parseFloat(region.element.style.left), y = parseFloat(region.element.style.top);
    const width = parseFloat(region.element.style.width), height = parseFloat(region.element.style.height);
    assert.ok(side === "left" ? x + width <= before.x : side === "right" ? x >= before.x + before.width
      : side === "top" ? y + height <= before.y : y >= before.y + before.height, "exit plane cannot overlap the workbench");
    const exit = f.jobs.at(-1); assert.equal(exit.settings.duration, .28); assert.equal(exit.settings.fadeDuration, .28);
    exit.write({ ...exit.from, opacity: .55 }); assert.equal(region.content.style.opacity, "0.55");
    assert.deepEqual(visibleStage(f.stage), before); assert.deepEqual(f.paper.getBoundingClientRect(), paper);
    // An unrelated same-geometry update must not shorten an active exit.
    f.update({ adjusting: true }, { pointer: false }); assert.deepEqual(visibleStage(f.stage), before);
    exit.complete(); await flush();
    assert.equal(region.element.hidden, true); assert.equal(region.element.style.position, "");
    assert.notDeepEqual(f.stage.getBoundingClientRect(), before); assert.deepEqual(f.paper.getBoundingClientRect(), paper);
    assert.equal(region.content, originalContent); assert.equal(f.settlements(), 1);
    f.update({ [side + "Open"]: true });
    const enter = f.jobs.at(-1); assert.equal(enter.settings.duration, .30); assert.equal(enter.settings.fadeDuration, .30);
    assert.deepEqual(f.paper.getBoundingClientRect(), paper); enter.complete(); await flush();
  } finally { f.dispose(); }
}));

test("simultaneous exits reserve each lane independently and release without paper movement", () => withTestDocument(async () => {
  const f = fixture();
  try {
    const before = f.stage.getBoundingClientRect(), paper = f.paper.getBoundingClientRect();
    f.update(Object.fromEntries(sides.map(side => [side + "Open", false])));
    assert.equal(f.jobs.length, 4); assert.deepEqual(visibleStage(f.stage), before);
    f.jobs[0].complete(); await flush();
    assert.equal(visibleStage(f.stage).x, 40); assert.equal(visibleStage(f.stage).y, before.y);
    assert.equal(visibleStage(f.stage).height, before.height); assert.deepEqual(f.paper.getBoundingClientRect(), paper);
    for (const job of f.jobs.slice(1)) job.complete(); await flush();
    assert.equal(f.stage.getBoundingClientRect().width, 1360); assert.equal(f.stage.getBoundingClientRect().height, 794);
    assert.deepEqual(f.paper.getBoundingClientRect(), paper); assert.equal(f.service.snapshot().active, 0);
  } finally { f.dispose(); }
}));

test("rapid reopen samples current content; stale close cannot release the reopened lane", () => withTestDocument(async () => {
  const f = fixture({ frameClock: true });
  try {
    const before = f.stage.getBoundingClientRect(), paper = f.paper.getBoundingClientRect();
    f.update({ leftOpen: false }); const exit = f.jobs[0]; exit.write({ x: -5, y: 0, opacity: .6 }); f.tick();
    const reversing = visibleStage(f.stage);
    f.update({ leftOpen: true }); const enter = f.jobs[1]; assert.deepEqual(enter.from, { x: -5, y: 0, opacity: .6 });
    exit.complete(); exit.failed(new Error("retired")); await flush();
    assert.equal(f.regions.left.element.hidden, false); assert.deepEqual(visibleStage(f.stage), reversing);
    assert.deepEqual(f.paper.getBoundingClientRect(), paper); assert.equal(f.issues.length, 0);
    enter.complete(); await flush(); assert.equal(f.settlements(), 1, "entry now releases its temporary workbench canvas through the preservation owner");
    f.update({ leftOpen: false }); f.jobs.at(-1).complete(); await flush();
    assert.equal(f.stage.getBoundingClientRect().x, 40); assert.equal(f.settlements(), 2);
  } finally { f.dispose(); }
}));

for (const side of sides) test(`${side}: opening retains the first painted workbench and crops only with native progress`, () => withTestDocument(async () => {
  const f = fixture({ frameClock: true });
  try {
    const final = visibleStage(f.stage);
    f.update({ [side + "Open"]: false }); f.jobs.at(-1).complete(); await flush();
    const closed = visibleStage(f.stage), paper = f.paper.getBoundingClientRect();
    f.update({ [side + "Open"]: true });
    assert.deepEqual(visibleStage(f.stage), closed, "transparent entry cannot blank its complete lane first");
    const entry = f.jobs.at(-1);
    for (const alpha of [.25, .5, .75]) {
      entry.write({ x: entry.from.x * (1 - alpha), y: entry.from.y * (1 - alpha), opacity: alpha }); f.tick();
      const expected = Object.fromEntries(Object.keys(closed).map(key => [key, closed[key] + (final[key] - closed[key]) * alpha]));
      assert.deepEqual(visibleStage(f.stage), expected, "region and workbench have complementary reveal boundaries");
      assert.deepEqual(f.paper.getBoundingClientRect(), paper, "crop never moves the paper");
    }
    entry.complete(); await flush();
    assert.deepEqual(visibleStage(f.stage), final); assert.deepEqual(f.paper.getBoundingClientRect(), paper);
    assert.equal(f.stage.style.position, ""); assert.equal(f.stage.style.clipPath, "");
  } finally { f.dispose(); }
}));

test("simultaneous entries crop independently, preserve paper and release one completed lane without stopping others", () => withTestDocument(async () => {
  const f = fixture({ frameClock: true });
  try {
    f.update(Object.fromEntries(sides.map(side => [side + "Open", false])));
    for (const exit of f.jobs) exit.complete(); await flush();
    const closed = visibleStage(f.stage), paper = f.paper.getBoundingClientRect();
    f.update(Object.fromEntries(sides.map(side => [side + "Open", true])));
    assert.deepEqual(visibleStage(f.stage), closed);
    const entries = f.jobs.slice(-4);
    entries[0].write({ ...entries[0].from, opacity: .5 }); entries[1].write({ ...entries[1].from, opacity: .25 }); f.tick();
    assert.equal(visibleStage(f.stage).x, closed.x + 130);
    assert.equal(visibleStage(f.stage).width, closed.width - 130 - 65);
    entries[0].complete(); await flush();
    assert.equal(visibleStage(f.stage).x, closed.x + 260);
    assert.equal(visibleStage(f.stage).width, closed.width - 260 - 65);
    assert.deepEqual(f.paper.getBoundingClientRect(), paper);
    for (const entry of entries.slice(1)) entry.complete(); await flush();
    assert.equal(f.stage.style.position, ""); assert.equal(f.stage.style.clipPath, "");
    assert.deepEqual(f.paper.getBoundingClientRect(), paper);
  } finally { f.dispose(); }
}));

test("closing during entry continues the current workbench boundary and rejects late entry completion", () => withTestDocument(async () => {
  const f = fixture({ frameClock: true });
  try {
    f.update({ rightOpen: false }); f.jobs.at(-1).complete(); await flush();
    const paper = f.paper.getBoundingClientRect();
    f.update({ rightOpen: true }); const entry = f.jobs.at(-1);
    entry.write({ x: 14.4, y: 0, opacity: .4 }); f.tick();
    const visible = visibleStage(f.stage);
    f.update({ rightOpen: false }); const exit = f.jobs.at(-1);
    assert.deepEqual(visibleStage(f.stage), visible);
    assert.equal(exit.from.opacity, .4);
    entry.complete(); entry.failed(new Error("stale")); await flush();
    assert.deepEqual(visibleStage(f.stage), visible); assert.deepEqual(f.paper.getBoundingClientRect(), paper);
    exit.write({ x: 20, y: 0, opacity: .2 }); f.tick();
    assert.ok(visibleStage(f.stage).width > visible.width);
    exit.complete(); await flush();
    assert.equal(f.stage.style.position, ""); assert.equal(f.stage.style.clipPath, "");
    assert.equal(f.regions.right.element.hidden, true); assert.deepEqual(f.paper.getBoundingClientRect(), paper);
    assert.equal(f.issues.length, 0);
  } finally { f.dispose(); }
}));

for (const interrupt of ["resize", "dimensions", "page", "reduced", "none", "quiet", "provider", "failure", "hidden"]) {
  test(`${interrupt}: release retained close lane and reject late frames`, () => withTestDocument(async () => {
    const f = fixture();
    try {
      const paper = f.paper.getBoundingClientRect(); f.update({ rightOpen: false }); const exit = f.jobs[0];
      if (interrupt === "resize") window.dispatchEvent(new Event("resize"));
      if (interrupt === "dimensions") f.update({ leftWidth: 300 });
      if (interrupt === "page") f.update({ currentPage: "other" });
      if (["reduced", "none"].includes(interrupt)) f.service.setPolicy({ mode: interrupt });
      if (interrupt === "quiet") f.service.setPolicy({ profile: "quiet" });
      if (interrupt === "provider") f.service.replaceProvider(null);
      if (interrupt === "failure") exit.failed(new Error("current"));
      if (interrupt === "hidden") { f.root.hidden = true; document.dispatchEvent(new Event("visibilitychange")); }
      await flush();
      assert.equal(f.regions.right.element.hidden, true); assert.equal(f.regions.right.element.style.position, "");
      assert.equal(f.shell.style.getPropertyValue("--right-w"), "0px"); assert.equal(f.service.snapshot().active, 0);
      assert.deepEqual(f.paper.getBoundingClientRect(), paper);
      const settled = f.stage.getBoundingClientRect(); exit.write({ x: 99, opacity: 1 }); exit.complete(); await flush();
      assert.deepEqual(f.stage.getBoundingClientRect(), settled); assert.equal(f.regions.right.element.hidden, true);
    } finally { f.dispose(); }
  }));
}

for (const side of sides) for (const interrupt of ["resize", "hidden", "none"]) {
  test(`${side}: entry interrupted by ${interrupt} releases the canvas without shifting paper`, () => withTestDocument(async () => {
    const f = fixture({ frameClock: true });
    try {
      f.update({ [side + "Open"]: false }); f.jobs.at(-1).complete(); await flush();
      const paper = f.paper.getBoundingClientRect();
      f.update({ [side + "Open"]: true });
      const entry = f.jobs.at(-1);
      entry.write({ x: entry.from.x * .6, y: entry.from.y * .6, opacity: .4 }); f.tick();
      assert.deepEqual(f.paper.getBoundingClientRect(), paper);
      if (interrupt === "resize") window.dispatchEvent(new Event("resize"));
      if (interrupt === "hidden") { f.root.hidden = true; document.dispatchEvent(new Event("visibilitychange")); }
      if (interrupt === "none") f.service.setPolicy({ mode: "none" });
      await flush();
      assert.equal(f.state()[side + "Open"], true, "reset settles presentation without changing accepted layout");
      assert.equal(f.service.snapshot().active, 0);
      assert.equal(f.stage.style.position, ""); assert.equal(f.stage.style.clipPath, "");
      assert.equal(f.regions[side].element.hidden, false);
      assert.deepEqual(f.paper.getBoundingClientRect(), paper, "reset must use the original preservation owner");
      entry.write({ ...entry.from, opacity: .9 }); entry.complete(); entry.failed(new Error("retired entry")); await flush();
      f.tick();
      assert.deepEqual(f.paper.getBoundingClientRect(), paper, "late provider/sampler callbacks cannot shift the settled view");
      assert.equal(f.stage.style.position, ""); assert.equal(f.stage.style.clipPath, "");
      assert.equal(f.issues.length, 0);
      if (interrupt === "hidden") { f.root.hidden = false; document.dispatchEvent(new Event("visibilitychange")); await flush(); }
      assert.deepEqual(f.paper.getBoundingClientRect(), paper, "returning must keep the reading position");
    } finally { f.dispose(); }
  }));
}

test("no provider / keyboard stay static; disposal cannot schedule a late geometry render", () => withTestDocument(async () => {
  const staticFrame = fixture({ provider: false });
  try {
    staticFrame.update({ leftOpen: false }); await flush();
    assert.equal(staticFrame.regions.left.element.hidden, true); assert.equal(staticFrame.shell.style.getPropertyValue("--left-w"), "0px");
  } finally { staticFrame.dispose(); }
  const f = fixture();
  f.update({ topOpen: false }, { pointer: false }); assert.equal(f.jobs.length, 0);
  f.update({ rightOpen: false }); const exit = f.jobs[0]; f.dispose(); exit.complete(); await flush();
  assert.equal(f.settlements(), 0); assert.equal(f.service.snapshot().components, 0); assert.equal(f.service.snapshot().targets, 0);
}));

test("runtime routes asynchronous presentation release through the existing paper-preservation owner", () => {
  const runtime = readFileSync(new URL("../src/host/workspace-runtime.js", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/shell/visual-workbench.js", import.meta.url), "utf8");
  assert.match(runtime, /onGeometrySettled:\s*settle\s*=>\s*\{\s*if \(!disposed && stage\) stage\.preserve\(\(\) => \{\s*settle\?\.\(\);\s*shell\.settleGeometry\(layout\.snapshot\(\)\)/);
  assert.match(shell, /applyWorkspaceShellGeometry\(shell,\s*regionPresentation\?\.beforeRender\(state, \{ pointer \}\) \?\? state\)/);
});
