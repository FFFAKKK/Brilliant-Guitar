import { createCommandRouter } from "./runtime/command-router.js";
import { createShortcutRouter } from "./runtime/shortcut-router.js";
import { createComponentRegistry } from "./runtime/component-registry.js";
import { createComponentHost } from "./runtime/component-host.js";
import { createMenuRegistry } from "./runtime/menu-registry.js";
import { createNotices } from "./runtime/notices.js";
import { createPluginPlatform } from "./runtime/plugin-installer.js";
import { createUiContributionCatalog } from "./runtime/ui-contribution-catalog.js";
import { createSidebarCompositionState } from "./layout/sidebar-composition-state.js";
import { createSidebarPresentation } from "./host/sidebar-presentation.js";
import { bindSidebarCommands } from "./host/sidebar-commands.js";
import { createSidebarContentReadPort } from "./host/sidebar-content-read-port.js";
import { createActionStateReadPort } from "./host/action-state-read-port.js";
import { createWorkspaceMenus, WORKSPACE_MENU_DEFINITIONS } from "./host/workspace-menus.js";
import { createCommandDialogs } from "./host/command-dialogs.js";
import { createBuiltinPages, LAYOUT_PAGE_ID } from "./features/builtin-pages.js";
import { createWorkspaceState } from "./layout/workspace-state.js";
import { createLayoutEditSession } from "./layout/layout-edit-session.js";
import { bindWorkspaceCommands } from "./host/workspace-commands.js";
import { createStageViewport } from "./host/stage-viewport.js";
import { createVisualWorkbench } from "./shell/visual-workbench.js";
import { bindKeyboard } from "./host/keyboard.js";

const shortcuts = createShortcutRouter();
const router = createCommandRouter({ shortcuts });
const registry = createComponentRegistry();
const notices = createNotices();
// Composition binds the page's read port before lazy mount; no second store or dispatcher.
let store, content, actionOwner;
const layout = Object.freeze({ snapshot: () => store.read.snapshot(), subscribe: listener => store.read.subscribe(listener) });
const contents = Object.freeze({ snapshot: () => content.snapshot(), subscribe: listener => content.subscribe(listener) });
const actions = Object.freeze({ snapshot: () => actionOwner.snapshot(), subscribe: listener => actionOwner.subscribe(listener) });
const reservedPanelIds = Object.freeze([LAYOUT_PAGE_ID]);
const builtin = createBuiltinPages(layout, contents, actions);
store = createWorkspaceState({ pageIds: builtin.components.map(item => item.id), layoutPageId: LAYOUT_PAGE_ID, width: innerWidth, height: innerHeight });

// Registration validates permissions before pages mount, so bind commands before platform registration.
let stage, composition, sidebar;
const editSession = createLayoutEditSession({ workspace: store, composition: () => composition, reservedPanelIds });
// These late-bound ports resolve after the fixed plugin session starts, before UI events.
const disposeCommands = bindWorkspaceCommands({ router, store, editSession, stage: { zoom: value => stage.zoom(value) },
  sidebar: { snapshot: () => sidebar.describe(layout.snapshot()) } });
const disposeSidebarCommands = bindSidebarCommands({ router, editSession });
const menus = createMenuRegistry(WORKSPACE_MENU_DEFINITIONS);
const platform = createPluginPlatform({ router, components: registry, menus, onFailure: error => { throw error; } });
platform.register(builtin);
platform.start();
const catalog = createUiContributionCatalog({ platform, components: registry });
composition = createSidebarCompositionState({ contributions: catalog.list() });
content = createSidebarContentReadPort({ catalog, composition: composition.read, changes: editSession.changes, reservedPanelIds });
const layoutDefinition = registry.get(LAYOUT_PAGE_ID);
actionOwner = createActionStateReadPort({ router, commands: layoutDefinition.permissions.commands,
  context: { componentId: layoutDefinition.id, owner: layoutDefinition.owner }, sources: [layout, composition.read] });
// Optional component capability; no new platform plugin or command dispatcher.
let shell;
const dialogs = createCommandDialogs({ router, sources: [layout, composition.read], fallbackFocus: () => shell?.stage });
const components = createComponentHost({ registry, router, notices, dialogs });
sidebar = createSidebarPresentation({ catalog, composition: composition.read, components });
const panels = catalog.list({ kind: "panel", slot: "right" });
// This hint belongs to the existing page presentation, not to the panel/state contract.
const presentationHints = Object.freeze(Object.fromEntries(panels.map(item => [item.id,
  Object.freeze({ footerHeight: registry.get(item.componentId).footerHeight ?? 0 })])));
const menuBinding = createWorkspaceMenus({ router, registry: menus, layout, layoutPageId: LAYOUT_PAGE_ID,
  notify: (text, level) => notices.push({ source: "frame.menu", text, level }) });
shell = createVisualWorkbench({ root: document.getElementById("app"), panels, layout, router, sidebar, presentationHints, menuBinding });
shell.render(layout.snapshot());
const disposeKeyboard = bindKeyboard(router, { root: shell.shell, components, fallback: shell.handleKeyDown,
  onError: error => notices.push({ level: "error", source: "frame.keyboard", text: error?.message ?? String(error) }) });
stage = createStageViewport(shell);
stage.initialize();
let recenter = false;
const unsubscribe = layout.subscribe(state => stage.preserve(() => shell.render(state), { recenter }));
const unsubscribeComposition = composition.read.subscribe(snapshot => stage.preserve(() => shell.render(layout.snapshot(), snapshot)));
const resize = () => {
  recenter = true;
  try { store.setViewport(innerWidth, innerHeight); } finally { recenter = false; }
};
window.addEventListener("resize", resize);
window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  window.removeEventListener("resize", resize);
  unsubscribe();
  unsubscribeComposition();
  disposeKeyboard();
  dialogs.dispose();
  shell.dispose();
  menuBinding.dispose();
  stage.dispose();
  editSession.dispose();
  platform.dispose();
  components.dispose();
  disposeSidebarCommands();
  disposeCommands();
});
