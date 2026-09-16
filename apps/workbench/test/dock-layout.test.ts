import assert from "node:assert/strict";
import test from "node:test";
import { clampDockLayout, COLLAPSED_DOCK_SIZE, dockSizeBounds, dockTrackSize, DOCK_LAYOUT_DEFAULTS, DOCK_VISIBILITY_DEFAULTS, keyboardResizeDock, mergeDockPreferences, resetDockSize, resizeDock, toggleDockVisibility } from "../src/workbench/dock-layout.ts";

test("a fresh workbench exposes every dock region", () => {
  assert.deepEqual(DOCK_VISIBILITY_DEFAULTS, { top: true, right: true, bottom: true, left: true });
});

test("dock layout keeps a usable central workspace on desktop", () => {
  const layout = clampDockLayout(DOCK_LAYOUT_DEFAULTS, { width: 1440, height: 900 });
  assert.deepEqual(layout, DOCK_LAYOUT_DEFAULTS);
  assert.ok(1440 - layout.left - layout.right >= 480);
  assert.ok(900 - layout.top - layout.bottom >= 280);
});

test("dock layout compresses to narrow rails without losing the center", () => {
  const layout = clampDockLayout({ left: 320, right: 420, top: 180, bottom: 240 }, { width: 760, height: 700 });
  assert.equal(layout.left, 44);
  assert.equal(layout.right, 44);
  assert.ok(760 - layout.left - layout.right >= 480);
  assert.ok(700 - layout.top - layout.bottom >= 280);
});

test("splitters support pointer deltas and keyboard alternatives", () => {
  const viewport = { width: 1440, height: 900 };
  const widened = resizeDock(DOCK_LAYOUT_DEFAULTS, "left", 80, viewport);
  assert.equal(widened.left, 288);
  assert.equal(resizeDock(DOCK_LAYOUT_DEFAULTS, "right", -80, viewport).right, 360);
  assert.equal(keyboardResizeDock(DOCK_LAYOUT_DEFAULTS, "top", "ArrowDown", 8, viewport)?.top, 64);
  assert.equal(keyboardResizeDock(DOCK_LAYOUT_DEFAULTS, "right", "ArrowLeft", 8, viewport)?.right, 288);
  assert.equal(keyboardResizeDock(DOCK_LAYOUT_DEFAULTS, "right", "ArrowRight", 8, viewport)?.right, 272);
  assert.equal(keyboardResizeDock(DOCK_LAYOUT_DEFAULTS, "bottom", "ArrowUp", 8, viewport)?.bottom, 144);
  assert.equal(keyboardResizeDock(DOCK_LAYOUT_DEFAULTS, "bottom", "ArrowDown", 8, viewport)?.bottom, 128);
  assert.equal(keyboardResizeDock(DOCK_LAYOUT_DEFAULTS, "left", "Home", 8, viewport), null);
});

test("dock region visibility is independently reversible", () => {
  const hiddenLeft = toggleDockVisibility(DOCK_VISIBILITY_DEFAULTS, "left");
  assert.equal(hiddenLeft.left, false);
  assert.equal(hiddenLeft.right, true);
  assert.deepEqual(toggleDockVisibility(hiddenLeft, "left"), DOCK_VISIBILITY_DEFAULTS);
});

test("collapsed docks keep a reversible compact track", () => {
  const hidden = toggleDockVisibility(DOCK_VISIBILITY_DEFAULTS, "left");
  assert.equal(dockTrackSize(DOCK_LAYOUT_DEFAULTS, hidden, "left"), COLLAPSED_DOCK_SIZE);
  assert.equal(dockTrackSize(DOCK_LAYOUT_DEFAULTS, hidden, "right"), DOCK_LAYOUT_DEFAULTS.right);
  assert.equal(dockTrackSize(DOCK_LAYOUT_DEFAULTS, DOCK_VISIBILITY_DEFAULTS, "left"), DOCK_LAYOUT_DEFAULTS.left);
});

test("a dock can reset independently", () => {
  const viewport = { width: 1440, height: 900 };
  const changed = resizeDock(DOCK_LAYOUT_DEFAULTS, "left", 100, viewport);
  assert.equal(resetDockSize(changed, "left", viewport).left, DOCK_LAYOUT_DEFAULTS.left);
});

test("splitter semantics expose the real axis bounds", () => {
  assert.deepEqual(dockSizeBounds("left", { width: 1440, height: 900 }), { min: 144, max: 420 });
  assert.deepEqual(dockSizeBounds("left", { width: 760, height: 700 }), { min: 44, max: 420 });
  assert.deepEqual(dockSizeBounds("top", { width: 1440, height: 900 }), { min: 40, max: 240 });
});

test("resizing a band in a compact window preserves the user's desktop side widths", () => {
  const preferred = { left: 356, right: 216, top: 56, bottom: 136 };
  const viewport = { width: 772, height: 936 };
  const displayed = clampDockLayout(preferred, viewport);
  const next = resizeDock(displayed, "top", 24, viewport);
  const saved = mergeDockPreferences(preferred, displayed, next);
  assert.deepEqual(saved, { ...preferred, top: 80 });
  assert.deepEqual(clampDockLayout(saved, { width: 1440, height: 900 }), saved);
  const reset = mergeDockPreferences(saved, next, resetDockSize(next, "top", viewport));
  assert.deepEqual(reset, preferred);
});
