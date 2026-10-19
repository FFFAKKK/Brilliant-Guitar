import assert from "node:assert/strict";
import test from "node:test";
import { importPreviewForTest } from "./support/workspace-runtime-test.js";
import { withTestDocument } from "./support/dom-test-environment.js";

test("preview mounts the core score view through the component host and releases it", () => withTestDocument(async () => {
  const { root, runtime, components } = await importPreviewForTest();
  const view = root.querySelector(".core-score-view");
  assert.ok(view);
  assert.equal(view.getAttribute("aria-label"), "五线谱");
  assert.equal(view.getAttribute("data-component"), "notation.core.view");
  assert.ok(["loading", "error"].includes(view.getAttribute("data-render-state")));
  assert.equal(root.querySelector(".v-paper img"), null);
  assert.equal(root.querySelector(".v-paper .score-view-message"), null);
  assert.ok(components.mounted().includes("notation.core.view"));
  assert.equal(view.querySelector(".score-event-controls"), null, "fixture without write ports remains readonly");

  runtime.dispose();
  assert.equal(root.querySelector(".core-score-view"), null);
  assert.deepEqual(components.mounted(), []);
}));
