import assert from "node:assert/strict";
import test from "node:test";
import { bindUiProjection, defineUiProjection, UiProjectionRegistry } from "../src/ui/projection-registry.ts";

const score = defineUiProjection<{ readonly title: string }>("score.document");
const selection = defineUiProjection<{ readonly count: number }>("score.selection");

test("a projection snapshot exposes typed values from the current application render", () => {
  const registry = new UiProjectionRegistry([score, selection]);
  const snapshot = registry.snapshot([
    bindUiProjection(score, { title: "练习曲" }),
    bindUiProjection(selection, { count: 2 }),
  ]);
  assert.equal(snapshot.get(score).title, "练习曲");
  assert.equal(snapshot.get(selection).count, 2);
});

test("projection bindings reject unknown and duplicate contracts", () => {
  const registry = new UiProjectionRegistry([score]);
  assert.throws(() => registry.snapshot([bindUiProjection(selection, { count: 1 })]), /Unknown/);
  assert.throws(() => registry.snapshot([
    bindUiProjection(score, { title: "A" }), bindUiProjection(score, { title: "B" }),
  ]), /Duplicate/);
});

test("projection keys and registrations have stable unique identities", () => {
  assert.throws(() => defineUiProjection("Invalid Projection"), /Invalid/);
  const registry = new UiProjectionRegistry([score]);
  assert.throws(() => registry.register(score), /already registered/);
  assert.deepEqual(registry.list().map((item) => item.id), ["score.document"]);
});
