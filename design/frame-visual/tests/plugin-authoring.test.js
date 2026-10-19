import assert from "node:assert/strict";
import test from "node:test";
import { defineUiPlugin } from "../src/runtime/ui-plugin-contract.js";
import { createUiContributionCatalog } from "../src/runtime/ui-contribution-catalog.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createPluginPlatform } from "../src/runtime/plugin-installer.js";
import { captureUiFacet } from "../src/runtime/plugin-facets.js";

function runtime() {
  const current = { router: createCommandRouter(), components: createComponentRegistry(),
    menus: createMenuRegistry([{ id: "view", label: "视图" }]) };
  current.platform = createPluginPlatform(current);
  current.catalog = createUiContributionCatalog({ platform: current.platform, components: current.components });
  return current;
}
function declaration(namespace = "sample") {
  return { namespace, commands: [{ id: `${namespace}.inspect`, run: () => ({ ok: true }) }], ui: [
    { id: `${namespace}.tools`, kind: "module", title: "工具", slots: ["left", "right"], order: 1,
      allowedSpans: ["full", "half"], defaultSpan: "half", minHeight: 80, defaultEnabled: true, mount() {} },
    { id: `${namespace}.page`, kind: "page", title: "页面", icon: "chat", slots: ["right"], order: 2,
      footerHeight: 64, permissions: { commands: [`${namespace}.inspect`] }, mount() {} },
    { id: `${namespace}.status`, kind: "slotItem", title: "状态", slots: ["top", "bottom"], order: 3,
      minWidth: 40, priority: 10, mount() {} },
    { id: `${namespace}.score`, kind: "view", title: "主体视图", slots: ["stage"], order: 4, mount() {} },
  ] };
}
function dataOnly(value) {
  assert.notEqual(typeof value, "function");
  if (value && typeof value === "object") {
    assert.ok(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype);
    for (const child of Object.values(value)) dataOnly(child);
  }
}

test("new panels have one style-neutral declaration for either sidebar", () => {
  const current = runtime();
  const panel = { id: "sample.notes", kind: "panel", title: "笔记", slots: ["left", "right"], defaultSlot: "right", mount() {} };
  const manifest = defineUiPlugin({ namespace: "sample", ui: [panel] });
  assert.equal(manifest.components[0].uiKind, "panel");
  assert.equal(manifest.components[0].role, "tool");
  assert.equal(manifest.components[0].defaultEnabled, false);
  assert.equal(manifest.facets.ui.modules[0].id, "sample.notes");
  assert.deepEqual(manifest.facets.ui.pages, []);
  current.platform.register(manifest); current.platform.start();
  const descriptor = current.catalog.get(panel.id);
  assert.deepEqual(descriptor.slots, ["left", "right"]);
  assert.equal(descriptor.defaultSlot, "right");
  assert.equal(descriptor.kind, "panel");
  for (const patch of [{ slots: ["top"] }, { slots: ["stage"] }, { footerHeight: 64 }, { minHeight: 80 },
    { allowedSpans: ["full"] }, { defaultSpan: "full" }, { style: "tabs" }, { defaultSlot: "bottom" }, { defaultEnabled: 1 }]) {
    assert.throws(() => defineUiPlugin({ namespace: "sample", ui: [{ ...panel, ...patch }] }));
  }
  current.platform.dispose();
});

test("legacy chrome and mixed-region content keep all declared positions in the catalog", () => {
  const current = runtime();
  current.platform.register({ namespace: "legacy", components: [
    { id: "legacy.chrome", title: "顶部内容", role: "tool", slots: ["top", "bottom"], defaultSlot: "top", mount() {} },
    { id: "legacy.mixed", title: "跨区域内容", role: "tool", slots: ["top", "left", "right"], defaultSlot: "top", mount() {} },
    { id: "legacy.status", title: "底部状态", role: "status", slots: ["bottom"], mount() {} },
  ] });
  current.platform.start();
  assert.equal(current.catalog.get("legacy.chrome").kind, "panel");
  assert.deepEqual(current.catalog.get("legacy.chrome").slots, ["top", "bottom"]);
  assert.equal(current.catalog.get("legacy.mixed").defaultSlot, "top");
  assert.equal(current.catalog.get("legacy.status").kind, "slotItem");
  assert.deepEqual(current.catalog.list({ slot: "top" }).map(item => item.id), ["legacy.chrome", "legacy.mixed"]);
  current.platform.dispose();
});

test("legacy author declarations retain v1 wire shape and normalize sidebar content", () => {
  const current = runtime(), raw = declaration(), manifest = defineUiPlugin(raw);
  assert.deepEqual(manifest.components.map(unit => [unit.uiKind, unit.role]),
    [["module", "tool"], ["page", "inspector"], ["slotItem", "status"], ["view", "view"]]);
  assert.deepEqual(manifest.facets.ui.pages.map(unit => unit.id), ["sample.page", "sample.score"]);
  assert.deepEqual(manifest.facets.ui.modules.map(unit => unit.id), ["sample.tools", "sample.status"]);
  current.platform.register(manifest);
  assert.deepEqual(current.catalog.list(), []);
  assert.equal(current.platform.start()[0].status, "active");
  assert.deepEqual(current.catalog.list().map(unit => unit.kind), ["panel", "panel", "slotItem", "view"]);
  assert.equal(manifest.components[0].defaultSpan, "half");
  assert.equal(manifest.components[1].footerHeight, 64);
  assert.equal(current.catalog.get("sample.tools").defaultEnabled, true);
  assert.equal(current.catalog.get("sample.page").defaultEnabled, true);
  assert.equal(current.catalog.get("sample.status").priority, 10);
  assert.equal(current.components.get("sample.page").mount, raw.ui[1].mount);
  current.platform.dispose();
});

test("author configuration and catalog descriptors are independent immutable captures", () => {
  const raw = declaration(), manifest = defineUiPlugin(raw), current = runtime();
  raw.ui[0].title = "changed";
  raw.ui[0].allowedSpans.splice(0, 1);
  raw.ui[1].permissions.commands.push("foreign.command");
  assert.equal(Object.isFrozen(raw.ui[0]), false);
  assert.equal(manifest.components[0].title, "工具");
  assert.deepEqual(manifest.components[0].allowedSpans, ["full", "half"]);
  assert.deepEqual(manifest.components[1].permissions.commands, ["sample.inspect"]);
  current.platform.register(manifest); current.platform.start();
  const entries = current.catalog.list();
  assert.throws(() => entries.push({}), TypeError);
  assert.throws(() => entries[0].slots.push("bottom"), TypeError);
  for (const key of ["allowedSpans", "defaultSpan", "minHeight", "footerHeight"]) assert.equal(key in entries[0], false);
  assert.equal(current.catalog.get("missing"), null);
  current.platform.dispose();
});

test("facets and public catalog contain data without mount functions, services or permissions", () => {
  const current = runtime(), manifest = defineUiPlugin(declaration());
  dataOnly(captureUiFacet(manifest));
  current.platform.register(manifest); current.platform.start();
  dataOnly(current.catalog.list());
  for (const entry of current.catalog.list()) for (const key of ["mount", "run", "permissions", "router", "layout", "dispose", "allowedSpans", "defaultSpan", "minHeight", "footerHeight"])
    assert.equal(key in entry, false);
  assert.doesNotThrow(() => JSON.stringify(current.catalog.list()));
  current.platform.dispose();
});

test("malformed or conflicting author fields fail without producing an installable manifest", () => {
  for (const raw of [null, { namespace: "bad namespace", ui: [] }, { namespace: "sample", ui: null },
    { ...declaration(), components: [] }, { ...declaration(), facets: {} },
    { ...declaration(), ui: [null] }, { ...declaration(), commands: [null] },
    { ...declaration(), menuItems: [{ menu: "view" }] }]) assert.throws(() => defineUiPlugin(raw));
  const invalid = [{ kind: "unknown" }, { id: "other.tools" }, { role: "inspector" },
    { order: NaN }, { minHeight: -1 }, { defaultEnabled: "yes" }, { allowedSpans: ["full", "full"] },
    { allowedSpans: ["half"], defaultSpan: "full" }, { footerHeight: 64 },
    { permissions: { commands: ["sample.inspect", "sample.inspect"] } }, { mount: null }];
  for (const change of invalid) { const raw = declaration(); Object.assign(raw.ui[0], change); assert.throws(() => defineUiPlugin(raw)); }
  const raw = declaration(); raw.ui[3].slots = ["right"];
  assert.throws(() => defineUiPlugin(raw), /view 只能/);
  const duplicate = declaration(); duplicate.ui.push(duplicate.ui[0]);
  assert.throws(() => defineUiPlugin(duplicate), /重复 id/);
  const badPage = declaration(); badPage.ui[1].footerHeight = Infinity;
  assert.throws(() => defineUiPlugin(badPage), /footerHeight/);
});

test("legacy stage views and sidebar content retain distinct catalog meanings", () => {
  const current = runtime();
  current.platform.register({ namespace: "legacy", components: [
    { id: "legacy.stage", title: "旧视图", role: "view", slots: ["stage"], mount() {} },
    { id: "legacy.right", title: "旧工具", role: "inspector", slots: ["right"], mount() {} },
  ] });
  current.platform.start();
  assert.equal(current.platform.facets("ui")[0].value.pages[0].kind, "page");
  assert.equal(current.catalog.get("legacy.stage").kind, "view");
  assert.equal(current.catalog.get("legacy.right").kind, "panel");
  current.platform.dispose();
});

test("catalog preserves explicit v1 aliases and narrowed surface slots", () => {
  const current = runtime();
  current.platform.register({ namespace: "legacy", components: [
    { id: "legacy.implementation", title: "旧页面", role: "inspector", slots: ["left", "right"], defaultSlot: "left", footerHeight: 24, mount() {} },
  ], facets: { ui: { contractVersion: 1, modules: [], pages: [
    { id: "legacy.public", componentId: "legacy.implementation", slots: ["right"] },
  ], slots: ["right"] } } });
  current.platform.start();
  const entry = current.catalog.get("legacy.public");
  assert.equal(entry.componentId, "legacy.implementation");
  assert.equal(entry.kind, "panel");
  assert.equal(entry.defaultSlot, "right");
  assert.equal("footerHeight" in entry, false);
  assert.equal(current.catalog.list({ slot: "left" }).length, 0);
  current.platform.dispose();
});

test("catalog filters by kind and slot and orders equal-order units by stable id", () => {
  const current = runtime();
  for (const namespace of ["zeta", "alpha"]) current.platform.register(defineUiPlugin(declaration(namespace)));
  current.platform.start();
  assert.deepEqual(current.catalog.list({ kind: "panel", slot: "right" }).map(unit => unit.id), ["alpha.tools", "zeta.tools", "alpha.page", "zeta.page"]);
  assert.deepEqual(current.catalog.list({ kind: "panel", slot: "left" }).map(unit => unit.id), ["alpha.tools", "zeta.tools"]);
  assert.equal(current.catalog.list({ slot: "stage" }).every(unit => unit.kind === "view"), true);
  assert.throws(() => current.catalog.list({ kind: "unknown" }), /kind/);
  assert.throws(() => current.catalog.list({ kind: "module" }), /kind/);
  assert.throws(() => current.catalog.list({ kind: "page" }), /kind/);
  assert.throws(() => current.catalog.list({ slot: "unknown" }), /slot/);
  assert.throws(() => current.catalog.list(null), /对象/);
  current.platform.dispose();
  assert.deepEqual(current.catalog.list(), []);
});

test("failed owners are absent from the catalog while independent contributors remain active", () => {
  const current = runtime();
  const contribute = current.menus.contribute;
  current.menus.contribute = (owner, item) => { if (owner === "broken") throw new Error("menu install failed"); return contribute(owner, item); };
  const broken = declaration("broken"); broken.menuItems = [{ menu: "view", command: "broken.inspect" }];
  current.platform.register(defineUiPlugin(broken));
  current.platform.register(defineUiPlugin(declaration("healthy")));
  assert.deepEqual(current.platform.start().map(entry => entry.status), ["failed", "active"]);
  assert.equal(current.catalog.list().length, 4);
  assert.equal(current.catalog.list().every(entry => entry.pluginId === "healthy"), true);
  assert.equal(current.router.describe("broken.inspect"), null);
  current.platform.dispose();
});

test("catalog does not attribute a replacement registry owner to a stale platform record", () => {
  const current = runtime(); current.platform.register(defineUiPlugin(declaration())); current.platform.start();
  const owned = current.components.get("sample.tools");
  const catalog = createUiContributionCatalog({ platform: current.platform, components: {
    get: id => id === owned.id ? { ...owned, owner: "other" } : current.components.get(id),
  } });
  assert.equal(catalog.get(owned.id), null);
  assert.equal(catalog.list().length, 3);
  current.platform.dispose();
});

function withDocument(run) {
  const before = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: () => ({ dataset: {}, setAttribute() {}, replaceChildren(...children) { this.children = children; }, remove() { this.removed = true; } }),
  } });
  try { run(); } finally { if (before) Object.defineProperty(globalThis, "document", before); else delete globalThis.document; }
}

test("new declarations use the existing authorized router and persistent resource lifecycle", () => withDocument(() => {
  const current = runtime(), notices = [], subscriptions = new Set();
  let calls = 0, mounts = 0, context, privateValue = "kept input";
  const raw = declaration();
  raw.commands[0].run = payload => { calls++; return { ok: true, payload }; };
  raw.ui[1].mount = (element, ctx) => {
    mounts++; context = ctx; element.input = privateValue;
    const listener = () => {}; subscriptions.add(listener);
    ctx.onDispose(() => subscriptions.delete(listener));
    return { setVariant() { privateValue = element.input; } };
  };
  current.platform.register(defineUiPlugin(raw)); current.platform.start();
  const host = createComponentHost({ registry: current.components, router: current.router, notices: { push: item => notices.push(item) } });
  const page = current.catalog.list({ kind: "panel", slot: "right" }).find(item => item.id === "sample.page");
  const first = host.ensure(page.componentId, "page");
  assert.equal(host.ensure(page.componentId, "compact"), first);
  assert.equal(first.input, "kept input");
  assert.equal(mounts, 1);
  assert.deepEqual(Object.keys(context).sort(), ["execute", "notify", "onDispose"]);
  assert.equal(context.execute("sample.inspect", { source: "page" }).ok, true);
  assert.equal(calls, 1);
  assert.equal(context.execute("host.ungranted").code, "permission.denied");
  assert.equal(calls, 1);
  current.platform.dispose();
  assert.equal(subscriptions.size, 0);
  assert.equal(context.execute("sample.inspect").code, "component.disposed");
  assert.deepEqual(current.catalog.list(), []);
  host.dispose();
}));
