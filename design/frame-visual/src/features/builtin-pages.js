import { h } from "../shell/dom.js";
import { createWorkspaceLayoutPlugin } from "./workspace-layout-plugin.js";

// Kept for old visual fixtures and tests. The application runtime uses the
// independently registered frame.layout plugin and its new page id.
export const LAYOUT_PAGE_ID = "frame.builtin.layout";
export const LEGACY_LAYOUT_PAGE_ID = LAYOUT_PAGE_ID;

// The legacy fixture is an author-level declaration. Keep it mutable until the
// plugin platform captures it, because visual tests and compatibility callers
// still decorate page definitions before registration. The live platform owns
// the immutable copy produced by captureConfig.
function mutableComponent(definition) {
  return {
    ...definition,
    slots: [...definition.slots],
    ...(definition.permissions ? {
      permissions: {
        ...definition.permissions,
        ...(definition.permissions.commands ? { commands: [...definition.permissions.commands] } : {}),
      },
    } : {}),
  };
}

export function createBuiltinPages(layout, contents, actions, { includeLayout = true } = {}) {
  const empty = (element) => { element.append(h("div", { class: "v-page-content" })); };
  const components = [
    { id: "frame.builtin.properties", title: "谱面属性", icon: "page", order: 0, footerHeight: 0, mount: empty },
    { id: "frame.builtin.assistant", title: "AI 助手", icon: "chat", order: 1, footerHeight: 64,
      mount(element) {
        element.append(h("div", { class: "v-page-content", "aria-label": "AI 助手内容" }),
          h("div", { class: "v-page-bottom" }, h("input", { id: "page-input", "aria-label": "页面输入占位", placeholder: "输入…" })));
      } },
    { id: "frame.builtin.tone", title: "音色", icon: "tone", order: 2, footerHeight: 0, mount: empty },
  ].map(definition => mutableComponent({ role: "inspector", slots: ["right"], ...definition }));
  const builtin = { namespace: "frame.builtin", components, facets: { ui: {
    contractVersion: 1, modules: [], slots: ["right"],
    pages: components.map(({ id, slots }) => ({ id, componentId: id, slots })),
  } } };
  if (!includeLayout) return builtin;

  // Compatibility composite used by older visual fixtures. The real runtime
  // registers this page as frame.layout through createWorkspaceLayoutPlugin.
  const legacyLayout = createWorkspaceLayoutPlugin(layout, contents, actions,
    { namespace: "frame.builtin", pageId: LEGACY_LAYOUT_PAGE_ID });
  return {
    namespace: builtin.namespace,
    components: [...builtin.components, ...legacyLayout.components.map(mutableComponent)],
    facets: { ui: {
      contractVersion: 1,
      modules: [],
      slots: ["right"],
      pages: [...builtin.facets.ui.pages, ...legacyLayout.facets.ui.pages],
    } },
  };
}
