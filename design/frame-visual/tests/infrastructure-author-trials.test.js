import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { resolve, sep } from "node:path";
import { validateAuthorDirectory } from "../scripts/author-validation-kit.mjs";
import { PluginPlatform } from "../src/vendor/plugin-platform.js";
import { createBackupFormalPlatform } from "../src/host/formal-plugin-assembly.js";
import { createWorkspaceRuntime } from "../src/host/workspace-runtime.js";
import { prepareBackupPlugin, configureBackupFormalPlatform } from "../src/host/formal-plugin-assembly.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createNotices } from "../src/runtime/notices.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const submittedDirectory = process.env.BRILLIANT_AUTHOR_TRIAL_DIRECTORY;
const submission = submittedDirectory ? await validateAuthorDirectory(submittedDirectory) : null;
const authorDirectory = submission ? pathToFileURL(resolve(submission.directory) + sep) : new URL("../examples/foundation/", import.meta.url);
const [{ createPanelPlugin }, { createCommandPlugin }, { createReadonlyViewPlugin }] = await Promise.all([
  import(new URL("panel-plugin.js", authorDirectory)), import(new URL("command-plugin.js", authorDirectory)),
  import(new URL("readonly-view-plugin.js", authorDirectory)),
]);

const tick = () => new Promise(resolve => setImmediate(resolve));
function source() {
  const listeners = new Set(); let value = 0;
  return { read: () => value, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    update(next) { value = next; for (const listener of [...listeners]) listener(); }, count: () => listeners.size };
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function setup() {
  const components = createComponentRegistry(), router = createCommandRouter(), menus = createMenuRegistry([{ id: "view", label: "View" }]);
  const platform = createBackupFormalPlatform({ components, router, menus });
  assert.ok(platform instanceof PluginPlatform);
  const host = createComponentHost({ registry: components, router, notices: createNotices() });
  return { components, router, menus, platform, host };
}

test("author examples import only the documented SDK and have no host-private imports", async () => {
  if (submission) {
    assert.ok(submission.files.length >= 3);
    assert.match(submission.sdkSha256, /^[a-f0-9]{64}$/);
    return;
  }
  for (const name of ["panel-plugin", "command-plugin", "readonly-view-plugin"]) {
    const content = await readFile(new URL(`../examples/foundation/${name}.js`, import.meta.url), "utf8");
    assert.deepEqual([...content.matchAll(/import .+ from "([^"]+)"/g)].map(match => match[1]), ["../../src/vendor/plugin-platform.js"]);
  }
});

test("A/B/C compose on one formal platform for 100 sessions with one mount, one execution and complete owned-resource release", t => withTestDocument(() => {
  const history = [];
  for (let cycle = 0; cycle < 100; cycle++) {
    const current = setup(), model = source(); let calls = 0;
    current.platform.registerAll([createPanelPlugin({ source: model }), createCommandPlugin({ run(payload) {
      calls++; return { ok: true, payload, calls };
    } }), createReadonlyViewPlugin({ read: () => Promise.resolve("own data") })]);
    current.platform.settings().restore({ "audit.panel": { schemaVersion: 1, value: { prefix: "R" } } });
    current.platform.start();
    const left = document.createElement("aside"), right = document.createElement("aside"); document.body.append(left, right);
    const panel = current.host.ensure("audit.panel.content", "left"); left.append(panel);
    assert.equal(panel.querySelector("[data-audit-panel-value]").textContent, "R:0");
    current.host.setVisible("audit.panel.content", false); right.append(panel);
    assert.equal(current.host.ensure("audit.panel.content", "right"), panel);
    current.host.setVisible("audit.panel.content", true); model.update(cycle);
    assert.equal(panel.querySelector("[data-audit-panel-value]").textContent, `R:${cycle}`);
    assert.equal(model.count(), 1);
    const payload = { cycle };
    assert.deepEqual(current.router.execute("audit.command.run", payload), { ok: true, payload, calls: 1 });
    assert.deepEqual(current.menus.resolve().map(menu => menu.groups.flat().map(item => item.command)), [["audit.command.run"]]);
    assert.equal(current.router.shortcuts.resolve("Mod+Alt+I").command, "audit.command.run");
    current.host.ensure("audit.readonly.view", "stage");
    current.platform.dispose(); current.platform.dispose(); current.host.dispose(); current.host.dispose();
    history.push({ cycle, subscriptions: model.count(), cells: current.host.mounted().length,
      definitions: current.components.list().length, keys: current.router.shortcuts.list().length,
      menus: current.menus.resolve().length, calls });
    assert.deepEqual(history.at(-1), { cycle, subscriptions: 0, cells: 0, definitions: 0, keys: 0, menus: 0, calls: 1 });
    assert.equal(panel.isConnected, false);
    assert.equal(current.router.execute("audit.command.run", payload).code, "command.missing");
    left.remove(); right.remove();
  }
  assert.equal(history.length, 100);
  t.diagnostic(JSON.stringify({ trial: "ABC", cycles: history }));
}));

test("B keeps dynamic disablement and Promise payload/result semantics with no placeholder UI", async () => {
  const current = setup(); let enabled = false, calls = 0;
  current.platform.register(createCommandPlugin({ enabled: () => enabled, async run(payload) { calls++; return { ok: true, payload }; } }));
  current.platform.start();
  assert.deepEqual(current.components.list(), []);
  assert.equal(current.router.execute("audit.command.run").code, "command.disabled"); assert.equal(calls, 0);
  enabled = true;
  const payload = { example: 1 }, result = await current.router.execute("audit.command.run", payload);
  assert.equal(result.payload, payload); assert.equal(calls, 1);
  current.platform.dispose(); current.host.dispose();
});

test("C rejects 100 stale reverse-order reads, supports failure/retry and ignores results after disposal", t => withTestDocument(async () => {
  const current = setup(), pending = [];
  const history = [];
  current.platform.register(createReadonlyViewPlugin({ read({ signal }) {
    const operation = deferred(); pending.push({ ...operation, signal }); return operation.promise;
  } })); current.platform.start();
  const cell = current.host.ensure("audit.readonly.view", "stage"); document.body.append(cell);
  const value = cell.querySelector("[data-audit-view-value]"), retry = cell.querySelector("button");
  await tick(); pending[0].resolve("initial"); await tick();
  for (let cycle = 0; cycle < 100; cycle++) {
    retry.click(); await tick(); const stale = pending.at(-1);
    retry.click(); await tick(); const accepted = pending.at(-1);
    assert.equal(stale.signal.aborted, true);
    accepted.resolve(`accepted:${cycle}`); await tick();
    stale.resolve(`stale:${cycle}`); await tick();
    assert.equal(value.textContent, `accepted:${cycle}`);
    history.push({ cycle, abortedOldRequest: stale.signal.aborted, rendered: value.textContent });
  }
  retry.click(); await tick(); pending.at(-1).reject(new Error("read failure")); await tick();
  assert.equal(value.textContent, "不可用");
  retry.click(); await tick(); pending.at(-1).resolve("recovered"); await tick(); assert.equal(value.textContent, "recovered");
  retry.click(); await tick(); const late = pending.at(-1);
  current.platform.dispose(); current.host.dispose(); assert.equal(late.signal.aborted, true);
  const before = value.textContent; late.resolve("late"); await tick();
  assert.equal(value.textContent, before); assert.equal(cell.isConnected, false);
  t.diagnostic(JSON.stringify({ trial: "reverse-order", cycles: history, lateIgnored: true }));
}));

test("actual workspace assembly mounts a public readonly view and returns root/listener ownership after 100 sessions", t => withTestDocument(async () => {
  const root = document.createElement("main"); document.body.append(root);
  const active = new Map();
  const history = [];
  const originals = [window.addEventListener, window.removeEventListener];
  window.addEventListener = function(type, listener, options) {
    if (!active.has(type)) active.set(type, new Set()); active.get(type).add(listener);
    return originals[0].call(this, type, listener, options);
  };
  window.removeEventListener = function(type, listener, options) {
    active.get(type)?.delete(listener); return originals[1].call(this, type, listener, options);
  };
  try {
    for (let cycle = 0; cycle < 100; cycle++) {
      const runtime = createWorkspaceRuntime({ root, requiredViewSlots: ["stage"], plugins: [createReadonlyViewPlugin({ read: () => cycle })],
        pluginWiring: { create: createBackupFormalPlatform, prepare: prepareBackupPlugin,
          configure: (platform, plugins) => configureBackupFormalPlatform(platform, { plugins }) } });
      await tick(); assert.equal(root.querySelector("[data-audit-view-value]").textContent, String(cycle));
      runtime.dispose(); runtime.dispose(); await tick();
      assert.equal(root.children.length, 0);
      assert.equal([...active.values()].reduce((count, listeners) => count + listeners.size, 0), 0);
      history.push({ cycle, rootChildren: root.children.length, windowListeners: 0 });
      assert.equal(runtime.execute("frame.workspace.region.toggle", { region: "left" }).code, "runtime.disposed");
    }
    t.diagnostic(JSON.stringify({ trial: "workspace", cycles: history }));
  } finally { [window.addEventListener, window.removeEventListener] = originals; root.remove(); }
}));
