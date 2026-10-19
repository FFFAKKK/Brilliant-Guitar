import test from "node:test";
import assert from "node:assert/strict";
import { fixtureFor } from "../src/fixtures/preview-scenarios.js";
import { applySidebarReview } from "../src/fixtures/sidebar-visuals.js";
import { canEditLayout, requiresLayoutEdit, beginLayoutEdit, finishLayoutEdit, prepareLayoutFixture } from "../src/fixtures/layout-edit-state.js";

function fixture() {
  const state = fixtureFor();
  applySidebarReview(state, new URLSearchParams("presentation=grid"));
  return state;
}

test("layout mutations require the unified mode while ordinary content actions remain usable", () => {
  for (const action of ["module", "module-remove", "module-width", "module-move", "content-select", "content-drag", "content-drop", "module-menu", "icon-visibility", "icon-order", "presentation", "preset", "restore"]) assert.equal(requiresLayoutEdit(action), true, action);
  for (const action of ["resize", "layout-region", "layout-arrange", "content-focus", "content-step", "region", "page", "review-layout", "review-content", "library", "library-clear", "zoom-value"]) assert.equal(requiresLayoutEdit(action), false, action);
  assert.equal(canEditLayout({ editing: true, assembly: false }), false);
});

test("cancel restores component configuration and retains workspace use, input, selection and reading state", () => {
  const state = fixture();
  const before = structuredClone(state);
  assert.equal(beginLayoutEdit(state), true);
  state.leftWidth += 20; state.rightWidth += 32; state.topHeight += 12; state.voiceHeight += 40;
  state.topOpen = false; state.leftOpen = false; state.voiceOpen = true;
  state.arrangement = "compact"; state.presentation = "mixed";
  state.enabled.reverse(); state.enabled.pop(); state.widths.B = "full";
  state.iconOrder.reverse(); state.hiddenIcons.push("A"); state.preset = "临时方案"; state.custom = true; state.modified = true;
  state.contentInputs.B = "仍然保留"; state.contentChoices.B = 1; state.contentScroll.grid = 64; state.contentExpanded.A = false;
  const workspaceKeys = ["leftWidth", "rightWidth", "topHeight", "voiceHeight", "topOpen", "leftOpen", "rightOpen", "voiceOpen", "arrangement"];
  const used = Object.fromEntries(workspaceKeys.map(key => [key, state[key]]));
  assert.equal(finishLayoutEdit(state, false), true);
  for (const field of ["presentation", "enabled", "widths", "iconOrder", "hiddenIcons", "preset", "custom"]) assert.deepEqual(state[field], before[field], field);
  for (const field of workspaceKeys) assert.equal(state[field], used[field], field);
  assert.equal(state.contentInputs.B, "仍然保留"); assert.equal(state.contentChoices.B, 1);
  assert.equal(state.contentScroll.grid, 64); assert.equal(state.contentExpanded.A, false);
  assert.equal(state.assembly, false); assert.equal(state.editing, false); assert.equal(state.assemblyBefore, null);
});

test("confirm retains explicit top visibility and content settings and repeated begin cannot replace rollback", () => {
  const state = fixture();
  state.topOpen = false;
  beginLayoutEdit(state);
  assert.equal(state.topOpen, false, "component editing does not force the top sidebar open");
  state.topOpen = true; state.widths.B = "full"; state.enabled = ["B", "A", "C"];
  const snapshot = structuredClone(state.assemblyBefore);
  assert.equal(beginLayoutEdit(state), false);
  assert.deepEqual(state.assemblyBefore, snapshot);
  finishLayoutEdit(state, true);
  assert.equal(state.topOpen, true); assert.equal(state.widths.B, "full"); assert.deepEqual(state.enabled, ["B", "A", "C"]);
  assert.equal(canEditLayout(state), false); assert.equal(state.editing, false);
  assert.equal(finishLayoutEdit(state, false), false);
});

test("explicit legacy edit scenes and review samples use the same cancellable mode", () => {
  const state = fixtureFor("S07", "editing");
  prepareLayoutFixture(state);
  assert.equal(state.assembly, true); assert.equal(state.editing, true); assert.ok(state.assemblyBefore);
  state.widths.B = "full"; finishLayoutEdit(state, false); assert.deepEqual(state.widths, {});
  const review = fixture(); review.editing = true; prepareLayoutFixture(review);
  assert.equal(review.assembly, true); assert.ok(review.assemblyBefore);
});
