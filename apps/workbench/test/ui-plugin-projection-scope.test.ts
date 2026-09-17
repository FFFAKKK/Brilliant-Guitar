import assert from "node:assert/strict";
import test from "node:test";
import { bindUiProjection, defineUiProjection, UiProjectionRegistry } from "../src/ui/projection-registry.ts";

test("plugin projection readers reveal only declared application state", () => {
  const input = defineUiProjection<{ readonly enabled: boolean }>("score.input");
  const document = defineUiProjection<{ readonly title: string }>("score.document");
  const snapshot = new UiProjectionRegistry([input, document]).snapshot([
    bindUiProjection(input, { enabled: true }), bindUiProjection(document, { title: "隐藏" }),
  ]);
  const scoped = snapshot.scoped([input]);
  assert.equal(scoped.get(input).enabled, true);
  assert.throws(() => scoped.get(document), /not declared/);
});
