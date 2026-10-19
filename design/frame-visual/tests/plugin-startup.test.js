import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import { BACKUP_PLUGIN_DIRECTORY as directory } from "../src/host/backup-plugin-directory.js";
import { defaultStartupPlan, definePluginDirectory, readStartupPlan, validateStartupPlan } from "../src/startup/plugin-startup-plan.js";
import { createBrowserPluginPlanStore, BACKUP_STARTUP_STORAGE_KEY } from "../src/startup/plugin-plan-store.js";
import { createPluginStartupController } from "../src/startup/plugin-startup-controller.js";
import { mountPluginStartupView } from "../src/startup/plugin-startup-view.js";
import { mountBackupPluginStartupPreview } from "../src/plugin-startup-preview.js";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { withTestDocument } from "./support/dom-test-environment.js";
import { createStartupTestShell as shell } from "./support/plugin-startup-fixtures.js";

const clone = value => JSON.parse(JSON.stringify(value));
function storageFixture() {
  const values = new Map(); let fail = false;
  const storage = { getItem: key => values.get(key) ?? null, setItem(key, value) {
    if (fail) throw new Error("QuotaExceededError"); values.set(key, value);
  } };
  return { values, storage, store: createBrowserPluginPlanStore({ storage }), fail(value) { fail = value; } };
}
const change = (node, value, type = "input") => { node.value = value; node.dispatchEvent(new Event(type)); };

test("startup directory is frozen data and rejects hooks, missing dependencies and cycles", () => {
  assert.equal(Object.isFrozen(directory[4].fields[1]), true);
  assert.throws(() => definePluginDirectory([{ ...clone(directory[0]), mount() {} }]), /未知字段/);
  assert.throws(() => definePluginDirectory([{ ...clone(directory[0]), required: false, reason() {} }]), /只能包含数据/);
  assert.throws(() => definePluginDirectory([{ ...clone(directory[0]), dependencies: ["absent"] }]), /依赖缺失/);
  assert.throws(() => definePluginDirectory([{ ...clone(directory[0]), dependencies: ["frame.builtin"] }]), /依赖循环/);
});

test("startup plan rejects disabling required plugins and unknown/invalid data; adds defaults for known new entries", () => {
  const plan = clone(defaultStartupPlan(directory));
  delete plan.plugins["frame.score-info"];
  assert.equal(validateStartupPlan(directory, plan).plugins["frame.score-info"].settings.measureLimit, 8);
  plan.plugins["notation.core"].enabled = false;
  assert.throws(() => validateStartupPlan(directory, plan), /必需插件/);
  plan.plugins["notation.core"].enabled = true;
  plan.plugins["unknown.plugin"] = { enabled: true, settings: {} };
  assert.throws(() => validateStartupPlan(directory, plan), /未知插件/);
  delete plan.plugins["unknown.plugin"];
  plan.plugins["frame.score-info"] = { enabled: true, settings: { measureLimit: 2.5 } };
  assert.throws(() => validateStartupPlan(directory, plan), /整数/);
  plan.plugins["frame.score-info"].settings = { extra: true };
  assert.throws(() => validateStartupPlan(directory, plan), /未知参数/);
  plan.format = 2;
  assert.throws(() => validateStartupPlan(directory, plan), /计划格式/);
});

test("disabled dependencies block saving without discarding the pending edits", () => {
  const items = clone(directory);
  items[4].dependencies = ["frame.plugins"];
  const controller = createPluginStartupController({ directory: definePluginDirectory(items), store: storageFixture().store });
  controller.setEnabled("frame.score-info", true); controller.setEnabled("frame.plugins", false);
  assert.match(controller.snapshot().issue, /需要启用 插件状态/);
  assert.equal(controller.save().ok, false);
  assert.equal(controller.snapshot().draft.plugins["frame.score-info"].enabled, true);
  controller.setEnabled("frame.plugins", true);
  assert.equal(controller.save().ok, true);
});

test("save, recreation and discard preserve accepted parameters; invalid input never reaches storage", () => {
  const { store } = storageFixture();
  let controller = createPluginStartupController({ directory, store });
  assert.equal(controller.setEnabled("notation.core", false).ok, false);
  controller.setEnabled("frame.score-info", true);
  for (const value of ["", " ", true, "0", "33", "2.5"]) assert.equal(controller.setSetting("frame.score-info", "measureLimit", value).ok, false);
  assert.equal(controller.save().ok, false); assert.equal(store.read(), null);
  controller.setSetting("frame.score-info", "measureLimit", "3");
  controller.setSetting("frame.score-info", "mode", "measures");
  assert.deepEqual(controller.save(), { ok: true, revision: 1 });
  controller = createPluginStartupController({ directory, store });
  assert.equal(controller.snapshot().draft.plugins["frame.score-info"].settings.measureLimit, 3);
  controller.setSetting("frame.score-info", "measureLimit", "4"); controller.discard();
  assert.equal(controller.snapshot().draft.plugins["frame.score-info"].settings.measureLimit, 3);
});

test("failed save keeps baseline and draft; observed external changes cannot be overwritten", () => {
  const fixture = storageFixture(), controller = createPluginStartupController({ directory, store: fixture.store });
  controller.setEnabled("frame.score-info", true); fixture.fail(true);
  assert.equal(controller.save().ok, false);
  assert.match(controller.snapshot().issue, /QuotaExceededError/);
  assert.equal(controller.snapshot().baseline.revision, 0);
  assert.deepEqual(controller.snapshot().dirtyIds, ["frame.score-info"]);
  fixture.fail(false);
  const other = createPluginStartupController({ directory, store: fixture.store });
  other.setEnabled("frame.plugins", false); other.save();
  assert.equal(controller.save().ok, false);
  assert.match(controller.snapshot().issue, /其他页面改变/);
  assert.equal(fixture.store.read().plugins["frame.plugins"].enabled, false);
  controller.reload(); assert.equal(controller.snapshot().dirtyIds.length, 0);
});

test("corrupt/unavailable storage blocks startup and saving; reload recovers without overwriting original data", () => {
  const fixture = storageFixture(); fixture.values.set(BACKUP_STARTUP_STORAGE_KEY, "{bad");
  const controller = createPluginStartupController({ directory, store: fixture.store });
  controller.setEnabled("frame.score-info", true);
  assert.equal(controller.snapshot().canStart, false); assert.equal(controller.save().ok, false);
  assert.equal(fixture.values.get(BACKUP_STARTUP_STORAGE_KEY), "{bad");
  fixture.values.delete(BACKUP_STARTUP_STORAGE_KEY); assert.equal(controller.reload().ok, true);
  assert.equal(controller.snapshot().canStart, true);
  const denied = createPluginStartupController({ directory, store: createBrowserPluginPlanStore({ storage() { throw new Error("SecurityError"); } }) });
  assert.match(denied.snapshot().issue, /SecurityError/); assert.equal(denied.snapshot().canStart, false);
});

test("saved selection/parameters reach one fixed runtime; further saves affect only the next startup", () => withTestDocument(({ document }) => {
  const fixture = storageFixture(), controller = createPluginStartupController({ directory, store: fixture.store });
  controller.setEnabled("frame.score-info", true); controller.setSetting("frame.score-info", "mode", "measures");
  controller.setSetting("frame.score-info", "measureLimit", "2"); controller.save();
  const root = document.createElement("main"); document.body.append(root);
  const first = createBackupUiRuntime({ root, startupStore: fixture.store });
  try {
    const info = first.execute("frame.score-info.read");
    assert.equal(info.ok, true); assert.equal(info.info.measureLimit, 2); assert.equal(info.info.measures.length, 2);
    // Enabling a plugin installs its contribution; placement remains a layout-edit decision.
    first.execute("frame.workspace.adjust.begin");
    assert.equal(first.execute("frame.sidebar.panel.enabled", { id: "frame.score-info.panel", enabled: true }).ok, true);
    first.execute("frame.workspace.adjust.finish", { confirm: true });
    assert.equal(first.execute("frame.workspace.page.select", { id: "frame.score-info.panel", toggle: false }).ok, true);
    assert.ok(root.querySelector(".score-info-panel"));
    assert.equal(root.querySelector(".score-info-panel").querySelectorAll("li").length, 2);
    first.execute("frame.workspace.page.select", { id: "frame.plugins.diagnostics", toggle: false });
    const statuses = root.querySelectorAll(".plugin-status-row").map(row => row.textContent);
    for (const id of directory.map(item => item.id)) assert.equal(statuses.filter(text => text.includes(id)).length, 1, id);
    controller.setEnabled("frame.score-info", false); controller.setEnabled("frame.plugins", false); controller.save();
    assert.equal(first.execute("frame.score-info.read").ok, true);
    assert.equal(first.startupPlan.revision, 1);
  } finally { first.dispose(); }
  const second = createBackupUiRuntime({ root, startupStore: fixture.store });
  try {
    assert.deepEqual(second.execute("frame.score-info.read"), { ok: false, code: "command.missing" });
    assert.equal(second.startupPlan.revision, 2);
    assert.equal(second.execute("frame.workspace.page.select", { id: "frame.score-info.panel" }).ok, false);
    assert.equal(second.execute("frame.workspace.page.select", { id: "frame.plugins.diagnostics" }).ok, false);
    assert.ok(root.querySelector(".core-score-view"));
  } finally { second.dispose(); }
}));

test("invalid stored plan fails before document reads/subscriptions; legacy entry still accepts its fixed plugins", () => withTestDocument(({ document }) => {
  const root = document.createElement("main"); document.body.append(root); let reads = 0, subscriptions = 0;
  const plan = clone(defaultStartupPlan(directory)); plan.plugins["notation.core"].enabled = false;
  assert.throws(() => createBackupUiRuntime({ root, startupPlan: plan, documentSession: {
    read() { reads++; }, subscribe() { subscriptions++; },
  } }), /必需插件/);
  assert.equal(reads, 0); assert.equal(subscriptions, 0); assert.equal(root.children.length, 0);
  assert.throws(() => createBackupUiRuntime({ root, startupStore: storageFixture().store, startupPlan: plan }), /其中之一/);
  const runtime = createBackupUiRuntime({ root });
  assert.equal(runtime.startupPlan, null); runtime.dispose();
}));

test("startup view retains selection/search/settings and shows genuine save errors; stale controls are released", () => withTestDocument(({ document }) => {
  const fixture = storageFixture(), controller = createPluginStartupController({ directory, store: fixture.store });
  const { root } = shell(document);
  const view = mountPluginStartupView({ root, controller, selectedId: "frame.score-info" });
  const row = id => root.querySelector(`[data-plugin-id="${id}"]`);
  const save = root.querySelector("#startup-apply"), search = root.querySelector("#startup-search");
  assert.equal(row("notation.core").querySelector(".startup-toggle"), null);
  for (const button of root.querySelectorAll("button")) assert.equal(button.querySelector("button"), null);
  const input = root.querySelector("#frame.score-info-measureLimit"); change(input, "");
  assert.equal(save.disabled, true); assert.equal(input.getAttribute("aria-invalid"), "true");
  change(input, "3"); fixture.fail(true); save.click();
  assert.match(root.querySelector("#startup-feedback").textContent, /保存失败.*QuotaExceededError/);
  assert.equal(input.value, "3"); fixture.fail(false); save.click();
  assert.match(root.querySelector("#startup-feedback").textContent, /已保存/);
  row("frame.layout").querySelector(".startup-select").click();
  change(input, "9"); assert.equal(controller.snapshot().draft.plugins["frame.score-info"].settings.measureLimit, 3);
  change(search, "absent"); assert.match(root.querySelector("#startup-detail").textContent, /没有匹配/);
  change(search, "谱面信息"); assert.equal(root.querySelector("#startup-detail").querySelector("h2").textContent, "谱面信息");
  const toggle = row("frame.score-info").querySelector(".startup-toggle");
  view.dispose(); toggle.click(); assert.equal(controller.snapshot().dirtyIds.length, 0);
  const remount = mountPluginStartupView({ root, controller }); assert.equal(root.querySelectorAll(".startup-row").length, 5); remount.dispose();
}));

test("same-document preview starts with saved config, returns cleanly and exposes a failed start", () => withTestDocument(({ document }) => {
  const fixture = storageFixture(), { root, workspaceRoot } = shell(document);
  const append = workspaceRoot.append.bind(workspaceRoot);
  workspaceRoot.append = (...nodes) => { assert.equal(workspaceRoot.hidden, false, "viewport mounts into visible DOM"); append(...nodes); };
  const preview = mountBackupPluginStartupPreview({ root, workspaceRoot, store: fixture.store });
  const start = root.querySelector("#startup-open"); start.click();
  assert.equal(root.hidden, true); assert.equal(workspaceRoot.hidden, false);
  const back = workspaceRoot.querySelector(".v-app-mark");
  assert.equal(back.getAttribute("aria-label"), "返回插件配置"); back.click();
  assert.equal(workspaceRoot.children.length, 0); assert.equal(root.hidden, false);
  back.click(); assert.equal(root.hidden, false);
  const plan = clone(readStartupPlan(directory, fixture.store)); plan.plugins["notation.core"].enabled = false;
  fixture.store.write(plan); start.click();
  assert.equal(root.hidden, false); assert.equal(workspaceRoot.children.length, 0);
  assert.match(root.querySelector("#startup-feedback").textContent, /工作区启动失败.*必需插件/);
  preview.dispose(); start.click(); assert.equal(workspaceRoot.children.length, 0);
}));

test("the shipped classic bundle mounts actual directory with storage, without ESM or HTTP bootstrap", () => withTestDocument(({ document }) => {
  const fixture = storageFixture(), { root } = shell(document); root.id = "startup-root";
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: fixture.storage });
  try {
    const source = readFileSync(new URL("../vendor/plugin-startup-preview.js", import.meta.url), "utf8");
    assert.doesNotMatch(source, /import\.meta|\bimport\s*\(/);
    runInThisContext(source);
    assert.equal(root.querySelectorAll(".startup-row").length, 5);
    root.querySelector('[data-plugin-id="frame.score-info"]').querySelector(".startup-toggle").click();
    root.querySelector("#startup-apply").click();
    assert.equal(fixture.store.read().plugins["frame.score-info"].enabled, true);
    window.dispatchEvent(new Event("pagehide")); assert.equal(root.querySelectorAll(".startup-row").length, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous); else delete globalThis.localStorage;
  }
}));
