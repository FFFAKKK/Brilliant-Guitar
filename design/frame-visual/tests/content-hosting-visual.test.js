import test from "node:test";
import assert from "node:assert/strict";
import { fixtureFor } from "../src/fixtures/preview-scenarios.js";
import { applyContentHosting, HOSTING_CONTENT, HOSTING_MUTATIONS, hostingPage, hostingLocation, hostingReason, hostingOrder, runHostingAction } from "../src/fixtures/content-hosting-state.js";
import { beginLayoutEdit, finishLayoutEdit, requiresLayoutEdit } from "../src/fixtures/layout-edit-state.js";
const fixture = sample => { const state = fixtureFor(); applyContentHosting(state, new URLSearchParams("contentReview=1" + (sample ? "&hostingSample=" + sample : ""))); return state; };
const act = (state, action, value) => runHostingAction(state, "hosting-" + action, value);
const unique = state => { const ids = state.contentHosting.pages.flatMap(page => page.items); assert.equal(new Set(ids).size, ids.length); };

test("default frame has no neutral content and every review sample has unique identities", () => {
  const state = fixtureFor(); assert.equal(applyContentHosting(state, new URLSearchParams()), false); assert.equal(state.contentHosting, undefined);
  for (const sample of [undefined, "empty", "hidden", "single", "long", "fixed-high", "half-limit", "missing", "unavailable", "no-results"]) unique(fixture(sample));
});
test("all configuration actions are gated; ordinary browsing keeps independent pages and memories", () => {
  const state = fixture(), before = structuredClone(state.contentHosting);
  for (const action of HOSTING_MUTATIONS) { assert.equal(requiresLayoutEdit(action), true); runHostingAction(state, action, "A"); }
  assert.deepEqual(state.contentHosting, before);
  act(state, "page", "left-2"); assert.equal(state.hostingMemory.current.right, "right-1");
  act(state, "focus", "E"); assert.equal(state.hostingMemory.active["left-2"], "E"); assert.equal(state.assembly, false);
});
test("per-page presentation changes cancel together and do not leak between pages", () => {
  const state = fixture(), before = structuredClone(state.contentHosting); beginLayoutEdit(state);
  act(state, "mode", "list"); assert.equal(hostingPage(state, "left-1").mode, "list"); assert.equal(hostingPage(state, "left-2").mode, "tabs");
  act(state, "target", "right-2"); act(state, "mode", "tabs"); assert.equal(hostingPage(state, "right-1").mode, "mixed");
  finishLayoutEdit(state, false); assert.deepEqual(state.contentHosting, before);
});
test("cancel restores assignments, widths, icons and order while retaining geometry/input/reading", () => {
  const state = fixture(), before = structuredClone(state.contentHosting); beginLayoutEdit(state);
  state.leftWidth = 300; state.topHeight = 64; state.topOpen = false;
  state.hostingMemory.inputs.B = "跟随内容"; state.hostingMemory.scroll["left-1:grid"] = 64; state.hostingMemory.expanded.H = false;
  act(state, "select", "B"); act(state, "destination", "right-1"); act(state, "move"); act(state, "icon", "B");
  act(state, "width", "B"); act(state, "order", { id: "B", delta: -1 });
  unique(state); assert.equal(hostingLocation(state, "B").id, "right-1");
  finishLayoutEdit(state, false); assert.deepEqual(state.contentHosting, before);
  assert.equal(state.leftWidth, 300); assert.equal(state.topHeight, 64); assert.equal(state.topOpen, false);
  assert.equal(state.hostingMemory.inputs.B, "跟随内容"); assert.equal(state.hostingMemory.scroll["left-1:grid"], 64); assert.equal(state.hostingMemory.expanded.H, false);
});
test("confirmed cross-region move keeps identity and ordinary private values", () => {
  const state = fixture(); state.hostingMemory.inputs.B = "唯一实例"; beginLayoutEdit(state);
  act(state, "select", "B"); act(state, "destination", "right-2"); act(state, "move"); unique(state);
  assert.equal(hostingLocation(state, "B").id, "right-2"); finishLayoutEdit(state, true);
  assert.equal(hostingLocation(state, "B").id, "right-2"); assert.equal(state.hostingMemory.inputs.B, "唯一实例");
  act(state, "toggle", "B"); assert.equal(hostingLocation(state, "B").id, "right-2");
});
test("fixed, missing, unready and half-only constraints prevent invalid mutations with a reason", () => {
  const state = fixture(); beginLayoutEdit(state);
  for (const [id, target, reason] of [["D","right-1","固定"],["J","left-1","插件缺失"],["K","left-1","暂未就绪"]]) {
    assert.match(hostingReason(state, id, target), new RegExp(reason)); const before = structuredClone(state.contentHosting);
    act(state, "select", id); act(state, "destination", target); act(state, "move"); assert.deepEqual(state.contentHosting, before);
  }
  state.leftWidth = 200; act(state, "select", "E"); act(state, "destination", "left-1");
  assert.match(hostingReason(state, "E", "left-1"), /最小宽度/); act(state, "move"); assert.equal(hostingLocation(state, "E").id, "left-2");
});
test("ordering only changes its section and invalid drops never duplicate or cross sections", () => {
  const state = fixture(); beginLayoutEdit(state); act(state, "select", "B"); act(state, "destination", "right-1"); act(state, "move");
  const page = hostingPage(state, "right-1"); assert.deepEqual(hostingOrder(page, "B"), ["G", "B"]);
  act(state, "order", { id: "B", delta: -1 }); assert.deepEqual(hostingOrder(page, "B"), ["B", "G"]);
  assert.equal(page.items[0], "F"); assert.equal(page.items[2], "H");
  const before = structuredClone(state.contentHosting); act(state, "drag", "B"); act(state, "drop", "F"); assert.deepEqual(state.contentHosting, before); assert.match(state.hostingMemory.result, /落点无效/);
  act(state, "drag", "B"); act(state, "drop", "G"); assert.deepEqual(hostingOrder(page, "B"), ["G", "B"]); unique(state);
});
test("remove/rejoin retains inputs, icon hiding keeps assignments and all hidden entries can recover", () => {
  const state = fixture("hidden"); beginLayoutEdit(state); state.hostingMemory.inputs.A = "保留";
  act(state, "toggle", "A"); assert.equal(hostingLocation(state, "A"), undefined); act(state, "toggle", "A");
  assert.equal(state.hostingMemory.inputs.A, "保留"); act(state, "icon", "A"); assert.equal(state.contentHosting.hidden.includes("A"), false); unique(state);
});
test("icon order is local to the hosting side and first/last operations are bounded", () => {
  const state = fixture(); beginLayoutEdit(state); const initial = [...state.contentHosting.iconOrder];
  act(state, "icon-order", { id: "A", delta: -1 }); assert.deepEqual(state.contentHosting.iconOrder, initial);
  act(state, "icon-order", { id: "B", delta: 1 }); assert.deepEqual(state.contentHosting.iconOrder.slice(5), initial.slice(5));
  const known = state.contentHosting.pages.flatMap(page => page.items); assert.ok(known.every(id => HOSTING_CONTENT.some(item => item.id === id)));
});
