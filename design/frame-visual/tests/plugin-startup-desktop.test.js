import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import { BACKUP_PLUGIN_DIRECTORY as directory } from "../src/host/backup-plugin-directory.js";
import { defaultStartupPlan } from "../src/startup/plugin-startup-plan.js";
import { createPluginStartupController } from "../src/startup/plugin-startup-controller.js";
import { createDesktopPluginPlanStore, BACKUP_STARTUP_SETTINGS_NAMESPACE as namespace } from "../src/startup/desktop-plugin-plan-store.js";
import { TauriPluginSettingsStorage } from "../src/vendor/desktop-plugin-settings.js";
import { mountPluginStartupView } from "../src/startup/plugin-startup-view.js";
import { mountBackupPluginStartupPreview } from "../src/plugin-startup-preview.js";
import { withTestDocument, serializeDom } from "./support/dom-test-environment.js";
import { createStartupTestShell as shell } from "./support/plugin-startup-fixtures.js";

const clone = value => JSON.parse(JSON.stringify(value));
const plan = (revision = 0) => ({ ...clone(defaultStartupPlan(directory)), revision });
const envelope = value => ({ schemaVersion: 1, value });
const flush = () => new Promise(resolve => setImmediate(resolve));
const asyncController = store => createPluginStartupController({ directory, store, storageMode: "async" });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function documentFixture(initial = null) {
  let data = clone(initial), failure = null;
  const writes = [];
  return { writes, get data() { return clone(data); }, set data(value) { data = clone(value); },
    fail(error) { failure = error; },
    settingsStorage: {
      async read() { return clone(data); },
      async write(next) { if (failure) throw failure; data = clone(next); writes.push(clone(next)); },
    },
  };
}
function desktopStore(fixture) {
  return createDesktopPluginPlanStore({ directory, settingsStorage: fixture.settingsStorage });
}

test("async initial load locks all mutations until saved parameters have been read", async () => {
  const read = deferred(), controller = asyncController({ read: () => read.promise, async write() {} });
  assert.equal(controller.snapshot().phase, "loading");
  assert.equal(controller.snapshot().canStart, false); assert.equal(controller.snapshot().canEdit, false);
  for (const action of [() => controller.setEnabled("frame.score-info", true),
    () => controller.setSetting("frame.score-info", "measureLimit", "3"), controller.discard, controller.save, controller.reload]) {
    assert.equal(action().code, "startup.busy");
  }
  const saved = plan(4); saved.plugins["frame.score-info"].settings.measureLimit = 3;
  read.resolve(saved); assert.deepEqual(await controller.ready, { ok: true });
  assert.equal(controller.snapshot().phase, "ready"); assert.equal(controller.snapshot().canStart, true);
  assert.equal(controller.snapshot().baseline.revision, 4);
  assert.equal(controller.snapshot().draft.plugins["frame.score-info"].settings.measureLimit, 3);
  controller.dispose(); assert.equal(controller.reload().code, "startup.disposed");
});

test("async save updates revision only after write resolves and blocks duplicate operations", async () => {
  const started = deferred(), write = deferred(); let options, next;
  const controller = asyncController({ async read() { return null; }, write(value, precondition) {
    next = value; options = precondition; started.resolve(); return write.promise;
  } });
  await controller.ready; controller.setEnabled("frame.score-info", true);
  const result = controller.save(); await started.promise;
  assert.equal(controller.snapshot().phase, "saving"); assert.equal(controller.snapshot().saved, false);
  assert.equal(controller.snapshot().baseline.revision, 0); assert.equal(next.revision, 1);
  assert.equal(options.expectedRevision, 0); assert.equal(Object.isFrozen(options), true);
  assert.equal(typeof options.isCurrent, "function"); assert.equal(options.isCurrent(), true);
  for (const action of [controller.save, controller.reload, controller.discard,
    () => controller.setEnabled("frame.plugins", false), () => controller.setSetting("frame.score-info", "mode", "measures")]) {
    assert.equal(action().code, "startup.busy");
  }
  write.resolve(); assert.deepEqual(await result, { ok: true, revision: 1 });
  assert.equal(controller.snapshot().saved, true); assert.equal(controller.snapshot().canStart, true);
  assert.equal(controller.snapshot().dirtyIds.length, 0); controller.dispose(); assert.equal(options.isCurrent(), false);
});

test("async write rejection or nonvoid response preserves the draft and permits a retry", async () => {
  for (const failure of [new Error("disk unavailable"), { ok: true }]) {
    let fail = true;
    const controller = asyncController({ async read() { return null; }, async write() {
      if (fail) { if (failure instanceof Error) throw failure; return failure; }
    } });
    await controller.ready; controller.setSetting("frame.score-info", "measureLimit", "5");
    assert.equal((await controller.save()).ok, false);
    assert.equal(controller.snapshot().baseline.revision, 0); assert.equal(controller.snapshot().saved, false);
    assert.equal(controller.snapshot().draft.plugins["frame.score-info"].settings.measureLimit, 5);
    assert.equal(controller.snapshot().canSave, true); assert.match(controller.snapshot().issue, /保存失败/);
    fail = false; assert.deepEqual(await controller.save(), { ok: true, revision: 1 }); controller.dispose();
  }
});

test("async read failure blocks writes and startup until an explicit successful reload", async () => {
  let value = { corrupt: true }, writes = 0;
  const controller = asyncController({ async read() { return value; }, async write() { writes++; } });
  assert.equal((await controller.ready).ok, false);
  controller.setEnabled("frame.score-info", true);
  assert.equal(controller.snapshot().canStart, false); assert.equal((await controller.save()).ok, false);
  assert.equal(writes, 0); assert.deepEqual(value, { corrupt: true });
  value = null; assert.deepEqual(await controller.reload(), { ok: true });
  assert.equal(controller.snapshot().dirtyIds.length, 0); assert.equal(controller.snapshot().canStart, true); controller.dispose();
});

test("dispose ignores a pending load and cancels a save before write dispatch", async () => {
  const read = deferred(), controller = asyncController({ read: () => read.promise, async write() {} });
  controller.dispose(); const disposed = controller.snapshot(); read.resolve(plan(8));
  assert.equal((await controller.ready).code, "startup.disposed"); assert.deepEqual(controller.snapshot(), disposed);
  const saveRead = deferred(); let reads = 0, writes = 0;
  const second = asyncController({ read() { return ++reads === 1 ? Promise.resolve(null) : saveRead.promise; }, async write() { writes++; } });
  await second.ready; second.setEnabled("frame.score-info", true); const saved = second.save();
  second.dispose(); saveRead.resolve(null);
  assert.equal((await saved).code, "startup.disposed"); assert.equal(writes, 0); assert.equal(second.snapshot().baseline.revision, 0);
});

test("dispose after dispatch does not accept a write result or claim to cancel storage", async () => {
  const fixture = documentFixture(), write = deferred(), started = deferred();
  const storageWrite = fixture.settingsStorage.write;
  fixture.settingsStorage.write = async value => { started.resolve(); await write.promise; await storageWrite(value); };
  const store = desktopStore(fixture), controller = asyncController(store); await controller.ready;
  controller.setEnabled("frame.score-info", true); const saved = controller.save(); await started.promise;
  controller.dispose(); const disposed = controller.snapshot(); write.resolve();
  assert.equal((await saved).code, "startup.disposed"); assert.deepEqual(controller.snapshot(), disposed);
  assert.equal((await store.read()).revision, 1, "dispatched IO may still finish after UI disposal");
});

test("async pre-save read detects a changed baseline even when the external revision matches", async () => {
  let actual = plan(); let writes = 0;
  const controller = asyncController({ async read() { return actual; }, async write() { writes++; } });
  await controller.ready; controller.setEnabled("frame.score-info", true);
  actual.plugins["frame.plugins"].enabled = false;
  assert.equal((await controller.save()).ok, false); assert.match(controller.snapshot().issue, /其他页面改变/);
  assert.equal(writes, 0); assert.equal(controller.snapshot().draft.plugins["frame.score-info"].enabled, true); controller.dispose();
});

test("Promise ports used in sync mode fail without unhandled rejections or false success", async () => {
  const read = createPluginStartupController({ directory, store: { read: () => Promise.reject(new Error("async read")), write() {} } });
  assert.equal((await read.ready).ok, false); assert.match(read.snapshot().issue, /read.*Promise.*async/);
  assert.equal(read.snapshot().canStart, false); read.dispose();
  const write = createPluginStartupController({ directory, store: { read: () => null, write: () => Promise.reject(new Error("async write")) } });
  write.setEnabled("frame.score-info", true); assert.equal(write.save().ok, false);
  assert.equal(write.snapshot().baseline.revision, 0); assert.match(write.snapshot().issue, /Promise.*async/);
  await flush(); write.dispose();
});

test("desktop plan stores activation and settings together and preserves other namespaces", async () => {
  const fixture = documentFixture({ "other.plugin": { schemaVersion: 7, value: { custom: [1, "x"] }, future: true }, futureDocumentField: ["opaque"] });
  const store = desktopStore(fixture); assert.equal(await store.read(), null);
  const controller = asyncController(store); await controller.ready;
  controller.setEnabled("frame.score-info", true); controller.setSetting("frame.score-info", "mode", "measures");
  controller.setSetting("frame.score-info", "measureLimit", "2");
  assert.equal((await controller.save()).ok, true); assert.equal(fixture.writes.length, 1);
  assert.deepEqual(fixture.data["other.plugin"], { schemaVersion: 7, value: { custom: [1, "x"] }, future: true });
  assert.deepEqual(fixture.data.futureDocumentField, ["opaque"]);
  assert.deepEqual(fixture.data[namespace], envelope(clone(controller.snapshot().baseline)));
  const restored = asyncController(store); await restored.ready;
  assert.equal(restored.snapshot().draft.plugins["frame.score-info"].settings.measureLimit, 2);
  assert.equal(restored.snapshot().draft.plugins["frame.score-info"].enabled, true);
  assert.equal(Object.isFrozen(await store.read()), true); controller.dispose(); restored.dispose();
  assert.equal(await desktopStore(documentFixture()).read(), null);
});

test("desktop adapter rejects malformed documents, its own future envelopes and invalid save preconditions", async () => {
  const invalidPlan = plan(); invalidPlan.plugins["notation.core"].enabled = false;
  for (const value of [[], "data", false, { [namespace]: null }, { [namespace]: { schemaVersion: 2, value: plan() } },
    { [namespace]: { ...envelope(plan()), unknown: true } }, { [namespace]: { schemaVersion: 1 } }, { [namespace]: envelope(invalidPlan) }]) {
    const fixture = documentFixture(value), store = desktopStore(fixture);
    await assert.rejects(store.read()); await assert.rejects(store.write(plan(1), { expectedRevision: 0 }));
    assert.equal(fixture.writes.length, 0); assert.deepEqual(fixture.data, value);
  }
  const fixture = documentFixture(), store = desktopStore(fixture);
  for (const expectedRevision of [undefined, -1, 0.5, 2]) await assert.rejects(store.write(plan(1), { expectedRevision }), /修订前提/);
  assert.throws(() => store.write(invalidPlan, { expectedRevision: 0 }), /必需插件/);
  assert.equal(fixture.writes.length, 0);
});

test("desktop queued writes reject observed revision conflicts and the queue recovers after failures", async () => {
  const fixture = documentFixture(), started = deferred(), write = deferred();
  const writeStorage = fixture.settingsStorage.write;
  fixture.settingsStorage.write = async value => { started.resolve(); await write.promise; await writeStorage(value); };
  const store = desktopStore(fixture), first = store.write(plan(1), { expectedRevision: 0 });
  await started.promise;
  const duplicate = assert.rejects(store.write(plan(1), { expectedRevision: 0 }), /已改变/);
  write.resolve(); await first; await duplicate; assert.equal(fixture.writes.length, 1);
  await store.write(plan(2), { expectedRevision: 1 }); assert.equal((await store.read()).revision, 2);
  let fail = true;
  fixture.settingsStorage.write = async value => { if (fail) { fail = false; throw new Error("disk denied"); } await writeStorage(value); };
  const failed = assert.rejects(store.write(plan(3), { expectedRevision: 2 }), /disk denied/);
  const retry = store.write(plan(3), { expectedRevision: 2 });
  await failed; await retry; assert.equal((await store.read()).revision, 3); assert.equal(fixture.writes.length, 3);
});

test("generated existing Tauri service uses exact host commands and propagates structured errors", async () => {
  const calls = []; let data = null, failure = null;
  const settingsStorage = new TauriPluginSettingsStorage(async (command, args) => {
    calls.push({ command, args: clone(args) });
    if (failure) throw failure;
    if (command === "workbench_read_plugin_settings_v1") return data;
    if (command === "workbench_write_plugin_settings_v1") { data = clone(args.document); return; }
    throw new Error("Unexpected IPC");
  });
  assert.deepEqual(await settingsStorage.read(), {});
  const store = createDesktopPluginPlanStore({ directory, settingsStorage }), controller = asyncController(store); await controller.ready;
  controller.setEnabled("frame.score-info", true); await controller.save();
  assert.equal(calls.filter(call => call.command === "workbench_write_plugin_settings_v1").length, 1);
  assert.deepEqual(calls.find(call => call.command === "workbench_write_plugin_settings_v1").args, { document: { [namespace]: envelope(clone(controller.snapshot().baseline)) } });
  assert.equal(calls.every(call => call.command === "workbench_write_plugin_settings_v1" || JSON.stringify(call.args) === "{}"), true);
  const issue = { code: "plugin.settings-write-failed", message: "磁盘写入失败", severity: "error", source: "host", target: { scope: "workbench" }, retryable: true };
  failure = { message: "存储不可用", status: 503, issue };
  await assert.rejects(settingsStorage.write({}), error => error.message === "存储不可用" && error.status === 503 && error.issue === issue);
  failure = "opaque rejection"; await assert.rejects(settingsStorage.read(), /无法读取插件设置/);
  controller.dispose();
});

test("async view locks loading/saving controls, keeps failed input and refreshes after accepted write", () => withTestDocument(async ({ document }) => {
  const read = deferred(), write = deferred(); let initial = true, writes = 0, starts = 0;
  const controller = asyncController({ read() { return initial ? read.promise : Promise.resolve(null); }, write() { writes++; return writes === 1 ? write.promise : Promise.resolve(); } });
  const { root } = shell(document), view = mountPluginStartupView({ root, controller, selectedId: "frame.score-info", onStart() { starts++; } });
  const feedback = root.querySelector("#startup-feedback"), start = root.querySelector("#startup-open"), save = root.querySelector("#startup-apply");
  assert.match(feedback.textContent, /正在读取/); start.click(); assert.equal(starts, 0);
  assert.equal(root.querySelector("#frame.score-info-measureLimit").disabled, true);
  assert.equal(root.querySelector('[data-plugin-id="frame.score-info"]').querySelector(".startup-toggle").disabled, true);
  initial = false; read.resolve(null); await controller.ready; await flush();
  const input = root.querySelector("#frame.score-info-measureLimit"); input.value = "3"; input.dispatchEvent(new Event("input"));
  save.click(); await flush(); assert.equal(writes, 1); assert.equal(save.disabled, true); assert.equal(start.disabled, true);
  assert.equal(input.disabled, true); assert.equal(root.querySelector("#startup-discard").disabled, true);
  assert.match(feedback.textContent, /正在保存/); assert.doesNotMatch(feedback.textContent, /已保存/);
  save.click(); assert.equal(writes, 1); write.reject(new Error("write denied")); await flush();
  assert.match(feedback.textContent, /保存失败.*write denied/); assert.equal(input.disabled, false);
  assert.equal(input.value, "3"); assert.equal(root.querySelector("#frame.score-info-measureLimit"), input);
  save.click(); await flush(); assert.match(feedback.textContent, /已保存/);
  assert.equal(root.querySelector("#frame.score-info-measureLimit").value, "3"); assert.equal(start.disabled, false);
  view.dispose(); controller.dispose();
}));

test("disposed async view and controller ignore late save completion without touching DOM", () => withTestDocument(async ({ document }) => {
  const write = deferred(), started = deferred(), controller = asyncController({ async read() { return null; }, write() { started.resolve(); return write.promise; } });
  await controller.ready; const { root } = shell(document), view = mountPluginStartupView({ root, controller, selectedId: "frame.score-info" });
  root.querySelector('[data-plugin-id="frame.score-info"]').querySelector(".startup-toggle").click();
  root.querySelector("#startup-apply").click(); await started.promise;
  view.dispose(); controller.dispose(); const dom = serializeDom(root), snapshot = controller.snapshot();
  write.resolve(); await flush(); assert.deepEqual(serializeDom(root), dom); assert.deepEqual(controller.snapshot(), snapshot);
}));

test("async start error survives automatic refresh and selection, and a new start permits retry", () => withTestDocument(async ({ document }) => {
  const controller = asyncController({ async read() { return null; }, async write() {} }); await controller.ready;
  const launch = deferred(); let starts = 0; const { root } = shell(document);
  const view = mountPluginStartupView({ root, controller, onStart() { return ++starts === 1 ? launch.promise : Promise.resolve(); } });
  const start = root.querySelector("#startup-open"); start.click(); start.click(); assert.equal(starts, 1);
  launch.reject(new Error("score failed")); await flush(); view.refresh();
  root.querySelector('[data-plugin-id="frame.layout"]').querySelector(".startup-select").click();
  assert.match(root.querySelector("#startup-feedback").textContent, /工作区启动失败.*score failed/);
  assert.equal(root.querySelector("#startup-retry").hidden, false);
  assert.equal(root.querySelector("#startup-retry").disabled, false);
  start.click(); await flush(); assert.equal(starts, 2); assert.doesNotMatch(root.querySelector("#startup-feedback").textContent, /启动失败/);
  view.dispose(); controller.dispose();
}));

test("async preview waits in visible manager, creates workspace only when ready and releases before return reload", () => withTestDocument(async ({ document }) => {
  const launchRead = deferred(), returnRead = deferred(); let reads = 0;
  const { root, workspaceRoot } = shell(document), append = workspaceRoot.append.bind(workspaceRoot);
  workspaceRoot.append = (...nodes) => { assert.equal(workspaceRoot.hidden, false, "viewport must mount visibly"); append(...nodes); };
  const preview = mountBackupPluginStartupPreview({ root, workspaceRoot, storageMode: "async", store: {
    read() { reads++; return reads === 1 ? Promise.resolve(null) : reads === 2 ? launchRead.promise : returnRead.promise; }, async write() {},
  } });
  await preview.controller.ready; await flush(); const start = root.querySelector("#startup-open"); start.click(); start.click();
  assert.equal(reads, 2); assert.equal(root.hidden, false); assert.equal(workspaceRoot.hidden, true);
  assert.equal(workspaceRoot.children.length, 0); assert.match(root.querySelector("#startup-feedback").textContent, /正在启动/);
  launchRead.resolve(plan()); await flush(); assert.equal(root.hidden, true); assert.equal(workspaceRoot.hidden, false);
  assert.ok(workspaceRoot.querySelector(".core-score-view")); const back = workspaceRoot.querySelector(".v-app-mark"); back.click();
  assert.equal(workspaceRoot.children.length, 0); assert.equal(root.hidden, false); assert.equal(workspaceRoot.hidden, true);
  assert.equal(preview.controller.snapshot().phase, "loading"); assert.equal(start.disabled, true);
  back.click(); assert.equal(reads, 3);
  preview.dispose(); const dom = serializeDom(root); returnRead.resolve(plan(7)); await flush();
  assert.deepEqual(serializeDom(root), dom); assert.equal(workspaceRoot.children.length, 0);
  assert.equal(preview.controller.snapshot().baseline.revision, 0);
}));

test("async preview disposed during startup never creates a late workspace", () => withTestDocument(async ({ document }) => {
  const read = deferred(); let reads = 0;
  const { root, workspaceRoot } = shell(document), preview = mountBackupPluginStartupPreview({ root, workspaceRoot, storageMode: "async", store: {
    read: () => ++reads === 1 ? Promise.resolve(null) : read.promise, async write() {},
  } });
  await preview.controller.ready; await flush(); root.querySelector("#startup-open").click();
  preview.dispose(); const dom = serializeDom(root); read.resolve(plan()); await flush();
  assert.deepEqual(serializeDom(root), dom); assert.equal(workspaceRoot.children.length, 0);
  assert.equal(document.body.classList.contains("startup-workspace-active"), false);
}));

test("failed workspace mount stays visible as an error after asynchronous manager reload", () => withTestDocument(async ({ document }) => {
  const reload = deferred(); let reads = 0;
  const { root, workspaceRoot } = shell(document), append = workspaceRoot.append.bind(workspaceRoot); let fail = true;
  workspaceRoot.append = (...nodes) => { if (fail) { fail = false; throw new Error("mount fault"); } append(...nodes); };
  const preview = mountBackupPluginStartupPreview({ root, workspaceRoot, storageMode: "async", store: {
    read: () => ++reads < 3 ? Promise.resolve(null) : reload.promise, async write() {},
  } });
  await preview.controller.ready; await flush(); root.querySelector("#startup-open").click(); await flush();
  assert.equal(root.hidden, false); assert.equal(workspaceRoot.hidden, true); assert.equal(workspaceRoot.children.length, 0);
  reload.resolve(null); await flush(); assert.match(root.querySelector("#startup-feedback").textContent, /工作区启动失败.*mount fault/);
  preview.dispose();
}));

test("shipped classic entry selects actual Tauri storage and never touches browser storage", () => withTestDocument(async ({ document, window }) => {
  const initial = deferred(), calls = []; let data = null, first = true;
  const previous = new Map(["isTauri", "localStorage"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "isTauri", { configurable: true, value: true });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("browser storage must not be used"); } });
  window.__TAURI_INTERNALS__ = { async invoke(command, args) {
    calls.push({ command, args: clone(args) });
    if (command === "workbench_read_plugin_settings_v1") { if (first) { first = false; return initial.promise; } return data; }
    if (command === "workbench_write_plugin_settings_v1") { data = clone(args.document); return; }
    throw new Error("Unexpected IPC");
  } };
  const { root } = shell(document); root.id = "startup-root";
  const badge = document.createElement("span"); badge.className = "startup-preview-badge"; root.append(badge);
  try {
    runInThisContext(readFileSync(new URL("../vendor/plugin-startup-preview.js", import.meta.url), "utf8"));
    assert.equal(badge.textContent, "桌面"); assert.match(root.querySelector("#startup-feedback").textContent, /正在读取/);
    assert.equal(root.querySelector("#startup-open").disabled, true);
    initial.resolve(null); await flush();
    root.querySelector('[data-plugin-id="frame.score-info"]').querySelector(".startup-toggle").click();
    root.querySelector("#startup-apply").click(); await flush();
    assert.equal(data[namespace].value.plugins["frame.score-info"].enabled, true);
    assert.equal(data[namespace].value.revision, 1); assert.match(root.querySelector("#startup-feedback").textContent, /已保存/);
    assert.equal(calls.filter(call => call.command === "workbench_write_plugin_settings_v1").length, 1);
  } finally {
    window.dispatchEvent(new Event("pagehide"));
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
  assert.equal(root.querySelectorAll(".startup-row").length, 0);
}));

test("desktop IPC read failure remains an error with no fallback to browser defaults", () => withTestDocument(async ({ document, window }) => {
  const previous = new Map(["isTauri", "localStorage"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])); let browserReads = 0;
  Object.defineProperty(globalThis, "isTauri", { configurable: true, value: true });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem() { browserReads++; return null; } } });
  window.__TAURI_INTERNALS__ = { async invoke() { throw { status: 503, message: "host unavailable" }; } };
  const { root } = shell(document); root.id = "startup-root";
  try {
    runInThisContext(readFileSync(new URL("../vendor/plugin-startup-preview.js", import.meta.url), "utf8")); await flush();
    assert.match(root.querySelector("#startup-feedback").textContent, /host unavailable/);
    assert.equal(root.querySelector("#startup-open").disabled, true); assert.equal(browserReads, 0);
  } finally {
    window.dispatchEvent(new Event("pagehide"));
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  }
}));
