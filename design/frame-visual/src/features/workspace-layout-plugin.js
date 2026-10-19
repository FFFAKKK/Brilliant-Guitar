import { defineUiPlugin } from "../runtime/ui-plugin-contract.js";
import { mountWorkspaceLayout } from "./workspace-layout-page.js";
import { WORKSPACE_COMMANDS as C, SIDEBAR_COMMANDS as S, captureLayoutReadPorts } from "../contracts/workspace-layout.js";
import { LAYOUT_PREVIEW_SHAPE, WORKSPACE_LAYOUT_ANIMATIONS, LAYOUT_TOGGLE_EMPHASIS } from "./workspace-layout-motion-recipes.js";

export const LAYOUT_PLUGIN_NAMESPACE = "frame.layout";
export const LAYOUT_PAGE_ID = `${LAYOUT_PLUGIN_NAMESPACE}.page`;

/**
 * Trusted application authoring input for the reserved workspace layout page.
 * The composition root supplies the common 4.0 identity before registration.
 * The factory receives narrowed read ports; it never receives the workspace
 * store, the full router, another plugin instance, or private DOM.
 *
 * namespace/pageId overrides exist only for the legacy composite fixture in
 * builtin-pages.js. The application runtime uses the defaults above.
 */
export function createWorkspaceLayoutPlugin(layout, contents, actions,
  { namespace = LAYOUT_PLUGIN_NAMESPACE, pageId = LAYOUT_PAGE_ID, view,
    animations = { contractVersion: 1, definitions: { "shape-transition": LAYOUT_PREVIEW_SHAPE,
      "selection-transition": WORKSPACE_LAYOUT_ANIMATIONS["selection-transition"],
      "content-transition": LAYOUT_TOGGLE_EMPHASIS } } } = {}) {
  ({ layout, contents, actions, view } = captureLayoutReadPorts({ layout, contents, actions, view }));
  return defineUiPlugin({
    namespace,
    ui: [{
      id: pageId,
      kind: "page",
      title: "工作区布局",
      icon: "layout",
      order: 3,
      slots: ["right"],
      footerHeight: 0,
      animations,
      permissions: { animations: ["shape-transition", "selection-transition", "content-transition"], commands: [
        C.region, C.resize, C.arrange, C.begin, C.finish,
        ...(view ? [C.zoom, C.fit] : []),
        ...(contents ? Object.values(S) : []),
      ] },
      mount: (element, ctx) => mountWorkspaceLayout(element, ctx, layout, contents, actions, view),
    }],
  });
}
