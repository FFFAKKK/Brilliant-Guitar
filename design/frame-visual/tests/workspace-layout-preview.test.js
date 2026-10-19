import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceLayoutVisual } from "../src/shell/workspace-layout-visual.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { LAYOUT_PREVIEW_SHAPE } from "../src/features/workspace-layout-motion-recipes.js";
import { withTestDocument } from "./support/dom-test-environment.js";

function fixture({ deferred = false } = {}) {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  const accepted = () => ({ ...store.read.snapshot(), editing: false });
  const view = createWorkspaceLayoutVisual({ state: accepted(), begin() {},
    region: side => deferred ? queueMicrotask(() => store.toggleRegion(side)) : store.toggleRegion(side),
    resize: (side, value) => store.resize(side, value), arrange: mode => store.arrange(mode) });
  const stop = store.read.subscribe(() => view.update(accepted()));
  const canvas = view.element.querySelector(".v-layout-map-canvas");
  canvas.clientWidth = 280; canvas.clientHeight = 144;
  document.body.append(view.element); view.update(accepted());
  return { store, view, canvas, accepted, dispose() { stop(); view.dispose(); } };
}
function click(node) {
  const event = new Event("click"); Object.defineProperty(event, "detail", { value: 1 }); node.dispatchEvent(event);
}
function recordingPort() {
  const calls = [];
  return { calls, port: { place: request => calls.push(["place", request]),
    play: request => { calls.push(["play", request]); return { finished: Promise.resolve({ status: "completed" }) }; },
    dispose: () => calls.push(["dispose"]) } };
}

test("actual thumbnail uses accepted independent sizes and recovers a hidden preference statically", () => withTestDocument(() => {
  const f = fixture(), left = f.view.element.querySelector(".v-map-left"), right = f.view.element.querySelector(".v-map-right");
  assert.equal(left.style.opacity, "0.28");
  const peer = right.style.clipPath;
  click(f.view.element.querySelector("#layout-left"));
  f.store.resize("left", 400);
  assert.equal(f.store.read.snapshot().leftWidth, 400);
  assert.equal(right.style.clipPath, peer);
  const open = left.style.clipPath;
  click(f.view.element.querySelector("#layout-left"));
  assert.match(left.style.clipPath, /^inset\(0px 509px /, "collapsed side is a 3px seam");
  click(f.view.element.querySelector("#layout-left"));
  assert.equal(left.style.clipPath, open);
  f.dispose();
}));

test("shape capability is an explicit private opt-in with five local targets and shared author parameters", () => withTestDocument(() => {
  const f = fixture(), recording = recordingPort(); let descriptor;
  f.view.attachMotion(value => { descriptor = value; return recording.port; }, { shapeTransition: true });
  assert.equal(descriptor.root, f.view.element);
  assert.equal(descriptor.animations["shape-transition"], LAYOUT_PREVIEW_SHAPE);
  assert.deepEqual(Object.keys(descriptor.targets), ["shape:top", "shape:left", "shape:right", "shape:voice", "shape:stage"]);
  for (const target of Object.values(descriptor.targets)) {
    assert.equal(f.view.element.contains(target.node), true);
    assert.deepEqual(target.intents, ["shape-transition"]);
  }
  assert.equal(f.view.element.querySelectorAll(".v-map-region-ink").length, 0);
  assert.equal(recording.calls.length, 5);
  assert.throws(() => f.view.attachMotion(() => null), /already bound/);
  f.dispose(); assert.equal(recording.calls.filter(([type]) => type === "dispose").length, 1);
}));

test("pointer presets/toggles animate only after acceptance; dimension, keyboard and async updates place instantly", () => withTestDocument(async () => {
  const f = fixture(), { calls, port } = recordingPort();
  f.view.attachMotion(() => port, { shapeTransition: true }); calls.length = 0;
  click(f.view.element.querySelector("#layout-left"));
  assert.equal(calls.some(([type]) => type === "play"), true);
  assert.equal(f.store.read.snapshot().leftOpen, true);
  calls.length = 0; f.store.resize("left", 360);
  assert.equal(calls.length > 0 && calls.every(([type]) => type === "place"), true);
  calls.length = 0; click(f.view.element.querySelector("#layout-compact"));
  assert.equal(calls.length > 0 && calls.every(([type]) => type === "play"), true);
  calls.length = 0; f.view.element.querySelector("#layout-left").click();
  assert.equal(calls.length > 0 && calls.every(([type]) => type === "place"), true);
  f.dispose();
  const asyncView = fixture({ deferred: true }), r = recordingPort();
  asyncView.view.attachMotion(() => r.port, { shapeTransition: true }); r.calls.length = 0;
  click(asyncView.view.element.querySelector("#layout-left")); assert.equal(r.calls.length, 0);
  await Promise.resolve(); assert.equal(r.calls.every(([type]) => type === "place"), true);
  asyncView.dispose();
}));

test("hidden geometry accepts updates without invalid rectangles and returns statically without another binding", () => withTestDocument(() => {
  const f = fixture(), { calls, port } = recordingPort();
  f.canvas.clientWidth = f.canvas.clientHeight = 0;
  f.view.attachMotion(() => port, { shapeTransition: true }); assert.equal(calls.length, 0);
  click(f.view.element.querySelector("#layout-left")); assert.equal(calls.length, 0);
  f.view.setVisible(false); f.store.resize("left", 400);
  f.canvas.clientWidth = 280; f.canvas.clientHeight = 144;
  f.view.setVisible(true);
  assert.equal(calls.length, 5); assert.equal(calls.every(([type]) => type === "place"), true);
  assert.equal(calls.find(([, request]) => request.target === "shape:left")[1].to.width, 280 * 400 / 1240);
  f.dispose();
}));

test("shape failures restore the accepted static result; optional absence never creates a substitute executor", () => withTestDocument(() => {
  const f = fixture(), issues = [];
  const initial = f.view.element.querySelector(".v-map-left").style.clipPath;
  f.view.attachMotion(() => null, { shapeTransition: true });
  assert.equal(f.view.element.querySelector(".v-map-left").style.clipPath, initial);
  f.view.attachMotion(() => ({ place() {}, play() { return {}; }, dispose() {} }), {
    shapeTransition: true, onIssue: error => issues.push(error.message) });
  click(f.view.element.querySelector("#layout-left"));
  assert.equal(f.store.read.snapshot().leftOpen, true);
  assert.equal(f.view.element.querySelector(".v-map-left").style.opacity, "1");
  assert.notEqual(f.view.element.querySelector(".v-map-left").style.clipPath, initial);
  assert.deepEqual(issues, ["Invalid layout presentation playback"]);
  const r = recordingPort(); assert.doesNotThrow(() => f.view.attachMotion(() => r.port, { shapeTransition: true }));
  f.dispose();
}));

test("preset measures accepted container geometry once; unchanged resize observation does not cancel its playback", () => withTestDocument(({ window }) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver");
  const observers = new Map();
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class {
    constructor(callback) { this.callback = callback; } observe(node) { observers.set(node, this.callback); } disconnect() {}
  } });
  const frames = new Map(); let sequence = 0;
  window.requestAnimationFrame = callback => { frames.set(++sequence, callback); return sequence; };
  window.cancelAnimationFrame = id => frames.delete(id);
  try {
    const f = fixture(), { calls, port } = recordingPort();
    const observe = observers.get(f.canvas);
    f.view.attachMotion(() => port, { shapeTransition: true }); calls.length = 0;
    click(f.view.element.querySelector("#layout-compact"));
    assert.equal(calls.length, 0, "no trajectory starts on the obsolete containing width");
    f.canvas.clientWidth = 200;
    const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback());
    assert.equal(calls.length > 0 && calls.every(([type]) => type === "play"), true);
    const stage = calls.find(([, request]) => request.target === "shape:stage")[1].to;
    assert.equal(stage.x + stage.width + 4 + 200 * 230 / 1240, 200, "thumbnail forecasts the compact preset while host remains balanced");
    assert.equal(f.accepted().rightWidth, 260);
    calls.length = 0; observe();
    assert.equal(calls.length, 0, "same-size observer must not place the accepted endpoint over live frames");
    click(f.view.element.querySelector("#layout-default"));
    f.canvas.clientWidth = 260; observe();
    assert.equal(calls.length > 0 && calls.every(([type]) => type === "play"), true);
    assert.equal(frames.size, 0, "observer can provide the first post-layout measurement");
    calls.length = 0; window.dispatchEvent(new Event("resize"));
    assert.equal(calls.length, 5); assert.equal(calls.every(([type]) => type === "place"), true);
    click(f.view.element.querySelector("#layout-compact")); assert.equal(frames.size, 1);
    f.view.setVisible(false); assert.equal(frames.size, 0);
    f.dispose(); calls.length = 0;
    window.dispatchEvent(new Event("resize")); observe();
    assert.equal(calls.length, 0, "released view has neither frame nor viewport/observer writes");
  } finally {
    if (original) Object.defineProperty(globalThis, "ResizeObserver", original); else delete globalThis.ResizeObserver;
  }
}));
