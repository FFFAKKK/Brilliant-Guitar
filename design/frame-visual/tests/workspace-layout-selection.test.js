import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceLayoutVisual } from "../src/shell/workspace-layout-visual.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { WORKSPACE_LAYOUT_ANIMATIONS } from "../src/features/workspace-layout-motion-recipes.js";
import { withTestDocument } from "./support/dom-test-environment.js";

function fixture() {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  const accepted = () => ({ ...store.read.snapshot(), editing: false });
  const view = createWorkspaceLayoutVisual({ state: accepted(), begin() {},
    region: side => store.toggleRegion(side), resize: (side, value) => store.resize(side, value), arrange: mode => store.arrange(mode) });
  document.body.append(view.element);
  const canvas = view.element.querySelector(".v-layout-map-canvas"); canvas.clientWidth = 260; canvas.clientHeight = 144;
  const row = view.element.querySelector(".v-layout-arrange-row");
  row.getBoundingClientRect = () => ({ left: 10, top: 20, width: 260, height: 40 });
  ["balanced", "compact", "default"].forEach((mode, index) => {
    view.element.querySelector("#layout-" + mode).getBoundingClientRect = () => ({ left: 10 + index * 88, top: 20, width: 84, height: 40 });
  });
  const stop = store.read.subscribe(() => view.update(accepted())); view.update(accepted());
  return { store, view, row, dispose() { stop(); view.dispose(); } };
}
function click(node) { const e = new Event("click"); Object.defineProperty(e, "detail", { value: 1 }); node.dispatchEvent(e); }
function executor({ reject = false } = {}) {
  const descriptors = [], calls = [], rejects = [];
  const bind = descriptor => {
    descriptors.push(descriptor);
    return { place: r => calls.push(["place", r]), dispose: () => calls.push(["dispose", descriptor]),
      play: r => { calls.push(["play", r]); return { finished: reject ? new Promise((_, no) => rejects.push(no)) : Promise.resolve({ status: "completed" }) }; } };
  };
  return { bind, calls, descriptors, rejects };
}

test("selection is separately opted in; shape-only permission never binds or paints a selection overlay", () => withTestDocument(() => {
  const f = fixture(), e = executor(); f.view.attachMotion(e.bind, { shapeTransition: true });
  assert.equal(e.descriptors.length, 1);
  assert.equal(f.row.getAttribute("data-selection-owned"), null);
  assert.equal(f.row.querySelector(".v-layout-arrange-active-copy"), null);
  f.dispose();
}));

test("one local mask accepts the preview selection before moving bright ink, without committing host geometry", () => withTestDocument(() => {
  const f = fixture(), e = executor(); f.view.attachMotion(e.bind, { shapeTransition: true, selectionTransition: true });
  assert.equal(e.descriptors.length, 2);
  const d = e.descriptors[1], mask = f.row.querySelector(".v-layout-selection-window");
  assert.equal(d.animations["selection-transition"], WORKSPACE_LAYOUT_ANIMATIONS["selection-transition"]);
  assert.deepEqual(Object.keys(d.targets), ["arrangement:selection"]);
  assert.equal(d.targets["arrangement:selection"].node, mask);
  assert.equal(f.view.element.contains(mask), true);
  assert.equal(f.row.querySelector(".v-layout-arrange-active-copy").getAttribute("aria-hidden"), "true");
  e.calls.length = 0; click(f.view.element.querySelector("#layout-compact"));
  assert.equal(f.store.read.snapshot().arrangement, "balanced");
  assert.equal(f.store.read.snapshot().rightWidth, 260);
  assert.equal(f.view.element.querySelector("#layout-compact").getAttribute("aria-pressed"), "true");
  const play = e.calls.find(([type, r]) => type === "play" && r.target === "arrangement:selection");
  assert.deepEqual(play[1].to, { x: 92, y: 5 });
  assert.equal(mask.getAttribute("width"), "76"); assert.equal(mask.getAttribute("height"), "30");
  e.calls.length = 0; f.view.element.querySelector("#layout-balanced").click();
  assert.equal(e.calls.some(([type, r]) => type === "play" && r.target === "arrangement:selection"), false);
  assert.deepEqual(e.calls.find(([type, r]) => type === "place" && r.target === "arrangement:selection")[1].to, { x: 4, y: 5 });
  f.dispose(); assert.equal(e.calls.filter(([type]) => type === "dispose").length, 2);
  assert.equal(f.row.querySelector(".v-layout-arrange-active-copy"), null);
}));

test("old selection failures cannot remove new ink or report after replacement, hiding or release", () => withTestDocument(async () => {
  const f = fixture(), e = executor({ reject: true }), issues = [];
  f.view.attachMotion(e.bind, { shapeTransition: true, selectionTransition: true, onIssue: error => issues.push(error.message) });
  click(f.view.element.querySelector("#layout-compact")); const old = e.rejects.at(-1);
  click(f.view.element.querySelector("#layout-balanced")); const current = e.rejects.at(-1);
  old(new Error("stale")); await Promise.resolve(); assert.deepEqual(issues, []);
  f.view.setVisible(false); current(new Error("hidden")); await Promise.resolve(); assert.deepEqual(issues, []);
  f.view.setVisible(true); click(f.view.element.querySelector("#layout-compact"));
  const released = e.rejects.at(-1); f.dispose(); released(new Error("released"));
  await Promise.resolve(); assert.deepEqual(issues, []);
}));

test("selection binding rollback restores static controls and releases the already bound preview", () => withTestDocument(() => {
  const f = fixture(), e = executor();
  assert.throws(() => f.view.attachMotion(d => {
    if (d.targets["arrangement:selection"]) throw new Error("permission denied");
    return e.bind(d);
  }, { shapeTransition: true, selectionTransition: true }), /permission denied/);
  assert.equal(f.row.querySelector(".v-layout-arrange-active-copy"), null);
  assert.equal(f.row.getAttribute("data-selection-owned"), null);
  assert.equal(e.calls.filter(([type]) => type === "dispose").length, 1);
  assert.doesNotThrow(() => f.view.attachMotion(e.bind, { shapeTransition: true, selectionTransition: true }));
  f.dispose();
}));
