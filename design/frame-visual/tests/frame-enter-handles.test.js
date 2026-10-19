import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createFrameRegionPresentation, FRAME_REGION_ANIMATIONS } from "../src/host/frame-region-presentation.js";
import { createFrameEdgeGestures } from "../src/host/frame-edge-gestures.js";
import { createAnimationService } from "../src/runtime/animation-service.js";
import { createMotionAnimationProvider } from "../src/runtime/motion-animation-provider.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const sides = ["left", "right", "top", "voice"];
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function nativeFixture() {
  const root = document.createElement("main"), stage = document.createElement("main"); document.body.append(root); root.append(stage);
  stage.getBoundingClientRect = () => ({ x: 300, y: 154, width: 840, height: 586 });
  const tracks = [], issues = [];
  const regions = Object.fromEntries(sides.map(side => {
    const element = document.createElement("section"), content = document.createElement("div"); root.append(element); element.append(content);
    element.getBoundingClientRect = () => side === "left" ? { x: 40, y: 154, width: 260, height: 586 }
      : side === "right" ? { x: 1140, y: 154, width: 260, height: 586 }
      : side === "top" ? { x: 0, y: 34, width: 1440, height: 120 } : { x: 0, y: 772, width: 1440, height: 88 };
    content.animate = (keyframes, options) => {
      const track = { node: content, keyframes, options, currentTime: 0, playbackRate: 1, playState: "running", cancels: 0,
        cancel() { this.cancels++; }, effect: { getComputedTiming: () => ({ duration: options.duration }) },
        finish() { this.currentTime = options.duration; this.playState = "finished"; this.onfinish?.(); } };
      tracks.push(track); return track;
    };
    return [side, { element, content }];
  }));
  const service = createAnimationService({ provider: createMotionAnimationProvider(), onIssue: issue => issues.push(issue) });
  const frame = createFrameRegionPresentation({ root, workspaceRoot: root, regions, stage, service });
  let state = { leftOpen: false, rightOpen: false, topOpen: false, voiceOpen: false, leftWidth: 260, rightWidth: 260, topHeight: 120, voiceHeight: 120, arrangement: "balanced", currentPage: "layout" };
  frame.update(state);
  return { root, tracks, issues, regions, service, frame,
    update(patch, options = { pointer: true }) { state = { ...state, ...patch }; frame.beforeRender(state, options); frame.update(state, options); },
    dispose() { frame.dispose(); service.dispose(); root.remove(); } };
}
for (const side of sides) test(`${side}: real Motion provider retains both native opening tracks until actual completion`, () => withTestDocument(async () => {
  const f = nativeFixture();
  try {
    f.update({ [side + "Open"]: true }); await flush();
    assert.equal(f.service.snapshot().active, 1); assert.equal(f.tracks.length, 2);
    assert.ok(f.tracks.every(track => !track.cancels && track.options.duration === 300));
    const opacity = f.tracks.find(track => track.keyframes.opacity); assert.deepEqual(opacity.keyframes.opacity, [0, 1]);
    const move = f.tracks.find(track => track.keyframes.transform);
    assert.match(move.keyframes.transform[0], /(?:-?24px)/); assert.equal(move.options.easing, "cubic-bezier(0.77, 0, 0.175, 1)");
    opacity.finish(); await flush(); assert.equal(f.service.snapshot().active, 1, "one native track cannot settle the whole region early");
    move.finish(); await flush(); assert.equal(f.service.snapshot().active, 0); assert.equal(f.regions[side].content.style.opacity, "1");
    assert.equal(f.issues.length, 0);
  } finally { f.dispose(); }
}));

test("selecting a different page while opening a closed right region still plays native entry", () => withTestDocument(async () => {
  const f = nativeFixture();
  try {
    f.update({ rightOpen: true, currentPage: "another-page" }); await flush();
    assert.equal(f.tracks.length, 2, "page navigation must not discard the simultaneous region opening");
    assert.equal(f.service.snapshot().active, 1);
    f.update({ currentPage: "third-page" }); await flush();
    assert.equal(f.service.snapshot().active, 0, "switching an already-open page stays static");
    assert.equal(f.tracks.length, 2); assert.equal(f.regions.right.element.hidden, false);
  } finally { f.dispose(); }
}));

test("dimensions or non-pointer page opening stay static; reduction and reversal cancel native entry", () => withTestDocument(async () => {
  const f = nativeFixture();
  try {
    f.update({ rightOpen: true, currentPage: "other" }, { pointer: false }); assert.equal(f.tracks.length, 0);
    f.update({ rightOpen: false }); for (const track of f.tracks) track.finish(); await flush();
    const count = f.tracks.length; f.update({ rightOpen: true, rightWidth: 300 }); assert.equal(f.tracks.length, count);
    f.update({ rightOpen: false }, { pointer: false }); f.update({ rightOpen: true }); assert.equal(f.service.snapshot().active, 1);
    f.service.setPolicy({ mode: "reduced" }); await flush(); assert.equal(f.service.snapshot().active, 0);
    f.service.setPolicy({ mode: "full" }); f.update({ rightOpen: false }, { pointer: false }); f.update({ rightOpen: true });
    const pending = f.tracks.slice(-2); f.update({ rightOpen: false }); await flush();
    assert.ok(pending.every(track => track.cancels > 0));
    for (const track of pending) track.finish(); await flush(); assert.equal(f.regions.right.element.inert, true);
  } finally { f.dispose(); }
}));

function bezierProgress(x, [x1, y1, x2, y2]) {
  const value = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let lo = 0, hi = 1; for (let i = 0; i < 45; i++) { const mid = (lo + hi) / 2; if (value(mid, x1, x2) < x) lo = mid; else hi = mid; }
  return value((lo + hi) / 2, y1, y2);
}
test("entry retains visible travel through the middle instead of completing most movement in its first quarter", () => {
  const ease = FRAME_REGION_ANIMATIONS.definitions["content-transition"].variants.enter.ease;
  assert.ok(bezierProgress(.25, ease) < .3, "strong ease-out was almost complete before the user could see the motion");
  assert.ok(bezierProgress(.75, ease) > .8); assert.equal(bezierProgress(1, ease).toFixed(6), "1.000000");
});

function handleFixture(width, menuRight) {
  const root = document.createElement("main"); document.body.append(root); const edges = {}, grips = new Map();
  let offset = 0;
  root.getBoundingClientRect = () => ({ left: offset, right: offset + width, width, top: 0, height: 900 });
  for (const side of sides) { const host = document.createElement("div"), grip = document.createElement("button"); root.append(host, grip); edges[side] = host; grips.set(side, grip); }
  const menu = document.createElement("div"); menu.className = "v-title-start"; edges.top.append(menu);
  menu.getBoundingClientRect = () => ({ left: offset + 8, right: offset + menuRight, width: menuRight - 8 });
  let state = { leftOpen: false, rightOpen: false, topOpen: false, voiceOpen: false };
  const gestures = createFrameEdgeGestures({ root, workspaceRoot: root, edges, grips, layout: { snapshot: () => state }, execute() {}, pointerPresentation: {} });
  return { root, menu, gestures,
    measure(w, end, left = 0) { width = w; menuRight = end; offset = left; },
    setGeometry(w, end, left = 0) { this.measure(w, end, left); window.dispatchEvent(new Event("resize")); },
    dispose() { gestures.dispose(); root.remove(); } };
}

test("horizontal anchor is shell-relative, survives zero/invalid geometry, and never crosses a full menu", () => withTestDocument(() => {
  const f = handleFixture(640, 350);
  try {
    f.setGeometry(640, 350, 120); assert.equal(f.root.style.getPropertyValue("--frame-horizontal-handle-x"), "390px");
    f.setGeometry(0, 350); assert.equal(f.root.style.getPropertyValue("--frame-horizontal-handle-x"), "390px");
    f.setGeometry(NaN, 350); assert.equal(f.root.style.getPropertyValue("--frame-horizontal-handle-x"), "390px");
    f.setGeometry(300, 350); assert.equal(f.root.style.getPropertyValue("--frame-horizontal-handle-width"), "0px");
    assert.equal(f.root.style.getPropertyValue("--frame-horizontal-handle-left"), "300px");
    f.menu.remove(); f.setGeometry(640, 350); assert.equal(f.root.style.getPropertyValue("--frame-horizontal-handle-x"), "320px");
  } finally { f.dispose(); }
}));

test("menu/root size observation repositions both anchors and disconnects with the gesture owner", () => withTestDocument(() => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver"), observers = [];
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class {
    constructor(callback) { this.callback = callback; this.nodes = []; this.disconnected = false; observers.push(this); }
    observe(node) { this.nodes.push(node); } disconnect() { this.disconnected = true; }
  } });
  let f;
  try {
    f = handleFixture(1440, 350); assert.equal(observers.length, 1); const observer = observers[0];
    assert.deepEqual(observer.nodes, [f.root, f.menu]);
    f.measure(640, 400); observer.callback(); assert.equal(f.root.style.getPropertyValue("--frame-horizontal-handle-x"), "440px");
    f.gestures.dispose(); assert.equal(observer.disconnected, true);
    f.measure(1600, 350); observer.callback(); assert.equal(f.root.style.getPropertyValue("--frame-horizontal-handle-x"), "440px");
  } finally {
    f?.dispose(); if (previous) Object.defineProperty(globalThis, "ResizeObserver", previous); else delete globalThis.ResizeObserver;
  }
}));
for (const [width, menuRight, expectedX, expectedWidth] of [[1440, 350, 720, 64], [640, 350, 390, 64], [400, 350, 379, 42]]) {
  test(`horizontal handles use one menu-safe anchor at width ${width}`, () => withTestDocument(() => {
    const f = handleFixture(width, menuRight);
    try {
      assert.equal(f.root.style.getPropertyValue("--frame-horizontal-handle-x"), expectedX + "px");
      assert.equal(f.root.style.getPropertyValue("--frame-horizontal-handle-width"), expectedWidth + "px");
      const left = parseFloat(f.root.style.getPropertyValue("--frame-horizontal-handle-left"));
      assert.ok(left >= menuRight + 8); assert.ok(left + expectedWidth <= width);
      f.setGeometry(1600, 350); assert.equal(f.root.style.getPropertyValue("--frame-horizontal-handle-x"), "800px");
      f.gestures.dispose(); f.setGeometry(900, 350); assert.equal(f.root.style.getPropertyValue("--frame-horizontal-handle-x"), "800px", "disposed resize cannot write an old anchor");
    } finally { f.dispose(); }
  }));
}

test("open and closed top/bottom handles share the anchor and boundary offsets", () => {
  const css = readFileSync(new URL("../styles/frame-edge-handles.css", import.meta.url), "utf8");
  assert.match(css, /\.v-edge-handle\[data-edge="top"\][^{]*\{[^}]*position: absolute;[^}]*left: var\(--frame-horizontal-handle-left/);
  assert.match(css, /\[data-edge="voice"\][^{]*\{[^}]*left: var\(--frame-horizontal-handle-left/);
  assert.match(css, /\.v-top[^{}]*> \.v-grip::after,[^{}]*\.v-voice-header[^{}]*> \.v-grip::after[^{}]*\{[^}]*left: calc\(var\(--frame-horizontal-handle-x, 50%\) - 10px\);[^}]*top: 3px;/s);
});
