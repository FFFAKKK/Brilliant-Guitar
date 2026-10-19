import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import { createFrameEdgeGestures } from "../src/host/frame-edge-gestures.js";
import { createFramePointerPresentation } from "../src/host/frame-pointer-presentation.js";
import { createAnimationService } from "../src/runtime/animation-service.js";
import { createFrameRegionPresentation } from "../src/host/frame-region-presentation.js";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { WORKSPACE_MINIMUMS, WORKSPACE_SIZE_KEYS } from "../src/workspace-geometry.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const specs = { left: ["clientX", 1], right: ["clientX", -1], top: ["clientY", 1], voice: ["clientY", -1] };
function pointer(node, type, values = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({ pointerId: 3, button: 0, buttons: 1, isPrimary: true, clientX: 500, clientY: 500, ...values }))
    Object.defineProperty(event, key, { value });
  node.dispatchEvent(event); return event;
}
function capture(node) {
  const ids = new Set();
  node.setPointerCapture = id => ids.add(id); node.hasPointerCapture = id => ids.has(id);
  node.releasePointerCapture = id => { ids.delete(id); pointer(node, "lostpointercapture", { pointerId: id }); };
  return ids;
}
function fixture({ animated = false, reject = false, nativeContext = false, onResize = null } = {}) {
  const root = document.createElement("main"), stage = document.createElement("main"); document.body.append(root); root.append(stage);
  const grips = new Map(), edges = {}, regions = {}, jobs = [], calls = [];
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  for (const [i, side] of Object.keys(specs).entries()) {
    const host = document.createElement("div"), element = document.createElement("section"), content = document.createElement("div"), grip = document.createElement("button");
    root.append(host, element); element.append(content, grip); grips.set(side, grip); edges[side] = host; regions[side] = { element, content };
    element.getBoundingClientRect = () => ({ x: 40, y: 34, width: 230, height: 80 });
    host.getBoundingClientRect = () => ({ left: i * 100, right: i * 100 + 40, top: 0, bottom: 30 });
    capture(grip);
  }
  stage.getBoundingClientRect = () => ({ x: 40, y: 34, width: 1000, height: 600 });
  const service = animated ? createAnimationService({ provider: { start(args) { const job = { ...args, stops: 0 }; jobs.push(job); return { stop() { job.stops++; } }; } } }) : null;
  const frame = service ? createFrameRegionPresentation({ root, workspaceRoot: root, regions, stage, service }) : null;
  let input = false, gestures;
  const context = nativeContext ? createFramePointerPresentation(root) : { runGesture(event, operation) { input = true; try { return operation(); } finally { input = false; } } };
  const execute = (id, payload) => {
    calls.push({ id, payload });
    if (typeof reject === "function" ? reject(id, payload) : reject) return { ok: false };
    const result = id === C.resize ? store.resize(payload.side, payload.value) : store.setRegionOpen(payload.region, payload.open);
    if (id === C.resize) onResize?.({ root, store });
    return result;
  };
  gestures = createFrameEdgeGestures({ root, workspaceRoot: root, layout: store.read, execute, grips, edges, pointerPresentation: context, service });
  const render = state => { const options = { pointer: nativeContext ? context.current() : input }; frame?.beforeRender(state, options); frame?.update(state, options); gestures.update(state); };
  render(store.read.snapshot()); const unsubscribe = store.read.subscribe(render);
  const buttons = Object.fromEntries(Object.keys(specs).map(side => [side, root.querySelector("#edge-handle-" + side)]));
  for (const button of Object.values(buttons)) capture(button);
  return { root, stage, regions, store, grips, buttons, gestures, frame, service, jobs, calls,
    dispose() { unsubscribe(); gestures.dispose(); frame?.dispose(); context.dispose?.(); service?.dispose(); root.remove(); } };
}
function pull(node, side, distance, type = "pointermove", extra = {}) {
  const [axis, sign] = specs[side]; return pointer(node, type, { [axis]: 500 + sign * distance, ...extra });
}

test("four directions clamp at the shared minimum and only continued 24px pull closes once", () => withTestDocument(() => {
  const f = fixture();
  try {
    for (const side of Object.keys(specs)) {
      f.store.setRegionOpen(side, true); const grip = f.grips.get(side), key = WORKSPACE_SIZE_KEYS[side];
      const rest = f.store.read.snapshot(), delta = WORKSPACE_MINIMUMS[side] - rest[key];
      pointer(grip, "pointerdown"); pull(grip, side, delta);
      assert.equal(f.store.read.snapshot()[key], WORKSPACE_MINIMUMS[side]); assert.equal(f.store.read.snapshot()[side + "Open"], true);
      pull(grip, side, delta - 23); assert.equal(f.store.read.snapshot()[side + "Open"], true);
      pull(grip, side, delta - 24); assert.equal(f.store.read.snapshot()[side + "Open"], false);
      assert.equal(grip.hasPointerCapture(3), false); assert.equal(f.root.dataset.resizing, "false");
      const count = f.calls.length; pull(grip, side, delta - 100); assert.equal(f.calls.length, count);
      for (const other of Object.keys(specs).filter(s => s !== side)) assert.equal(f.store.read.snapshot()[WORKSPACE_SIZE_KEYS[other]], rest[WORKSPACE_SIZE_KEYS[other]]);
      assert.equal(f.buttons[side].hidden, false); assert.equal(f.buttons[side].textContent, "");
    }
  } finally { f.dispose(); }
}));

test("short/wrong direction and hover never open; inward pull opens with stored size on all edges", () => withTestDocument(() => {
  const f = fixture();
  try {
    for (const [index, side] of Object.keys(specs).entries()) {
      f.store.setRegionOpen(side, false); const button = f.buttons[side], key = WORKSPACE_SIZE_KEYS[side], size = f.store.read.snapshot()[key];
      pointer(f.root, "pointermove", { clientX: index * 100 + 20, clientY: 15 });
      assert.equal(button.dataset.revealed, "true"); assert.equal(f.store.read.snapshot()[side + "Open"], false);
      pointer(button, "pointerdown"); pull(button, side, -50); pull(button, side, 23); pull(button, side, 23, "pointerup");
      assert.equal(f.store.read.snapshot()[side + "Open"], false);
      pointer(button, "pointerdown"); pull(button, side, 24, "pointerup");
      assert.equal(f.store.read.snapshot()[side + "Open"], true); assert.equal(f.store.read.snapshot()[key], size);
      assert.equal(button.hidden, true); assert.equal(button.hasPointerCapture(3), false);
    }
  } finally { f.dispose(); }
}));

test("capture cancellation, Escape, blur, viewport and hidden reset cannot commit a later pull", () => withTestDocument(() => {
  const f = fixture();
  try {
    for (const cancel of [node => pointer(node, "pointercancel"), node => pointer(node, "lostpointercapture"),
      () => { const e = new Event("keydown", { cancelable: true }); Object.defineProperty(e, "key", { value: "Escape" }); f.root.dispatchEvent(e); assert.equal(e.defaultPrevented, true); },
      () => window.dispatchEvent(new Event("blur")), () => window.dispatchEvent(new Event("resize")),
      () => { f.root.hidden = true; document.dispatchEvent(new Event("visibilitychange")); f.root.hidden = false; }]) {
      f.store.setRegionOpen("left", false); const button = f.buttons.left;
      pointer(button, "pointerdown"); pull(button, "left", 20); cancel(button); pull(button, "left", 100);
      assert.equal(f.store.read.snapshot().leftOpen, false); assert.equal(f.root.dataset.resizing, "false");
      assert.equal(button.hasPointerCapture(3), false);
    }
  } finally { f.dispose(); }
}));

test("foreign pointer, right click, second pointer, rejected command and external geometry do not collapse", () => withTestDocument(() => {
  const f = fixture();
  try {
    f.store.setRegionOpen("left", true); const grip = f.grips.get("left");
    pointer(grip, "pointerdown", { button: 2 }); pull(grip, "left", -200); assert.equal(f.store.read.snapshot().leftWidth, 260);
    pointer(grip, "pointerdown"); pull(grip, "left", -200, "pointermove", { pointerId: 8 }); assert.equal(f.store.read.snapshot().leftOpen, true);
    f.store.resize("left", 300); pull(grip, "left", -200); assert.equal(f.store.read.snapshot().leftOpen, true);
    assert.equal(f.store.read.snapshot().leftWidth, 300);
    pointer(grip, "pointerdown", { isPrimary: false }); assert.equal(grip.hasPointerCapture(3), false);
  } finally { f.dispose(); }
  const blocked = fixture({ reject: true });
  try {
    blocked.store.setRegionOpen("left", true); blocked.store.resize("left", 230);
    pointer(blocked.grips.get("left"), "pointerdown"); pull(blocked.grips.get("left"), "left", -100);
    assert.equal(blocked.store.read.snapshot().leftOpen, true); assert.equal(blocked.calls.some(c => c.id === C.configureRegion), false);
  } finally { blocked.dispose(); }
}));

test("host gesture uses original region animation; reveal reverses from current ink and static policies remain usable", () => withTestDocument(async () => {
  const f = fixture({ animated: true });
  try {
    f.store.setRegionOpen("left", true); const grip = f.grips.get("left"); pointer(grip, "pointerdown"); pull(grip, "left", -54);
    assert.equal(f.store.read.snapshot().leftOpen, false); const exit = f.jobs.find(job => job.node === f.regions.left.content);
    assert.ok(exit); assert.equal(exit.settings.duration, .28); assert.equal(exit.settings.fadeDuration, .28);
    assert.equal(f.regions.left.element.style.clipPath, "inset(0px)"); assert.equal(f.stage.style.transform, "");
    pointer(f.root, "pointermove", { clientX: 20, clientY: 15 }); const reveal = f.jobs.at(-1);
    assert.equal(reveal.node, f.buttons.left.firstChild); assert.equal(reveal.settings.duration, .18); reveal.write({ x: -3, y: 0, opacity: .4 });
    pointer(f.root, "pointerleave"); assert.equal(f.jobs.at(-1).from.opacity, .4);
    reveal.complete(); await Promise.resolve(); assert.equal(f.buttons.left.dataset.revealed, "false");
    for (const policy of [{ mode: "none" }, { mode: "reduced" }, { mode: "full", profile: "quiet" }]) {
      f.service.setPolicy(policy); const count = f.jobs.length;
      pointer(f.root, "pointermove", { clientX: 20, clientY: 15 }); assert.equal(f.jobs.length, count);
      pointer(f.buttons.left, "pointerdown"); pull(f.buttons.left, "left", 24); assert.equal(f.store.read.snapshot().leftOpen, true);
      f.store.setRegionOpen("left", false);
    }
  } finally { f.dispose(); }
}));

test("synthetic pointer fields never authorize frame animation and keyboard activation stays static", () => withTestDocument(() => {
  const f = fixture({ animated: true, nativeContext: true });
  try {
    f.store.setRegionOpen("left", true); pointer(f.grips.get("left"), "pointerdown"); pull(f.grips.get("left"), "left", -54);
    assert.equal(f.store.read.snapshot().leftOpen, false); assert.equal(f.jobs.length, 0);
    f.buttons.left.click(); assert.equal(f.store.read.snapshot().leftOpen, true); assert.equal(f.jobs.length, 0);
    const event = new Event("pointermove"); Object.defineProperty(event, "pointerId", { value: 3 });
    const context = createFramePointerPresentation(f.root);
    try { assert.equal(context.runGesture(event, () => context.current()), false); } finally { context.dispose(); }
  } finally { f.dispose(); }
}));

test("disposing two instances releases only its own listeners, targets, capture and handle nodes", () => withTestDocument(() => {
  const before = getEventListeners(window, "blur").length, a = fixture({ animated: true }), b = fixture({ animated: true });
  assert.equal(getEventListeners(window, "blur").length, before + 2);
  pointer(a.grips.get("right"), "pointerdown"); a.dispose(); a.dispose();
  assert.equal(a.service.snapshot().targets, 0); assert.equal(a.grips.get("right").hasPointerCapture(3), false);
  assert.equal(a.root.querySelectorAll(".v-edge-handle").length, 0); assert.equal(getEventListeners(window, "blur").length, before + 1);
  b.store.setRegionOpen("left", false); pointer(b.buttons.left, "pointerdown"); pull(b.buttons.left, "left", 24);
  assert.equal(b.store.read.snapshot().leftOpen, true); b.dispose(); assert.equal(getEventListeners(window, "blur").length, before);
}));

test("actual runtime wires existing grips and four empty graphical edge controls through original commands", () => withTestDocument(() => {
  const root = document.createElement("main"); document.body.append(root);
  const runtime = createBackupUiRuntime({ root, animationProvider: null });
  try {
    const controls = root.querySelectorAll(".v-edge-handle"); assert.equal(controls.length, 4);
    runtime.execute(C.configureRegion, { region: "left", open: true });
    const grip = root.querySelector("#grip-left"); capture(grip); pointer(grip, "pointerdown"); pull(grip, "left", -54);
    assert.equal(runtime.workspace.snapshot().leftOpen, false);
    const edge = root.querySelector("#edge-handle-left"); capture(edge); pointer(edge, "pointerdown"); pull(edge, "left", 24);
    assert.equal(runtime.workspace.snapshot().leftOpen, true);
    for (const control of controls) { assert.equal(control.textContent, ""); assert.match(control.getAttribute("aria-label"), /^展开/); }
  } finally { runtime.dispose(); root.remove(); }
}));


test("release accepts the last ordinary size, local focus follows close/open and capture failure leaves no state", () => withTestDocument(() => {
  const f = fixture();
  try {
    f.store.setRegionOpen("left", true); const grip = f.grips.get("left");
    pointer(grip, "pointerdown"); pull(grip, "left", 30, "pointerup"); assert.equal(f.store.read.snapshot().leftWidth, 290);
    grip.focus(); pointer(grip, "pointerdown"); pull(grip, "left", -84);
    assert.equal(document.activeElement, f.buttons.left);
    pointer(f.buttons.left, "pointerdown"); pull(f.buttons.left, "left", 24); assert.equal(document.activeElement, grip);
    grip.setPointerCapture = () => { throw new Error("unavailable capture"); };
    const count = f.calls.length; pointer(grip, "pointerdown"); pull(grip, "left", -200);
    assert.equal(f.calls.length, count); assert.equal(f.root.dataset.resizing, "false");
  } finally { f.dispose(); }
}));

test("edge provider failure and stale writes settle only the ink and preserve accepted geometry", () => withTestDocument(async () => {
  const f = fixture({ animated: true });
  try {
    f.store.setRegionOpen("left", false);
    pointer(f.root, "pointermove", { clientX: 20, clientY: 15 }); const old = f.jobs.at(-1);
    pointer(f.root, "pointerleave"); const current = f.jobs.at(-1), accepted = f.store.read.snapshot();
    old.failed(new Error("old")); old.write({ x: 0, y: 0, opacity: 1 }); await Promise.resolve();
    assert.equal(f.buttons.left.dataset.revealed, "false"); assert.equal(f.store.read.snapshot(), accepted);
    current.failed(new Error("current")); await Promise.resolve(); assert.equal(f.buttons.left.firstChild.style.opacity, "0");
    assert.equal(f.service.snapshot().active, 0); assert.equal(f.store.read.snapshot(), accepted);
    f.service.replaceProvider(null); pointer(f.root, "pointermove", { clientX: 20, clientY: 15 });
    assert.equal(f.buttons.left.firstChild.style.opacity, "1");
  } finally { f.dispose(); }
}));


test("maximum overshoot is consumed and reverse dragging immediately adjusts each region", () => withTestDocument(() => {
  const f = fixture();
  try {
    for (const side of Object.keys(specs)) {
      f.store.setRegionOpen(side, true); const node = f.grips.get(side), key = WORKSPACE_SIZE_KEYS[side];
      pointer(node, "pointerdown"); pull(node, side, 1000); const max = f.store.read.snapshot()[key];
      pull(node, side, 999); assert.equal(f.store.read.snapshot()[key], max - 1);
      pull(node, side, 999, "pointerup"); assert.equal(f.store.read.snapshot()[side + "Open"], true);
    }
  } finally { f.dispose(); }
}));

test("a cancelled resize dispatch cannot later collapse and a rejected open keeps the real closed entry", () => withTestDocument(() => {
  const f = fixture({ onResize() { window.dispatchEvent(new Event("blur")); } });
  try {
    f.store.setRegionOpen("left", true); pointer(f.grips.get("left"), "pointerdown"); pull(f.grips.get("left"), "left", -100);
    assert.equal(f.store.read.snapshot().leftOpen, true); assert.equal(f.calls.some(c => c.id === C.configureRegion), false);
  } finally { f.dispose(); }
  const blocked = fixture({ reject: id => id === C.configureRegion });
  try {
    pointer(blocked.buttons.left, "pointerdown"); pull(blocked.buttons.left, "left", 24);
    assert.equal(blocked.store.read.snapshot().leftOpen, false); assert.equal(blocked.buttons.left.hidden, false);
    assert.equal(blocked.root.dataset.resizing, "false"); assert.equal(blocked.buttons.left.hasPointerCapture(3), false);
  } finally { blocked.dispose(); }
}));


for (const side of Object.keys(specs)) test(`${side} drag stops when the primary button is released while another button stays pressed`, () => withTestDocument(() => {
  const f = fixture();
  try {
    f.store.setRegionOpen(side, true); f.store.resize(side, WORKSPACE_MINIMUMS[side]);
    const grip = f.grips.get(side), before = f.store.read.snapshot();
    pointer(grip, "pointerdown"); const count = f.calls.length;
    pull(grip, side, -100, "pointermove", { buttons: 2 });
    assert.equal(f.calls.length, count, "right-button motion cannot continue a primary resize or collapse");
    assert.ok(f.store.read.snapshot() === before);
    assert.equal(grip.hasPointerCapture(3), false); assert.equal(f.root.dataset.resizing, "false");
    pull(grip, side, -200, "pointerup", { button: 2, buttons: 0 });
    assert.equal(f.calls.length, count, "late release cannot commit a new endpoint");
  } finally { f.dispose(); }
}));

test("a non-primary final pointerup cancels without accepting its coordinate on both opened and closed handles", () => withTestDocument(() => {
  const f = fixture();
  try {
    for (const side of Object.keys(specs)) for (const open of [true, false]) {
      f.store.setRegionOpen(side, open); f.store.resize(side, WORKSPACE_MINIMUMS[side]);
      const node = open ? f.grips.get(side) : f.buttons[side], before = f.store.read.snapshot();
      pointer(node, "pointerdown"); const count = f.calls.length;
      pull(node, side, open ? -24 : 24, "pointerup", { button: 2, buttons: 0 });
      assert.equal(f.calls.length, count, "only the matching primary release can accept final coordinates");
      assert.ok(f.store.read.snapshot() === before);
      assert.equal(node.hasPointerCapture(3), false);
    }
  } finally { f.dispose(); }
}));

test("primary-button chords remain responsive and a genuine primary release still accepts the last coordinate", () => withTestDocument(() => {
  const f = fixture();
  try {
    for (const side of Object.keys(specs)) {
      f.store.setRegionOpen(side, true); f.store.resize(side, WORKSPACE_MINIMUMS[side]);
      const node = f.grips.get(side), size = WORKSPACE_SIZE_KEYS[side];
      pointer(node, "pointerdown"); pull(node, side, 5, "pointermove", { buttons: 3 });
      assert.equal(f.store.read.snapshot()[size], WORKSPACE_MINIMUMS[side] + 5);
      assert.equal(node.hasPointerCapture(3), true);
      pull(node, side, 8, "pointerup", { button: 0, buttons: 0 });
      assert.equal(f.store.read.snapshot()[size], WORKSPACE_MINIMUMS[side] + 8);
      assert.equal(node.hasPointerCapture(3), false);
    }
  } finally { f.dispose(); }
}));

test("gesture Escape respects composition, modifiers and previously reserved keys", () => withTestDocument(() => {
  const f = fixture();
  try {
    const node = f.buttons.left; f.store.setRegionOpen("left", false); pointer(node, "pointerdown");
    for (const values of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { shiftKey: true },
      { altKey: true }, { metaKey: true }, { getModifierState: name => name === "AltGraph" }, { reserved: true }]) {
      const event = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "key", { value: "Escape" });
      for (const [key, value] of Object.entries(values)) if (key !== "reserved") Object.defineProperty(event, key, { value });
      if (values.reserved) event.preventDefault();
      f.root.dispatchEvent(event);
      assert.equal(node.hasPointerCapture(3), true, "reserved Escape must not be consumed by the resize adapter");
      assert.equal(event.cancelBubble, false);
      assert.equal(event.defaultPrevented, !!values.reserved);
    }
    const plain = new Event("keydown", { bubbles: true, cancelable: true }); Object.defineProperty(plain, "key", { value: "Escape" });
    f.root.dispatchEvent(plain); assert.equal(plain.defaultPrevented, true); assert.equal(node.hasPointerCapture(3), false);
    pull(node, "left", 100); assert.equal(f.store.read.snapshot().leftOpen, false);
  } finally { f.dispose(); }
}));


function escapeFrom(node, properties = {}) {
  const event = new Event("keydown", { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({ key: "Escape", ...properties })) Object.defineProperty(event, key, { value });
  node.dispatchEvent(event); return event;
}

test("actual runtime Escape cancels the active grip before a second Escape cancels content editing", () => withTestDocument(() => {
  const root = document.createElement("main"); document.body.append(root);
  const runtime = createBackupUiRuntime({ root, animationProvider: null });
  try {
    runtime.execute(C.page, { id: "frame.layout.page", toggle: false });
    runtime.execute(C.begin); runtime.execute(C.configureRegion, { region: "left", open: true });
    const grip = root.querySelector("#grip-left"); capture(grip); grip.focus(); pointer(grip, "pointerdown");
    assert.equal(escapeFrom(grip).defaultPrevented, true);
    assert.equal(grip.hasPointerCapture(3), false);
    assert.equal(runtime.workspace.snapshot().adjusting, true, "one Escape cannot cancel both gestures and content edits");
    assert.equal(escapeFrom(grip).defaultPrevented, true); assert.equal(runtime.workspace.snapshot().adjusting, false);
  } finally { runtime.dispose(); root.remove(); }
}));

test("actual runtime composition Escape leaves both content editing and the grip gesture available", () => withTestDocument(() => {
  const root = document.createElement("main"); document.body.append(root);
  const runtime = createBackupUiRuntime({ root, animationProvider: null });
  try {
    runtime.execute(C.page, { id: "frame.layout.page", toggle: false });
    runtime.execute(C.begin); runtime.execute(C.configureRegion, { region: "left", open: true });
    const grip = root.querySelector("#grip-left"); capture(grip); grip.focus(); pointer(grip, "pointerdown");
    assert.equal(escapeFrom(grip, { isComposing: true }).defaultPrevented, false);
    assert.equal(grip.hasPointerCapture(3), true); assert.equal(runtime.workspace.snapshot().adjusting, true);
    const before = runtime.workspace.snapshot().leftWidth; pull(grip, "left", 4);
    assert.equal(runtime.workspace.snapshot().leftWidth, before + 4);
    pointer(grip, "pointercancel"); assert.equal(grip.hasPointerCapture(3), false);
    assert.equal(runtime.workspace.snapshot().adjusting, true);
  } finally { runtime.dispose(); root.remove(); }
}));

for (const [index, side] of Object.keys(specs).entries()) test(`${side} short pull ending outside its edge clears the reveal without opening`, () => withTestDocument(() => {
  const f = fixture();
  try {
    f.store.setRegionOpen(side, false); const button = f.buttons[side], [axis, sign] = specs[side];
    const start = { clientX: index * 100 + 20, clientY: 15, pointerType: "mouse" };
    const end = { ...start, [axis]: start[axis] + sign * 23 };
    pointer(f.root, "pointermove", start); assert.equal(button.dataset.revealed, "true");
    const state = f.store.read.snapshot(), count = f.calls.length;
    pointer(button, "pointerdown", start); pointer(button, "pointermove", end);
    pointer(button, "pointerup", { ...end, buttons: 0 });
    assert.equal(button.dataset.revealed, "false"); assert.equal(button.firstChild.style.opacity, "0");
    assert.equal(button.hasPointerCapture(3), false); assert.equal(f.root.dataset.resizing, "false");
    assert.equal(f.store.read.snapshot(), state); assert.equal(f.calls.length, count);
  } finally { f.dispose(); }
}));

test("cancelled opening gestures clear stale reveal even when their last event has edge-like coordinates", () => withTestDocument(() => {
  const f = fixture();
  try {
    f.store.setRegionOpen("left", false); const button = f.buttons.left, state = f.store.read.snapshot();
    for (const type of ["pointercancel", "lostpointercapture", "Escape"]) {
      pointer(f.root, "pointermove", { clientX: 20, clientY: 15, pointerType: "mouse" });
      pointer(button, "pointerdown", { clientX: 20, clientY: 15, pointerType: "mouse" });
      pointer(f.root, "pointerleave", { clientX: -10, clientY: 50 });
      if (type === "Escape") {
        const event = new Event("keydown", { cancelable: true }); Object.defineProperty(event, "key", { value: "Escape" });
        f.root.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
      } else pointer(button, type, { clientX: 20, clientY: 15 });
      assert.equal(button.dataset.revealed, "false", type); assert.equal(button.firstChild.style.opacity, "0", type);
      assert.equal(button.hasPointerCapture(3), false); assert.equal(f.store.read.snapshot(), state);
    }
    assert.equal(f.calls.length, 0);
  } finally { f.dispose(); }
}));

test("cancelled focused edge remains visible for local focus instead of disappearing", () => withTestDocument(() => {
  const f = fixture();
  try {
    f.store.setRegionOpen("left", false); const button = f.buttons.left;
    button.focus(); button.dispatchEvent(new Event("focus"));
    pointer(button, "pointerdown", { clientX: 20, clientY: 15 }); pointer(button, "pointercancel");
    assert.equal(button.dataset.revealed, "true"); assert.equal(button.firstChild.style.opacity, "1");
    assert.equal(document.activeElement, button); assert.equal(button.hasPointerCapture(3), false);
    assert.equal(f.calls.length, 0);
  } finally { f.dispose(); }
}));

test("short mouse release within chrome keeps the reveal while touch does not leave a hover hint", () => withTestDocument(() => {
  const f = fixture();
  try {
    f.store.setRegionOpen("left", false); const button = f.buttons.left;
    for (const type of ["mouse", "touch"]) {
      pointer(button, "pointerdown", { clientX: 20, clientY: 15, pointerType: type });
      pointer(button, "pointerup", { clientX: 25, clientY: 15, pointerType: type, buttons: 0 });
      assert.equal(button.dataset.revealed, String(type === "mouse"));
      assert.equal(f.store.read.snapshot().leftOpen, false); assert.equal(button.hasPointerCapture(3), false);
    }
    assert.equal(f.calls.length, 0);
  } finally { f.dispose(); }
}));

test("short-pull reveal exit and quick re-entry continue from current ink without stale completion", () => withTestDocument(async () => {
  const f = fixture({ animated: true });
  try {
    f.store.setRegionOpen("left", false); const button = f.buttons.left;
    pointer(f.root, "pointermove", { clientX: 20, clientY: 15, pointerType: "mouse" });
    const enter = f.jobs.at(-1); enter.write({ x: -3.3, y: 0, opacity: .45 });
    pointer(button, "pointerdown", { clientX: 20, clientY: 15, pointerType: "mouse" });
    pointer(button, "pointerup", { clientX: 43, clientY: 15, pointerType: "mouse", buttons: 0 });
    const exit = f.jobs.at(-1); assert.notEqual(exit, enter); assert.equal(exit.node, button.firstChild);
    assert.equal(exit.from.opacity, .45); assert.equal(exit.settings.duration, .12);
    exit.write({ x: -4.8, y: 0, opacity: .2 });
    pointer(f.root, "pointermove", { clientX: 20, clientY: 15, pointerType: "mouse" });
    const latest = f.jobs.at(-1); assert.equal(latest.from.opacity, .2); assert.equal(button.dataset.revealed, "true");
    enter.complete(); exit.complete(); await Promise.resolve();
    assert.equal(button.firstChild.style.opacity, "0.2"); assert.equal(button.dataset.revealed, "true");
    latest.complete(); await Promise.resolve(); assert.equal(button.firstChild.style.opacity, "1");
    assert.equal(f.store.read.snapshot().leftOpen, false); assert.equal(f.calls.length, 0);
  } finally { f.dispose(); }
}));

test("rejected threshold opening settles the edge hint while retaining the accepted closed state", () => withTestDocument(() => {
  const f = fixture({ reject: true });
  try {
    f.store.setRegionOpen("left", false); const button = f.buttons.left, state = f.store.read.snapshot();
    pointer(f.root, "pointermove", { clientX: 20, clientY: 15, pointerType: "mouse" });
    pointer(button, "pointerdown", { clientX: 20, clientY: 15, pointerType: "mouse" });
    pointer(button, "pointerup", { clientX: 44, clientY: 15, pointerType: "mouse", buttons: 0 });
    assert.equal(button.dataset.revealed, "false"); assert.equal(button.hasPointerCapture(3), false);
    assert.equal(f.store.read.snapshot(), state); assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].id, C.configureRegion);
  } finally { f.dispose(); }
}));
