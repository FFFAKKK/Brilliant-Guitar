import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { createWorkspaceLayoutVisual } from "../src/shell/workspace-layout-visual.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { withTestDocument } from "./support/dom-test-environment.js";

function fixture() {
  const frames = new Map(); let serial = 0;
  window.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; };
  window.cancelAnimationFrame = id => frames.delete(id);
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  const accepted = () => ({ ...store.read.snapshot(), editing: false });
  const view = createWorkspaceLayoutVisual({ state: accepted(), begin() {},
    region: side => store.toggleRegion(side), resize: (side, size) => store.resize(side, size), arrange: mode => store.arrange(mode) });
  document.body.append(view.element);
  const canvas = view.element.querySelector(".v-layout-map-canvas"); canvas.clientWidth = 260; canvas.clientHeight = 144;
  const row = view.element.querySelector(".v-layout-arrange-row");
  let measurable = true;
  row.getBoundingClientRect = () => ({ left: 0, top: 0, width: measurable ? 260 : 0, height: measurable ? 40 : 0 });
  ["balanced", "compact", "default"].forEach((mode, index) => {
    view.element.querySelector("#layout-" + mode).getBoundingClientRect = () => ({ left: index * 88, top: 0,
      width: measurable ? 84 : 0, height: measurable ? 40 : 0 });
  });
  const calls = [], jobs = [], issues = [];
  const bind = descriptor => ({
    place(request) { calls.push(["place", request]); },
    play(request) {
      calls.push(["play", request]); let resolve, reject;
      const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
      jobs.push({ request, resolve, reject }); return { finished };
    },
    dispose() { calls.push(["dispose", Object.keys(descriptor.targets)]); },
  });
  const stop = store.read.subscribe(() => view.update(accepted())); view.update(accepted());
  view.attachMotion(bind, { shapeTransition: true, selectionTransition: true, toggleTransition: true,
    onIssue: error => issues.push(error.message) }); calls.length = 0;
  return { view, store, canvas, calls, jobs, issues, frames,
    button: side => view.element.querySelector("#layout-" + side),
    flush() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
    measure(value) { measurable = value; canvas.clientWidth = value ? 260 : 0; canvas.clientHeight = value ? 144 : 0; },
    dispose() { stop(); view.dispose(); },
  };
}
function pointer(button) { const event = new Event("click"); Object.defineProperty(event, "detail", { value: 1 }); button.dispatchEvent(event); }
function visibility(hidden) { document.hidden = hidden; document.dispatchEvent(new Event("visibilitychange")); }
const plays = f => f.calls.filter(([kind]) => kind === "play");

test("leaving the document cancels queued preview and selection frames; restoring never replays an old click", () => withTestDocument(() => {
  const f = fixture();
  try {
    const geometry = f.store.read.snapshot(); pointer(f.button("compact"));
    assert.equal(f.frames.size, 2); assert.equal(plays(f).length, 0);
    visibility(true); assert.equal(f.frames.size, 0, "both author-owned measurement frames must be canceled");
    visibility(false); f.flush();
    assert.equal(plays(f).length, 0, "restoring a document is not a new pointer action");
    assert.deepEqual(f.store.read.snapshot(), geometry, "preview continuity cannot commit a preset");
    const selection = f.calls.filter(([kind, r]) => kind === "place" && r.target === "arrangement:selection").at(-1);
    assert.deepEqual(selection[1].to, { x: 92, y: 5 });
  } finally { visibility(false); f.dispose(); }
}));

test("document hiding settles local toggle ink and invalidates all in-flight failures without detaching live artwork", () => withTestDocument(async () => {
  const f = fixture();
  try {
    pointer(f.button("left")); f.flush();
    assert.equal(f.button("left").dataset.toggleRest, "moving");
    assert.equal(f.jobs.some(job => job.request.target.startsWith("shape:")), true);
    visibility(true);
    assert.equal(f.button("left").dataset.toggleRest, "open");
    for (const job of f.jobs) job.reject(new Error("obsolete hidden track"));
    await Promise.resolve(); assert.deepEqual(f.issues, []);
    assert.equal(f.button("left").getAttribute("data-toggle-motion"), "true");
    assert.equal(f.store.read.snapshot().leftOpen, true);
    const count = plays(f).length; visibility(false); f.flush(); assert.equal(plays(f).length, count);
  } finally { visibility(false); f.dispose(); }
}));

test("hiding with unmeasurable geometry still invalidates old selection and shape completions", () => withTestDocument(async () => {
  const f = fixture();
  try {
    pointer(f.button("compact")); f.flush();
    const count = f.jobs.length;
    assert.equal(f.jobs.some(job => job.request.target === "arrangement:selection"), true);
    assert.equal(f.jobs.some(job => job.request.target.startsWith("shape:")), true);
    f.measure(false); visibility(true);
    for (const job of f.jobs) job.reject(new Error("old unmeasurable track"));
    await Promise.resolve(); assert.deepEqual(f.issues, [], "zero geometry must not leave an old callback authoritative");
    f.measure(true); visibility(false); f.flush();
    assert.equal(plays(f).length, count); assert.equal(f.view.element.querySelector(".v-layout-arrange-row").dataset.selectionOwned, "true");
    assert.equal(f.calls.filter(([kind, r]) => kind === "place" && r.target === "arrangement:selection").at(-1)[1].to.x, 92);
  } finally { visibility(false); f.dispose(); }
}));

test("a fresh pointer action after restoration animates; hidden and keyboard actions remain static", () => withTestDocument(() => {
  const f = fixture();
  try {
    visibility(true); pointer(f.button("compact")); pointer(f.button("left"));
    assert.equal(f.frames.size, 0); assert.equal(plays(f).length, 0);
    visibility(false); f.flush(); assert.equal(plays(f).length, 0);
    pointer(f.button("compact")); f.flush(); assert.equal(plays(f).some(([, r]) => r.target === "arrangement:selection"), true);
    pointer(f.button("left")); assert.equal(f.button("left").dataset.toggleRest, "moving");
    f.button("left").click(); assert.equal(f.button("left").dataset.toggleRest, "open");
    const count = plays(f).length; f.button("compact").click(); f.flush(); assert.equal(plays(f).length, count);
  } finally { visibility(false); f.dispose(); }
}));

test("layout visual disposal removes document visibility listeners and pending measurement frames", () => withTestDocument(() => {
  const baseline = getEventListeners(document, "visibilitychange").length;
  const f = fixture(); pointer(f.button("compact")); assert.equal(f.frames.size, 2);
  assert.equal(getEventListeners(document, "visibilitychange").length > baseline, true);
  f.dispose(); assert.equal(f.frames.size, 0);
  assert.equal(getEventListeners(document, "visibilitychange").length, baseline);
  const count = f.calls.length; visibility(true); visibility(false); f.flush();
  assert.equal(f.calls.length, count);
}));
