import test from "node:test";
import assert from "node:assert/strict";
import { applyHorizontalSlots, topSlotCapacity, mergeSlotCapacity, slotCapacity, activateSlotContribution, SLOT_SAMPLES } from "../src/fixtures/horizontal-slots-state.js";
import { fixtureFor } from "../src/fixtures/preview-scenarios.js";
import { beginLayoutEdit, finishLayoutEdit } from "../src/fixtures/layout-edit-state.js";
import { createHorizontalSlotsView } from "../src/fixtures/horizontal-slots-view.js";
import { h } from "../src/shell/dom.js";
import { withTestDocument } from "./support/dom-test-environment.js";
const fixture = sample => { const state = fixtureFor(); applyHorizontalSlots(state, new URLSearchParams("slotReview=1&slotSample=" + sample)); return state; };
const item = (id, slot, minWidth, priority) => ({ id, slot, minWidth, priority, available: true });

test("review contributions are explicit; every sample has unique identities and original slots", () => {
  const state = fixtureFor(); assert.equal(applyHorizontalSlots(state, new URLSearchParams()), false); assert.equal(state.horizontalSlots, undefined);
  for (const sample of SLOT_SAMPLES) { const s = fixture(sample).horizontalSlots, ids = [...s.top, ...s.merge].map(entry => entry.id); assert.equal(new Set(ids).size, ids.length); }
  assert.equal(fixture("empty").horizontalSlots.top.length, 0); assert.equal(fixture("empty").horizontalSlots.merge.length, 0);
});
test("top overflow uses one global budget, retaining highest priority across all three slots", () => {
  const items = [item("low-left", "left", 100, 10), item("high-center", "center", 140, 100), item("high-right", "right", 140, 90)];
  const packed = topSlotCapacity(items, 400);
  assert.deepEqual(packed.visible.map(entry => entry.id), ["high-center", "high-right"]);
  assert.deepEqual(packed.overflow.map(entry => entry.id), ["low-left"]); assert.ok(packed.used <= packed.budget);
});
test("more trigger is budgeted once overflow starts, so it never pushes remaining entries outside", () => {
  const items = [item("first", "left", 100, 30), item("second", "left", 100, 20), item("last", "right", 100, 10)];
  const packed = topSlotCapacity(items, 340);
  assert.deepEqual(packed.visible.map(entry => entry.id), ["first", "second"]); assert.ok(packed.used <= packed.budget);
  const merge = mergeSlotCapacity(items, 660).find(entry => entry.slot === "left");
  assert.deepEqual(merge.visible.map(entry => entry.id), ["first"]); assert.equal(merge.overflow.length, 1); assert.ok(merge.used <= merge.budget);
});
test("equal priorities keep early declarations, and expanding restores exact identity and order", () => {
  const items = [item("a", "left", 100, 20), item("b", "left", 100, 20), item("c", "right", 100, 20)];
  assert.deepEqual(topSlotCapacity(items, 300).visible.map(entry => entry.id), ["a", "b"]);
  assert.deepEqual(topSlotCapacity(items, 600).visible, items); assert.deepEqual(topSlotCapacity(items, 600).overflow, []);
});
test("merge slots own capacity independently; unused neighboring width cannot absorb contributions", () => {
  const items = [item("a", "left", 96, 100), item("b", "left", 120, 20)];
  const packed = mergeSlotCapacity(items, 720); assert.deepEqual(packed[0].visible.map(entry => entry.id), ["a"]);
  assert.deepEqual(packed[0].overflow.map(entry => entry.id), ["b"]); assert.equal(packed[1].visible.length, 0); assert.equal(packed[2].visible.length, 0);
});
test("mode name, details and confirmation stay protected under dense capacity at all reviewed widths", () => {
  const state = fixture("dense"); beginLayoutEdit(state);
  for (const width of [640, 800, 922, 1024, 1280, 1920]) {
    const top = slotCapacity(state, width).top; assert.ok(top.used <= top.budget);
    for (const entry of top.slots) assert.ok(entry.width >= top.protected[entry.slot]);
  }
});
test("unavailable entries preserve declared space and reason but cannot execute", () => {
  const state = fixture("unavailable"), entry = state.horizontalSlots.top[0]; assert.ok(entry.reason); assert.equal(entry.available, false);
  assert.equal(activateSlotContribution(state, entry.id), false); assert.equal(state.horizontalSlots.current, null);
  assert.equal(activateSlotContribution(state, "not-registered"), false); assert.equal(state.horizontalSlots.result, "");
});
test("ordinary contribution activation and reading survive layout cancel without changing configuration", () => {
  const state = fixture("dense"), config = structuredClone({ top: state.horizontalSlots.top, merge: state.horizontalSlots.merge });
  beginLayoutEdit(state); state.topHeight = 88; state.voiceOpen = true; state.horizontalSlots.scroll = 112;
  assert.equal(activateSlotContribution(state, "top-left-4"), true); finishLayoutEdit(state, false);
  assert.equal(state.horizontalSlots.current, "top-left-4"); assert.equal(state.horizontalSlots.scroll, 112); assert.equal(state.topHeight, 88); assert.equal(state.voiceOpen, true);
  assert.deepEqual({ top: state.horizontalSlots.top, merge: state.horizontalSlots.merge }, config);
});
test("all capacities preserve every contribution exactly once without mutating declarations", () => {
  const state = fixture("dense"), before = structuredClone(state.horizontalSlots);
  for (const width of [640, 800, 922, 1024, 1280, 1920]) {
    const capacity = slotCapacity(state, width);
    for (const [items, packed] of [[state.horizontalSlots.top, [capacity.top]], [state.horizontalSlots.merge, capacity.merge]]) {
      const actual = packed.flatMap(entry => [...entry.visible, ...entry.overflow]).map(entry => entry.id).sort();
      assert.deepEqual(actual, items.map(entry => entry.id).sort()); for (const entry of packed) assert.ok(entry.used <= entry.budget);
    }
  }
  assert.deepEqual(state.horizontalSlots, before);
});

test("slot rendering and capacity refresh never turn absent overflow controls into text", async () => {
  for (const width of [640, 800, 922, 1024, 1280, 1920]) await withTestDocument(({ document }) => {
    const wordButton = (label, type, value, options = {}) => h("button", { id: options.id, disabled: options.disabled }, label);
    const button = (label, glyph, type, value, options) => wordButton(label, type, value, options);
    for (const sample of SLOT_SAMPLES) {
      const state = fixture(sample);
      if (sample === "editing") beginLayoutEdit(state);
      const view = createHorizontalSlotsView({ state, button, wordButton, grip: () => h("div") });
      const root = h("div", {}, view.top(), view.merge(), view.voice());
      document.body.append(root);
      for (const phase of ["initial", "refresh"]) {
        if (phase === "refresh") view.sync(root);
        const track = root.querySelector(".hs-top-track");
        assert.doesNotMatch(root.textContent, /null|undefined/, `${sample} ${width}px ${phase}`);
        assert.equal(track.childNodes.length, 3 + Number(slotCapacity(state, width).top.overflow.length > 0));
        assert.equal(track.childNodes.every(node => node.tag !== "#text"), true);
        assert.equal(!!root.querySelector("#more-top"), slotCapacity(state, width).top.overflow.length > 0);
      }
      root.remove();
    }
  }, { width });
});
