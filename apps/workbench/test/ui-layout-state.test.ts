import assert from "node:assert/strict";
import test from "node:test";
import { listUiComponentsInSlot, moveUiComponent, reconcileUiLayout, restoreUiLayout, setUiComponentPresentation, setUiComponentVisibility } from "../src/ui/layout-state.ts";
import { workbenchPlugins } from "../src/ui/workbench-plugins.ts";

const COMPONENTS = workbenchPlugins.components.list();

test("layout reconciliation installs valid defaults and rejects unknown persisted components", () => {
  const state = reconcileUiLayout(COMPONENTS, {
    version: 1,
    placements: [
      { componentId: "unknown", slot: "left", presentation: "panel", order: 0, visible: true },
      { componentId: "notation.note-input", slot: "workspace", presentation: "panel", order: 0, visible: true },
    ],
  });
  assert.deepEqual(state.placements.map((placement) => [placement.componentId, placement.slot]), [
    ["notation.staff-view", "workspace"],
    ["notation.history-control", "top"],
    ["notation.paper-zoom", "top"],
    ["notation.note-input", "left"],
  ]);
});

test("an older saved layout gains horizontal history and zoom tools without moving existing components", () => {
  const older = reconcileUiLayout(COMPONENTS, { version: 2, placements: [
    { componentId: "notation.staff-view", slot: "workspace", presentation: "inline", order: 0, visible: true },
    { componentId: "notation.note-input", slot: "left", presentation: "panel", order: 0, visible: true },
  ] });
  assert.deepEqual(listUiComponentsInSlot(older, "top").map((item) => item.componentId),
    ["notation.history-control", "notation.paper-zoom"]);
  assert.equal(listUiComponentsInSlot(older, "left")[0]?.componentId, "notation.note-input");
});

test("old default bottom placement migrates once while an intentional V2 bottom placement persists", () => {
  const old = reconcileUiLayout(COMPONENTS, { version: 1, placements: [
    { componentId: "notation.note-input", slot: "bottom", presentation: "panel", order: 0, visible: true },
  ] });
  assert.equal(old.version, 2);
  assert.equal(old.placements.find((item) => item.componentId === "notation.note-input")?.slot, "left");
  const deliberate = moveUiComponent(old, COMPONENTS, "notation.note-input", "bottom");
  assert.equal(reconcileUiLayout(COMPONENTS, deliberate).placements.find((item) => item.componentId === "notation.note-input")?.slot, "bottom");
});

test("dockable components move only to declared slots while the staff remains in the workspace", () => {
  const initial = reconcileUiLayout(COMPONENTS, null);
  const moved = moveUiComponent(initial, COMPONENTS, "notation.note-input", "left");
  assert.equal(moved.placements.find((item) => item.componentId === "notation.note-input")?.slot, "left");
  assert.equal(moveUiComponent(initial, COMPONENTS, "notation.note-input", "workspace"), initial);
  assert.equal(moveUiComponent(initial, COMPONENTS, "notation.staff-view", "left"), initial);
});

test("two registered components share one dock without losing their saved order", () => {
  const initial = reconcileUiLayout(COMPONENTS, null);
  const joined = moveUiComponent(initial, COMPONENTS, "notation.paper-zoom", "left", 1);
  assert.deepEqual(listUiComponentsInSlot(joined, "left").map((item) => item.componentId),
    ["notation.note-input", "notation.paper-zoom"]);
  const restored = reconcileUiLayout(COMPONENTS, joined);
  assert.deepEqual(listUiComponentsInSlot(restored, "left").map((item) => [item.componentId, item.order]),
    [["notation.note-input", 0], ["notation.paper-zoom", 1]]);
});

test("visibility and presentation are logical state, independent of component markup", () => {
  const initial = reconcileUiLayout(COMPONENTS, null);
  const hidden = setUiComponentVisibility(initial, "notation.paper-zoom", false);
  assert.deepEqual(listUiComponentsInSlot(hidden, "top").map((item) => item.componentId), ["notation.history-control"]);
  const popover = setUiComponentPresentation(initial, COMPONENTS, "notation.paper-zoom", "popover");
  assert.equal(popover.placements.find((item) => item.componentId === "notation.paper-zoom")?.presentation, "popover");
  assert.equal(setUiComponentPresentation(initial, COMPONENTS, "notation.staff-view", "dialog"), initial);
});

test("persisted layouts are validated, migrated and recovered before the workbench consumes them", () => {
  const invalid = restoreUiLayout(COMPONENTS, { version: 2, placements: [{ componentId: "unknown", slot: "left",
    presentation: "panel", order: 0, visible: true }] });
  assert.equal(invalid.recovered, true);
  assert.equal(invalid.reason, "invalid-placement");
  assert.ok(invalid.state.placements.some((item) => item.componentId === "notation.staff-view"));
  const unsupported = restoreUiLayout(COMPONENTS, { version: 99, placements: [] });
  assert.equal(unsupported.reason, "unsupported-version");
  const clean = restoreUiLayout(COMPONENTS, { version: 2, placements: invalid.state.placements });
  assert.equal(clean.recovered, false);
});
