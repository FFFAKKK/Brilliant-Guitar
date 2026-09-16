import assert from "node:assert/strict";
import test from "node:test";
import { clampInspectorWidth, INSPECTOR_WIDTH, nextInspectorWidth } from "../src/workbench/inspector-layout.ts";

test("inspector width preserves score space and follows stable presets", () => {
  assert.equal(clampInspectorWidth(100, 1200), INSPECTOR_WIDTH.min);
  assert.equal(clampInspectorWidth(800, 1200), INSPECTOR_WIDTH.max);
  assert.equal(clampInspectorWidth(360, 770), 290);
  assert.equal(nextInspectorWidth(240, 1200), INSPECTOR_WIDTH.default);
  assert.equal(nextInspectorWidth(INSPECTOR_WIDTH.default, 1200), INSPECTOR_WIDTH.wide);
  assert.equal(nextInspectorWidth(INSPECTOR_WIDTH.wide, 1200), INSPECTOR_WIDTH.min);
});
