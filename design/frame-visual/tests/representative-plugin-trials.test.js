import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import { createWorkspaceRuntime } from "../src/host/workspace-runtime.js";
import { WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { SIDEBAR_COMMANDS as S } from "../src/host/sidebar-commands.js";
import { withTestDocument } from "./support/dom-test-environment.js";
import { loadRuntimeForTest } from "./support/workspace-runtime-test.js";
import { COMMAND_ONLY_IDS as A, createCommandOnlyPlugin } from "./fixtures/representative-plugins/command-only-plugin.js";
import { MOVABLE_PANEL_IDS as B, createMovablePanelPlugin } from "./fixtures/representative-plugins/movable-panel-plugin.js";
import { SHARED_ENTRY_IDS as D, createSharedEntryPlugin } from "./fixtures/representative-plugins/shared-entry-plugin.js";

function withTrials(createPlugins, run, { inspect = false } = {}) {
  return withTestDocument(async () => {
    // Node EventTarget does not remove a boolean-capture listener with remove(..., true).
    // Match browser capture semantics in this test double before counting portal listeners.
    const remove = document.removeEventListener.bind(document);
    document.removeEventListener = (type, listener, options) => remove(type, listener, options === true ? { capture: true } : options);
    const trials = createPlugins(), root = document.createElement("div"), sentinel = document.createElement("span");
    sentinel.textContent = "application-owned"; root.append(sentinel); document.body.append(root);
    let runtime;
    try {
      const factory = inspect ? await loadRuntimeForTest() : { createWorkspaceRuntime };
      runtime = factory.createWorkspaceRuntime({ root, plugins: trials.map(trial => trial.manifest) });
      return await run({ trials, root, sentinel, runtime, inspection: runtime.inspection });
    } finally { runtime?.dispose(); root.remove(); }
  });
}

function executeOk(runtime, command, payload) {
  const result = runtime.execute(command, payload);
  assert.equal(result.ok, true, `${command}: ${result.code ?? ""}`);
  return result;
}

function show(runtime, panel) { executeOk(runtime, C.page, { id: panel, toggle: false }); }
const cellFor = (root, panel) => root.querySelector(`[data-component="${panel}"]`);

function press(target, key = "j", properties = {}) {
  const event = new Event("keydown", { bubbles: true, cancelable: true });
  Object.assign(event, { key, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false, ...properties });
  target.dispatchEvent(event); return event;
}

const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function menuRow(root, command = D.command) {
  root.querySelector("#menu-plugins").click();
  const row = document.body.querySelector(`[data-command="${command}"]`);
  assert.ok(row, "menu must consume the contributed action"); return row;
}

test("command-only trial runs through the public application entry without a UI contribution", () => withTrials(
  () => [createCommandOnlyPlugin()], ({ runtime, trials: [trial], root }) => {
    assert.deepEqual(trial.manifest.components, []);
    assert.deepEqual(trial.snapshot(), { attempts: 0, accepted: 0 });
    assert.deepEqual(runtime.execute(A.command), { ok: true, count: 1 });
    assert.deepEqual(runtime.execute(A.command, { mode: "accept" }), { ok: true, count: 2 });
    assert.deepEqual(trial.snapshot(), { attempts: 2, accepted: 2 });
    assert.equal(root.querySelector(`[data-component="${A.namespace}"]`), null);
    assert.equal(root.querySelector("#menu-plugins").disabled, true);
  },
));

test("command-only trial distinguishes disabled, rejected, invalid and throwing actions without committing them", () => {
  let enabled = false;
  return withTrials(() => [createCommandOnlyPlugin({ enabled: () => enabled })], ({ runtime, trials: [trial] }) => {
    assert.deepEqual(runtime.execute(A.command), { ok: false, code: "command.disabled" });
    assert.deepEqual(trial.snapshot(), { attempts: 0, accepted: 0 });
    enabled = true;
    assert.deepEqual(runtime.execute(A.command, { mode: "reject" }), { ok: false, code: "trial.rejected" });
    assert.deepEqual(runtime.execute(A.command, { unexpected: true }), { ok: false, code: "trial.invalid-payload" });
    assert.deepEqual(runtime.execute(A.command, { mode: "unknown" }), { ok: false, code: "trial.invalid-mode" });
    assert.throws(() => runtime.execute(A.command, { mode: "throw" }), /trial command failure/);
    assert.deepEqual(trial.snapshot(), { attempts: 4, accepted: 0 });
    assert.deepEqual(runtime.execute(A.command), { ok: true, count: 1 });
  });
});

test("command-only trial stops executing on disposal and starts with fresh private state in a new session", () => withTrials(
  () => [createCommandOnlyPlugin()], ({ runtime, trials: [trial], root, sentinel }) => {
    runtime.execute(A.command);
    runtime.dispose(); runtime.dispose();
    assert.deepEqual(runtime.execute(A.command), { ok: false, code: "runtime.disposed" });
    assert.deepEqual(trial.snapshot(), { attempts: 1, accepted: 1 });
    assert.deepEqual(root.children, [sentinel]);
    const fresh = createCommandOnlyPlugin(), next = createWorkspaceRuntime({ root, plugins: [fresh.manifest] });
    try {
      assert.deepEqual(next.execute(A.command), { ok: true, count: 1 });
      assert.deepEqual(trial.snapshot(), { attempts: 1, accepted: 1 });
    } finally { next.dispose(); }
  },
));

test("movable trial preserves its actual cell, input and reading position through move, hide, reorder and cancel", () => withTrials(
  () => [createMovablePanelPlugin()], ({ runtime, root, trials: [trial], inspection }) => {
    show(runtime, B.panel);
    const cell = cellFor(root, B.panel), input = cell.querySelector("textarea");
    input.value = "保留的笔记"; input.dispatchEvent(new Event("input")); cell.scrollTop = 73;
    const baseline = inspection.composition.read.snapshot();
    assert.deepEqual(runtime.execute(S.move, { id: B.panel, slot: "left" }), { ok: false, code: "command.disabled" });
    executeOk(runtime, C.begin);
    executeOk(runtime, C.configureRegion, { region: "left", open: true });
    executeOk(runtime, C.resize, { side: "left", value: 310 });
    executeOk(runtime, S.move, { id: B.panel, slot: "left", index: 0 });
    assert.equal(cellFor(root, B.panel), cell);
    assert.equal(cell.parentNode, root.querySelector(".v-modules"));
    input.focus();
    executeOk(runtime, S.enabled, { id: B.panel, enabled: false });
    assert.equal(cell.hidden, true); assert.notEqual(document.activeElement, input);
    executeOk(runtime, S.enabled, { id: B.panel, enabled: true });
    executeOk(runtime, S.move, { id: B.panel, slot: "right", index: 0 });
    executeOk(runtime, S.reorder, { id: B.panel, index: 1 });
    executeOk(runtime, C.finish, { confirm: false });
    assert.deepEqual(inspection.composition.read.snapshot(), baseline);
    show(runtime, B.panel);
    assert.equal(cellFor(root, B.panel), cell);
    assert.equal(cell.querySelector("textarea"), input);
    assert.equal(input.value, "保留的笔记"); assert.equal(cell.scrollTop, 73);
    assert.equal(runtime.workspace.snapshot().leftOpen, true);
    assert.equal(runtime.workspace.snapshot().leftWidth, 310);
    assert.equal(trial.snapshot().mounts, 1); assert.equal(trial.snapshot().cleanups, 0);
    assert.ok(trial.snapshot().visibility.includes(false));
  }, { inspect: true },
));

test("movable trial starts on the left and keeps confirmed placement, daily folding and its one instance", () => withTrials(
  () => [createMovablePanelPlugin({ defaultSlot: "left" })], ({ runtime, root, trials: [trial] }) => {
    executeOk(runtime, C.configureRegion, { region: "left", open: true });
    const cell = cellFor(root, B.panel), input = cell.querySelector("textarea");
    input.value = "左侧内容"; input.dispatchEvent(new Event("input"));
    executeOk(runtime, C.configureRegion, { region: "left", open: false });
    assert.equal(trial.snapshot().visibility.at(-1), false);
    executeOk(runtime, C.configureRegion, { region: "left", open: true });
    assert.equal(trial.snapshot().visibility.at(-1), true);
    executeOk(runtime, C.begin); executeOk(runtime, S.move, { id: B.panel, slot: "right", index: 0 });
    executeOk(runtime, C.finish, { confirm: true }); show(runtime, B.panel);
    executeOk(runtime, C.begin); executeOk(runtime, S.move, { id: B.panel, slot: "left", index: 0 });
    executeOk(runtime, C.finish, { confirm: false }); show(runtime, B.panel);
    assert.equal(cell.parentNode, root.querySelector(".v-page"));
    assert.equal(cellFor(root, B.panel), cell); assert.equal(input.value, "左侧内容");
    assert.equal(trial.snapshot().mounts, 1);
  },
));

test("movable trial clears its input listener and starts a new factory with no private input", () => withTrials(
  () => [createMovablePanelPlugin()], ({ runtime, root, trials: [trial] }) => {
    show(runtime, B.panel);
    const input = cellFor(root, B.panel).querySelector("textarea");
    input.value = "旧会话"; input.dispatchEvent(new Event("input"));
    assert.equal(getEventListeners(input, "input").length, 1);
    runtime.dispose(); runtime.dispose();
    assert.equal(getEventListeners(input, "input").length, 0);
    input.dispatchEvent(new Event("input"));
    assert.equal(trial.snapshot().edits, 1); assert.equal(trial.snapshot().cleanups, 1);
    const fresh = createMovablePanelPlugin(), next = createWorkspaceRuntime({ root, plugins: [fresh.manifest] });
    try {
      show(next, B.panel);
      assert.equal(cellFor(root, B.panel).querySelector("textarea").value, "");
      assert.equal(fresh.snapshot().text, ""); assert.equal(fresh.snapshot().edits, 0);
    } finally { next.dispose(); }
  },
));

test("movable permission probe cannot execute a registered foreign command", () => withTrials(
  () => [createCommandOnlyPlugin(), createMovablePanelPlugin({ probeCommand: A.command })],
  ({ runtime, root, trials: [command, panel], inspection }) => {
    show(runtime, B.panel); cellFor(root, B.panel).querySelector("button").click();
    assert.equal(panel.snapshot().probeCode, "permission.denied");
    assert.equal(command.snapshot().attempts, 0);
    assert.ok(inspection.notices.state().entries.some(entry => entry.source === B.panel && entry.level === "error"));
  }, { inspect: true },
));

test("movable mount failure releases acquired resources and leaves other trial commands usable", () => withTrials(
  () => [createCommandOnlyPlugin(), createMovablePanelPlugin({ failMount: true })],
  ({ runtime, root, trials: [, panel] }) => {
    show(runtime, B.panel);
    assert.match(cellFor(root, B.panel).querySelector(".component-fault").textContent, /加载失败/);
    assert.equal(panel.snapshot().mounts, 1); assert.equal(panel.snapshot().cleanups, 1);
    assert.deepEqual(runtime.execute(A.command), { ok: true, count: 1 });
    runtime.dispose(); assert.equal(panel.snapshot().cleanups, 1);
  },
));

test("shared-entry button, actual menu and focused shortcut execute the same handler once and update one private view", () => withTrials(
  () => [createSharedEntryPlugin()], async ({ runtime, root, trials: [trial] }) => {
    show(runtime, D.panel);
    const cell = cellFor(root, D.panel), button = cell.querySelector("button"), output = cell.querySelector("p");
    button.click(); await settle();
    assert.equal(trial.snapshot().attempts, 1); assert.equal(output.textContent, "计数：1");
    menuRow(root).click(); await settle();
    assert.equal(trial.snapshot().attempts, 2); assert.equal(output.textContent, "计数：2");
    assert.equal(document.body.querySelector(".v-menu-popup"), null);
    button.focus(); const event = press(button); await settle();
    assert.equal(event.defaultPrevented, true);
    assert.equal(trial.snapshot().attempts, 3); assert.equal(trial.snapshot().accepted, 3);
    assert.equal(output.textContent, "计数：3"); assert.equal(trial.snapshot().subscribers, 1);
  },
));

test("shared-entry local mapping protects fields, composition and foreign or hidden focus, with one execution per accepted event", () => withTrials(
  () => [createSharedEntryPlugin()], async ({ runtime, root, trials: [trial] }) => {
    show(runtime, D.panel);
    const cell = cellFor(root, D.panel), content = cell.querySelector(".trial-shared-entry"), input = cell.querySelector("input");
    for (const [target, properties] of [[input, {}], [content, { isComposing: true }], [content, { keyCode: 229 }],
      [content, { key: "Dead" }], [content, { getModifierState: name => name === "AltGraph" }], [root.querySelector(".v-stage"), {}]]) {
      assert.equal(press(target, properties.key ?? "j", properties).defaultPrevented, false);
    }
    executeOk(runtime, C.configureRegion, { region: "right", open: false });
    assert.equal(press(content).defaultPrevented, false);
    executeOk(runtime, C.configureRegion, { region: "right", open: true });
    assert.equal(trial.snapshot().attempts, 0);
    assert.equal(press(content).defaultPrevented, true);
    assert.equal(press(content, "j", { repeat: true }).defaultPrevented, true);
    await settle(); assert.equal(trial.snapshot().attempts, 2);
  },
));

test("shared-entry busy action blocks a second button, reopened menu and local shortcut without duplicate work", () => {
  const operation = deferred();
  return withTrials(() => [createSharedEntryPlugin({ perform: () => operation.promise })], async ({ runtime, root, trials: [trial] }) => {
    show(runtime, D.panel);
    const cell = cellFor(root, D.panel), button = cell.querySelector("button"), content = cell.querySelector(".trial-shared-entry");
    button.click(); button.dispatchEvent(new Event("click"));
    assert.equal(button.disabled, true); assert.equal(cell.querySelector("p").textContent, "处理中");
    assert.equal(trial.snapshot().attempts, 1); assert.equal(trial.snapshot().pending, true);
    const row = menuRow(root); assert.equal(row.disabled, true); row.dispatchEvent(new Event("click"));
    assert.equal(trial.snapshot().attempts, 1);
    press(row, "Escape", { altKey: false });
    assert.equal(press(content).defaultPrevented, true);
    assert.deepEqual(runtime.execute(D.command), { ok: false, code: "command.disabled" });
    assert.equal(trial.snapshot().attempts, 1);
    operation.resolve({ ok: true }); await settle();
    assert.equal(trial.snapshot().pending, false); assert.equal(button.disabled, false);
    assert.equal(cell.querySelector("p").textContent, "计数：1");
    assert.equal(menuRow(root).disabled, false);
  });
});

test("shared-entry pending menu cannot execute twice or close a newer menu on completion", () => {
  const operation = deferred();
  return withTrials(() => [createSharedEntryPlugin({ perform: () => operation.promise })], async ({ runtime, root, trials: [trial] }) => {
    show(runtime, D.panel);
    const row = menuRow(root); row.click(); row.dispatchEvent(new Event("click"));
    assert.equal(trial.snapshot().attempts, 1); assert.equal(row.disabled, true);
    root.querySelector("#menu-view").click();
    const newer = document.body.querySelector(".v-menu-popup"); assert.ok(newer);
    operation.resolve({ ok: true }); await settle();
    assert.equal(document.body.querySelector(".v-menu-popup"), newer);
    assert.equal(trial.snapshot().accepted, 1);
  });
});

test("shared-entry disabled action is gated at button, menu and shortcut before the handler", () => withTrials(
  () => [createSharedEntryPlugin({ enabled: () => false })], async ({ runtime, root, trials: [trial] }) => {
    show(runtime, D.panel);
    const cell = cellFor(root, D.panel), button = cell.querySelector("button");
    assert.equal(button.disabled, true); button.click();
    const row = menuRow(root); assert.equal(row.disabled, true);
    assert.match(row.title, /不可用|不能|当前/);
    row.dispatchEvent(new Event("click")); press(row, "Escape", { altKey: false });
    assert.equal(press(cell.querySelector(".trial-shared-entry")).defaultPrevented, true);
    await settle(); assert.equal(trial.snapshot().attempts, 0);
  },
));

test("shared-entry expected refusal and sync throw leave the button retryable and publish a visible error", () => {
  let invocation = 0;
  return withTrials(() => [createSharedEntryPlugin({ perform() {
    invocation++; if (invocation === 1) return { ok: false, code: "trial.refused" };
    if (invocation === 2) throw new Error("trial synchronous failure");
    return { ok: true };
  } })], async ({ runtime, root, trials: [trial], inspection }) => {
    show(runtime, D.panel);
    const cell = cellFor(root, D.panel), button = cell.querySelector("button"), output = cell.querySelector("p");
    button.click(); await settle(); assert.match(output.textContent, /trial.refused/); assert.equal(button.disabled, false);
    button.click(); await settle(); assert.match(output.textContent, /trial synchronous failure/); assert.equal(button.disabled, false);
    assert.equal(trial.snapshot().accepted, 0);
    assert.equal(inspection.notices.state().entries.length, 2);
    button.click(); await settle(); assert.equal(output.textContent, "计数：1");
    assert.equal(trial.snapshot().attempts, 3);
  }, { inspect: true });
});

test("shared-entry async failures reach the actual button, menu and keyboard consumers without unhandled rejections", () => withTrials(
  () => [createSharedEntryPlugin({ perform: () => Promise.reject(new Error("trial asynchronous failure")) })],
  async ({ runtime, root, trials: [trial], inspection }) => {
    show(runtime, D.panel);
    const cell = cellFor(root, D.panel), button = cell.querySelector("button");
    button.click(); await settle(); assert.match(cell.querySelector("p").textContent, /trial asynchronous failure/);
    menuRow(root).click(); await settle();
    assert.match(document.body.querySelector(".v-menu-feedback").textContent, /失败/);
    press(document.body.querySelector(".v-menu-list"), "Escape", { altKey: false });
    press(button); await settle();
    assert.equal(trial.snapshot().attempts, 3); assert.equal(trial.snapshot().accepted, 0);
    assert.equal(trial.snapshot().pending, false); assert.equal(button.disabled, false);
    const sources = inspection.notices.state().entries.map(entry => entry.source).sort();
    assert.deepEqual(sources, ["frame.keyboard", "frame.menu", D.panel].sort());
  }, { inspect: true },
));

test("shared-entry empty or malformed sync and async results are rejected instead of presented as successful edits", async () => {
  for (const invalid of [undefined, null, {}, { ok: "yes" }, { ok: false }, { ok: false, code: "" }]) {
    for (const asynchronous of [false, true]) await withTrials(
      () => [createSharedEntryPlugin({ perform: () => asynchronous ? Promise.resolve(invalid) : invalid })],
      async ({ runtime, root, trials: [trial] }) => {
        show(runtime, D.panel); const cell = cellFor(root, D.panel);
        cell.querySelector("button").click(); await settle();
        assert.match(cell.querySelector("p").textContent, /trial invalid action result/);
        assert.equal(trial.snapshot().accepted, 0); assert.equal(trial.snapshot().pending, false);
        assert.equal(cell.querySelector("button").disabled, false);
      },
    );
  }
});

test("shared-entry missing permission is rejected by the actual component context without calling its handler", () => withTrials(
  () => [createSharedEntryPlugin({ allowCommand: false, bindShortcut: false })],
  async ({ runtime, root, trials: [trial], inspection }) => {
    show(runtime, D.panel); const cell = cellFor(root, D.panel);
    cell.querySelector("button").click(); await settle();
    assert.match(cell.querySelector("p").textContent, /permission.denied/);
    assert.equal(trial.snapshot().attempts, 0);
    assert.ok(inspection.notices.state().entries.some(entry => entry.source === D.panel));
    menuRow(root).click(); assert.equal(trial.snapshot().attempts, 1, "trusted menu keeps its separately granted host command access");
  }, { inspect: true },
));

test("shared-entry late completion after disposal neither changes old DOM nor contaminates a fresh session", () => {
  const operation = deferred();
  return withTrials(() => [createSharedEntryPlugin({ perform: () => operation.promise })], async ({ runtime, root, trials: [trial], inspection }) => {
    show(runtime, D.panel);
    const oldCell = cellFor(root, D.panel), oldButton = oldCell.querySelector("button"), output = oldCell.querySelector("p");
    oldButton.click(); const textAtDispose = output.textContent;
    runtime.dispose(); assert.equal(trial.snapshot().subscribers, 0); assert.equal(trial.snapshot().cleanups, 1);
    assert.equal(getEventListeners(oldButton, "click").length, 0);
    const fresh = createSharedEntryPlugin(), next = createWorkspaceRuntime({ root, plugins: [fresh.manifest] });
    try {
      show(next, D.panel); const freshOutput = cellFor(root, D.panel).querySelector("p");
      operation.resolve({ ok: true }); await settle();
      assert.equal(output.textContent, textAtDispose); assert.equal(freshOutput.textContent, "计数：0");
      assert.equal(fresh.snapshot().accepted, 0); assert.equal(inspection.notices.state().entries.length, 0);
      assert.equal(trial.snapshot().accepted, 1, "disposing UI does not pretend to cancel work that already started");
      oldButton.dispatchEvent(new Event("click")); assert.equal(trial.snapshot().attempts, 1);
    } finally { next.dispose(); }
  }, { inspect: true });
});

test("shared-entry rejection after disposal publishes no late feedback or resurrected surface", () => {
  const operation = deferred();
  return withTrials(() => [createSharedEntryPlugin({ perform: () => operation.promise })], async ({ runtime, root, trials: [trial], inspection }) => {
    show(runtime, D.panel); const output = cellFor(root, D.panel).querySelector("p");
    cellFor(root, D.panel).querySelector("button").click(); const before = output.textContent;
    runtime.dispose(); operation.reject(new Error("late failure")); await settle();
    assert.equal(output.textContent, before); assert.equal(trial.snapshot().subscribers, 0);
    assert.equal(inspection.notices.state().entries.length, 0);
    assert.equal(document.body.querySelector(".v-menu-popup"), null);
  }, { inspect: true });
});

test("shared-entry hidden instance can complete its owned task and resume without remounting", () => {
  const operation = deferred();
  return withTrials(() => [createSharedEntryPlugin({ perform: () => operation.promise })], async ({ runtime, root, trials: [trial] }) => {
    show(runtime, D.panel); const cell = cellFor(root, D.panel);
    cell.querySelector("button").click(); executeOk(runtime, C.configureRegion, { region: "right", open: false });
    operation.resolve({ ok: true }); await settle();
    executeOk(runtime, C.configureRegion, { region: "right", open: true });
    assert.equal(cellFor(root, D.panel), cell); assert.equal(cell.querySelector("p").textContent, "计数：1");
    assert.equal(trial.snapshot().mounts, 1); assert.equal(trial.snapshot().cleanups, 0);
  });
});

test("three trials coexist, move and reorder with separate state, then release the actual command, menu and key registrations", () => withTrials(
  () => [createCommandOnlyPlugin(), createMovablePanelPlugin({ defaultSlot: "left" }), createSharedEntryPlugin()],
  async ({ runtime, root, sentinel, trials: [command, panel, entries], inspection }) => {
    executeOk(runtime, C.configureRegion, { region: "left", open: true }); show(runtime, D.panel);
    const panelCell = cellFor(root, B.panel), entryCell = cellFor(root, D.panel);
    const note = panelCell.querySelector("textarea"), field = entryCell.querySelector("input"), button = entryCell.querySelector("button");
    note.value = "笔记与动作独立"; note.dispatchEvent(new Event("input")); field.value = "普通文本";
    assert.deepEqual(runtime.execute(A.command), { ok: true, count: 1 });
    button.click(); await settle();
    assert.equal(press(panelCell.querySelector(".trial-movable-panel")).defaultPrevented, false);
    assert.equal(command.snapshot().accepted, 1); assert.equal(entries.snapshot().accepted, 1);
    executeOk(runtime, C.begin); executeOk(runtime, S.move, { id: D.panel, slot: "left", index: 0 });
    executeOk(runtime, S.reorder, { id: B.panel, index: 0 });
    const order = root.querySelector(".v-modules").children.filter(node => node.dataset.component).map(node => node.dataset.component);
    assert.deepEqual(order, [B.panel, D.panel]);
    executeOk(runtime, C.finish, { confirm: true });
    assert.equal(cellFor(root, B.panel), panelCell); assert.equal(cellFor(root, D.panel), entryCell);
    assert.equal(note.value, "笔记与动作独立"); assert.equal(field.value, "普通文本");
    press(button); await settle(); assert.equal(entries.snapshot().accepted, 2);
    menuRow(root).click(); await settle(); assert.equal(entries.snapshot().accepted, 3);
    assert.equal(panel.snapshot().edits, 1); assert.equal(command.snapshot().accepted, 1);
    menuRow(root); assert.ok(getEventListeners(document, "pointerdown").length > 0);
    runtime.dispose();
    assert.deepEqual(root.children, [sentinel]); assert.equal(document.body.querySelector(".v-menu-popup"), null);
    for (const id of [A.command, D.command]) assert.equal(inspection.router.describe(id), null);
    assert.deepEqual(inspection.shortcuts.list(), []); assert.deepEqual(inspection.components.mounted(), []);
    assert.ok(inspection.menus.resolve().every(menu => menu.groups.flat().length === 0));
    assert.equal(getEventListeners(document, "keydown").length, 0);
    assert.equal(getEventListeners(document, "pointerdown").length, 0);
    assert.equal(getEventListeners(window, "resize").length, 0);
    assert.equal(getEventListeners(window, "pagehide").length, 0);
    assert.equal(getEventListeners(note, "input").length, 0); assert.equal(getEventListeners(button, "click").length, 0);
    assert.equal(entries.snapshot().subscribers, 0); assert.equal(panel.snapshot().cleanups, 1);
  }, { inspect: true },
));

test("two trial instances in distinct namespaces can share a local key without responding to each other's focus", () => withTrials(
  () => [createSharedEntryPlugin(), createSharedEntryPlugin({ namespace: "trial.second" })],
  async ({ runtime, root, trials: [first, second] }) => {
    show(runtime, first.ids.panel); const firstCell = cellFor(root, first.ids.panel);
    press(firstCell.querySelector("button")); await settle();
    assert.equal(first.snapshot().accepted, 1); assert.equal(second.snapshot().accepted, 0);
    show(runtime, second.ids.panel); const secondCell = cellFor(root, second.ids.panel);
    press(secondCell.querySelector("button")); await settle();
    assert.equal(first.snapshot().accepted, 1); assert.equal(second.snapshot().accepted, 1);
    assert.equal(press(firstCell.querySelector("button")).defaultPrevented, false);
    assert.equal(first.snapshot().attempts, 1);
  },
));

test("duplicate trial namespaces and unauthorized shortcut declarations fail before mount and permit a clean root retry", () => withTestDocument(() => {
  const root = document.createElement("div"), sentinel = document.createElement("span");
  root.append(sentinel); document.body.append(root);
  const command = createCommandOnlyPlugin(), unauthorized = createSharedEntryPlugin({ allowCommand: false });
  try {
    assert.throws(() => createWorkspaceRuntime({ root, plugins: [command.manifest, command.manifest] }), /namespace 已注册/);
    assert.throws(() => createWorkspaceRuntime({ root, plugins: [command.manifest, unauthorized.manifest] }), /组件缺少命令权限/);
    assert.deepEqual(root.children, [sentinel]); assert.equal(unauthorized.snapshot().mounts, 0);
    assert.equal(getEventListeners(document, "keydown").length, 0);
    const fresh = createSharedEntryPlugin(), runtime = createWorkspaceRuntime({ root, plugins: [command.manifest, fresh.manifest] });
    try { assert.deepEqual(runtime.execute(A.command), { ok: true, count: 1 }); show(runtime, fresh.ids.panel); }
    finally { runtime.dispose(); }
  } finally { root.remove(); }
}));

test("conflicting local keys in one trial declaration are rejected by the public author adapter", () => {
  assert.throws(() => createSharedEntryPlugin({ keys: ["Alt+J", "Alt+j"] }), /重复/);
  assert.throws(() => createMovablePanelPlugin({ defaultSlot: "stage" }), /defaultSlot|默认位置/);
});

test("late keyboard failure stays in its originating runtime and never updates a replacement UI session", () => {
  const operation = deferred();
  return withTrials(() => [createSharedEntryPlugin({ perform: () => operation.promise })], async ({ runtime, root, trials: [trial], inspection }) => {
    show(runtime, D.panel); const oldOutput = cellFor(root, D.panel).querySelector("p");
    press(cellFor(root, D.panel).querySelector("button")); const oldText = oldOutput.textContent;
    runtime.dispose();
    const fresh = createSharedEntryPlugin(), factory = await loadRuntimeForTest();
    const next = factory.createWorkspaceRuntime({ root, plugins: [fresh.manifest] });
    try {
      show(next, D.panel); operation.reject(new Error("old keyboard operation")); await settle();
      assert.equal(oldOutput.textContent, oldText); assert.equal(trial.snapshot().subscribers, 0);
      assert.equal(cellFor(root, D.panel).querySelector("p").textContent, "计数：0");
      assert.equal(next.inspection.notices.state().entries.length, 0);
      // Current keyboard binding may retain diagnostics for already-started work in the old notice owner.
      assert.ok(inspection.notices.state().entries.every(entry => entry.source === "frame.keyboard"));
    } finally { next.dispose(); }
  }, { inspect: true });
});
