import assert from "node:assert/strict";
import test from "node:test";
import { workbenchPlugins } from "../src/ui/workbench-plugins.ts";

test("view contributions attach presentation to installed definitions without changing the logical contract", () => {
  const views = workbenchPlugins.indexViews([
    { componentId: "notation.staff-view", label: "五线谱", render: () => null },
    { componentId: "notation.note-input", label: "音符控制", render: () => null },
  ]);
  assert.equal(views.get("notation.staff-view")?.label, "五线谱");
  assert.equal(workbenchPlugins.components.get("notation.staff-view")?.kind, "view");
  assert.throws(() => workbenchPlugins.indexViews(
    [{ componentId: "unknown", label: "未知", render: () => null }]), /not declared/);
  assert.throws(() => workbenchPlugins.indexViews([
    { componentId: "notation.staff-view", label: "A", render: () => null },
    { componentId: "notation.staff-view", label: "B", render: () => null },
  ]), /Duplicate/);
});
