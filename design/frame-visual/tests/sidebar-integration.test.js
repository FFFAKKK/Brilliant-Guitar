import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createPluginPlatform } from "../src/runtime/plugin-installer.js";
import { createUiContributionCatalog } from "../src/runtime/ui-contribution-catalog.js";
import { defineUiPlugin } from "../src/runtime/ui-plugin-contract.js";
import { captureUiFacet } from "../src/runtime/plugin-facets.js";
import { createSidebarCompositionState } from "../src/layout/sidebar-composition-state.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { createLayoutEditSession } from "../src/layout/layout-edit-session.js";
import { createSidebarPresentation } from "../src/host/sidebar-presentation.js";
import { bindSidebarCommands, SIDEBAR_COMMANDS as S } from "../src/host/sidebar-commands.js";
import { bindWorkspaceCommands, WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { createBuiltinPages, LAYOUT_PAGE_ID } from "../src/features/builtin-pages.js";
import { createVisualWorkbench } from "../src/shell/visual-workbench.js";
import { withTestDocument, serializeDom } from "./support/dom-test-environment.js";
import { omitAcceptedReadingMarkup, normalizeScorePaperContent, normalizeContentEditScope, normalizeCommandBarChrome, omitFrameEdgeHandles, normalizeUnavailableLibraryHint, normalizeUnknownMeasureCount } from "./support/accepted-reading-markup.js";

// Compare the actual pre-migration shell against the new shell with the same DOM
// double. This verifies structure/attributes only, not rendered browser pixels.
const baselineUrl = new URL("../evidence/sidebar-integration/before-source/src/shell/visual-workbench.js", import.meta.url);
const originalUrl = new URL("../src/shell/visual-workbench.js", import.meta.url);
const baselineSource = readFileSync(baselineUrl, "utf8").replace(/from "(\.[^"]+)"/g,
  (_, dependency) => `from "${new URL(dependency, originalUrl).href}"`);
const { createVisualWorkbench: createBaselineWorkbench } = await import("data:text/javascript;base64," + Buffer.from(baselineSource).toString("base64"));

function start({ legacy = false, manifest, initialId = LAYOUT_PAGE_ID, observeAssistant } = {}) {
  const router = createCommandRouter(), registry = createComponentRegistry(), notices = [];
  let store, sidebar, composition;
  const layout = { snapshot: () => store.read.snapshot(), subscribe: listener => store.read.subscribe(listener) };
  const builtin = manifest ?? createBuiltinPages(layout, undefined, undefined, { includeLayout: true });
  if (observeAssistant) {
    const definition = builtin.components.find(item => item.id === "frame.builtin.assistant");
    const mount = definition.mount;
    definition.mount = (element, ctx) => { mount(element, ctx); return observeAssistant(element, ctx); };
  }
  const facet = captureUiFacet(builtin);
  store = createWorkspaceState({ pageIds: [...facet.modules, ...facet.pages].map(item => item.id), layoutPageId: initialId,
    width: innerWidth, height: innerHeight });
  const editSession = createLayoutEditSession({ workspace: store, composition: () => composition });
  const disposeWorkspace = bindWorkspaceCommands({ router, store, editSession, stage: { zoom() { return { ok: true }; } },
    ...(legacy ? {} : { sidebar: { snapshot: () => sidebar.describe(layout.snapshot()) } }) });
  const disposeSidebar = legacy ? () => {} : bindSidebarCommands({ router, editSession });
  const platform = createPluginPlatform({ router, components: registry, menus: createMenuRegistry([]) });
  platform.register(builtin); assert.equal(platform.start()[0].status, "active");
  const catalog = createUiContributionCatalog({ platform, components: registry });
  composition = createSidebarCompositionState({ contributions: catalog.list() });
  const components = createComponentHost({ registry, router, notices: { push: notice => notices.push(notice) } });
  sidebar = createSidebarPresentation({ catalog, composition: composition.read, components });
  const root = document.createElement("div"), panels = catalog.list({ kind: "panel", slot: "right" });
  const presentationHints = Object.fromEntries(panels.map(item => [item.id, { footerHeight: registry.get(item.componentId).footerHeight ?? 0 }]));
  const shell = legacy ? createBaselineWorkbench({ root, pages: builtin.components, layout, router, components })
    : createVisualWorkbench({ root, panels, layout, router, sidebar, presentationHints });
  shell.render(layout.snapshot());
  const stopLayout = layout.subscribe(snapshot => shell.render(snapshot));
  const stopComposition = legacy ? () => {} : composition.read.subscribe(snapshot => shell.render(layout.snapshot(), snapshot));
  return { router, registry, platform, catalog, components, composition, sidebar, store, shell, root, notices, editSession,
    execute: router.execute, query: selector => root.querySelector(selector),
    dispose() { stopComposition(); stopLayout(); shell.dispose(); sidebar.dispose(); editSession.dispose(); platform.dispose(); components.dispose(); disposeSidebar(); disposeWorkspace(); },
  };
}

function customPlugin({ alias = false, lifecycle = {} } = {}) {
  const ui = ["a", "b", "c"].map((name, order) => ({ id: `sample.${name}`, kind: "panel", title: name,
    slots: ["left", "right"], defaultSlot: "right", defaultEnabled: true, order,
    permissions: { commands: [S.move] }, mount(element, ctx) {
      const input = document.createElement("input"); input.id = `input-${name}`; element.append(input);
      lifecycle.mounts = (lifecycle.mounts ?? 0) + 1;
      ctx.onDispose(() => { lifecycle.cleanups = (lifecycle.cleanups ?? 0) + 1; });
      lifecycle.context = ctx;
      return { setVisible: visible => (lifecycle.visibility ??= []).push([name, visible]) };
    },
  }));
  const manifest = defineUiPlugin({ namespace: "sample", ui });
  if (!alias) return manifest;
  return { ...manifest, facets: { ui: { ...manifest.facets.ui,
    modules: manifest.facets.ui.modules.map(item => ({ ...item, id: item.id === "sample.a" ? "sample.public" : item.id })) } } };
}

// Normalize only the explicitly accepted edit-entry, grip policy and abstract region labels.
function unifiedLayoutControls(node, state) {
  const labels = { "声部与音轨": "下侧栏", "声部与音轨内容": "下侧栏", "调整声部面板高度": "调整下侧栏高度",
    "区域显隐与工作区排布": "栏内组件配置" };
  if (typeof node === "string") return labels[node] ?? node;
  if (typeof node !== "object" || !node.children) return node;
  const next = { ...node, attributes: { ...node.attributes }, children: node.children
    .filter(child => typeof child !== "object" || !(child.attributes?.id === "module-edit-trigger" || (child.attributes?.["aria-label"] === "编辑" && child.attributes?.class === "v-text-button ")))
    .map(child => unifiedLayoutControls(child, state)) };
  if (next.attributes.class === "v-grip") {
    const side = next.attributes.id?.replace(/^grip-/, "");
    const open = { left: "leftOpen", right: "rightOpen", top: "topOpen", voice: "voiceOpen" }[side];
    if (!open || state?.[open]) delete next.attributes.disabled;
    else next.attributes.disabled = "";
  }
  for (const key of ["aria-label", "data-tooltip"]) if (labels[next.attributes[key]]) next.attributes[key] = labels[next.attributes[key]];
  return next;
}

test("default shell preserves the captured baseline except accepted layout, reading, command chrome and edge handle revisions at three viewport sizes", async () => {
  for (const [width, height] of [[1024, 720], [1280, 720], [1440, 900]]) await withTestDocument(() => {
    const before = start({ legacy: true }), after = start();
    const same = () => assert.deepEqual(normalizeScorePaperContent(omitAcceptedReadingMarkup(omitFrameEdgeHandles(serializeDom(after.root)))), normalizeUnknownMeasureCount(normalizeUnavailableLibraryHint(normalizeCommandBarChrome(normalizeContentEditScope(normalizeScorePaperContent(omitAcceptedReadingMarkup(unifiedLayoutControls(serializeDom(before.root), after.store.read.snapshot()))))))), `${width}x${height}`);
    same();
    for (const [id, payload] of [[C.page, { id: "frame.builtin.assistant", toggle: false }],
      [C.region, { region: "right" }], [C.region, { region: "right" }], [C.step, { delta: 1 }], [C.begin, {}], [C.finish, { confirm: false }]]) {
      before.execute(id, payload); after.execute(id, payload); same();
    }
    assert.equal(after.query(".v-left-empty").hidden, false);
    assert.deepEqual(after.notices, []);
    before.dispose(); after.dispose();
  }, { width, height });
});

test("layout page and shell allow workspace actions before, during and after component editing", () => withTestDocument(() => {
  const current = start();
  const before = current.store.read.snapshot();
  const input = current.query("#layout-size-left");
  assert.equal(input.disabled, true);
  current.query("#layout-left").dispatchEvent(new Event("click"));
  assert.equal(input.disabled, false);
  input.value = "280"; input.validity = { valid: true };
  input.dispatchEvent(new Event("input"));
  assert.equal(current.store.read.snapshot().leftWidth, 280);
  current.query("#layout-compact").dispatchEvent(new Event("click"));
  assert.equal(current.store.read.snapshot().leftWidth, 280, "choosing a forecast does not resize its own settings carrier");
  current.query("#layout-apply-arrangement").click();
  assert.equal(current.store.read.snapshot().leftWidth, 230);
  assert.equal(current.store.read.snapshot().leftOpen, true);
  const key = new Event("keydown"); Object.defineProperty(key, "key", { value: "ArrowRight" });
  current.query("#grip-left").dispatchEvent(key);
  current.query("#grip-left").dispatchEvent(new Event("dblclick"));
  assert.equal(current.store.read.snapshot().leftWidth, before.leftWidth);
  assert.equal(current.store.read.snapshot().adjusting, false);
  for (const side of ["left", "right", "top", "voice"]) assert.equal(current.query("#grip-" + side).disabled, !current.store.read.snapshot()[side + "Open"]);
  assert.equal(current.query("#module-edit-trigger"), null);
  current.query("#composer-edit").click();
  assert.equal(current.store.read.snapshot().adjusting, true);
  assert.equal(current.query(".v-mode-name").textContent, "内容编辑");
  assert.equal(current.query(".v-mode-detail").textContent, "");
  assert.equal(current.query("#assembly-cancel").getAttribute("aria-label"), "取消内容编辑");
  assert.equal(current.query("#assembly-done").getAttribute("aria-label"), "确认内容编辑");
  assert.equal(input.disabled, false);
  input.value = "300"; input.dispatchEvent(new Event("input"));
  assert.equal(current.store.read.snapshot().leftWidth, 300);
  current.query("#layout-cancel").click();
  assert.equal(current.store.read.snapshot().leftWidth, 300);
  assert.equal(input.disabled, false); assert.equal(current.query("#grip-left").disabled, false);
  current.dispose();
}));

test("real assistant input survives tab switching and sidebar folding with visibility notifications", () => withTestDocument(() => {
  let mounts = 0, disposals = 0; const visibility = [], resources = new Set();
  const current = start({ observeAssistant(element, ctx) {
    mounts++; resources.add(element); ctx.onDispose(() => resources.delete(element));
    return { setVisible: visible => visibility.push(visible), dispose: () => disposals++ };
  } });
  const tab = current.query('[id="page-tab-frame.builtin.assistant"]'); tab.click();
  const first = current.query("#page-input"); first.value = "保留这份输入";
  current.query('[id="page-tab-frame.builtin.tone"]').click();
  tab.click();
  tab.click(); tab.click();
  assert.equal(current.query("#page-input"), first); assert.equal(first.value, "保留这份输入");
  assert.equal(mounts, 1); assert.equal(disposals, 0); assert.equal(resources.size, 1);
  assert.deepEqual(visibility, [false, true, false, true]);
  current.dispose(); current.dispose();
  assert.equal(disposals, 1); assert.equal(resources.size, 0);
}));

test("actual presentation adapter moves the same cell left and back through one authorized command", () => withTestDocument(() => {
  const lifecycle = {}, current = start({ manifest: customPlugin({ lifecycle }), initialId: "sample.a" });
  current.execute(C.begin);
  const first = current.query("#input-a"); first.value = "draft";
  let notifications = 0; current.composition.read.subscribe(() => notifications++);
  const geometry = current.store.read.snapshot();
  current.execute(C.region, { region: "left" });
  const beforeMove = current.store.read.snapshot();
  assert.equal(lifecycle.context.execute(S.move, { id: "sample.a", slot: "left" }).ok, true);
  assert.equal(notifications, 1); assert.equal(current.store.read.snapshot(), beforeMove);
  assert.equal(first.parentNode.parentNode, current.query(".v-modules"));
  assert.equal(first.parentNode.classList.contains("runtime-page-cell"), false);
  assert.equal(current.query(".v-left-empty").hidden, true);
  assert.equal(current.sidebar.describe(beforeMove).activeRight.id, "sample.b");
  current.execute(S.move, { id: "sample.a", slot: "right", index: 0 });
  assert.equal(current.query("#input-a"), first); assert.equal(first.value, "draft");
  assert.equal(first.parentNode.parentNode, current.query(".v-page"));
  assert.equal(first.parentNode.getAttribute("role"), "tabpanel");
  assert.equal(current.query(".v-left-empty").hidden, false);
  for (const key of ["leftWidth", "rightWidth", "topHeight", "voiceHeight"]) assert.equal(current.store.read.snapshot()[key], geometry[key]);
  current.dispose(); assert.equal(lifecycle.cleanups, lifecycle.mounts);
}));

test("disabled panels disappear from navigation, preserve mounted input and support an empty right sidebar", () => withTestDocument(() => {
  const current = start();
  current.execute(C.begin);
  current.execute(C.page, { id: "frame.builtin.assistant", toggle: false });
  const first = current.query("#page-input"); first.value = "saved draft";
  current.execute(S.enabled, { id: "frame.builtin.assistant", enabled: false });
  assert.equal(current.query('[id="page-tab-frame.builtin.assistant"]').hidden, true);
  assert.equal(current.execute(C.page, { id: "frame.builtin.assistant" }).ok, false);
  assert.equal(current.store.read.snapshot().currentPage, "frame.builtin.assistant");
  assert.equal(current.sidebar.describe(current.store.read.snapshot()).activeRight.id, "frame.builtin.properties");
  current.execute(S.enabled, { id: "frame.builtin.assistant", enabled: true });
  assert.equal(current.query("#page-input"), first); assert.equal(first.value, "saved draft");
  for (const item of current.catalog.list({ kind: "panel" })) current.execute(S.enabled, { id: item.id, enabled: false });
  assert.equal(current.sidebar.describe(current.store.read.snapshot()).activeRight, null);
  assert.equal(current.query("#page-next").disabled, true); assert.equal(current.query("#page-previous").disabled, true);
  assert.equal(current.execute(C.step, { delta: 1 }).ok, false);
  assert.equal(current.query(".v-page-navigation").textContent.includes("0 / 0"), true);
  current.execute(S.enabled, { id: "frame.builtin.assistant", enabled: true });
  assert.equal(current.query("#page-input"), first); assert.deepEqual(current.notices, []);
  current.dispose();
}));

test("navigation follows composition order and preserves a closed region without extra publications", () => withTestDocument(() => {
  const current = start({ manifest: customPlugin(), initialId: "sample.a" });
  current.execute(C.begin);
  current.execute(S.reorder, { id: "sample.c", index: 1 });
  assert.deepEqual(current.sidebar.describe(current.store.read.snapshot()).right.map(item => item.id), ["sample.a", "sample.c", "sample.b"]);
  assert.equal(current.query(".v-page-rail").querySelector('[role="tablist"]').getAttribute("aria-label"), "右侧栏页面");
  assert.deepEqual(current.query(".v-page-rail").querySelector('[role="tablist"]').children.map(item => item.id), ["page-tab-sample.a", "page-tab-sample.c", "page-tab-sample.b"]);
  current.execute(C.region, { region: "right" }); let changes = 0;
  current.store.read.subscribe(() => changes++);
  assert.equal(current.execute(C.step, { delta: 1 }).ok, true);
  assert.equal(current.store.read.snapshot().currentPage, "sample.c"); assert.equal(current.store.read.snapshot().rightOpen, false);
  assert.equal(changes, 1); assert.equal(current.components.has("sample.c"), false);
  current.execute(C.region, { region: "right" });
  assert.equal(current.components.has("sample.c"), true);
  current.execute(S.enabled, { id: "sample.c", enabled: false });
  current.execute(C.step, { delta: 1 }); assert.equal(current.store.read.snapshot().currentPage, "sample.b");
  current.dispose();
}));

test("clicking the effective fallback tab folds the region with a single state publication", () => withTestDocument(() => {
  const current = start({ manifest: customPlugin(), initialId: "sample.a" });
  current.execute(C.begin);
  current.execute(S.enabled, { id: "sample.a", enabled: false });
  assert.equal(current.sidebar.describe(current.store.read.snapshot()).activeRight.id, "sample.b");
  let changes = 0; current.store.read.subscribe(() => changes++);
  current.query("#page-tab-sample.b").click();
  assert.equal(current.store.read.snapshot().currentPage, "sample.b");
  assert.equal(current.store.read.snapshot().rightOpen, false); assert.equal(changes, 1);
  current.query("#page-tab-sample.b").click(); assert.equal(current.store.read.snapshot().rightOpen, true);
  current.dispose();
}));

test("left presentation follows runtime order while preserving every mounted input", () => withTestDocument(() => {
  const current = start({ manifest: customPlugin(), initialId: "sample.a" });
  current.execute(C.begin);
  current.execute(C.region, { region: "left" });
  const first = current.query("#input-a"); first.value = "left draft";
  for (const name of ["a", "b", "c"]) current.execute(S.move, { id: `sample.${name}`, slot: "left" });
  current.execute(S.reorder, { id: "sample.c", index: 0 });
  assert.deepEqual(current.query(".v-modules").children.filter(item => item.classList.contains("component-cell")).map(item => item.dataset.component),
    ["sample.c", "sample.a", "sample.b"]);
  assert.equal(current.query("#input-a"), first); assert.equal(first.value, "left draft");
  current.dispose();
}));

test("component host final disposal releases all live cells with the optional identity guard", () => withTestDocument(() => {
  const registry = createComponentRegistry(), events = [];
  for (const name of ["a", "b"]) registry.register("sample", { id: `sample.${name}`, title: name, role: "tool", slots: ["left"],
    mount(element, ctx) { ctx.onDispose(() => events.push(name)); } });
  const host = createComponentHost({ registry, router: createCommandRouter(), notices: { push() {} } });
  host.ensure("sample.a", "panel"); host.ensure("sample.b", "panel"); host.dispose(); host.dispose();
  assert.deepEqual(host.mounted(), []); assert.deepEqual(events, ["b", "a"]);
}));

test("surface alias drives tab identity while mounting only the implementation component", () => withTestDocument(() => {
  const current = start({ manifest: customPlugin({ alias: true }), initialId: "sample.public" });
  const cell = current.query("#cell-sample.public");
  assert.equal(cell.dataset.component, "sample.a"); assert.equal(current.components.has("sample.public"), false);
  assert.equal(current.components.has("sample.a"), true);
  current.execute(C.page, { id: "sample.b", toggle: false }); current.execute(C.page, { id: "sample.public", toggle: false });
  assert.equal(current.query("#cell-sample.public"), cell);
  current.dispose();
}));

test("invalid sidebar commands preserve state and binding failure rolls back earlier registrations", () => withTestDocument(() => {
  const current = start(), before = current.composition.read.snapshot(); let publications = 0;
  current.execute(C.begin);
  current.composition.read.subscribe(() => publications++);
  for (const [id, payload] of [[S.move, null], [S.move, []], [S.move, { id: "frame.builtin.assistant", slot: "left" }],
    [S.enabled, { id: "frame.builtin.assistant", enabled: "false" }], [S.reorder, { id: "frame.builtin.assistant", index: 99 }],
    [S.move, { id: "frame.builtin.assistant", slot: "right", unexpected: true }]]) {
    assert.equal(current.execute(id, payload).ok, false); assert.equal(current.composition.read.snapshot(), before);
  }
  assert.equal(publications, 0); current.dispose();
  for (const id of Object.values(S)) assert.equal(current.execute(id).code, "command.missing");
  const router = createCommandRouter(); router.register("foreign", { id: S.enabled, run() {} });
  assert.throws(() => bindSidebarCommands({ router, editSession: current.editSession }), /already owned/);
  assert.equal(router.describe(S.move), null); assert.equal(router.describe(S.enabled).owner, "foreign");
}));

test("presentation teardown preserves unrelated components and replacement instances", () => withTestDocument(() => {
  const current = start({ manifest: customPlugin(), initialId: "sample.a" });
  const stale = current.query("#cell-sample.a");
  current.components.release("sample.a");
  const replacement = current.components.ensure("sample.a", "external");
  current.registry.register("external", { id: "external.view", role: "view", title: "独立视图", slots: ["stage"], mount() {} });
  current.components.ensure("external.view", "stage");
  current.sidebar.dispose();
  assert.equal(current.components.has("sample.a", replacement), true);
  assert.equal(current.components.has("sample.a", stale), false);
  assert.equal(current.components.has("external.view"), true);
  assert.throws(() => current.sidebar.render(current.sidebar.describe(current.store.read.snapshot()), {}), /已释放/);
  current.dispose();
}));

test("ownership loss removes content from presentation without mounting a foreign owner", () => withTestDocument(() => {
  const current = start({ manifest: customPlugin(), initialId: "sample.a" });
  current.platform.dispose();
  let foreignMounts = 0;
  current.registry.register("foreign", { id: "sample.a", role: "tool", title: "其他所有者", slots: ["left"], mount() { foreignMounts++; } });
  current.shell.render(current.store.read.snapshot());
  assert.equal(current.sidebar.describe(current.store.read.snapshot()).right.length, 0);
  assert.equal(foreignMounts, 0); current.dispose();
}));
