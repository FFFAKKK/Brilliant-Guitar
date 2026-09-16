import assert from "node:assert/strict";
import test from "node:test";
import { resizePanel } from "../src/workbench/panel-layout.ts";
import { clampScoreZoom, layoutNotationViewport } from "../src/notation/notation-viewport.ts";
import type { StaffView } from "../src/contracts/notation.ts";

const definition = { id: "test-panel", title: "测试面板", minWidth: 280, minHeight: 240 };

test("pointer resizing follows the grabbed edge and clamps to work area and minimum dimensions", () => {
  const start = { width: 600, height: 400 }, bounds = { width: 900, height: 700 };
  assert.deepEqual(resizePanel(start, { x: -150, y: -100 }, "corner", bounds, definition), { mode: "fixed", width: 450, height: 300 });
  assert.deepEqual(resizePanel(start, { x: -150, y: -100 }, "right", bounds, definition), { mode: "fixed", width: 450, height: 400 });
  assert.deepEqual(resizePanel(start, { x: -150, y: -100 }, "bottom", bounds, definition), { mode: "fixed", width: 600, height: 300 });
  assert.deepEqual(resizePanel(start, { x: -2000, y: -2000 }, "corner", bounds, definition), { mode: "fixed", width: 280, height: 240 });
  assert.deepEqual(resizePanel(start, { x: 2000, y: 2000 }, "corner", bounds, definition), { mode: "fixed", width: 900, height: 700 });
  assert.deepEqual(resizePanel(start, { x: 0, y: 0 }, "corner", { width: 220, height: 180 }, definition), { mode: "fixed", width: 220, height: 180 });
});

test("zoom is bounded and changes engraving scale and wrapping, not the requested panel width", () => {
  const view: StaffView = { kind: "staff", partId: "p1", staffId: "s1", clef: "treble",
    measures: Array.from({ length: 8 }, (_, index) => ({ id: `m${index}`, voiceId: `v${index}`, meter: { numerator: 4, denominator: 4 }, events: [] })),
  };
  const before = structuredClone(view);
  const normal = layoutNotationViewport(view, 1000, 100);
  const enlarged = layoutNotationViewport(view, 1000, 200);
  assert.equal(normal.displayWidth, 1000);
  assert.equal(enlarged.displayWidth, 1000);
  assert.equal(enlarged.scale, 2);
  assert.ok(enlarged.layout.measures.at(-1)!.system > normal.layout.measures.at(-1)!.system);
  assert.deepEqual(enlarged.layout.measures.map((item) => item.measure.id), view.measures.map((measure) => measure.id));
  assert.deepEqual(view, before);
  assert.equal(clampScoreZoom(10), 50);
  assert.equal(clampScoreZoom(300), 200);
  assert.equal(clampScoreZoom(NaN), 100);
});

test("narrow zoomed view keeps notation legible with bounded horizontal overflow instead of clipping", () => {
  const view: StaffView = { kind: "staff", partId: "p1", staffId: "s1", clef: "treble",
    measures: [{ id: "m1", voiceId: "v1", meter: { numerator: 4, denominator: 4 }, events: [] }],
  };
  for (const zoom of [50, 75, 100, 125, 150, 175, 200]) {
    const viewport = layoutNotationViewport(view, 250, zoom);
    assert.ok(viewport.displayWidth <= Math.max(250, 240 * viewport.scale));
    assert.ok(viewport.layout.measures[0]!.x + viewport.layout.measures[0]!.width <= viewport.layout.width);
    assert.ok(viewport.displayHeight > 0);
  }
});
