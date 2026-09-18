import assert from "node:assert/strict";
import test from "node:test";
import type { NotationInteractionGeometry } from "../src/notation/notation-renderer.ts";
import { resolveStaffRangeGeometry } from "../src/editor/staff-range-geometry.ts";

const geometry: NotationInteractionGeometry = {
  anchors: [],
  measures: [{ measureId: "m1", x: 20, y: 10, width: 180, height: 90, staffBottom: 70, lineSpacing: 10 }],
  events: [
    { measureId: "m1", eventId: "high", x: 50, y: 2, width: 12, height: 40 },
    { measureId: "m1", eventId: "low", x: 100, y: 62, width: 16, height: 38 },
  ],
};

test("range band follows event width but keeps stable staff-aligned height", () => {
  assert.deepEqual(resolveStaffRangeGeometry(geometry, "m1", ["high", "low"]), {
    x: 47, y: 23.5, width: 72, height: 53.5,
  });
  assert.equal(resolveStaffRangeGeometry(geometry, "m1", ["high"]), null);
  assert.equal(resolveStaffRangeGeometry(geometry, "m1", ["high", "missing"]), null);
});
