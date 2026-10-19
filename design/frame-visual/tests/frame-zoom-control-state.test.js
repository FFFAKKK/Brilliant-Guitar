import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceLayoutVisual } from "../src/shell/workspace-layout-visual.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { isUnavailable, pathFrom } from "../src/host/focus-boundary.js";
import { withTestDocument } from "./support/dom-test-environment.js";

function fixture() {
  const state = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 }).read.snapshot(), calls = [];
  const view = createWorkspaceLayoutVisual({ state, begin() {}, region() {}, arrange() {}, resize() {},
    view: { snapshot: () => ({ zoom: 100 }) }, zoom: value => calls.push([C.zoom, value]), fit: () => calls.push([C.fit]) });
  document.body.append(view.element);
  const query = id => view.element.querySelector("#" + id);
  const allow = id => view.update(state, null, [], { actions: [{ id, enabled: true, checked: null, keys: [] }] });
  return { view, calls, query, allow, dispose() { view.dispose(); view.element.remove(); } };
}

test("fit and zoom expose independent command availability without disabling a container", () => withTestDocument(() => {
  const f = fixture();
  try {
    const range = f.query("layout-zoom-range"), input = f.query("layout-zoom-value"), fit = f.query("layout-zoom-fit");
    f.allow(C.fit);
    assert.equal(range.disabled, true); assert.equal(input.disabled, true); assert.equal(fit.disabled, false);
    assert.equal(isUnavailable(pathFrom(fit)), false, "an unavailable zoom command cannot disable the independent fit action");
    fit.click(); assert.deepEqual(f.calls, [[C.fit]]);
    range.value = "120"; range.dispatchEvent(new Event("input"));
    input.value = "120"; input.dispatchEvent(new Event("input")); assert.deepEqual(f.calls, [[C.fit]]);
    f.allow(C.zoom); assert.equal(fit.disabled, true); assert.match(fit.title, /没有.*权限/);
    fit.dispatchEvent(new Event("click")); assert.deepEqual(f.calls, [[C.fit]]);
    input.value = "120"; input.dispatchEvent(new Event("input")); assert.deepEqual(f.calls, [[C.fit], [C.zoom, 120]]);
  } finally { f.dispose(); }
}));

test("hidden and released zoom callbacks cannot emit actions or rewrite a disposed draft", () => withTestDocument(() => {
  const f = fixture();
  try {
    const range = f.query("layout-zoom-range"), input = f.query("layout-zoom-value"), fit = f.query("layout-zoom-fit");
    f.view.setVisible(false);
    range.value = "130"; range.dispatchEvent(new Event("input")); input.value = "130"; input.dispatchEvent(new Event("input"));
    fit.dispatchEvent(new Event("click")); assert.deepEqual(f.calls, []);
    f.view.setVisible(true); f.view.dispose();
    range.value = "140"; range.dispatchEvent(new Event("input")); input.value = "140"; input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new Event("blur")); fit.dispatchEvent(new Event("click"));
    assert.deepEqual(f.calls, []); assert.equal(input.value, "140");
  } finally { f.dispose(); }
}));
