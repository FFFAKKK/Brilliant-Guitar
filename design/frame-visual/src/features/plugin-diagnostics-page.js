import { h } from "../shell/dom.js";
import { createDisposalScope } from "../runtime/runtime-support.js";

export const PLUGIN_DIAGNOSTICS_PAGE_ID = "frame.plugins.diagnostics";

export function mountPluginDiagnosticsPage(element, ctx, statuses) {
  const scope = createDisposalScope();
  const shell = h("div", { class: "plugin-manager", "aria-label": "插件管理" });
  const toolbar = h("div", { class: "plugin-manager-toolbar" });
  const search = h("input", { class: "plugin-manager-search", type: "search", placeholder: "搜索插件", "aria-label": "搜索插件" });
  const filter = h("select", { class: "plugin-manager-filter", "aria-label": "筛选插件状态" },
    h("option", { value: "all" }, "全部"), h("option", { value: "active" }, "运行中"),
    h("option", { value: "failed" }, "失败"), h("option", { value: "discovered" }, "已登记"),
    h("option", { value: "installed" }, "未启用"));
  // Keep the authoring and DOM-test paths on the same explicit initial state.
  // Native selects default to their first option, while the lightweight test
  // DOM does not infer that value from child options.
  filter.value = "all";
  toolbar.append(search, filter);
  const body = h("div", { class: "plugin-manager-body" });
  const list = h("div", { class: "plugin-manager-list", role: "list", "aria-label": "插件列表" });
  const detail = h("section", { class: "plugin-manager-detail", "aria-live": "polite" });
  body.append(list, detail);
  shell.append(toolbar, body);
  const render = snapshot => {
    list.replaceChildren();
    const query = search.value.trim().toLowerCase();
    const visible = snapshot.filter(record => (filter.value === "all" || record.status === filter.value)
      && (!query || record.namespace.toLowerCase().includes(query)));
    const selected = visible.find(record => record.namespace === detail.dataset.plugin) ?? visible[0];
    if (selected) detail.dataset.plugin = selected.namespace;
    else delete detail.dataset.plugin;
    for (const record of visible) {
      const state = record.active ? "正常" : record.status === "failed" ? "失败" : record.status === "installed" ? "未启用" : "已登记";
      const details = record.manifest
        ? `${record.manifest.components.length} 界面 · ${record.manifest.commands.length} 命令`
        : "";
      const item = h("button", { class: "plugin-status-row", type: "button", role: "listitem", "data-status": record.status,
        "data-selected": record === selected ? "true" : "false" },
        h("span", { class: "plugin-status-icon", "aria-hidden": "true" }),
        h("div", { class: "plugin-status-main" },
          h("strong", { class: "plugin-status-name", title: record.namespace }, record.namespace),
          h("span", { class: "plugin-status-meta" }, details)),
        h("span", { class: "plugin-status-state", "aria-label": state, title: state }, state));
      item.addEventListener("click", () => { detail.dataset.plugin = record.namespace; render(snapshot); });
      list.append(item);
    }
    if (!visible.length) list.append(h("p", { class: "plugin-status-empty" }, "没有匹配的插件"));
    const current = selected;
    detail.replaceChildren();
    if (!current) detail.append(h("p", { class: "plugin-status-empty" }, "选择一个插件查看详情"));
    else {
      const state = current.active ? "正常运行" : current.status === "failed" ? "启动失败" : "等待启动";
      detail.append(h("div", { class: "plugin-manager-detail-head" },
        h("span", { class: "plugin-status-icon", "aria-hidden": "true" }),
        h("div", {}, h("strong", {}, current.namespace), h("span", { class: "plugin-manager-detail-state" }, state))));
      if (current.manifest) {
        const sections = [
          ["界面贡献", current.manifest.components.map(item => `${item.title} · ${item.kind ?? item.role}`).join("\n")],
          ["命令", current.manifest.commands.map(item => item.label).join("\n")],
          ["菜单", current.manifest.menuItems.map(item => item.label).join("\n")],
          ["快捷键", current.manifest.shortcuts.map(item => `${item.id} · ${item.keys.join(" / ")}`).join("\n")],
        ];
        for (const [title, value] of sections) detail.append(h("div", { class: "plugin-manager-detail-section" },
          h("span", {}, title), h("p", {}, value || "无")));
      }
      if (current.error) detail.append(h("p", { class: "plugin-status-error" }, current.error));
      detail.append(h("p", { class: "plugin-manager-restart-note" }, "插件集合在当前会话中保持冻结；启用、停用或更新将在下次启动时生效。"));
    }
  };
  const refresh = () => render(statuses.snapshot());
  search.addEventListener("input", refresh);
  filter.addEventListener("change", refresh);
  render(statuses.snapshot());
  scope.add(statuses.subscribe(render));
  scope.add(() => search.removeEventListener("input", refresh));
  scope.add(() => filter.removeEventListener("change", refresh));
  element.append(h("div", { class: "v-page-content", "aria-label": "插件管理内容" }, shell));
  ctx.onDispose?.(() => scope.dispose());
  return { dispose: () => scope.dispose() };
}
