import assert from "node:assert/strict";
import test from "node:test";
import { createSidebarCompositionState } from "../src/layout/sidebar-composition-state.js";
import { defineUiPlugin } from "../src/runtime/ui-plugin-contract.js";
import { createUiContributionCatalog } from "../src/runtime/ui-contribution-catalog.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createPluginPlatform } from "../src/runtime/plugin-installer.js";

const panel = (id, overrides = {}) => ({ id: `sample.${id}`, componentId: `sample.${id}`, kind: "panel",
  slots: ["left", "right"], defaultSlot: "left", defaultEnabled: true, order: 0, ...overrides });
const items = state => state.read.snapshot().panels;
const ids = (state, slot) => items(state).filter(item => item.slot === slot).map(item => item.id);

test("startup projects capabilities without owning declarations, styles or geometry", () => {
  const contributions = [panel("zeta"), panel("alpha"), panel("right", { defaultSlot: "right", order: -10 }),
    panel("chrome", { slots: ["top", "bottom"], defaultSlot: "top" }),
    panel("mixed", { slots: ["top", "right"], defaultSlot: "top" }),
    { id: "sample.status", kind: "slotItem" }, { id: "sample.score", kind: "view" }];
  const state = createSidebarCompositionState({ contributions });
  assert.deepEqual(ids(state, "left"), ["sample.alpha", "sample.zeta"]);
  assert.deepEqual(ids(state, "right"), ["sample.right", "sample.mixed"]);
  assert.equal(items(state).find(item => item.id === "sample.mixed").enabled, false);
  assert.deepEqual(items(state).map(item => item.order), [0, 1, 0, 1]);
  for (const item of items(state)) assert.deepEqual(Object.keys(item).sort(), ["componentId", "enabled", "id", "order", "slot"]);
  const snapshot = state.read.snapshot();
  assert.throws(() => snapshot.panels.push({}), TypeError);
  assert.throws(() => { snapshot.panels[0].enabled = false; }, TypeError);
  assert.equal(Object.isFrozen(contributions), false);
  contributions[0].slots.push("bottom"); contributions[0].defaultEnabled = false;
  contributions.push(panel("later"));
  assert.equal(state.move("sample.zeta", "bottom").code, "sidebar.invalid-slot");
  assert.equal(state.setEnabled("sample.later", true).code, "sidebar.unknown-panel");
  assert.equal(items(state).find(item => item.id === "sample.zeta").enabled, true);
});

test("moving in both directions preserves identity, enablement and contiguous regional order", () => {
  const state = createSidebarCompositionState({ contributions: [panel("a"), panel("b"), panel("c", { defaultSlot: "right" })] });
  assert.equal(state.move("sample.a", "right", 0).changed, true);
  assert.deepEqual(ids(state, "left"), ["sample.b"]);
  assert.deepEqual(ids(state, "right"), ["sample.a", "sample.c"]);
  assert.equal(state.move("sample.a", "left").changed, true);
  assert.deepEqual(ids(state, "left"), ["sample.b", "sample.a"]);
  assert.deepEqual(items(state).map(item => item.order), [0, 1, 0]);
  assert.equal(items(state).find(item => item.id === "sample.a").componentId, "sample.a");
  assert.equal(items(state).every(item => item.enabled), true);
});

test("hidden panels keep their order and can be reordered before being enabled again", () => {
  const state = createSidebarCompositionState({ contributions: [panel("a"), panel("b"), panel("c")] });
  state.setEnabled("sample.b", false);
  state.reorder("sample.b", 0);
  assert.deepEqual(ids(state, "left"), ["sample.b", "sample.a", "sample.c"]);
  state.setEnabled("sample.b", true);
  assert.deepEqual(ids(state, "left"), ["sample.b", "sample.a", "sample.c"]);
  state.reorder("sample.b", 2);
  assert.deepEqual(ids(state, "left"), ["sample.a", "sample.c", "sample.b"]);
});

test("invalid operations fail atomically without notifying or replacing an accepted snapshot", () => {
  const state = createSidebarCompositionState({ contributions: [panel("a", { slots: ["left"] }), panel("b")] });
  const before = state.read.snapshot(); let notifications = 0;
  state.read.subscribe(() => notifications++);
  const failed = [() => state.move("missing", "left"), () => state.setEnabled("missing", true), () => state.reorder("missing", 0),
    () => state.move("sample.a", "right"), () => state.move("sample.b", "stage"), () => state.move("sample.b", "top"),
    () => state.move("sample.b", "left", -1), () => state.move("sample.b", "left", 2),
    () => state.move("sample.b", "right", 1), () => state.move("sample.b", "left", NaN),
    () => state.move("sample.b", "left", 0.5), () => state.move("sample.b", "left", "0"),
    () => state.reorder("sample.b"), () => state.setEnabled("sample.b", "false")];
  for (const action of failed) {
    assert.equal(action().ok, false);
    assert.equal(state.read.snapshot(), before);
  }
  assert.equal(notifications, 0);
  assert.equal(state.setEnabled("sample.a", true).changed, false);
  assert.equal(state.move("sample.a", "left").changed, false);
  assert.equal(state.reorder("sample.b", 1).changed, false);
  assert.equal(state.read.snapshot(), before);
  assert.equal(notifications, 0);
});

test("invalid capabilities and duplicate identities are rejected at construction", () => {
  assert.throws(() => createSidebarCompositionState(), /贡献数组/);
  for (const contribution of [null, { kind: "module" }, panel("a", { id: "" }), panel("a", { componentId: "" }),
    panel("a", { slots: [] }), panel("a", { slots: ["left", "left"] }), panel("a", { slots: ["unknown"] }),
    panel("a", { defaultSlot: "top" }), panel("a", { defaultEnabled: 1 }), panel("a", { order: Infinity })]) {
    assert.throws(() => createSidebarCompositionState({ contributions: [contribution] }));
  }
  assert.throws(() => createSidebarCompositionState({ contributions: [panel("a"), panel("a")] }), /id 重复/);
  assert.throws(() => createSidebarCompositionState({ contributions: [panel("a"), panel("alias", { componentId: "sample.a" })] }), /多个实例/);
  assert.deepEqual(items(createSidebarCompositionState({ contributions: [] })), []);
  assert.throws(() => createSidebarCompositionState({ contributions: [], onObserverError: 1 }), /回调/);
});

test("surface aliases retain component identity and never widen the allowed sidebar", () => {
  const state = createSidebarCompositionState({ contributions: [panel("public", { componentId: "sample.implementation", slots: ["right"], defaultSlot: "right" })] });
  assert.equal(items(state)[0].id, "sample.public");
  assert.equal(items(state)[0].componentId, "sample.implementation");
  assert.equal(state.move("sample.public", "left").ok, false);
  assert.equal(state.move("sample.implementation", "right").code, "sidebar.unknown-panel");
});

test("observers receive ordered snapshots through failures, reentry and unsubscribe", () => {
  const errors = [], received = [[], []];
  const state = createSidebarCompositionState({ contributions: [panel("a")], onObserverError(error) { errors.push(error); throw new Error("reporting failed"); } });
  assert.throws(() => state.read.subscribe(null), /订阅者/);
  const stopBroken = state.read.subscribe(() => { throw new Error("observer failed"); });
  state.read.subscribe(snapshot => {
    received[0].push(snapshot.panels[0].slot);
    if (snapshot.panels[0].slot === "right") state.move("sample.a", "left");
  });
  const stopSecond = state.read.subscribe(snapshot => received[1].push(snapshot.panels[0].slot));
  assert.equal(state.move("sample.a", "right").ok, true);
  assert.deepEqual(received, [["right", "left"], ["right", "left"]]);
  assert.equal(errors.length, 2);
  stopBroken(); stopBroken(); stopSecond(); stopSecond();
  state.setEnabled("sample.a", false);
  assert.equal(errors.length, 2);
  assert.deepEqual(received[1], ["right", "left"]);
});

function withDocument(run) {
  const before = Object.getOwnPropertyDescriptor(globalThis, "document");
  const make = () => ({ dataset: {}, parentNode: null, children: [], setAttribute() {},
    append(child) { child.remove(); child.parentNode = this; this.children.push(child); },
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; },
    replaceChildren(...children) { for (const child of [...this.children]) child.remove(); for (const child of children) this.append(child); } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: make } });
  try { run(make); } finally { if (before) Object.defineProperty(globalThis, "document", before); else delete globalThis.document; }
}

test("one router moves a mounted panel; hide/show retains input, instance and resources until release", () => withDocument(make => {
  const router = createCommandRouter(), registry = createComponentRegistry(), menus = createMenuRegistry([]);
  const platform = createPluginPlatform({ router, components: registry, menus });
  let state, context, mounts = 0, commandCalls = 0, disposals = 0;
  const visibility = [], resources = new Set(), notices = [], regions = { left: make(), right: make() };
  const disposeCommand = router.register("host", { id: "host.sidebar.move", run({ id, slot, index }) { commandCalls++; return state.move(id, slot, index); } });
  platform.register(defineUiPlugin({ namespace: "sample", ui: [
    { id: "sample.notes", kind: "panel", title: "笔记", slots: ["left", "right"], defaultEnabled: true,
      permissions: { commands: ["host.sidebar.move"] }, mount(element, ctx) {
        mounts++; context = ctx; element.input = { value: "draft" };
        resources.add("subscription"); ctx.onDispose(() => resources.delete("subscription"));
        return { setVisible: visible => visibility.push(visible), dispose: () => disposals++ };
      } },
    { id: "sample.lazy", kind: "panel", title: "未启用内容", slots: ["right"], mount() { throw new Error("must stay lazy"); } },
  ] }));
  platform.start();
  state = createSidebarCompositionState({ contributions: createUiContributionCatalog({ platform, components: registry }).list() });
  const host = createComponentHost({ registry, router, notices: { push: notice => notices.push(notice) } });
  function render(snapshot) {
    for (const item of snapshot.panels) {
      if (item.enabled) {
        const element = host.ensure(item.componentId, item.slot);
        regions[item.slot].append(element); host.setVisible(item.componentId, true);
      } else if (host.has(item.componentId)) {
        host.setVisible(item.componentId, false);
        // Existing hidden cells stay owned by the host while detached from presentation.
        for (const region of Object.values(regions)) for (const child of [...region.children]) if (child.dataset.component === item.componentId) child.remove();
      }
    }
  }
  const unsubscribe = state.read.subscribe(render); render(state.read.snapshot());
  const first = regions.left.children[0]; first.input.value = "user draft";
  assert.equal(host.has("sample.lazy"), false);
  assert.equal(context.execute("host.sidebar.move", { id: "sample.notes", slot: "right" }).ok, true);
  assert.equal(commandCalls, 1); assert.equal(regions.right.children[0], first); assert.equal(regions.left.children.length, 0);
  state.setEnabled("sample.notes", false); state.setEnabled("sample.notes", false);
  assert.equal(first.parentNode, null); assert.equal(host.has("sample.notes"), true); assert.equal(resources.size, 1);
  assert.equal(disposals, 0); assert.deepEqual(visibility, [false]);
  state.move("sample.notes", "left"); state.setEnabled("sample.notes", true);
  assert.equal(regions.left.children[0], first); assert.equal(first.input.value, "user draft"); assert.equal(mounts, 1);
  assert.deepEqual(visibility, [false, true]);
  assert.equal(context.execute("host.ungranted").code, "permission.denied"); assert.equal(commandCalls, 1);
  unsubscribe(); platform.dispose(); host.dispose(); host.dispose(); disposeCommand();
  assert.equal(resources.size, 0); assert.equal(disposals, 1); assert.equal(first.parentNode, null);
  assert.equal(context.execute("host.sidebar.move", { id: "sample.notes", slot: "right" }).code, "component.disposed");
  assert.equal(commandCalls, 1);
  assert.equal(notices.filter(item => item.text.includes("加载失败")).length, 0);
}));

test("visibility notifications isolate hook failure and remain separate from DOM and disposal", () => withDocument(() => {
  const registry = createComponentRegistry(), notices = [];
  let calls = 0, cleanups = 0;
  const unregister = registry.register("sample", { id: "sample.notes", title: "笔记", role: "tool", slots: ["left"], mount(element, ctx) {
    ctx.onDispose(() => cleanups++);
    return { setVisible() { calls++; throw new Error("pause failed"); }, dispose() { cleanups++; } };
  } });
  const host = createComponentHost({ registry, router: createCommandRouter(), notices: { push: notice => notices.push(notice) } });
  const first = host.ensure("sample.notes", "left");
  assert.throws(() => host.setVisible("sample.notes", "false"), /布尔值/);
  host.setVisible("sample.notes", true); host.setVisible("sample.notes", false); host.setVisible("sample.notes", false);
  assert.equal(calls, 1); assert.equal(cleanups, 0); assert.equal(first.hidden, undefined);
  assert.match(notices[0].text, /可见状态更新失败/);
  assert.equal(host.ensure("sample.notes", "right"), first);
  host.setVisible("sample.notes", true); assert.equal(calls, 2);
  unregister(); host.setVisible("sample.notes", false); host.dispose();
  assert.equal(cleanups, 2); assert.equal(calls, 2);
}));

test("invalid optional visibility hooks drain resources and isolate the failed component", () => withDocument(() => {
  const registry = createComponentRegistry(), notices = []; let resources = 0, disposals = 0;
  registry.register("sample", { id: "sample.broken", title: "错误内容", role: "tool", slots: ["left"], mount(element, ctx) {
    resources++; ctx.onDispose(() => resources--);
    return { setVisible: true, dispose() { disposals++; } };
  } });
  registry.register("sample", { id: "sample.healthy", title: "正常内容", role: "tool", slots: ["right"], mount() {} });
  const host = createComponentHost({ registry, router: createCommandRouter(), notices: { push: notice => notices.push(notice) } });
  const broken = host.ensure("sample.broken", "left");
  assert.equal(resources, 0); assert.equal(disposals, 1); assert.match(broken.children[0].textContent, /加载失败/);
  assert.match(notices[0].text, /setVisible 必须是函数/);
  assert.doesNotThrow(() => { host.ensure("sample.healthy", "right"); host.setVisible("sample.healthy", false); host.setVisible("sample.broken", false); });
  host.dispose(); assert.equal(disposals, 1);
}));
