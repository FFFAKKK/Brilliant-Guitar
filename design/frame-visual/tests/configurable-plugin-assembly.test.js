import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createAuthorKitFiles, isWithin, projectRoot } from "../scripts/author-validation-kit.mjs";
import { BACKUP_PLUGIN_DIRECTORY } from "../src/host/backup-plugin-directory.js";
import { defaultStartupPlan, definePluginDirectory } from "../src/startup/plugin-startup-plan.js";
import { createDesktopPluginPlanStore, BACKUP_STARTUP_SETTINGS_NAMESPACE as namespace } from "../src/startup/desktop-plugin-plan-store.js";
import { TauriPluginSettingsStorage } from "../src/vendor/desktop-plugin-settings.js";
import { mountBackupPluginStartupPreview } from "../src/plugin-startup-preview.js";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { createBackupFormalPlatform, configureBackupFormalPlatform } from "../src/host/formal-plugin-assembly.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { withTestDocument } from "./support/dom-test-environment.js";
import { createStartupTestShell } from "./support/plugin-startup-fixtures.js";

const id = "trial.configured";
const clone = value => structuredClone(value);
const flush = () => new Promise(resolve => setImmediate(resolve));
const metadata = () => ({ id, name: "Configured trial", icon: "page", summary: "Fixed startup trial", builtin: false,
  required: false, enabled: false, source: "Public SDK trial", contributions: [{ icon: "page", label: "Panel" }], dependencies: [],
  fields: [{ key: "count", label: "Count", type: "number", initial: 2, min: 1, max: 9 }] });

async function independentSdk(t) {
  const temp = join(projectRoot, ".tmp"); await mkdir(temp, { recursive: true });
  const directory = await mkdtemp(join(temp, "configurable-plugin-"));
  t.after(async () => {
    const canonical = await realpath(directory);
    assert.ok(isWithin(await realpath(temp), canonical)); await rm(canonical, { recursive: true, force: true });
  });
  await writeFile(join(directory, "sdk.mjs"), (await createAuthorKitFiles()).get("sdk.mjs"));
  const source = await readFile(new URL("../examples/foundation/configured-plugin.js", import.meta.url), "utf8");
  await writeFile(join(directory, "configured-plugin.mjs"), source.replace('"../../src/vendor/plugin-platform.js"', '"./sdk.mjs"'));
  const sdk = await import(pathToFileURL(join(directory, "sdk.mjs")));
  const example = await import(pathToFileURL(join(directory, "configured-plugin.mjs")));
  return { ...sdk, ...example };
}

function plugin(createConfiguredPlugin, counters = { mounts: [], runs: [], disposed: 0 }, overrides = {}) {
  const pkg = createConfiguredPlugin({ onMount: count => counters.mounts.push(count), onRun: result => counters.runs.push(result),
    onDispose: () => { counters.disposed++; } });
  return Object.freeze({ ...pkg, ...overrides });
}

test("importing the reusable manager on a complete shell does not read storage or auto-mount a default application", async () => {
  await withTestDocument(async ({ document }) => {
    const { root, workspaceRoot } = createStartupTestShell(document); root.id = "startup-root";
    const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage"); let reads = 0;
    const storage = { getItem() { reads++; return null; }, setItem() {} };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    try {
      const { mountBackupPluginStartupPreview: mount } = await import(new URL("../src/plugin-startup-preview.js?assembly-import-check", import.meta.url));
      assert.equal(reads, 0); assert.equal(root.querySelectorAll(".startup-row").length, 0);
      const preview = mount({ root, workspaceRoot });
      try { assert.equal(reads, 1); assert.equal(root.querySelectorAll(".startup-row").length, BACKUP_PLUGIN_DIRECTORY.length); }
      finally { preview.dispose(); }
    } finally {
      if (previous) Object.defineProperty(globalThis, "localStorage", previous); else delete globalThis.localStorage;
    }
  });
});

test("independent configured package completes actual manager, generated desktop service, fixed session and recreation", async t => {
  const { createConfiguredPlugin } = await independentSdk(t);
  await withTestDocument(async ({ document }) => {
    const counters = { mounts: [], runs: [], disposed: 0 };
    const entry = { metadata: metadata(), plugin: plugin(createConfiguredPlugin, counters) };
    const directory = definePluginDirectory([...BACKUP_PLUGIN_DIRECTORY, entry.metadata]);
    const preserved = { schemaVersion: 7, value: { opaque: true } };
    let disk = { "other.plugin": clone(preserved) }, denyWrite = false;
    const calls = [];
    const settingsStorage = new TauriPluginSettingsStorage(async (command, args) => {
      calls.push({ command, args: clone(args) });
      if (command === "workbench_read_plugin_settings_v1") return clone(disk);
      if (command === "workbench_write_plugin_settings_v1") {
        if (denyWrite) throw { message: "trial disk denied", status: 503 };
        disk = clone(args.document); return;
      }
      throw new Error(`Unexpected IPC ${command}`);
    });
    const { root, workspaceRoot } = createStartupTestShell(document);
    const create = () => mountBackupPluginStartupPreview({ root, workspaceRoot, startupEntries: [entry], sessionMode: "process",
      storageMode: "async", store: createDesktopPluginPlanStore({ directory, settingsStorage }) });
    const changeCount = value => {
      const input = root.querySelector(`#${id}-count`); assert.ok(input);
      input.value = value; input.dispatchEvent(new Event("input"));
    };
    const select = () => root.querySelector(`[data-plugin-id="${id}"]`).querySelector(".startup-select").click();
    const toggle = () => root.querySelector(`[data-plugin-id="${id}"]`).querySelector(".startup-toggle").click();
    let preview = create();
    try {
      await preview.controller.ready; await flush();
      assert.equal(root.querySelectorAll(".startup-row").length, BACKUP_PLUGIN_DIRECTORY.length + 1);
      select(); toggle(); changeCount("5");
      denyWrite = true; root.querySelector("#startup-apply").click(); await flush();
      assert.match(root.querySelector("#startup-feedback").textContent, /trial disk denied/);
      assert.equal(disk[namespace], undefined); assert.equal(preview.controller.snapshot().baseline.revision, 0);
      assert.equal(root.querySelector(`#${id}-count`).value, "5");
      denyWrite = false; root.querySelector("#startup-apply").click(); await flush();
      assert.equal(disk[namespace].value.plugins[id].settings.count, 5);
      assert.deepEqual(disk["other.plugin"], preserved);
      root.querySelector("#startup-open").click(); await flush();
      assert.equal(root.hidden, true); assert.ok(workspaceRoot.querySelector(".core-score-view"));
      workspaceRoot.querySelector(`#page-tab-${id}.panel`).click();
      const button = workspaceRoot.querySelector("[data-configured-trial]");
      assert.equal(button.textContent, "5"); button.click(); await flush();
      assert.deepEqual(counters.runs, [{ ok: true, count: 5, payload: { source: "button" } }]);
      workspaceRoot.querySelector(".v-app-mark").click(); await flush(); select(); toggle(); changeCount("7");
      root.querySelector("#startup-apply").click(); await flush();
      assert.equal(disk[namespace].value.plugins[id].enabled, false);
      root.querySelector("#startup-open").click(); await flush();
      assert.equal(workspaceRoot.querySelector("[data-configured-trial]"), button);
      button.click(); await flush(); assert.equal(counters.runs.at(-1).count, 5); assert.deepEqual(counters.mounts, [5]);
      preview.dispose(); assert.equal(counters.disposed, 1);
      button.click(); assert.equal(counters.runs.length, 2, "disposed DOM cannot execute a stale command");
      preview = create(); await preview.controller.ready; await flush();
      assert.equal(preview.controller.snapshot().baseline.plugins[id].enabled, false);
      assert.equal(preview.controller.snapshot().baseline.plugins[id].settings.count, 7);
      root.querySelector("#startup-open").click(); await flush();
      assert.equal(workspaceRoot.querySelector(`#page-tab-${id}.panel`), null);
      workspaceRoot.querySelector(".v-app-mark").click(); await flush(); select(); toggle();
      root.querySelector("#startup-apply").click(); await flush();
      preview.dispose(); preview = create(); await preview.controller.ready; await flush();
      root.querySelector("#startup-open").click(); await flush();
      workspaceRoot.querySelector(`#page-tab-${id}.panel`).click();
      assert.equal(workspaceRoot.querySelector("[data-configured-trial]").textContent, "7");
      assert.deepEqual(counters.mounts, [5, 7]);
      assert.deepEqual(disk["other.plugin"], preserved);
      assert.equal(calls.filter(call => call.command === "workbench_write_plugin_settings_v1").length, 4, "one rejected and three accepted writes");
    } finally { preview.dispose(); }
    assert.equal(counters.disposed, 2); assert.equal(workspaceRoot.children.length, 0);
  });
});

test("directory/package mismatches reject before configuration reads or document creation", async t => {
  const { createConfiguredPlugin } = await independentSdk(t);
  await withTestDocument(({ document }) => {
    for (const entry of [
      { metadata: { ...metadata(), id: "trial.wrong" }, plugin: plugin(createConfiguredPlugin) },
      { metadata: metadata(), plugin: plugin(createConfiguredPlugin, undefined, { activation: "always" }) },
      { metadata: metadata(), plugin: plugin(createConfiguredPlugin, undefined, { settings: undefined }) },
      { metadata: metadata(), plugin: plugin(createConfiguredPlugin, undefined, { settings: { schemaVersion: 2, defaults: { count: 2 }, parse: value => value } }) },
    ]) {
      const { root, workspaceRoot } = createStartupTestShell(document); let reads = 0, documents = 0;
      assert.throws(() => mountBackupPluginStartupPreview({ root, workspaceRoot, startupEntries: [entry],
        store: { read() { reads++; return null; }, write() {} }, createDocumentSession() { documents++; } }), /装配|参数|schemaVersion|activation/);
      assert.equal(reads, 0); assert.equal(documents, 0); assert.equal(workspaceRoot.children.length, 0);
    }
  });
});

test("a planned runtime cannot silently activate an unmanaged package outside its saved fixed directory", async t => {
  const { createConfiguredPlugin } = await independentSdk(t);
  await withTestDocument(({ document }) => {
    const root = document.createElement("main"); document.body.append(root); let reads = 0;
    assert.throws(() => createBackupUiRuntime({ root, startupPlan: defaultStartupPlan(BACKUP_PLUGIN_DIRECTORY),
      plugins: [plugin(createConfiguredPlugin)], documentSession: { read() { reads++; } } }), /装配|目录/);
    assert.equal(reads, 0); assert.equal(root.children.length, 0);
  });
});

test("a no-settings unmanaged command cannot bypass the saved plan, while the explicit no-plan entry stays supported", async t => {
  const { definePlugin } = await independentSdk(t);
  await withTestDocument(({ document }) => {
    const pkg = definePlugin({ id: "trial.unlisted", name: "Unlisted", version: "0.1.0", apiVersion: "4.0", activation: "user",
      ui: { contractVersion: 1, commands: [{ id: "trial.unlisted.read", run: () => ({ ok: true }) }] } });
    const root = document.createElement("main"); document.body.append(root);
    assert.throws(() => createBackupUiRuntime({ root, startupPlan: defaultStartupPlan(BACKUP_PLUGIN_DIRECTORY), plugins: [pkg] }), /装配|目录/);
    assert.equal(root.children.length, 0);
    const runtime = createBackupUiRuntime({ root, plugins: [pkg] });
    try { assert.deepEqual(runtime.execute("trial.unlisted.read"), { ok: true }); }
    finally { runtime.dispose(); }
  });
});

test("the formal activation adapter rejects absent plan membership before restoring settings or installing commands", async t => {
  const { definePlugin } = await independentSdk(t);
  const router = createCommandRouter(), components = createComponentRegistry(), menus = createMenuRegistry([]);
  const platform = createBackupFormalPlatform({ router, components, menus });
  const pkg = definePlugin({ id: "trial.unlisted", name: "Unlisted", version: "0.1.0", apiVersion: "4.0", activation: "user",
    ui: { contractVersion: 1, commands: [{ id: "trial.unlisted.read", run: () => ({ ok: true }) }] } });
  platform.register(pkg);
  try {
    assert.throws(() => configureBackupFormalPlatform(platform, { plugins: [pkg], plan: defaultStartupPlan(BACKUP_PLUGIN_DIRECTORY) }), /启动计划未声明/);
    assert.equal(router.describe("trial.unlisted.read"), null);
    configureBackupFormalPlatform(platform, { plugins: [pkg] });
    platform.start();
    assert.deepEqual(router.execute("trial.unlisted.read"), { ok: true });
  } finally { platform.dispose(); }
});

test("settings rejected by the original parser fail startup rather than silently using defaults", async t => {
  const { createConfiguredPlugin } = await independentSdk(t);
  await withTestDocument(async ({ document }) => {
    const counters = { mounts: [], runs: [], disposed: 0 };
    const entry = { metadata: metadata(), plugin: plugin(createConfiguredPlugin, counters, { settings: { schemaVersion: 1, defaults: { count: 2 },
      parse: value => value && value.count <= 4 ? { count: value.count } : null } }) };
    const directory = definePluginDirectory([...BACKUP_PLUGIN_DIRECTORY, entry.metadata]);
    const plan = clone(defaultStartupPlan(directory)); plan.plugins[id] = { enabled: true, settings: { count: 7 } };
    const root = document.createElement("main"); document.body.append(root);
    assert.throws(() => createBackupUiRuntime({ root, startupPlan: plan, startupEntries: [entry] }), /启动设置恢复失败/);
    assert.deepEqual(counters.mounts, []); assert.equal(root.children.length, 0);
    plan.plugins[id].settings.count = 3;
    const runtime = createBackupUiRuntime({ root, startupPlan: plan, startupEntries: [entry] });
    try { assert.equal((await runtime.execute(`${id}.read`)).count, 3); }
    finally { runtime.dispose(); }
  });
});

test("duplicate, builtin-replacing, old API and unknown assembly records cannot acquire resources", async t => {
  const { createConfiguredPlugin, definePlugin } = await independentSdk(t);
  await withTestDocument(({ document }) => {
    const entry = { metadata: metadata(), plugin: plugin(createConfiguredPlugin) };
    for (const entries of [[entry, entry], [{ ...entry, install() {} }],
      [{ metadata: metadata(), plugin: definePlugin({ id, name: "Old", version: "0.1.0" }) }],
      [{ metadata: { ...metadata(), id: "notation.core", required: true, enabled: true, reason: "trial", fields: [] },
        plugin: definePlugin({ id: "notation.core", name: "Replace core", version: "0.1.0", apiVersion: "4.0" }) }]]) {
      const { root, workspaceRoot } = createStartupTestShell(document); let reads = 0;
      assert.throws(() => mountBackupPluginStartupPreview({ root, workspaceRoot, startupEntries: entries,
        store: { read() { reads++; return null; }, write() {} } }), /装配|4.0|重复/);
      assert.equal(reads, 0); assert.equal(workspaceRoot.children.length, 0);
    }
  });
});

test("captured fixed entries ignore later application mutations and reject use without a plan", async t => {
  const { createConfiguredPlugin } = await independentSdk(t);
  await withTestDocument(({ document }) => {
    const entry = { metadata: metadata(), plugin: plugin(createConfiguredPlugin) }, entries = [entry];
    const { root, workspaceRoot } = createStartupTestShell(document);
    const preview = mountBackupPluginStartupPreview({ root, workspaceRoot, startupEntries: entries, store: { read: () => null, write() {} } });
    try {
      entries.length = 0; entry.metadata.id = "trial.changed"; entry.metadata.fields[0].max = 50;
      assert.equal(preview.controller.directory.at(-1).id, id);
      assert.equal(preview.controller.directory.at(-1).fields[0].max, 9);
      assert.equal(preview.controller.setSetting(id, "count", "40").ok, false);
      assert.throws(() => createBackupUiRuntime({ root: workspaceRoot, startupEntries: [{ metadata: metadata(), plugin: entry.plugin }] }), /需要启动计划/);
    } finally { preview.dispose(); }
  });
});

test("failed package installation rolls back the entire selected application and permits retry on the same root", async t => {
  const { createConfiguredPlugin } = await independentSdk(t);
  await withTestDocument(({ document }) => {
    const counters = { mounts: [], runs: [], disposed: 0 }, entry = { metadata: metadata(), plugin: plugin(createConfiguredPlugin, counters,
      { hostFeatures: ["trial.unavailable"] }) };
    const directory = definePluginDirectory([...BACKUP_PLUGIN_DIRECTORY, entry.metadata]);
    const plan = clone(defaultStartupPlan(directory)); plan.plugins[id].enabled = true;
    const root = document.createElement("main"); document.body.append(root);
    assert.throws(() => createBackupUiRuntime({ root, startupEntries: [entry], startupPlan: plan }), /UI 插件启动失败/);
    assert.equal(root.children.length, 0); assert.deepEqual(counters.mounts, []);
    entry.plugin = plugin(createConfiguredPlugin, counters);
    const runtime = createBackupUiRuntime({ root, startupEntries: [entry], startupPlan: plan });
    try { assert.equal(runtime.plugins.snapshot().filter(record => record.manifest.id === id && record.status === "active").length, 1); }
    finally { runtime.dispose(); }
  });
});
