import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { WORKSPACE_CHROME } from "../src/workspace-geometry.js";
import { bindWorkspaceCommands, WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createPluginPlatform } from "../src/runtime/plugin-installer.js";
import { createBuiltinPages, LAYOUT_PAGE_ID } from "../src/features/builtin-pages.js";

function runtime(options = {}) {
  const store = createWorkspaceState({ pageIds: ["page.first", "page.second", "page.layout"], layoutPageId: "page.layout", ...options });
  const router = createCommandRouter();
  const zooms = [];
  const dispose = bindWorkspaceCommands({ router, store, stage: { zoom(value) { zooms.push(value); return { ok: true }; } } });
  return { store, router, zooms, dispose, execute: router.execute };
}

test("one layout operation publishes once without entering the document command handler", () => {
  const { store, execute, router } = runtime();
  let writes = 0, changes = 0;
  router.register("document", { id: "document.edit", run: () => { writes++; return { ok: true, version: writes }; } });
  const unsubscribe = store.read.subscribe(() => changes++);
  execute(C.region, { region: "left" });
  assert.equal(store.read.snapshot().leftOpen, true);
  assert.equal(changes, 1);
  assert.equal(writes, 0);
  assert.deepEqual(execute("document.edit"), { ok: true, version: 1 });
  assert.equal(writes, 1);
  assert.equal(changes, 1);
  unsubscribe();
  execute(C.region, { region: "left" });
  assert.equal(changes, 1);
});

test("read ports and bad payloads cannot modify host state", () => {
  const { store, execute } = runtime();
  execute(C.begin);
  const baseline = store.read.snapshot();
  assert.throws(() => { baseline.leftWidth = 999; }, TypeError);
  assert.throws(() => { baseline.limits.left = 999; }, TypeError);
  assert.deepEqual(Object.keys(store.read).sort(), ["snapshot", "subscribe"]);
  const invalid = [[C.region, null], [C.region, []], [C.region, { region: ["left"] }],
    [C.region, { region: "__proto__" }], [C.resize, { side: "right", value: "360" }],
    [C.resize, { side: "right", value: Infinity }], [C.resize, { side: "top", value: NaN }], [C.resize, { side: ["left"], value: 280 }],
    [C.page, { id: "unregistered" }], [C.page, { id: "page.first", toggle: null }],
    [C.step, { delta: 8 }], [C.arrange, { mode: "unknown" }], [C.finish, { confirm: "yes" }]];
  for (const [id, payload] of invalid) {
    assert.equal(execute(id, payload).ok, false);
    assert.equal(store.read.snapshot(), baseline);
  }
});

test("ending component editing keeps the user's current region visibility and geometry", () => {
  const { store, execute } = runtime({ width: 1440 });
  execute(C.region, { region: "top" });
  execute(C.page, { id: "page.first" });
  execute(C.begin);
  execute(C.region, { region: "left" });
  execute(C.resize, { side: "right", value: 380 });
  execute(C.arrange, { mode: "compact" });
  execute(C.begin); // Re-entry must not overwrite the transaction baseline.
  const used = store.read.snapshot();
  execute(C.finish, { confirm: false });
  const canceled = store.read.snapshot();
  for (const key of ["leftOpen", "rightOpen", "topOpen", "voiceOpen", "leftWidth", "rightWidth", "topHeight", "voiceHeight", "arrangement"]) assert.equal(canceled[key], used[key]);
  assert.equal(canceled.currentPage, "page.layout");
  assert.equal(canceled.adjusting, false);
  execute(C.begin);
  execute(C.arrange, { mode: "compact" });
  execute(C.finish, { confirm: true });
  assert.equal(store.read.snapshot().leftWidth, 230);
  assert.equal(store.read.snapshot().topOpen, false);
  execute(C.region, { region: "top" });
  execute(C.begin);
  execute(C.arrange, { mode: "default" });
  execute(C.finish, { confirm: true });
  assert.equal(store.read.snapshot().topOpen, true);
  assert.equal(execute(C.finish, { confirm: true }).code, "workspace.no-adjustment");
});

test("wide sidebars accept the shared 420px product cap", () => {
  const { store, execute } = runtime({ width: 1440, height: 900 });
  execute(C.resize, { side: "left", value: 400 });
  assert.equal(store.read.snapshot().leftWidth, 400);
  execute(C.resize, { side: "left", value: 420 });
  assert.equal(store.read.snapshot().leftWidth, 420);
  assert.equal(store.read.snapshot().rightWidth, 260);
});

test("geometry keeps a 480px stage on the minimum canvas and a 300px stage vertically", () => {
  const { store, execute } = runtime({ width: 1440, height: 720 });
  execute(C.begin);
  execute(C.region, { region: "left" });
  execute(C.region, { region: "voice" });
  execute(C.resize, { side: "left", value: 360 });
  execute(C.resize, { side: "right", value: 360 });
  execute(C.resize, { side: "voice", value: 320 });
  execute(C.finish, { confirm: true });
  store.setViewport(1024, 720);
  let state = store.read.snapshot();
  assert.equal(1024 - 40 - 40 - state.leftWidth - state.rightWidth, 480);
  execute(C.begin);
  execute(C.resize, { side: "voice", value: 320 });
  state = store.read.snapshot();
  assert.equal(720 - WORKSPACE_CHROME.title - state.topHeight - state.voiceHeight - WORKSPACE_CHROME.merge, 300);
  execute(C.finish, { confirm: false });
  state = store.read.snapshot();
  assert.ok(state.leftWidth + state.rightWidth <= 464);
  const snapshot = state;
  assert.equal(store.setViewport(NaN, 720).ok, false);
  assert.equal(store.read.snapshot(), snapshot);
});

test("stable page ids survive reordered contributions and selection is distinct from tab toggling", () => {
  const { store, execute } = runtime({ pageIds: ["page.second", "page.layout", "page.first"] });
  execute(C.page, { id: "page.first" });
  assert.equal(store.read.snapshot().currentPage, "page.first");
  execute(C.page, { id: "page.first" });
  assert.equal(store.read.snapshot().rightOpen, false);
  execute(C.page, { id: "page.first", toggle: false });
  assert.equal(store.read.snapshot().rightOpen, true);
  execute(C.step, { delta: -1 });
  assert.equal(store.read.snapshot().currentPage, "page.layout");
});

test("opening bands changes visibility without changing stored widths, heights or capacity", () => {
  for (const width of [1024, 1280, 1440]) {
    const { store, execute } = runtime({ width, height: 720 });
    execute(C.begin);
    execute(C.resize, { side: "voice", value: 320 });
    execute(C.finish, { confirm: true });
    const baseline = store.read.snapshot();
    const regions = ["left", "right", "top", "voice"];
    let mask = regions.reduce((value, side, index) => value | (baseline[side + "Open"] ? 1 << index : 0), 0);
    for (let target = 0; target < 16; target++) {
      for (let index = 0; index < regions.length; index++) {
        if ((mask ^ target) & (1 << index)) execute(C.region, { region: regions[index] });
      }
      mask = target;
      const current = store.read.snapshot();
      for (const key of ["leftWidth", "rightWidth", "topHeight", "voiceHeight", "limits"]) {
        assert.deepEqual(current[key], baseline[key], width + " / " + mask + " / " + key);
      }
    }
  }
});

test("default, balanced and compact widths stay symmetric including the minimum window", () => {
  for (const width of [1024, 1280, 1440]) {
    const { store, execute } = runtime({ width, height: 720 });
    let state = store.read.snapshot();
    assert.equal(state.topOpen, true);
    assert.equal(state.topHeight, 120);
    assert.equal(state.voiceOpen, false);
    assert.equal(state.leftWidth, state.rightWidth);
    assert.equal(state.leftWidth, width === 1024 ? 232 : 260);
    execute(C.begin);
    execute(C.resize, { side: "left", value: 200 });
    for (const mode of ["compact", "balanced", "default"]) {
      execute(C.arrange, { mode });
      state = store.read.snapshot();
      assert.equal(state.leftWidth, state.rightWidth, width + " / " + mode);
      assert.ok(width - 40 - 40 - state.leftWidth - state.rightWidth >= 480);
    }
    assert.equal(state.topOpen, true);
  }
});

test("top height survives hiding and component cancellation while ordinary arrangement can reset it", () => {
  const { store, execute } = runtime({ width: 1280, height: 720 });
  execute(C.begin);
  execute(C.resize, { side: "top", value: 80 });
  execute(C.finish, { confirm: true });
  assert.equal(store.read.snapshot().topHeight, 80);
  execute(C.region, { region: "top" });
  assert.equal(store.read.snapshot().topHeight, 80);
  execute(C.region, { region: "top" });
  assert.equal(store.read.snapshot().topHeight, 80);
  execute(C.begin);
  execute(C.resize, { side: "top", value: 120 });
  execute(C.finish, { confirm: false });
  assert.equal(store.read.snapshot().topHeight, 120);
  execute(C.begin);
  execute(C.resize, { side: "top", value: 96 });
  execute(C.finish, { confirm: true });
  assert.equal(store.read.snapshot().topHeight, 96);
  execute(C.begin);
  for (const mode of ["compact", "balanced", "default"]) {
    execute(C.resize, { side: "top", value: 80 });
    execute(C.arrange, { mode });
    assert.equal(store.read.snapshot().topHeight, mode === "compact" ? 80 : 120);
  }
});

test("top and bottom resizing reserve 300px without changing the other stored region", () => {
  const { store, execute } = runtime({ width: 1280, height: 720 });
  execute(C.begin);
  execute(C.resize, { side: "top", value: -20 });
  assert.equal(store.read.snapshot().topHeight, 80);
  execute(C.resize, { side: "top", value: 999 });
  assert.equal(store.read.snapshot().topHeight, 226);
  assert.equal(store.read.snapshot().voiceHeight, 120);
  execute(C.resize, { side: "voice", value: 999 });
  assert.equal(store.read.snapshot().voiceHeight, 120);
  assert.equal(store.read.snapshot().topHeight, 226);
  execute(C.arrange, { mode: "default" });
  execute(C.resize, { side: "voice", value: 999 });
  execute(C.resize, { side: "top", value: 999 });
  assert.equal(store.read.snapshot().topHeight, 120);
  assert.equal(store.read.snapshot().voiceHeight, 226);
  store.setViewport(1280, 900);
  execute(C.resize, { side: "top", value: 320 });
  execute(C.resize, { side: "voice", value: 320 });
  store.setViewport(1280, 720);
  const state = store.read.snapshot();
  assert.equal(state.topHeight, 266);
  assert.equal(state.voiceHeight, 80);
  assert.equal(720 - WORKSPACE_CHROME.title - state.topHeight - state.voiceHeight - WORKSPACE_CHROME.merge, 300);
});

test("disposing or partially failing command binding leaves no owned handlers", () => {
  const current = runtime();
  current.dispose(); current.dispose();
  for (const id of Object.values(C)) assert.equal(current.execute(id).code, "command.missing");
  const router = createCommandRouter();
  router.register("other", { id: C.arrange, run: () => ({ ok: true }) });
  assert.throws(() => bindWorkspaceCommands({ router, store: current.store, stage: {} }), /already owned/);
  assert.equal(router.describe(C.region), null);
  assert.equal(router.describe(C.resize), null);
  assert.equal(router.describe(C.arrange).owner, "other");
});

test("one built-in package contributes four right pages from a single definition list", () => {
  const current = runtime();
  const components = createComponentRegistry();
  const builtin = createBuiltinPages(current.store.read, undefined, undefined, { includeLayout: true });
  const platform = createPluginPlatform({ router: current.router, components, menus: createMenuRegistry([]) });
  platform.register(builtin);
  assert.equal(platform.start()[0].status, "active");
  const facet = platform.facets("ui")[0].value;
  assert.equal(facet.modules.length, 0);
  assert.deepEqual(facet.pages.map(item => item.componentId), builtin.components.map(item => item.id));
  assert.equal(components.get(LAYOUT_PAGE_ID).title, "工作区布局");
  assert.equal(facet.pages.every(item => item.slots[0] === "right" && !("mount" in item)), true);
  platform.dispose();
  assert.equal(components.list().length, 0);
});

test("component host retains the same instance and private input state across page selection", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const elements = [];
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement() { const element = { dataset: {}, setAttribute() {}, remove() { this.removed = true; } }; elements.push(element); return element; },
  } });
  try {
    const { router, execute, store } = runtime();
    const registry = createComponentRegistry();
    let mounts = 0, disposals = 0;
    const privateInput = { value: "接口状态保留" };
    registry.register("page", { id: "page.first", title: "测试页", role: "inspector", slots: ["right"],
      mount(element) { mounts++; element.input = privateInput; return { dispose() { disposals++; } }; },
    });
    const host = createComponentHost({ registry, router, notices: { push() {} } });
    execute(C.page, { id: "page.first" });
    const first = host.ensure(store.read.snapshot().currentPage, "page");
    execute(C.page, { id: "page.layout" });
    execute(C.page, { id: "page.first" });
    const returned = host.ensure(store.read.snapshot().currentPage, "page");
    assert.equal(returned, first);
    assert.equal(returned.input.value, "接口状态保留");
    assert.equal(mounts, 1);
    host.release("page.first"); host.release("page.first");
    assert.equal(disposals, 1);
    assert.equal(first.removed, true);
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else delete globalThis.document;
  }
});
