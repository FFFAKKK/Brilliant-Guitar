import test from "node:test";
import assert from "node:assert/strict";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createPluginPlatform } from "../src/runtime/plugin-installer.js";
import { createUiContributionCatalog } from "../src/runtime/ui-contribution-catalog.js";
import { defineUiPlugin } from "../src/runtime/ui-plugin-contract.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { createSidebarCompositionState } from "../src/layout/sidebar-composition-state.js";
import { createLayoutEditSession } from "../src/layout/layout-edit-session.js";
import { createSidebarContentReadPort } from "../src/host/sidebar-content-read-port.js";
import { createSidebarPresentation } from "../src/host/sidebar-presentation.js";
import { bindSidebarCommands, SIDEBAR_COMMANDS as S } from "../src/host/sidebar-commands.js";
import { bindWorkspaceCommands, WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { createBuiltinPages, LAYOUT_PAGE_ID } from "../src/features/builtin-pages.js";
import { createVisualWorkbench } from "../src/shell/visual-workbench.js";
import { createSidebarContentSettings } from "../src/shell/sidebar-content-settings.js";
import { withTestDocument } from "./support/dom-test-environment.js";

function start({ extra, deny = false, wrapContents, intercept, deferRender = false } = {}) {
  const router = createCommandRouter(), registry = createComponentRegistry(), notices = [], calls = [];
  const subscriptions = { workspace: 0, content: 0 };
  let workspace, composition, sidebar, content;
  function track(name, subscribe, listener) {
    const stop = subscribe(listener); subscriptions[name]++;
    let active = true;
    return () => { if (active) { active = false; subscriptions[name]--; stop(); } };
  }
  const layout = { snapshot: () => workspace.read.snapshot(), subscribe: listener => track("workspace", workspace.read.subscribe, listener) };
  const contents = { snapshot: () => content.snapshot(), subscribe: listener => track("content", content.subscribe, listener) };
  const builtin = createBuiltinPages(layout, contents, undefined, { includeLayout: true });
  const definition = builtin.components.find(panel => panel.id === LAYOUT_PAGE_ID), mount = definition.mount;
  if (deny) definition.permissions.commands = definition.permissions.commands.filter(id => !Object.values(S).includes(id));
  definition.mount = (element, ctx) => mount(element, { ...ctx, execute(id, payload) {
    calls.push([id, payload]);
    return intercept ? intercept(id, payload, ctx.execute) : ctx.execute(id, payload);
  } });
  workspace = createWorkspaceState({ pageIds: [...builtin.components, ...(extra?.components ?? [])].map(panel => panel.id),
    layoutPageId: LAYOUT_PAGE_ID, width: innerWidth, height: innerHeight });
  const reservedPanelIds = [LAYOUT_PAGE_ID];
  const edit = createLayoutEditSession({ workspace, composition: () => composition, reservedPanelIds });
  const stopCommands = bindWorkspaceCommands({ router, store: workspace, editSession: edit,
    stage: { zoom() { return { ok: true }; } }, sidebar: { snapshot: () => sidebar.describe(layout.snapshot()) } });
  const stopSidebar = bindSidebarCommands({ router, editSession: edit });
  const platform = createPluginPlatform({ router, components: registry, menus: createMenuRegistry([]) });
  platform.register(builtin); if (extra) platform.register(extra);
  assert.ok(platform.start().every(result => result.status === "active"));
  const catalog = createUiContributionCatalog({ platform, components: registry });
  composition = createSidebarCompositionState({ contributions: catalog.list() });
  const read = createSidebarContentReadPort({ catalog, composition: composition.read, changes: edit.changes, reservedPanelIds });
  content = wrapContents ? wrapContents(read) : read;
  const components = createComponentHost({ registry, router, notices: { push: notice => notices.push(notice) } });
  sidebar = createSidebarPresentation({ catalog, composition: composition.read, components });
  const root = document.createElement("div"); document.body.append(root);
  const panels = catalog.list({ kind: "panel", slot: "right" });
  const presentationHints = Object.fromEntries(panels.map(panel => [panel.id, { footerHeight: registry.get(panel.componentId).footerHeight ?? 0 }]));
  const shell = createVisualWorkbench({ root, panels, layout, router, sidebar, presentationHints });
  let rendering = !deferRender;
  const render = (state, snapshot) => { if (rendering) shell.render(state, snapshot); };
  render(workspace.read.snapshot());
  const stopLayout = workspace.read.subscribe(snapshot => render(snapshot));
  const stopComposition = composition.read.subscribe(snapshot => render(workspace.read.snapshot(), snapshot));
  const query = selector => root.querySelector(selector);
  return { router, workspace, composition, edit, content, platform, catalog, components, root, query, calls, notices, subscriptions,
    render() { rendering = true; shell.render(workspace.read.snapshot()); },
    choose(id) { const select = query("#layout-content-choice"); select.value = id; select.dispatchEvent(new Event("change")); },
    panel: id => composition.read.snapshot().panels.find(panel => panel.id === id),
    dispose() { stopLayout(); stopComposition(); shell.dispose(); edit.dispose(); components.dispose(); platform.dispose(); stopSidebar(); stopCommands(); root.remove(); },
  };
}
function withRuntime(run, options) {
  return withTestDocument(async () => {
    const current = start(options);
    try { return await run(current); } finally { current.dispose(); }
  });
}
function notePlugin(lifecycle) {
  return defineUiPlugin({ namespace: "example", ui: [{ id: "example.notes", kind: "panel", title: "便笺",
    slots: ["left", "right"], defaultSlot: "left", defaultEnabled: false, order: 10,
    mount(element, ctx) {
      lifecycle.mounts++; const input = document.createElement("input"); input.id = "notes-input"; element.append(input);
      element.business = { selected: "original" };
      ctx.onDispose(() => lifecycle.cleanups++);
      return { setVisible: visible => lifecycle.visibility.push(visible) };
    },
  }] });
}

test("the actual catalog projects three configurable built-ins as immutable data and keeps the layout entry outside the library", () => withRuntime(current => {
  const snapshot = current.content.snapshot();
  assert.deepEqual(snapshot.panels.map(panel => panel.id), ["frame.builtin.properties", "frame.builtin.assistant", "frame.builtin.tone"]);
  assert.deepEqual(Object.keys(current.content).sort(), ["snapshot", "subscribe"]);
  assert.deepEqual(snapshot.changes, []);
  assert.throws(() => snapshot.panels[0].slots.push("left"), TypeError);
  assert.throws(() => { snapshot.panels[0].enabled = false; }, TypeError);
  const choices = current.query("#layout-content-choice").children.map(option => option.getAttribute("value"));
  assert.deepEqual(choices, ["", ...snapshot.panels.map(panel => panel.id)]);
  assert.equal(current.query("#layout-content-choice").value, "", "editing has no implicit selection");
  current.choose("frame.builtin.assistant");
  assert.equal(current.query("#layout-content-toggle").disabled, true);
  const before = current.composition.read.snapshot();
  current.query("#layout-content-toggle").dispatchEvent(new Event("click"));
  assert.equal(current.composition.read.snapshot(), before);
  assert.match(current.query("#layout-content-feedback").textContent, /先进入内容编辑/);
  assert.equal(current.calls.length, 0);
}));

test("layout controls execute one authorized command, preview removal and restore it on cancel while preserving ordinary geometry", () => withRuntime(current => {
  current.query("#composer-edit").click(); current.choose("frame.builtin.assistant");
  const select = current.query("#layout-content-choice"), toggle = current.query("#layout-content-toggle"); select.focus();
  assert.equal(current.query("#layout-content-left").disabled, true);
  assert.match(current.query("#layout-content-left").title, /不支持左侧栏/);
  assert.equal(current.query("#layout-content-right").disabled, true);
  const before = current.calls.length; toggle.click();
  assert.deepEqual(current.calls.slice(before), [[S.enabled, { id: "frame.builtin.assistant", enabled: false }]]);
  assert.equal(current.panel("frame.builtin.assistant").enabled, false);
  assert.equal(current.query("#page-tab-frame.builtin.assistant").hidden, true);
  assert.equal(toggle.getAttribute("aria-label"), "添加到侧栏");
  assert.match(current.query("#layout-session").textContent, /已修改 1 项/);
  assert.match(current.query(".v-layout-change-list").textContent, /AI 助手.*移出侧栏/);
  current.router.execute(C.resize, { side: "right", value: 300 });
  current.query("#layout-top").click();
  const geometry = current.workspace.read.snapshot();
  assert.equal(document.activeElement, select); assert.equal(current.query("#layout-content-choice"), select);
  current.query("#layout-cancel").click();
  assert.equal(current.panel("frame.builtin.assistant").enabled, true);
  assert.equal(current.query("#page-tab-frame.builtin.assistant").hidden, false);
  assert.equal(current.workspace.read.snapshot().rightWidth, 300);
  assert.equal(current.workspace.read.snapshot().topOpen, geometry.topOpen);
  assert.deepEqual(current.content.snapshot().changes, []);
}));

test("the fixed layout entry cannot be moved, disabled or reordered through router or direct session handlers", () => withRuntime(current => {
  current.query("#composer-edit").click(); const before = current.composition.read.snapshot();
  for (const [command, payload, direct] of [
    [S.move, { id: LAYOUT_PAGE_ID, slot: "left" }, () => current.edit.move(LAYOUT_PAGE_ID, "left")],
    [S.enabled, { id: LAYOUT_PAGE_ID, enabled: false }, () => current.edit.setEnabled(LAYOUT_PAGE_ID, false)],
    [S.reorder, { id: LAYOUT_PAGE_ID, index: 0 }, () => current.edit.reorder(LAYOUT_PAGE_ID, 0)],
  ]) {
    assert.equal(current.router.execute(command, payload).code, "layout.reserved-panel");
    assert.equal(current.router.describe(command).run(payload).code, "layout.reserved-panel");
    assert.equal(direct().code, "layout.reserved-panel");
    assert.equal(current.composition.read.snapshot(), before);
  }
  assert.equal(current.query("#layout-content-choice").children.some(option => option.getAttribute("value") === LAYOUT_PAGE_ID), false);
}));

test("sorting uses actual placement indexes and updates page order; reverting an operation removes its final difference", () => withRuntime(current => {
  current.query("#composer-edit").click(); current.choose("frame.builtin.tone");
  assert.equal(current.query("#layout-content-down").disabled, true, "fixed config entry is not a sorting target");
  current.query("#layout-content-up").click();
  assert.deepEqual(current.composition.read.snapshot().panels.map(panel => panel.id),
    ["frame.builtin.properties", "frame.builtin.tone", "frame.builtin.assistant", LAYOUT_PAGE_ID]);
  assert.deepEqual(current.query('[role="tablist"]').children.map(tab => tab.id),
    ["page-tab-frame.builtin.properties", "page-tab-frame.builtin.tone", "page-tab-frame.builtin.assistant", "page-tab-" + LAYOUT_PAGE_ID]);
  assert.equal(current.content.snapshot().changes.length, 2, "count final changed records, not button presses");
  current.query("#layout-content-down").click();
  assert.deepEqual(current.content.snapshot().changes, []);
  assert.equal(current.query("#layout-session").textContent, "编辑中 · 未修改");
  assert.equal(current.router.execute(S.move, { id: "frame.builtin.tone", slot: "left" }).code, "sidebar.invalid-slot");
}));

test("confirm becomes the next baseline and cancellation restores that accepted configuration", () => withRuntime(current => {
  current.query("#composer-edit").click(); current.choose("frame.builtin.tone");
  current.query("#layout-content-up").click(); current.query("#layout-content-toggle").click();
  current.query("#layout-confirm").click(); const accepted = current.composition.read.snapshot();
  assert.equal(current.panel("frame.builtin.tone").enabled, false);
  current.query("#composer-edit").click(); assert.deepEqual(current.content.snapshot().changes, []);
  current.query("#layout-content-toggle").click(); current.query("#layout-content-down").click();
  current.query("#layout-cancel").click();
  assert.deepEqual(current.composition.read.snapshot(), accepted);
  assert.equal(current.query("#layout-content-choice").value, "frame.builtin.tone");
}));

test("a real dual-slot plugin is added, moved, removed and restored without remounting or losing private state", () => {
  const lifecycle = { mounts: 0, cleanups: 0, visibility: [] };
  return withRuntime(current => {
    current.query("#composer-edit").click(); current.choose("example.notes");
    assert.equal(lifecycle.mounts, 0); assert.equal(current.query("#layout-content-toggle").getAttribute("aria-label"), "添加到侧栏");
    current.query("#layout-content-toggle").click();
    assert.equal(lifecycle.mounts, 0, "closed sidebar does not eagerly mount content");
    current.query("#layout-left").click();
    const input = current.query("#notes-input"), cell = input.parentNode;
    input.value = "保留输入"; cell.scrollTop = 61; cell.business.selected = "keep";
    assert.equal(lifecycle.mounts, 1);
    current.query("#layout-content-right").click();
    assert.equal(current.panel("example.notes").slot, "right");
    assert.equal(cell.parentNode, current.query(".v-page"));
    assert.equal(current.query("#notes-input"), input);
    current.query("#layout-content-toggle").click(); current.query("#layout-content-toggle").click();
    assert.equal(current.query("#notes-input"), input); assert.equal(lifecycle.mounts, 1); assert.equal(lifecycle.cleanups, 0);
    current.query("#layout-confirm").click(); const accepted = current.composition.read.snapshot();
    current.router.execute(C.page, { id: "example.notes", toggle: false });
    assert.equal(cell.hidden, false); assert.equal(input.value, "保留输入");
    current.router.execute(C.page, { id: LAYOUT_PAGE_ID, toggle: false });
    current.query("#composer-edit").click(); current.query("#layout-content-left").click();
    current.query("#layout-content-toggle").click(); current.query("#layout-cancel").click();
    assert.deepEqual(current.composition.read.snapshot(), accepted);
    assert.equal(input.parentNode, cell); assert.equal(input.value, "保留输入"); assert.equal(cell.scrollTop, 61);
    assert.equal(cell.business.selected, "keep"); assert.equal(lifecycle.mounts, 1);
    current.dispose(); assert.equal(lifecycle.cleanups, 1); assert.deepEqual(current.subscriptions, { workspace: 0, content: 0 });
  }, { extra: notePlugin(lifecycle) });
});

test("removing a mounted assistant preserves its actual input and restores the same cell on cancellation", () => withRuntime(current => {
  current.router.execute(C.page, { id: "frame.builtin.assistant", toggle: false });
  const input = current.query("#page-input"), cell = input.parentNode.parentNode;
  input.value = "助手草稿";
  current.router.execute(C.page, { id: LAYOUT_PAGE_ID, toggle: false });
  current.query("#composer-edit").click(); current.choose("frame.builtin.assistant");
  current.query("#layout-content-toggle").click(); assert.equal(cell.hidden, true);
  current.query("#layout-cancel").click();
  current.router.execute(C.page, { id: "frame.builtin.assistant", toggle: false });
  assert.equal(current.query("#page-input"), input); assert.equal(input.value, "助手草稿"); assert.equal(cell.hidden, false);
}));

test("permission denial produces visible feedback and cannot mutate composition", () => withRuntime(current => {
  current.query("#composer-edit").click(); current.choose("frame.builtin.assistant");
  const before = current.composition.read.snapshot(); current.query("#layout-content-toggle").click();
  assert.equal(current.composition.read.snapshot(), before);
  assert.match(current.query("#layout-content-feedback").textContent, /没有.*权限/);
  assert.ok(current.notices.some(notice => notice.level === "error"));
}, { deny: true }));

test("execution failure leaves controls, state and session usable for retry", () => {
  let fail = true;
  return withRuntime(current => {
    current.query("#composer-edit").click(); current.choose("frame.builtin.assistant");
    const before = current.composition.read.snapshot(), toggle = current.query("#layout-content-toggle");
    toggle.click(); assert.equal(current.composition.read.snapshot(), before);
    assert.match(current.query("#layout-content-feedback").textContent, /失败.*重试/);
    assert.equal(current.edit.canConfigure(), true); assert.equal(current.query("#layout-content-toggle"), toggle);
    fail = false; toggle.click(); assert.equal(current.panel("frame.builtin.assistant").enabled, false);
    current.query("#layout-cancel").click(); assert.deepEqual(current.composition.read.snapshot(), before);
  }, { intercept(id, payload, execute) { if (fail && id === S.enabled) throw new Error("injected execution error"); return execute(id, payload); } });
});

test("missing, replaced and not-in-session contributions are projected as unavailable without inventing placements", () => {
  const a = { id: "example.a", componentId: "example.a", title: "内容甲", kind: "panel", slots: ["left", "right"], defaultEnabled: true };
  const b = { ...a, id: "example.b", componentId: "example.b", title: "内容乙" };
  const composition = createSidebarCompositionState({ contributions: [a] });
  let definitions = [a, b];
  const port = createSidebarContentReadPort({ catalog: { list: () => definitions }, composition: composition.read });
  const before = composition.read.snapshot();
  assert.equal(port.snapshot().panels[0].available, true);
  assert.match(port.snapshot().panels[1].reason, /未加入当前运行会话/);
  definitions = [b];
  assert.match(port.snapshot().panels.find(panel => panel.id === a.id).reason, /贡献当前不可用/);
  definitions = [{ ...a, componentId: "foreign.a" }];
  assert.equal(port.snapshot().panels[0].available, false);
  assert.match(port.snapshot().panels[0].reason, /登记身份/);
  assert.equal(composition.read.snapshot(), before);
  assert.throws(() => port.subscribe(null), /必须是函数/);
});

test("empty and unavailable content remains readable and exposes no successful configuration action", () => withTestDocument(() => {
  const composition = createSidebarCompositionState({ contributions: [] });
  const port = createSidebarContentReadPort({ catalog: { list: () => [] }, composition: composition.read });
  let executions = 0;
  const view = createSidebarContentSettings({ execute() { executions++; } });
  document.body.append(view.element); view.update(port.snapshot(), true);
  assert.equal(view.element.querySelector("#layout-content-choice").disabled, true);
  assert.match(view.element.querySelector("#layout-content-help").textContent, /没有可配置/);
  view.update({ panels: [{ id: "missing.panel", title: "失效内容", slots: [], available: false, reason: "贡献缺失", enabled: false }], changes: [] }, true);
  const choice = view.element.querySelector("#layout-content-choice"); choice.value = "missing.panel"; choice.dispatchEvent(new Event("change"));
  assert.match(view.element.querySelector("#layout-content-help").textContent, /贡献缺失/);
  view.element.querySelector("#layout-content-toggle").dispatchEvent(new Event("click"));
  assert.equal(executions, 0); assert.match(view.element.querySelector("#layout-content-feedback").textContent, /贡献缺失/);
  view.dispose();
}));

test("an operation rechecks the live content projection so a stale available row cannot configure a missing contribution", () => {
  let missing = false;
  return withRuntime(current => {
    current.query("#composer-edit").click(); current.choose("frame.builtin.assistant");
    const before = current.composition.read.snapshot(); missing = true;
    current.query("#layout-content-toggle").click();
    assert.equal(current.composition.read.snapshot(), before);
    assert.match(current.query("#layout-content-feedback").textContent, /贡献当前不可用/);
  }, { wrapContents(read) { return { ...read, snapshot() {
    const snapshot = read.snapshot();
    return missing ? { ...snapshot, panels: snapshot.panels.map(panel => ({ ...panel, available: false })) } : snapshot;
  } }; } });
});

test("lazy mounting during an active edit uses the original session difference rather than a new view baseline", () => withRuntime(current => {
  current.edit.begin();
  current.edit.setEnabled("frame.builtin.tone", false);
  assert.equal(current.query("#layout-content-manager"), null, "no view exists when the change is made");
  current.render();
  assert.match(current.query("#layout-session").textContent, /已修改 1 项/);
  current.query("#layout-cancel").click(); assert.equal(current.panel("frame.builtin.tone").enabled, true);
}, { deferRender: true }));

test("removing every ordinary component keeps the fixed layout entry usable and allows content to be added back", () => withRuntime(current => {
  current.query("#composer-edit").click();
  for (const panel of current.content.snapshot().panels) {
    current.choose(panel.id); current.query("#layout-content-toggle").click();
  }
  assert.deepEqual(current.composition.read.snapshot().panels.filter(panel => panel.enabled).map(panel => panel.id), [LAYOUT_PAGE_ID]);
  assert.equal(current.query("#composer-edit").hidden, true); assert.equal(current.query("#layout-confirm").hidden, false);
  assert.equal(current.query("#page-tab-" + LAYOUT_PAGE_ID).hidden, false);
  current.query("#layout-confirm").click(); current.query("#composer-edit").click();
  current.choose("frame.builtin.properties"); current.query("#layout-content-toggle").click();
  assert.equal(current.panel("frame.builtin.properties").enabled, true);
  assert.equal(current.query("#page-tab-frame.builtin.properties").hidden, false);
}));

test("legacy surface aliases use the placement id for commands and retain the actual component identity", () => {
  const lifecycle = { mounts: 0, cleanups: 0, visibility: [] }, manifest = notePlugin(lifecycle);
  const extra = { ...manifest, facets: { ui: { ...manifest.facets.ui,
    modules: manifest.facets.ui.modules.map(surface => ({ ...surface, id: "example.public" })),
  } } };
  return withRuntime(current => {
    const panel = current.content.snapshot().panels.find(panel => panel.id === "example.public");
    assert.equal(panel.componentId, "example.notes");
    current.query("#composer-edit").click(); current.choose("example.public");
    const before = current.calls.length; current.query("#layout-content-toggle").click();
    assert.deepEqual(current.calls.slice(before), [[S.enabled, { id: "example.public", enabled: true }]]);
    current.query("#layout-left").click();
    const input = current.query("#notes-input");
    assert.equal(input.parentNode.id, "cell-example.public");
    assert.equal(input.parentNode.dataset.component, "example.notes");
    current.query("#layout-content-right").click();
    assert.equal(current.query("#notes-input"), input); assert.equal(lifecycle.mounts, 1);
  }, { extra });
});

test("partial mount failure and normal disposal both release the layout and content subscriptions", () => withRuntime(current => {
  assert.match(current.query(".component-fault").textContent, /加载失败/);
  assert.deepEqual(current.subscriptions, { workspace: 0, content: 0 });
  assert.ok(current.notices.some(notice => /injected subscribe failure/.test(notice.text)));
}, { wrapContents(read) { return { ...read, subscribe() { throw new Error("injected subscribe failure"); } }; } }));

test("the actual default preview connects the content manager, updates tabs and survives pagehide cleanup", () => withTestDocument(async () => {
  const root = document.createElement("div"); root.id = "app"; document.body.append(root);
  await import("../src/runtime-preview.js?sidebar-content-management-test");
  try {
    const query = selector => root.querySelector(selector), choice = query("#layout-content-choice");
    assert.equal(choice.children.length, 4); query("#composer-edit").click();
    choice.value = "frame.builtin.assistant"; choice.dispatchEvent(new Event("change"));
    query("#layout-content-toggle").click(); assert.equal(query("#page-tab-frame.builtin.assistant").hidden, true);
    assert.match(query("#layout-session").textContent, /已修改 1 项/);
    query("#layout-cancel").click(); assert.equal(query("#page-tab-frame.builtin.assistant").hidden, false);
  } finally { window.dispatchEvent(new Event("pagehide")); }
  assert.equal(root.children.length, 0);
}));
