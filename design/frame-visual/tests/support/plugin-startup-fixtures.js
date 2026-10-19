/** Minimal static shell, shared by sync and async integration tests; no browser geometry. */
export function createStartupTestShell(document) {
  const root = document.createElement("main"); document.body.append(root);
  for (const [id, tag] of [["startup-list", "section"], ["startup-detail", "aside"], ["startup-search", "input"],
    ["startup-filter", "select"], ["startup-feedback", "span"], ["startup-apply", "button"], ["startup-discard", "button"],
    ["startup-retry", "button"], ["startup-open", "button"]]) {
    const node = document.createElement(tag); node.id = id; root.append(node);
  }
  root.querySelector("#startup-filter").value = "all";
  const workspaceRoot = document.createElement("div"); workspaceRoot.id = "app"; workspaceRoot.hidden = true; document.body.append(workspaceRoot);
  return { root, workspaceRoot };
}
