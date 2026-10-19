import assert from "node:assert/strict";
import test from "node:test";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createPluginPlatform, installPlugin } from "../src/runtime/plugin-installer.js";
import { createUiPluginHost } from "../src/runtime/ui-plugin-host.js";

function runtime(options = {}) {
  return { router: createCommandRouter(), components: createComponentRegistry(),
    menus: createMenuRegistry([{ id: "view", label: "视图" }]), ...options };
}

function plugin(namespace = "sample") {
  return { namespace,
    components: [{ id: `${namespace}.page`, title: "测试页", role: "inspector", slots: ["right"],
      permissions: { commands: [`${namespace}.inspect`] }, metadata: { tags: ["original"] }, mount() {} }],
    commands: [{ id: `${namespace}.inspect`, label: "检查", keys: ["Mod+J"], run: () => ({ ok: true, source: "original" }) }],
    menuItems: [{ menu: "view", command: `${namespace}.inspect`, payload: { value: [1] } }],
  };
}

function assertEmpty(current, namespace = "sample") {
  assert.equal(current.components.list().filter(item => item.owner === namespace).length, 0);
  assert.equal(current.router.describe(`${namespace}.inspect`), null);
  assert.equal(current.router.describe(`${namespace}.second`), null);
  assert.equal(current.router.commandFor("Mod+J"), null);
  assert.equal(current.router.commandFor("Mod+L"), null);
  assert.equal(current.menus.resolve().flatMap(menu => menu.groups.flat()).filter(item => item.owner === namespace).length, 0);
}

test("registration captures nested configuration without freezing or retaining author objects", () => {
  const current = runtime();
  const platform = createPluginPlatform(current);
  const raw = plugin();
  const entry = platform.register(raw);
  raw.namespace = "changed";
  raw.components[0].title = "Changed";
  raw.components[0].slots.push("left");
  raw.components[0].metadata.tags[0] = "changed";
  raw.components[0].permissions.commands.push("host.ungranted");
  raw.commands[0].keys[0] = "Mod+H";
  raw.commands[0].run = () => ({ ok: true, source: "changed" });
  raw.menuItems[0].payload.value[0] = 99;
  assert.equal(Object.isFrozen(raw.components[0]), false);
  assert.throws(() => entry.manifest.components[0].slots.push("left"), TypeError);
  assert.throws(() => { entry.manifest.commands[0].run = () => {}; }, TypeError);
  assert.equal(platform.start()[0].namespace, "sample");
  assert.deepEqual(current.router.execute("sample.inspect"), { ok: true, source: "original" });
  assert.equal(current.router.commandFor("Mod+J"), "sample.inspect");
  assert.equal(current.router.commandFor("Mod+H"), null);
  const definition = current.components.get("sample.page");
  assert.equal(definition.title, "测试页");
  assert.deepEqual(definition.slots, ["right"]);
  assert.deepEqual(definition.metadata.tags, ["original"]);
  assert.deepEqual(definition.permissions.commands, ["sample.inspect"]);
  assert.deepEqual(current.menus.resolve()[0].groups[0][0].payload.value, [1]);
  assert.equal("dispose" in platform.list()[0], false);
  platform.dispose();
  assertEmpty(current);
});

test("malformed declarations and cyclic configuration fail before registering contributions", () => {
  const invalid = [null, { namespace: 12 }, { namespace: "sample", commands: {} },
    { ...plugin(), commands: [null] }, { ...plugin(), components: [null] },
    { ...plugin(), components: [{ ...plugin().components[0], slots: null }] },
    { ...plugin(), components: [{ ...plugin().components[0], permissions: { commands: "sample.inspect" } }] },
    { ...plugin(), commands: [{ ...plugin().commands[0], enabled: true }] },
    { ...plugin(), commands: [{ ...plugin().commands[0], keys: ["Mod++J"] }] },
    { ...plugin(), menuItems: [null] }, { ...plugin(), facets: { ui: null } },
    { ...plugin(), facets: { ui: { contractVersion: 1, modules: [], pages: [null], slots: ["right"] } } }];
  const cyclic = plugin(); cyclic.metadata = { self: cyclic }; invalid.push(cyclic);
  for (const raw of invalid) {
    const current = runtime(); const platform = createPluginPlatform(current);
    assert.throws(() => platform.register(raw), /注册失败|UI facet|循环引用/);
    assert.equal(platform.list().length, 0);
    assertEmpty(current);
  }
});

test("duplicate ids, foreign component ids and ambiguous facet references are rejected", () => {
  const duplicateCommands = plugin(); duplicateCommands.commands.push({ ...duplicateCommands.commands[0] });
  const duplicateComponents = plugin(); duplicateComponents.components.push({ ...duplicateComponents.components[0] });
  const foreign = plugin(); foreign.components[0].id = "other.page";
  const ambiguous = plugin(); ambiguous.facets = { ui: { contractVersion: 1, slots: ["right"], modules: [], pages: [
    { id: "sample.first", componentId: "sample.page", slots: ["right"] },
    { id: "sample.second", componentId: "sample.page", slots: ["right"] },
  ] } };
  for (const manifest of [duplicateCommands, duplicateComponents, foreign, ambiguous]) {
    const current = runtime(); const platform = createPluginPlatform(current);
    assert.throws(() => platform.register(manifest), /重复|命名空间|重复绑定/);
    assertEmpty(current);
  }
});

test("normalized shortcuts are reserved across pending packages and within one package", () => {
  const current = runtime(); const platform = createPluginPlatform(current);
  platform.register(plugin("first"));
  const second = plugin("second"); second.commands[0].keys = ["j + Mod"];
  assert.throws(() => platform.register(second), /快捷键.*first.inspect/);
  const duplicate = plugin("duplicate"); duplicate.commands.push({ id: "duplicate.second", keys: ["j+Mod"], run() {} });
  const independent = createPluginPlatform(runtime());
  assert.throws(() => independent.register(duplicate), /快捷键.*占用/);
  const repeated = plugin("repeated"); repeated.commands[0].keys = ["Mod+J", "j + Mod"];
  assert.throws(() => independent.register(repeated), /快捷键.*重复/);
  assert.equal(current.router.commandFor("Mod+J"), null);
});

test("overlapping namespaces cannot reserve the same component before startup", () => {
  const current = runtime(); const platform = createPluginPlatform(current);
  const first = plugin("root"); first.components[0].id = "root.shared.page";
  platform.register(first);
  const second = plugin("root.shared"); second.commands[0].keys = [];
  assert.throws(() => platform.register(second), /组件已被登记/);
  assert.equal(platform.list().length, 1);
});

test("a later shortcut conflict publishes no earlier shortcut and leaves its owner intact", () => {
  const router = createCommandRouter();
  router.register("host", { id: "host.existing", keys: ["Mod+K"], run() {} });
  assert.throws(() => router.register("sample", { id: "sample.inspect", keys: ["Mod+J", "Mod+K"], run() {} }), /already bound/);
  assert.equal(router.describe("sample.inspect"), null);
  assert.equal(router.commandFor("Mod+J"), null);
  assert.equal(router.commandFor("Mod+K"), "host.existing");
});

test("stale command, component and menu disposers cannot remove later owners", () => {
  const current = runtime();
  const firstCommand = current.router.register("first", { id: "shared.command", keys: ["Mod+J"], run() {} });
  firstCommand();
  current.router.register("second", { id: "shared.command", keys: ["Mod+J"], run() {} });
  firstCommand();
  assert.equal(current.router.describe("shared.command").owner, "second");
  const firstComponent = current.components.register("first", plugin().components[0]);
  firstComponent(); current.components.register("second", plugin().components[0]); firstComponent();
  assert.equal(current.components.get("sample.page").owner, "second");
  const firstMenu = current.menus.contribute("first", { menu: "view", command: "shared.command" });
  current.menus.contribute("second", { menu: "view", command: "shared.command" });
  firstMenu(); firstMenu();
  assert.deepEqual(current.menus.resolve()[0].groups[0].map(item => item.owner), ["second"]);
});

test("standalone registries capture configuration and isolate broken view observers", () => {
  const reported = [];
  const current = runtime({
    router: createCommandRouter({ onObserverError: error => reported.push(error) }),
    components: createComponentRegistry({ onObserverError: error => reported.push(error) }),
    menus: createMenuRegistry([{ id: "view" }], { onObserverError: error => reported.push(error) }),
  });
  let observerCalls = 0;
  for (const registry of [current.router, current.components, current.menus]) {
    registry.subscribe(() => { throw new Error("broken observer"); });
    registry.subscribe(() => observerCalls++);
  }
  const raw = plugin();
  const command = current.router.register("sample", raw.commands[0]);
  const component = current.components.register("sample", raw.components[0]);
  const menu = current.menus.contribute("sample", raw.menuItems[0]);
  raw.commands[0].keys.push("Mod+K"); raw.components[0].slots.push("left"); raw.menuItems[0].payload.value[0] = 2;
  assert.throws(() => current.router.describe("sample.inspect").keys.push("Mod+L"), TypeError);
  assert.deepEqual(current.components.get("sample.page").slots, ["right"]);
  assert.deepEqual(current.menus.resolve()[0].groups[0][0].payload.value, [1]);
  command(); component(); menu();
  assert.equal(reported.length, 6);
  assert.equal(observerCalls, 6);
  assertEmpty(current);
});

test("live conflicts appearing after registration fail before plugin installation", () => {
  const current = runtime(); const platform = createPluginPlatform(current);
  platform.register(plugin());
  current.router.register("foreign", { id: "sample.inspect", run: () => ({ ok: true, owner: "foreign" }) });
  assert.equal(platform.start()[0].status, "failed");
  assert.equal(current.components.list().length, 0);
  assert.deepEqual(current.router.execute("sample.inspect"), { ok: true, owner: "foreign" });
  platform.dispose();
  assert.equal(current.router.describe("sample.inspect").owner, "foreign");
});

for (const stage of ["component", "command", "menu"]) {
  test(`failure on the second ${stage} rolls back every earlier contribution`, () => {
    const current = runtime();
    const manifest = plugin();
    manifest.components.push({ ...manifest.components[0], id: "sample.second" });
    manifest.commands.push({ id: "sample.second", keys: ["Mod+L"], run() {} });
    manifest.menuItems.push({ menu: "view", command: "sample.second" });
    const [registry, method] = stage === "component" ? [current.components, "register"] : stage === "command" ? [current.router, "register"] : [current.menus, "contribute"];
    const actual = registry[method]; let calls = 0;
    registry[method] = (...args) => { if (++calls === 2) throw new Error(`injected ${stage} failure`); return actual(...args); };
    const platform = createPluginPlatform(current); platform.register(manifest);
    const result = platform.start()[0];
    assert.equal(result.status, "failed");
    assert.match(result.error.message, /injected/);
    assertEmpty(current);
    assert.deepEqual(platform.facets(), []);
    platform.dispose(); platform.dispose();
    assertEmpty(current);
  });
}

test("rollback continues through cleanup errors and preserves the installation error", () => {
  const current = runtime(); const manifest = plugin();
  manifest.components.push({ ...manifest.components[0], id: "sample.second" });
  const attempts = [];
  const register = current.components.register;
  current.components.register = (...args) => {
    const dispose = register(...args);
    return () => { dispose(); attempts.push(args[1].id); throw new Error("injected cleanup failure"); };
  };
  current.menus.contribute = () => { throw new Error("injected install failure"); };
  const platform = createPluginPlatform(current); platform.register(manifest);
  const record = platform.start()[0];
  assert.equal(record.status, "failed");
  assert.match(record.error.message, /injected install failure/);
  assert.equal(record.error.cause.message, "injected install failure");
  assert.deepEqual(attempts, ["sample.second", "sample.page"]);
  assertEmpty(current);
});

test("failed command providers block dependent plugins while independent plugins still start", () => {
  const current = runtime({ onFailure() { throw new Error("reporter failed"); } });
  const register = current.router.register;
  current.router.register = (owner, command) => { if (owner === "provider") throw new Error("provider failed"); return register(owner, command); };
  const provider = plugin("provider"); provider.commands[0].keys = [];
  const consumer = plugin("consumer"); consumer.commands[0].keys = []; consumer.components[0].permissions.commands.push("provider.inspect");
  const healthy = plugin("healthy"); healthy.commands[0].keys = [];
  const platform = createPluginPlatform(current);
  platform.register(provider); platform.register(consumer); platform.register(healthy);
  const results = platform.start();
  assert.deepEqual(results.map(item => item.status), ["failed", "failed", "active"]);
  assert.match(results[1].error.message, /provider.inspect/);
  assert.equal(results[0].reportingError.message, "reporter failed");
  assert.equal(current.components.get("provider.page"), null);
  assert.equal(current.components.get("consumer.page"), null);
  assert.equal(current.router.execute("healthy.inspect").ok, true);
  platform.dispose();
});

test("platform disposal clears all packages despite one cleanup error and permits a fresh session", () => {
  const current = runtime();
  const register = current.components.register;
  const cleaned = [];
  current.components.register = (owner, definition) => {
    const dispose = register(owner, definition);
    return () => { dispose(); cleaned.push(owner); if (owner === "second") throw new Error("second cleanup failed"); };
  };
  const platform = createPluginPlatform(current);
  const first = plugin("first"); first.commands[0].keys = [];
  const second = plugin("second"); second.commands[0].keys = [];
  platform.register(first); platform.register(second); platform.start();
  assert.throws(() => platform.dispose(), AggregateError);
  assert.deepEqual(cleaned, ["second", "first"]);
  assert.equal(current.components.list().length, 0);
  assert.equal(current.menus.resolve().length, 0);
  assert.equal(current.router.describe("first.inspect"), null);
  assert.equal(current.router.describe("second.inspect"), null);
  assert.deepEqual(platform.list(), []);
  assert.equal(platform.phase(), "configuring");
  platform.dispose();
  platform.register(first);
  assert.equal(platform.start()[0].status, "active");
  platform.dispose();
});

test("legacy one-call installation throws on runtime failure instead of returning false success", () => {
  const current = runtime();
  current.menus.contribute = () => { throw new Error("late install failure"); };
  assert.throws(() => installPlugin(current, plugin()), /late install failure/);
  assertEmpty(current);
});

function withDocument(run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement() { return { dataset: {}, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; },
      replaceChildren(...children) { this.children = children; }, remove() { this.removed = true; } }; },
  } });
  try { run(); } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else delete globalThis.document;
  }
}

test("persistent instances keep state and dispose private resources once, in reverse order", () => withDocument(() => {
  const current = runtime(); const events = [], notices = [];
  let mounts = 0, ctx, writes = 0;
  current.router.register("sample", { id: "sample.inspect", run() { writes++; } });
  const definition = plugin().components[0];
  definition.mount = (element, context) => {
    mounts++; ctx = context; element.input = { value: "private input" };
    context.onDispose(() => events.push("first")); context.onDispose(() => events.push("second"));
    return { setVariant: () => events.push("variant"), dispose: () => events.push("instance") };
  };
  current.components.register("sample", definition);
  const host = createComponentHost({ registry: current.components, router: current.router, notices: { push: notice => notices.push(notice) } });
  const first = host.ensure("sample.page", "page");
  assert.equal(host.ensure("sample.page", "compact"), first);
  assert.equal(first.input.value, "private input");
  assert.equal(mounts, 1);
  assert.equal(ctx.execute("sample.inspect").ok, true);
  assert.equal(ctx.execute("host.ungranted").code, "permission.denied");
  host.release("sample.page"); host.release("sample.page");
  assert.deepEqual(events, ["variant", "instance", "second", "first"]);
  assert.equal(first.removed, true);
  assert.equal(ctx.execute("sample.inspect").code, "component.disposed");
  assert.equal(writes, 1);
  const count = notices.length; ctx.notify("late notification"); assert.equal(notices.length, count);
  ctx.onDispose(() => events.push("late cleanup"));
  assert.equal(events.at(-1), "late cleanup");
  host.dispose(); host.dispose();
}));

test("mount failure drains registered listeners and subscriptions before showing its own fault", () => withDocument(() => {
  const current = runtime(); const resources = new Set(), notices = [];
  let cleanups = 0;
  const definition = plugin().components[0];
  definition.mount = (element, ctx) => {
    for (const id of ["listener", "subscription"]) { resources.add(id); ctx.onDispose(() => { resources.delete(id); cleanups++; }); }
    throw new Error("mount failed");
  };
  current.components.register("sample", definition);
  const host = createComponentHost({ registry: current.components, router: current.router, notices: { push: notice => notices.push(notice) } });
  const element = host.ensure("sample.page", "page");
  assert.equal(resources.size, 0);
  assert.equal(cleanups, 2);
  assert.match(element.children[0].textContent, /加载失败/);
  assert.match(notices.at(-1).text, /mount failed/);
  host.release("sample.page"); host.dispose();
  assert.equal(cleanups, 2);
}));

test("a throwing or reentrant component cleanup cannot skip remaining resource releases", () => withDocument(() => {
  const current = runtime(); const events = [], notices = [];
  let host;
  const definition = plugin().components[0];
  definition.mount = (element, ctx) => {
    ctx.onDispose(() => events.push("first"));
    ctx.onDispose(() => { events.push("reentrant"); host.release("sample.page"); throw new Error("cleanup failed"); });
    return { dispose() { events.push("instance"); throw new Error("instance failed"); } };
  };
  current.components.register("sample", definition);
  host = createComponentHost({ registry: current.components, router: current.router, notices: { push: notice => notices.push(notice) } });
  const element = host.ensure("sample.page", "page");
  host.release("sample.page");
  assert.deepEqual(events, ["instance", "reentrant", "first"]);
  assert.equal(element.removed, true);
  assert.equal(host.has("sample.page"), false);
  assert.match(notices.at(-1).text, /清理失败/);
  host.dispose();
}));

test("platform disposal releases mounted components through registry ownership even without a shell", () => withDocument(() => {
  const current = runtime(); const notices = []; let cleanups = 0;
  const host = createComponentHost({ registry: current.components, router: current.router, notices: { push: notice => notices.push(notice) } });
  const manifest = plugin();
  manifest.components[0].mount = (element, ctx) => { ctx.onDispose(() => cleanups++); return { dispose() { cleanups++; } }; };
  const platform = createPluginPlatform(current); platform.register(manifest); platform.start();
  const element = host.ensure("sample.page", "page");
  platform.dispose();
  assert.equal(cleanups, 2);
  assert.equal(element.removed, true);
  assert.deepEqual(host.mounted(), []);
  host.dispose(); host.dispose();
  assert.throws(() => host.ensure("sample.page", "page"), /已释放/);
  assert.equal(notices.length, 0);
}));
