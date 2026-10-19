import test from "node:test";
import assert from "node:assert/strict";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { WORKSPACE_SIZE_KEYS } from "../src/workspace-geometry.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { createWorkspaceLayoutVisual } from "../src/shell/workspace-layout-visual.js";
import { withTestDocument } from "./support/dom-test-environment.js";

function withRuntime(run) {
  return withTestDocument(() => {
    const root = document.createElement("main"); document.body.append(root);
    const runtime = createBackupUiRuntime({ root, animationProvider: null });
    const query = selector => root.querySelector(selector);
    const execute = (command, payload = {}) => {
      const result = runtime.execute(command, payload); assert.equal(result.ok, true, command); return result;
    };
    const choose = id => { const node = query("#layout-content-choice"); node.value = id; node.dispatchEvent(new Event("change")); };
    try {
      execute(C.page, { id: "frame.layout.page", toggle: false });
      return run({ root, runtime, query, execute, choose });
    } finally { runtime.dispose(); root.remove(); }
  });
}
function key(node, name) {
  const event = new Event("keydown", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "key", { value: name }); node.dispatchEvent(event); return event;
}

for (const [side, outward, inward, unrelated] of [
  ["left", "ArrowLeft", "ArrowRight", "ArrowUp"],
  ["right", "ArrowRight", "ArrowLeft", "ArrowDown"],
  ["top", "ArrowUp", "ArrowDown", "ArrowLeft"],
  ["voice", "ArrowDown", "ArrowUp", "ArrowRight"],
]) test(`${side} grip keyboard movement follows the divider direction on its own axis`, () => withRuntime(f => {
  f.execute(C.configureRegion, { region: side, open: true });
  const node = f.query("#grip-" + side), size = WORKSPACE_SIZE_KEYS[side];
  const before = f.runtime.workspace.snapshot();
  assert.equal(key(node, inward).defaultPrevented, true);
  assert.equal(f.runtime.workspace.snapshot()[size], before[size] + 4);
  for (const [peer, peerKey] of Object.entries(WORKSPACE_SIZE_KEYS)) if (peer !== side) {
    assert.equal(f.runtime.workspace.snapshot()[peerKey], before[peerKey], peer + " stays independent");
  }
  key(node, outward); assert.equal(f.runtime.workspace.snapshot()[size], before[size]);
  const unchanged = f.runtime.workspace.snapshot();
  assert.equal(key(node, unrelated).defaultPrevented, false);
  assert.ok(f.runtime.workspace.snapshot() === unchanged, "unrelated axis is not a resize command");
}));

for (const prefix of ["size", "range", "reset"]) test(`disabled ${prefix} control returns focus to its local region toggle`, () => withRuntime(f => {
  f.execute(C.configureRegion, { region: "left", open: true });
  f.execute(C.resize, { side: "left", value: 300 });
  const field = f.query(`#layout-${prefix}-left`); assert.equal(field.disabled, false); field.focus();
  f.execute(C.configureRegion, { region: "left", open: false });
  assert.equal(field.disabled, true);
  assert.equal(document.activeElement?.id, "layout-left");
}));

test("content reorder reaching the boundary keeps focus in the component chooser", () => withRuntime(f => {
  f.query("#composer-edit").click(); f.choose("frame.builtin.assistant");
  const up = f.query("#layout-content-up"); assert.equal(up.disabled, false); up.focus(); up.click();
  assert.equal(up.disabled, true);
  assert.equal(document.activeElement?.id, "layout-content-choice");
}));

test("zoom gesture hint has image semantics without a dead button or extra tab stop", () => withRuntime(f => {
  const node = f.query(".v-layout-zoom-help");
  assert.equal(node.tagName, "SPAN"); assert.equal(node.getAttribute("role"), "img");
  assert.equal(node.getAttribute("tabindex"), null);
  assert.equal(node.getAttribute("aria-label"), "Ctrl 加滚轮连续调整谱面缩放");
  assert.equal(node.textContent, "");
}));

test("late blur after closing a region cannot commit a stale invalid size draft", () => withRuntime(f => {
  f.execute(C.configureRegion, { region: "left", open: true });
  const input = f.query("#layout-size-left"); input.focus(); input.value = "999";
  input.dispatchEvent(new Event("input")); assert.equal(input.getAttribute("aria-invalid"), "true");
  const width = f.runtime.workspace.snapshot().leftWidth;
  f.execute(C.configureRegion, { region: "left", open: false });
  // Simulate a previously queued callback; disabled inputs cannot receive fresh user input.
  input.value = "999"; input.dispatchEvent(new Event("blur"));
  assert.equal(f.runtime.workspace.snapshot().leftWidth, width);
  assert.equal(Number(input.value), width);
  f.execute(C.configureRegion, { region: "left", open: true });
  input.focus(); input.value = "999"; input.dispatchEvent(new Event("input")); input.dispatchEvent(new Event("blur"));
  assert.equal(f.runtime.workspace.snapshot().leftWidth, Number(input.max), "active blur still clamps to the real capacity");
}));

test("disabled and released size callbacks do not invoke commands", () => withTestDocument(() => {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  const calls = [], state = store.read.snapshot();
  const view = createWorkspaceLayoutVisual({ state, begin() {}, region() {}, arrange() {}, resize: (...args) => calls.push(args) });
  document.body.append(view.element);
  const input = view.element.querySelector("#layout-size-left"), range = view.element.querySelector("#layout-range-left");
  const restore = view.element.querySelector("#layout-reset-left");
  assert.equal(input.disabled, true); input.value = "300"; input.dispatchEvent(new Event("input"));
  input.dispatchEvent(new Event("blur")); range.value = "300"; range.dispatchEvent(new Event("input"));
  restore.dispatchEvent(new Event("click")); assert.deepEqual(calls, []);
  view.update({ ...state, leftOpen: true }); view.dispose();
  input.value = "300"; input.dispatchEvent(new Event("input")); input.dispatchEvent(new Event("blur"));
  range.value = "300"; range.dispatchEvent(new Event("input")); restore.dispatchEvent(new Event("click"));
  assert.deepEqual(calls, []); view.element.remove();
}));

test("accepted runtime workflow preserves private preview, content rollback, geometry and mounted input", () => withRuntime(f => {
  f.execute(C.page, { id: "frame.builtin.assistant", toggle: false });
  const note = f.query("#page-input"); note.value = "保留正在输入的内容";
  f.execute(C.page, { id: "frame.layout.page", toggle: false });
  const paper = f.query(".v-paper"), number = f.query("#layout-size-right");
  const before = f.runtime.workspace.snapshot();
  f.query("#layout-compact").click();
  assert.equal(f.runtime.workspace.snapshot(), before, "forecast is local only");
  assert.equal(Number(number.value), before.rightWidth);
  f.query("#layout-apply-arrangement").click();
  assert.equal(f.runtime.workspace.snapshot().rightWidth, 230);
  assert.equal(f.runtime.workspace.snapshot().topHeight, 80);
  f.execute(C.zoom, { value: 87.5 });
  const choices = f.query("#layout-content-choice");
  const initialOrder = [...choices.children].map(node => node.getAttribute("value"));
  f.query("#composer-edit").click(); f.choose("frame.builtin.assistant");
  f.query("#layout-content-up").click(); f.query("#layout-content-toggle").click();
  assert.equal(f.query("#layout-content-toggle").getAttribute("aria-pressed"), "false");
  const range = f.query("#layout-range-right"); range.value = "300"; range.dispatchEvent(new Event("input"));
  const top = f.query("#layout-size-top"); top.value = "100"; top.dispatchEvent(new Event("input"));
  f.query("#edge-handle-left").click(); key(f.query("#grip-left"), "ArrowRight");
  f.query("#layout-left").click();
  f.query("#layout-cancel").click();
  assert.deepEqual([...choices.children].map(node => node.getAttribute("value")), initialOrder);
  assert.equal(f.query("#layout-content-toggle").getAttribute("aria-pressed"), "true");
  assert.equal(f.runtime.workspace.snapshot().rightWidth, 300);
  assert.equal(f.runtime.workspace.snapshot().topHeight, 100);
  assert.equal(f.runtime.workspace.snapshot().leftOpen, false);
  assert.equal(f.runtime.workspace.snapshot().leftWidth, 234);
  assert.equal(Number(f.query("#layout-zoom-value").value), 87.5);
  assert.equal(f.query(".v-paper"), paper); assert.equal(f.query("#layout-size-right"), number);
  f.execute(C.page, { id: "frame.builtin.assistant", toggle: false });
  assert.equal(f.query("#page-input"), note); assert.equal(note.value, "保留正在输入的内容");
  f.execute(C.page, { id: "frame.layout.page", toggle: false });
  f.query("#composer-edit").click(); f.query("#layout-content-toggle").click(); f.query("#layout-confirm").click();
  assert.equal(f.query("#layout-content-toggle").getAttribute("aria-pressed"), "false");
  f.query("#composer-edit").click(); f.query("#layout-content-toggle").click(); f.query("#layout-cancel").click();
  assert.equal(f.query("#layout-content-toggle").getAttribute("aria-pressed"), "false", "cancel uses the last confirmed baseline");
  assert.equal(note.value, "保留正在输入的内容"); assert.equal(f.query(".v-paper"), paper);
}));


test("restoring the default and hiding the page recover to usable local or rail controls", () => withRuntime(f => {
  f.execute(C.configureRegion, { region: "left", open: true }); f.execute(C.resize, { side: "left", value: 300 });
  const reset = f.query("#layout-reset-left"); reset.focus(); reset.click();
  assert.equal(reset.disabled, true); assert.equal(document.activeElement?.id, "layout-left");
  f.query("#layout-size-right").focus(); f.query("#layout-right").click();
  assert.equal(document.activeElement?.id, "page-tab-frame.layout.page", "the hidden page cannot recover to a hidden local node");
}));

for (const mode of ["denied", "hidden", "released"]) test(`${mode} size callbacks cannot emit commands`, () => withTestDocument(() => {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  const state = { ...store.read.snapshot(), leftOpen: true }, calls = [];
  const view = createWorkspaceLayoutVisual({ state, begin() {}, region() {}, arrange() {}, resize: (...args) => calls.push(args) });
  document.body.append(view.element);
  if (mode === "denied") view.update(state, null, [], { actions: [] });
  if (mode === "hidden") view.setVisible(false);
  if (mode === "released") view.dispose();
  const input = view.element.querySelector("#layout-size-left"), range = view.element.querySelector("#layout-range-left");
  input.value = "300"; input.dispatchEvent(new Event("input")); input.dispatchEvent(new Event("blur"));
  range.value = "300"; range.dispatchEvent(new Event("input"));
  view.element.querySelector("#layout-reset-left").dispatchEvent(new Event("click"));
  assert.deepEqual(calls, []);
  if (mode !== "released") assert.equal(Number(input.value), state.leftWidth, "unavailable draft restores the accepted value");
  view.dispose(); view.element.remove();
}));
