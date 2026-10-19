import assert from "node:assert/strict";
import test from "node:test";
import { projectLayoutPreview } from "../src/fixtures/motion-pilot/layout-preview.js";
import { WORKSPACE_DEFAULT_SIZES, WORKSPACE_MINIMUMS, WORKSPACE_MAXIMUMS } from "../src/workspace-geometry.js";

test("schematic keeps paired defaults symmetric and all shared boundaries connected", () => {
  for (const [width, height] of [[242, 56], [280, 120], [304, 156]]) {
    for (const sizes of [WORKSPACE_DEFAULT_SIZES, WORKSPACE_MINIMUMS, WORKSPACE_MAXIMUMS]) {
      const input = { sizes, regions: { left: true, right: true, top: true, voice: true } };
      const shapes = projectLayoutPreview(input, width, height);
      assert.equal(shapes.left.width, shapes.right.width);
      assert.equal(shapes.top.height, shapes.voice.height);
      assert.equal(shapes.stage.x, shapes.left.width + 4);
      assert.ok(Math.abs(shapes.right.x - shapes.stage.x - shapes.stage.width - 4) < 1e-10);
      assert.equal(shapes.stage.y, shapes.top.height + 4);
      assert.ok(Math.abs(shapes.voice.y - shapes.stage.y - shapes.stage.height - 4) < 1e-10);
      for (const shape of Object.values(shapes)) {
        assert.ok(shape.width > 0 && shape.height > 0 && shape.x >= 0 && shape.y >= 0);
        assert.ok(shape.x + shape.width <= width + 1e-10 && shape.y + shape.height <= height + 1e-10);
      }
    }
  }
});

test("closing a side preserves its preference and the opposite rectangle's size", () => {
  const input = { sizes: { ...WORKSPACE_DEFAULT_SIZES, left: 400 }, regions: { left: true, right: true, top: true, voice: true } };
  const before = projectLayoutPreview(input, 280, 120);
  const after = projectLayoutPreview({ ...input, regions: { ...input.regions, left: false } }, 280, 120);
  assert.equal(input.sizes.left, 400);
  assert.equal(after.left.width, 3); assert.equal(after.left.opacity, .28);
  assert.deepEqual(after.right, before.right);
  assert.ok(after.stage.width > before.stage.width);
  const none = projectLayoutPreview({ ...input, regions: { left: false, right: false, top: false, voice: false } }, 280, 120);
  assert.equal(none.stage.x, 7); assert.equal(none.stage.y, 7);
  assert.equal(none.stage.width, 266); assert.equal(none.stage.height, 106);
});
