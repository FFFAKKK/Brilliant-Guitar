// Composition root: create runtime services, register host commands, install plugins, mount the shell.
import { createCommandRouter } from "./runtime/command-router.js";
import { createShortcutRouter } from "./runtime/shortcut-router.js";
import { createComponentRegistry } from "./runtime/component-registry.js";
import { createMenuRegistry } from "./runtime/menu-registry.js";
import { createNotices } from "./runtime/notices.js";
import { createComponentHost } from "./runtime/component-host.js";
import { createDocumentIdentity } from "./runtime/document-identity.js";
import { createPluginPlatform } from "./runtime/plugin-installer.js";
import { createUiPluginHost } from "./runtime/ui-plugin-host.js";
import { createLayoutStore } from "./layout/layout-store.js";
import { registerFrameCommands, registerDocumentEntries } from "./host/frame-commands.js";
import { bindKeyboard } from "./host/keyboard.js";
import { createShell } from "./shell/shell.js";
import { placeholderPlugin } from "./fixtures/placeholder-plugin.js";

const MENUS = [
  { id: "file", label: "文件" },
  { id: "edit", label: "编辑" },
  { id: "view", label: "视图" },
  { id: "help", label: "帮助" },
];

const shortcuts = createShortcutRouter();
const router = createCommandRouter({ shortcuts });
const components = createComponentRegistry();
const menus = createMenuRegistry(MENUS);
const notices = createNotices();
const identity = createDocumentIdentity({ title: "未命名乐谱", save: "saved" });
const host = createComponentHost({ registry: components, router, notices });
const uiHost = createUiPluginHost({ components });

const runtime = { router, shortcuts, components, menus, notices, identity, host, uiHost,
  facetHosts: { ui: uiHost }, onFailure: (error) => notices.push({ level: "error", text: error.message }) };
const platform = createPluginPlatform(runtime);

// Plugins install before layout is restored, so saved placements can be validated against real slots.
const plugins = new URLSearchParams(location.search).has("empty") ? [] : [placeholderPlugin];
for (const plugin of plugins) {
  try { platform.register(plugin); } catch (error) { notices.push({ level: "error", text: error.message }); }
}
platform.start();
runtime.platform = platform;

runtime.layout = createLayoutStore({
  components: () => components.list(),
  storage: localStorage,
  onIssues: (issues) => issues.forEach((text) => notices.push({ level: "warning", text })),
});
registerFrameCommands(runtime);
registerDocumentEntries(runtime);
const disposeKeyboard = bindKeyboard(router, { root: document.getElementById("app"), components: host,
  onError: error => notices.push({ level: "error", source: "frame.keyboard", text: error?.message ?? String(error) }) });
window.addEventListener("pagehide", event => { if (!event.persisted) disposeKeyboard(); });
createShell(document.getElementById("app"), runtime);

// Test hook only when explicitly requested; components never reach the runtime this way.
if (new URLSearchParams(location.search).has("debug")) window.__frame = { runtime };
