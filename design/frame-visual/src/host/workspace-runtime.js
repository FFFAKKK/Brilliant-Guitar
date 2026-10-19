import { createCommandRouter } from "../runtime/command-router.js";
import { createShortcutRouter } from "../runtime/shortcut-router.js";
import { createComponentRegistry } from "../runtime/component-registry.js";
import { createComponentHost } from "../runtime/component-host.js";
import { createMenuRegistry } from "../runtime/menu-registry.js";
import { createNotices } from "../runtime/notices.js";
import { createPluginPlatform } from "../runtime/plugin-installer.js";
import { capturePluginFacets, UI_SLOTS } from "../runtime/plugin-facets.js";
import { createUiContributionCatalog, contributionKind } from "../runtime/ui-contribution-catalog.js";
import { captureConfig, createDisposalScope, rollback } from "../runtime/runtime-support.js";
import { createSidebarCompositionState } from "../layout/sidebar-composition-state.js";
import { createSidebarPresentation } from "./sidebar-presentation.js";
import { createHorizontalSlotPresentation } from "./horizontal-slot-presentation.js";
import { bindSidebarCommands } from "./sidebar-commands.js";
import { createSidebarContentReadPort } from "./sidebar-content-read-port.js";
import { createActionStateReadPort } from "./action-state-read-port.js";
import { createWorkspaceMenus, WORKSPACE_MENU_DEFINITIONS } from "./workspace-menus.js";
import { createCommandDialogs } from "./command-dialogs.js";
import { createBuiltinPages } from "../features/builtin-pages.js";
import { createWorkspaceLayoutPlugin, LAYOUT_PAGE_ID } from "../features/workspace-layout-plugin.js";
import { createPluginDiagnosticsPlugin, PLUGIN_DIAGNOSTICS_PAGE_ID } from "../features/plugin-diagnostics-plugin.js";
import { createPluginStatusReadPort } from "../runtime/plugin-status-read-port.js";
import { createWorkspaceState } from "../layout/workspace-state.js";
import { createLayoutEditSession } from "../layout/layout-edit-session.js";
import { bindWorkspaceCommands } from "./workspace-commands.js";
import { createStageViewport } from "./stage-viewport.js";
import { createWorkspaceViewState } from "./workspace-view-state.js";
import { createVisualWorkbench } from "../shell/visual-workbench.js";
import { bindKeyboard } from "./keyboard.js";
import { createWorkspaceAnimations } from "./workspace-animations.js";

const activeRoots = new WeakSet();

// Declared surface ids also support legacy aliases. Views and horizontal items
// are not sidebar pages; actual placement remains owned by the composition state.
function declaredPageIds(manifests) {
  return manifests.flatMap(manifest => {
    if (manifest.apiVersion === "4.0") return (manifest.ui?.components ?? [])
      .filter(unit => unit.slots.includes("right") && contributionKind(unit) === "panel").map(unit => unit.id);
    const facet = capturePluginFacets(manifest).ui;
    const definitions = new Map((manifest.components ?? []).map(item => [item.id, item]));
    return [...facet.modules, ...facet.pages].filter(item => item.slots.includes("right")
      && contributionKind(definitions.get(item.componentId)) === "panel").map(item => item.id);
  });
}

/** Fixed-session UI composition root. Importing this module acquires no DOM resources. */
export function createWorkspaceRuntime({ root, plugins = [], requiredViewSlots = [], enablePluginDiagnostics = false, pluginWiring = null,
  animationProvider = undefined, animationPolicy = {}, enableAnimations = pluginWiring !== null, commandStateSources = [], documentRead = null } = {}) {
  if (!root || typeof root.append !== "function" || !root.isConnected
    || root.ownerDocument !== globalThis.document || root.ownerDocument.defaultView !== globalThis.window) {
    throw new TypeError("UI 运行入口需要当前浏览器 document 中已连接的 root");
  }
  if (!Array.isArray(plugins)) throw new TypeError("plugins 必须是固定启动声明数组");
  if (typeof enablePluginDiagnostics !== "boolean") throw new TypeError("enablePluginDiagnostics 必须是布尔值");
  if (!Array.isArray(commandStateSources) || commandStateSources.some(source => typeof source?.subscribe !== "function")) throw new TypeError("commandStateSources 必须提供只读订阅");
  if (documentRead && (typeof documentRead.snapshot !== "function" || typeof documentRead.subscribe !== "function")) throw new TypeError("documentRead 必须提供只读端口");
  if (typeof enableAnimations !== "boolean") throw new TypeError("enableAnimations 必须是布尔值");
  if (!Array.isArray(requiredViewSlots) || requiredViewSlots.some(slot => typeof slot !== "string" || !slot.trim())) {
    throw new TypeError("requiredViewSlots 必须是字符串数组");
  }
  if (new Set(requiredViewSlots).size !== requiredViewSlots.length) {
    throw new TypeError("requiredViewSlots 不能包含重复槽位");
  }
  if (requiredViewSlots.some(slot => !UI_SLOTS.includes(slot))) {
    throw new TypeError("requiredViewSlots 包含未知 UI 槽位");
  }
  if (activeRoots.has(root)) throw new Error("此 root 已有活跃的 UI 运行实例");

  const resources = createDisposalScope(), bindings = createDisposalScope(), lifetime = createDisposalScope();
  let disposed = false;
  lifetime.add(() => resources.dispose());
  lifetime.add(() => bindings.dispose());
  lifetime.add(() => { disposed = true; });
  activeRoots.add(root);
  resources.add(() => activeRoots.delete(root));
  try {
    const shortcuts = createShortcutRouter();
    const router = createCommandRouter({ shortcuts });
    for (const source of commandStateSources) bindings.add(source.subscribe(() => router.refresh()));
    const registry = createComponentRegistry();
    const notices = createNotices();
    // Bind these read-only ports before lazy mount; there is one owner of each state.
    let store, content, actionOwner, viewState;
    const layout = Object.freeze({ snapshot: () => store.read.snapshot(), subscribe: listener => store.read.subscribe(listener) });
    const contents = Object.freeze({ snapshot: () => content.snapshot(), subscribe: listener => content.subscribe(listener) });
    const actions = Object.freeze({ snapshot: () => actionOwner.snapshot(), subscribe: listener => actionOwner.subscribe(listener) });
    const reservedPanelIds = Object.freeze([LAYOUT_PAGE_ID]);
    const builtin = createBuiltinPages(layout, contents, actions, { includeLayout: false });
    viewState = createWorkspaceViewState();
    resources.add(() => viewState.dispose());
    const view = Object.freeze({ snapshot: () => viewState.read.snapshot(), subscribe: listener => viewState.read.subscribe(listener) });
    const layoutPlugin = createWorkspaceLayoutPlugin(layout, contents, actions, { view });
    const prepare = pluginWiring?.prepare ?? (plugin => captureConfig(plugin, "plugin"));
    const externalManifests = plugins.map(plugin => prepare(plugin));
    const baseManifests = [prepare(builtin), prepare(layoutPlugin), ...externalManifests];
    store = createWorkspaceState({ pageIds: [...declaredPageIds(baseManifests), ...(enablePluginDiagnostics ? [PLUGIN_DIAGNOSTICS_PAGE_ID] : [])],
      layoutPageId: LAYOUT_PAGE_ID, width: innerWidth, height: innerHeight });

    let stage, composition, sidebar, shell;
    const editSession = createLayoutEditSession({ workspace: store, composition: () => composition, reservedPanelIds });
    resources.add(() => {
      const result = editSession.dispose();
      if (!result.ok) throw new Error(`布局编辑会话释放失败：${result.code}`);
    });
    resources.add(bindWorkspaceCommands({ router, store, editSession, stage: { zoom: value => stage.zoom(value), zoomBy: delta => stage.zoomBy(delta), fit: mode => stage.fit(mode) },
      sidebar: { snapshot: () => sidebar.describe(layout.snapshot()) } }));
    resources.add(bindSidebarCommands({ router, editSession }));
    const menus = createMenuRegistry(WORKSPACE_MENU_DEFINITIONS);
    const platform = (pluginWiring?.create ?? createPluginPlatform)({ router, components: registry, menus });
    resources.add(() => platform.dispose());
    const pluginStatuses = enablePluginDiagnostics ? createPluginStatusReadPort(platform) : null;
    const diagnosticsPlugin = pluginStatuses ? createPluginDiagnosticsPlugin(pluginStatuses) : null;
    const manifests = [...baseManifests.slice(0, 2), ...(diagnosticsPlugin ? [prepare(diagnosticsPlugin)] : []), ...externalManifests];
    for (const manifest of manifests) platform.register(manifest);
    pluginWiring?.configure?.(platform, manifests);
    // Platform isolates installation errors. The application requires the entire
    // fixed startup set, so inspect the result rather than relying on onFailure.
    platform.start();
    const failures = platform.list().filter(record => record.status === "failed");
    if (failures.length) throw new AggregateError(failures.map(record => record.error),
      `UI 插件启动失败：${failures.map(record => record.manifest?.id ?? record.namespace).join(", ")}`);
    const catalog = createUiContributionCatalog({ platform, components: registry });
    composition = createSidebarCompositionState({ contributions: catalog.list() });
    content = createSidebarContentReadPort({ catalog, composition: composition.read, changes: editSession.changes, reservedPanelIds });
    const layoutDefinition = registry.get(LAYOUT_PAGE_ID);
    actionOwner = createActionStateReadPort({ router, commands: layoutDefinition.permissions.commands,
      context: { componentId: layoutDefinition.id, owner: layoutDefinition.owner }, sources: [layout, composition.read] });
    const dialogs = createCommandDialogs({ router, sources: [layout, composition.read], fallbackFocus: () => shell?.stage });
    bindings.add(() => dialogs.dispose());
    const animations = enableAnimations ? createWorkspaceAnimations({ root, notices, provider: animationProvider, policy: animationPolicy ?? {} }) : null;
    if (animations) resources.add(() => animations.dispose());
    const components = createComponentHost({ registry, router, notices, dialogs, animationService: animations?.service });
    resources.add(() => components.dispose());
    sidebar = createSidebarPresentation({ catalog, composition: composition.read, components });
    resources.add(() => sidebar.dispose());
    const horizontal = createHorizontalSlotPresentation({ catalog, components });
    resources.add(() => horizontal.dispose());
    const stageViews = catalog.list({ kind: "view", slot: "stage" });
    if (stageViews.length > 1) throw new Error("中央工作区需要且只能有一个核心谱面 view");
    for (const slot of requiredViewSlots) {
      const views = catalog.list({ kind: "view", slot });
      if (views.length !== 1) {
        throw new Error(`应用要求槽位 ${slot} 恰好注册一个 view，当前为 ${views.length} 个`);
      }
    }
    const scoreView = stageViews.length ? components.ensure(stageViews[0].componentId, "stage") : null;
    if (scoreView) resources.add(() => components.release(stageViews[0].componentId, scoreView));
    const panels = catalog.list({ kind: "panel", slot: "right" });
    const presentationHints = Object.freeze(Object.fromEntries(panels.map(item => [item.id,
      Object.freeze({ footerHeight: registry.get(item.componentId).footerHeight ?? 0 })])));
    const menuBinding = createWorkspaceMenus({ router, registry: menus, layout, layoutPageId: LAYOUT_PAGE_ID,
      ...(enablePluginDiagnostics ? { pluginPageId: PLUGIN_DIAGNOSTICS_PAGE_ID } : {}),
      notify: (text, level) => notices.push({ source: "frame.menu", text, level }) });
    resources.add(() => menuBinding.dispose());
    shell = createVisualWorkbench({ root, panels, scoreView, layout, view, router, sidebar, horizontal, presentationHints, menuBinding, documentRead,
      animationService: animations?.service,
      onGeometrySettled: settle => {
        if (!disposed && stage) stage.preserve(() => { settle?.(); shell.settleGeometry(layout.snapshot()); });
      } });
    resources.add(() => shell.dispose());
    shell.render(layout.snapshot());
    bindings.add(bindKeyboard(router, { root: shell.shell, components, fallback: shell.handleKeyDown,
      onError: error => notices.push({ level: "error", source: "frame.keyboard", text: error?.message ?? String(error) }) }));
    stage = createStageViewport({ ...shell, view: viewState, execute: (id, payload) => router.execute(id, payload) });
    resources.add(() => stage.dispose());
    stage.initialize();
    let recenter = false;
    bindings.add(layout.subscribe(state => stage.preserve(() => shell.render(state), { recenter })));
    bindings.add(composition.read.subscribe(snapshot => stage.preserve(() => shell.render(layout.snapshot(), snapshot))));
    const resize = () => {
      recenter = true;
      try { store.setViewport(innerWidth, innerHeight); } finally { recenter = false; }
    };
    const pagehide = event => { if (!event.persisted) lifetime.dispose(); };
    window.addEventListener("resize", resize);
    bindings.add(() => window.removeEventListener("resize", resize));
    window.addEventListener("pagehide", pagehide);
    bindings.add(() => window.removeEventListener("pagehide", pagehide));

    // This is the trusted application entry, not a component capability. All
    // components still mount through the original narrowed ctx from ComponentHost.
    const workspace = Object.freeze({ snapshot: layout.snapshot, subscribe(listener) {
      if (disposed) throw new Error("UI 运行实例已释放");
      if (typeof listener !== "function") throw new TypeError("工作区订阅者必须是函数");
      let active = true;
      const stop = layout.subscribe(state => { if (active && !disposed) return listener(state); });
      return bindings.add(() => { active = false; stop(); });
    } });
    return Object.freeze({ execute: (id, payload) => disposed ? { ok: false, code: "runtime.disposed" } : router.execute(id, payload),
      workspace, ...(animations ? { motion: animations.controls } : {}), ...(pluginWiring ? { plugins: Object.freeze({ snapshot: () => platform.list(), subscribe: platform.subscribe }) } : {}),
      dispose: () => lifetime.dispose() });
  } catch (error) { rollback(lifetime, error); }
}
