import { createStartupTestShell } from "./plugin-startup-fixtures.js";

// Behavioral DOM only. Pixel layout and native window qualification are separate.
export function createStartupCenterTestShell(document, { product = false } = {}) {
  const root = document.createElement("main"); root.id = "launch-root"; document.body.append(root);
  const nav = document.createElement("nav"); nav.setAttribute("role", "tablist"); root.append(nav);
  for (const id of ["recent", "plugins", "settings"]) {
    const tab = document.createElement("button"); tab.id = "launch-tab-" + id;
    tab.setAttribute("data-launch-page", id); nav.append(tab);
    const panel = document.createElement("section"); panel.id = "launch-" + id; root.append(panel);
  }
  for (const [id, tag] of [["file-list", "div"], ["search", "input"], ["empty", "p"],
    ["score-card", "div"], ["preview-title", "strong"], ["preview-meta", "span"],
    ["open-selected", "button"], ["status", "span"], ["density", "select"],
    ["font-size", "select"], ["new", "button"], ["open", "button"],
    ...(product ? ["continue", "retry", "refresh", "remove", "appearance-status"].map(id => [id, "button"]) : [])]) {
    const value = document.createElement(tag); value.id = "launch-" + id; root.append(value);
  }
  const plugin = createStartupTestShell(document); plugin.root.id = "startup-root";
  root.querySelector("#launch-plugins").append(plugin.root);
  if (!product) plugin.workspaceRoot.remove();
  return { root, workspaceRoot: plugin.workspaceRoot, node: id => root.querySelector("#" + id) };
}
