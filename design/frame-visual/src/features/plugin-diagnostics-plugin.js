import { defineUiPlugin } from "../runtime/ui-plugin-contract.js";
import { PLUGIN_DIAGNOSTICS_PAGE_ID, mountPluginDiagnosticsPage } from "./plugin-diagnostics-page.js";

export { PLUGIN_DIAGNOSTICS_PAGE_ID };

export function createPluginDiagnosticsPlugin(statuses) {
  return defineUiPlugin({
    namespace: "frame.plugins",
    ui: [{ id: PLUGIN_DIAGNOSTICS_PAGE_ID, kind: "page", title: "插件状态", icon: "settings", order: 20,
      slots: ["right"], footerHeight: 0, permissions: { commands: [] },
      mount: (element, ctx) => mountPluginDiagnosticsPage(element, ctx, statuses) }],
    commands: [], menuItems: [], shortcuts: [],
  });
}
