import assert from "node:assert/strict";
import test from "node:test";
import { definePlugin, PluginPlatform } from "../src/vendor/plugin-platform.js";
import { createBackupFormalPlatform } from "../src/host/formal-plugin-assembly.js";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createNotices } from "../src/runtime/notices.js";
import { createPluginStatusReadPort } from "../src/runtime/plugin-status-read-port.js";
import { createUiContributionCatalog } from "../src/runtime/ui-contribution-catalog.js";
import { defaultStartupPlan } from "../src/startup/plugin-startup-plan.js";
import { BACKUP_PLUGIN_DIRECTORY } from "../src/host/backup-plugin-directory.js";
import { mountBackupPluginStartupPreview } from "../src/plugin-startup-preview.js";
import { createStartupTestShell } from "./support/plugin-startup-fixtures.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const identity = id => ({ id, name: id, version: "0.1.0", apiVersion: "4.0" });
const ui = overrides => ({ contractVersion: 1, components: [], commands: [], menuItems: [], shortcuts: [], ...overrides });
function setup(menus = createMenuRegistry([{ id: "view", label: "View" }])) {
  const router = createCommandRouter(), components = createComponentRegistry();
  const platform = createBackupFormalPlatform({ router, components, menus });
  assert.ok(platform instanceof PluginPlatform, "the backup executes the generated formal class");
  return { router, components, menus, platform };
}

test("layout/core/info register under formal identities with restored settings and unchanged placement", () => withTestDocument(() => {
  const root = document.createElement("main"); document.body.append(root);
  const plan = JSON.parse(JSON.stringify(defaultStartupPlan(BACKUP_PLUGIN_DIRECTORY)));
  plan.plugins["frame.score-info"] = { enabled: true, settings: { mode: "measures", measureLimit: 2 } };
  const runtime = createBackupUiRuntime({ root, startupPlan: plan });
  try {
    const records = runtime.plugins.snapshot();
    assert.deepEqual(records.map(item => item.manifest.id).sort(), BACKUP_PLUGIN_DIRECTORY.map(item => item.id).sort());
    assert.equal(records.every(item => item.manifest.apiVersion === "4.0" && item.active), true);
    const result = runtime.execute("frame.score-info.read");
    assert.equal(result.info.measureLimit, 2); assert.equal(result.info.measures.length, 2);
    assert.equal(root.querySelectorAll(".core-score-view").length, 1);
    assert.equal(root.querySelector(".score-info-panel"), null, "enablement does not force a layout placement");
    assert.equal(runtime.execute("frame.workspace.region.toggle", { region: "left" }).ok, true);
  } finally { runtime.dispose(); }
}));

test("payload/result, menus and local shortcuts share the existing UI router and restricted component context", () => withTestDocument(() => {
  const { platform, router, components, menus } = setup();
  let context, calls = 0;
  const run = payload => { calls++; return { ok: true, payload, calls }; };
  platform.register(definePlugin({ ...identity("trial.panel"), ui: ui({
    commands: [{ id: "trial.panel.inspect", run }],
    components: [{ id: "trial.panel.content", title: "Trial", role: "tool", uiKind: "panel", slots: ["left", "right"],
      permissions: { commands: ["trial.panel.inspect"] }, mount(_element, ctx) { context = ctx; } }],
    menuItems: [{ id: "trial.panel.menu", menu: "view", command: "trial.panel.inspect" }],
    shortcuts: [{ id: "trial.panel.key", command: "trial.panel.inspect", keys: ["Mod+I"], scope: "component", componentId: "trial.panel.content" }],
  }) }));
  platform.start();
  const host = createComponentHost({ registry: components, router, notices: createNotices() });
  const element = host.ensure("trial.panel.content", "left");
  assert.equal(Object.isFrozen(context), true);
  assert.equal(context.platform, undefined); assert.equal(context.router, undefined);
  const payload = { value: 7 };
  assert.deepEqual(context.execute("trial.panel.inspect", payload), { ok: true, payload, calls: 1 });
  const item = menus.resolve()[0].groups[0][0];
  assert.deepEqual(router.execute(item.command, payload), { ok: true, payload, calls: 2 });
  const binding = router.shortcuts.resolve("Mod+I", { componentId: "trial.panel.content", owner: "trial.panel" });
  assert.equal(host.executeShortcut(binding, [element]).ok, true); assert.equal(calls, 3);
  assert.deepEqual(context.execute("frame.ungranted"), { ok: false, code: "permission.denied" });
  assert.equal(calls, 3);
  host.dispose(); platform.dispose();
  assert.deepEqual(context.execute("trial.panel.inspect"), { ok: false, code: "component.disposed" });
  assert.equal(router.describe("trial.panel.inspect"), null);
  assert.deepEqual(router.shortcuts.list(), []); assert.deepEqual(menus.resolve(), []);
}));

test("public no-UI and disabled packages stay in the one directory without placeholder components", () => {
  const { platform, components, router } = setup();
  platform.register(definePlugin(identity("trial.empty")));
  platform.register(definePlugin({ ...identity("trial.off"), activation: "user", ui: ui({
    commands: [{ id: "trial.off.run", run: () => ({ ok: true }) }],
  }) }));
  platform.start();
  assert.deepEqual(platform.sessionPlan().pluginIds, ["trial.empty"]);
  assert.equal(platform.list()[1].status, "installed");
  assert.equal(router.describe("trial.off.run"), null); assert.deepEqual(components.list(), []);
  const port = createPluginStatusReadPort(platform);
  assert.equal(port.snapshot()[0].manifest.version, "0.1.0");
  assert.equal(JSON.stringify(port.snapshot()).includes("trial.off.run"), true);
  platform.activate("trial.off"); assert.equal(platform.restartRequired(), true);
  assert.equal(router.describe("trial.off.run"), null, "a next-launch preference never installs into this session");
  platform.dispose();
});

test("disabled and asynchronous mount commands retain router semantics without a second forwarding layer", async () => {
  const { platform, router } = setup(); let enabled = false, calls = 0;
  platform.register(definePlugin({ ...identity("trial.async"), ui: ui({ commands: [{ id: "trial.async.run",
    enabled: () => enabled, async run(payload) { calls++; return { ok: true, payload }; } }] }) }));
  platform.start(); assert.deepEqual(router.execute("trial.async.run", 7), { ok: false, code: "command.disabled" });
  assert.equal(calls, 0); enabled = true;
  assert.deepEqual(await router.execute("trial.async.run", 7), { ok: true, payload: 7 }); assert.equal(calls, 1);
  platform.dispose(); assert.deepEqual(router.execute("trial.async.run", 7), { ok: false, code: "command.missing" });
});

test("install failure releases components, commands and shortcuts and keeps formal failure diagnostics", () => {
  const menus = { has: () => true, contribute() { throw new Error("menu install fault"); } };
  const { platform, components, router } = setup(menus);
  platform.register(definePlugin({ ...identity("trial.fault"), ui: ui({
    components: [{ id: "trial.fault.panel", title: "Fault", role: "tool", slots: ["left"], mount() {} }],
    commands: [{ id: "trial.fault.run", keys: ["Mod+I"], run() {} }],
    menuItems: [{ id: "trial.fault.menu", menu: "view", command: "trial.fault.run" }],
  }) }));
  platform.register(definePlugin(identity("trial.good"))); platform.start();
  assert.equal(platform.list()[0].status, "failed"); assert.equal(platform.list()[1].active, true);
  assert.match(createPluginStatusReadPort(platform).snapshot()[0].error, /menu install fault/);
  assert.deepEqual(components.list(), []); assert.equal(router.describe("trial.fault.run"), null);
  assert.deepEqual(router.shortcuts.list(), []); platform.dispose();
});

test("the owning settings read port is restored before mount, and moving a cell does not recreate it", () => withTestDocument(() => {
  const { platform, router, components } = setup();
  let count = 0, settings, releases = 0;
  platform.register(definePlugin({ ...identity("trial.settings"), settings: { schemaVersion: 1, defaults: 1,
    parse: value => Number.isSafeInteger(value) ? value : null }, ui: ui({
    components: [{ id: "trial.settings.panel", title: "Settings", role: "tool", slots: ["left", "right"], mount(_el, ctx) {
      count++; settings = ctx.settings.read(); assert.equal(ctx.settings.write, undefined); ctx.onDispose(() => { releases++; });
    } }],
  }) }));
  platform.settings().restore({ "trial.settings": { schemaVersion: 1, value: 7 } }); platform.start();
  const host = createComponentHost({ registry: components, router, notices: createNotices() });
  const first = host.ensure("trial.settings.panel", "left");
  assert.equal(settings, 7); host.setVisible("trial.settings.panel", false);
  assert.equal(host.ensure("trial.settings.panel", "right"), first); assert.equal(count, 1);
  const catalog = createUiContributionCatalog({ platform, components });
  assert.equal(catalog.list()[0].pluginId, "trial.settings");
  host.dispose(); platform.dispose(); assert.equal(releases, 1);
}));

test("unknown legacy declarations fail before any document subscription unless identity metadata is explicit", () => withTestDocument(() => {
  const root = document.createElement("main"); document.body.append(root); let reads = 0;
  let arity;
  const legacy = { namespace: "trial.legacy", components: [], commands: [{ id: "trial.legacy.read", run(value) { arity = arguments.length; return value; } }] };
  assert.throws(() => createBackupUiRuntime({ root, plugins: [legacy], documentSession: { read() { reads++; } } }), /身份|元数据/);
  assert.equal(reads, 0); assert.equal(root.children.length, 0);
  const runtime = createBackupUiRuntime({ root, plugins: [legacy], legacyPluginMetadata: {
    "trial.legacy": { ...identity("trial.legacy"), activation: "user" },
  } });
  assert.deepEqual(runtime.execute("trial.legacy.read", { ok: true, value: 3 }), { ok: true, value: 3 });
  assert.equal(arity, 1, "the migration retains the old run(payload) calling convention"); runtime.dispose();
}));

test("the desktop process returns to its original session after editing the next plan; only a new process applies it", () => withTestDocument(() => {
  const { root, workspaceRoot } = createStartupTestShell(document);
  let plan = JSON.parse(JSON.stringify(defaultStartupPlan(BACKUP_PLUGIN_DIRECTORY)));
  plan.plugins["frame.score-info"].enabled = true;
  const store = { read: () => plan, write(value) { plan = value; } };
  let preview = mountBackupPluginStartupPreview({ root, workspaceRoot, store, sessionMode: "process" });
  root.querySelector("#startup-open").click();
  const original = workspaceRoot.querySelector(".core-score-view"); assert.ok(original);
  workspaceRoot.querySelector(".v-app-mark").click();
  assert.equal(workspaceRoot.hidden, true); assert.equal(original.isConnected, true);
  preview.controller.setEnabled("frame.score-info", false); preview.controller.save();
  // The manager refreshes on return; use its explicit saved-plan start control.
  root.querySelector("#startup-open").click();
  assert.equal(workspaceRoot.querySelector(".core-score-view"), original);
  assert.equal(root.hidden, true); preview.dispose(); assert.equal(original.isConnected, false);
  preview = mountBackupPluginStartupPreview({ root, workspaceRoot, store, sessionMode: "process" });
  root.querySelector("#startup-open").click();
  assert.notEqual(workspaceRoot.querySelector(".core-score-view"), original);
  preview.dispose();
}));

test("a failed next-launch config read cannot block resuming a healthy fixed process session", () => withTestDocument(() => {
  const { root, workspaceRoot } = createStartupTestShell(document);
  let fail = false, reads = 0;
  const store = { read() { reads++; if (fail) throw new Error("next-launch storage fault"); return null; }, write() {} };
  const preview = mountBackupPluginStartupPreview({ root, workspaceRoot, store, sessionMode: "process" });
  try {
  root.querySelector("#startup-open").click(); const original = workspaceRoot.querySelector(".core-score-view");
  fail = true; workspaceRoot.querySelector(".v-app-mark").click();
  assert.equal(preview.controller.snapshot().canStart, false);
  assert.match(root.querySelector("#startup-feedback").textContent, /storage fault/);
  const beforeResume = reads;
  assert.equal(root.querySelector("#startup-open").disabled, false);
  root.querySelector("#startup-open").click();
  assert.equal(reads, beforeResume); assert.equal(workspaceRoot.querySelector(".core-score-view"), original);
  assert.equal(root.hidden, true);
  } finally { preview.dispose(); }
}));

test("async desktop next-plan errors leave the current session resumable without another storage request", async () => withTestDocument(async () => {
  const { root, workspaceRoot } = createStartupTestShell(document);
  let fail = false, reads = 0;
  const store = { async read() { reads++; if (fail) throw new Error("desktop read fault"); return null; }, async write() {} };
  const preview = mountBackupPluginStartupPreview({ root, workspaceRoot, store, storageMode: "async", sessionMode: "process" });
  try {
  await preview.controller.ready; await new Promise(resolve => setTimeout(resolve, 0));
  root.querySelector("#startup-open").click(); await new Promise(resolve => setTimeout(resolve, 0));
  const original = workspaceRoot.querySelector(".core-score-view"); assert.ok(original);
  fail = true; workspaceRoot.querySelector(".v-app-mark").click(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(preview.controller.snapshot().canStart, false);
  assert.match(preview.controller.snapshot().issue, /desktop read fault/);
  const before = reads; root.querySelector("#startup-open").click(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(reads, before); assert.equal(workspaceRoot.querySelector(".core-score-view"), original);
  assert.equal(root.hidden, true);
  } finally { preview.dispose(); }
}));
