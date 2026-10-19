import { icon as renderIconSvg } from "../fixtures/preview-icons.js";
import { notifyObservers } from "../runtime/runtime-support.js";

const mounted = new WeakSet();
/** Uses the accepted static shell; receives neither storage nor platform capabilities. */
export function mountPluginStartupView({ root, controller, selectedId = null, onStart = null, canResume = () => false, onStateChange = null }) {
  if (mounted.has(root)) throw new Error("启动管理页已挂载");
  const document = root.ownerDocument;
  let active = true, launching = false, operationIssue = "";
  const plugins = controller.directory;
  let selected = plugins.some(item => item.id === selectedId) ? selectedId : plugins[0]?.id;
  let state, draft, invalid;
  function syncState() {
    state = controller.snapshot(); draft = state.draft.plugins;
    invalid = new Map(Object.entries(state.invalid));
  }
  syncState();
  const rows = new Map(), groups = [], cleanups = [], detailCleanups = [];
  const node = id => root.querySelector("#" + id);
  const list = node("startup-list"), detail = node("startup-detail");
  const search = node("startup-search"), filter = node("startup-filter");
  const feedback = node("startup-feedback"), save = node("startup-apply"), discard = node("startup-discard");
  const retry = node("startup-retry"), start = node("startup-open");
  if (![list, detail, search, filter, feedback, save, discard].every(Boolean)) throw new Error("启动管理页缺少必要控件");
  mounted.add(root);
  function listen(target, event, callback, scope = cleanups) {
    target.addEventListener(event, callback); scope.push(() => target.removeEventListener(event, callback));
  }
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    node.setAttribute("data-frame-ui", "");
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    node.append(...children);
    return node;
  }
  function icon(name, size = 16) {
    const span = el("span", { class: "startup-icon", "aria-hidden": "true" });
    // The only HTML consumed here is generated, bundled SVG, never plugin text.
    span.innerHTML = renderIconSvg(name, size);
    return span;
  }
  root.querySelectorAll("[data-preview-icon]").forEach(node => node.replaceWith(icon(node.dataset.previewIcon)));
  const empty = el("p", { class: "startup-empty", hidden: "" }, "没有匹配的插件");
  const changed = plugin => state.dirtyIds.includes(plugin.id);

  function updateFooter() {
    const count = plugins.filter(changed).length, dirty = count > 0;
    feedback.dataset.dirty = String(dirty);
    feedback.textContent = launching ? "正在启动…" : state.phase === "loading" ? "正在读取配置…" : state.phase === "saving" ? "正在保存…" : state.issue || operationIssue || (dirty ? count + " 项修改 · 下次启动生效"
      : state.saved ? "已保存 · 下次启动生效" : "启停在下次启动生效");
    feedback.dataset.error = String(!!(state.issue || operationIssue));
    save.hidden = discard.hidden = !dirty;
    save.disabled = !state.canSave || launching;
    discard.disabled = !state.canEdit || launching;
    save.title = state.canSave ? "保存下次启动配置" : "先修正参数或存储问题";
    if (retry) { retry.hidden = !state.canReload && !operationIssue; retry.disabled = !state.canEdit || launching; }
    if (start) { start.hidden = !onStart; start.disabled = (!state.canStart && !canResume()) || launching; }
    if (onStateChange) notifyObservers([onStateChange]);
  }
  function updateList() {
    const query = search.value.trim().toLowerCase();
    for (const plugin of plugins) {
      const row = rows.get(plugin.id), on = draft[plugin.id].enabled;
      row.container.hidden = !(plugin.name.toLowerCase().includes(query) || plugin.id.includes(query) || plugin.summary.includes(query))
        || (filter.value === "enabled" && !on) || (filter.value === "disabled" && on);
      row.container.dataset.selected = String(plugin.id === selected);
      row.container.dataset.dirty = String(changed(plugin));
      row.select.setAttribute("aria-pressed", String(plugin.id === selected));
      if (row.toggle) {
        row.toggle.disabled = !state.canEdit || launching;
        row.toggle.setAttribute("aria-checked", String(on));
        row.toggle.setAttribute("aria-label", plugin.name + "：下次启动" + (on ? "启用" : "停用"));
        row.toggle.title = on ? "下次启动停用" : "下次启动启用";
      }
    }
    for (const group of groups) {
      const count = group.ids.filter(id => !rows.get(id).container.hidden).length;
      group.node.hidden = count === 0;
      group.count.textContent = String(count);
    }
    empty.hidden = [...rows.values()].some(row => !row.container.hidden);
    if (!selected || rows.get(selected)?.container.hidden) {
      const first = plugins.find(plugin => !rows.get(plugin.id).container.hidden);
      if (first) { selected = first.id; rows.get(selected).select.setAttribute("aria-pressed", "true"); rows.get(selected).container.dataset.selected = "true"; }
      renderDetail(first ?? null);
    } else if (detail.dataset.plugin !== selected) renderDetail();
  }
  function renderDetail(plugin = plugins.find(item => item.id === selected)) {
    detailCleanups.splice(0).forEach(stop => stop());
    detail.replaceChildren();
    detail.dataset.plugin = plugin?.id ?? "";
    if (!plugin) { detail.append(el("p", { class: "startup-empty" }, "没有匹配的插件")); return; }
    const heading = el("div", { class: "startup-detail-heading" },
      el("span", { class: "startup-glyph" }, icon(plugin.icon, 20)), el("h2", {}, plugin.name));
    const facts = el("div", { class: "startup-facts" },
      el("span", { class: "startup-fact" }, icon(plugin.builtin ? "page" : "library"), plugin.builtin ? "内置" : "扩展"));
    if (plugin.required) facts.append(el("span", { class: "startup-fact", title: plugin.reason }, icon("lock"), "必需"));
    detail.append(heading, el("p", { class: "startup-detail-summary" }, plugin.summary), facts);
    const contributions = el("section", { class: "startup-section", "aria-label": "界面贡献" },
      el("h3", {}, "贡献"), el("div", { class: "startup-contributions" },
        ...plugin.contributions.map(item => el("span", { class: "startup-contribution" }, icon(item.icon), item.label))));
    detail.append(contributions);
    if (plugin.fields.length) {
      const settings = el("section", { class: "startup-section", "aria-label": plugin.name + "设置" }, el("h3", {}, "设置"));
      for (const field of plugin.fields) {
        const key = plugin.id + ":" + field.key, id = plugin.id + "-" + field.key;
        const input = field.type === "number" ? el("input", { id, type: "number", min: field.min, max: field.max, step: 1 })
          : el("select", { id }, ...field.options.map(([value, label]) => el("option", { value }, label)));
        input.value = invalid.has(key) ? invalid.get(key).raw : String(draft[plugin.id].settings[field.key]);
        input.disabled = !state.canEdit || launching;
        input.setAttribute("aria-invalid", String(invalid.has(key)));
        const error = el("p", { id: id + "-error", class: "startup-setting-error", role: "alert" },
          invalid.get(key)?.message ?? "");
        error.hidden = !invalid.has(key);
        input.setAttribute("aria-describedby", id + "-error");
        listen(input, field.type === "number" ? "input" : "change", () => {
          operationIssue = "";
          const result = controller.setSetting(plugin.id, field.key, input.value);
          syncState();
          input.setAttribute("aria-invalid", String(!result.ok)); error.hidden = result.ok;
          error.textContent = result.ok ? "" : result.error;
          rows.get(plugin.id).container.dataset.dirty = String(changed(plugin)); updateFooter();
        }, detailCleanups);
        settings.append(el("div", { class: "startup-setting" }, el("label", { for: id }, field.label), input), error);
      }
      detail.append(settings);
    }
    const technical = el("details", { class: "startup-technical" }, el("summary", {}, "技术信息"));
    const info = el("dl", {}, el("dt", {}, "标识"), el("dd", {}, plugin.id),
      el("dt", {}, "配置修订"), el("dd", {}, String(state.baseline.revision)),
      el("dt", {}, "来源"), el("dd", {}, plugin.source),
      el("dt", {}, "接口"), el("dd", {}, "备份内部 UI v1"));
    if (plugin.dependencies.length) info.append(el("dt", {}, "依赖"), el("dd", {}, plugin.dependencies.map(id => plugins.find(item => item.id === id).name).join("、")));
    if (plugin.reason) info.append(el("dt", {}, "必需原因"), el("dd", {}, plugin.reason));
    technical.append(info); detail.append(technical);
  }
  for (const [builtin, label] of [[true, "内置"], [false, "扩展"]]) {
    const group = el("section", { class: "startup-group", "aria-label": label + "插件" });
    const count = el("span", { class: "startup-group-count", "aria-hidden": "true" });
    group.append(el("h2", { class: "startup-group-label" }, label, count));
    const ids = [];
    for (const plugin of plugins.filter(item => item.builtin === builtin)) {
      ids.push(plugin.id);
      const select = el("button", { class: "startup-select", type: "button", "aria-label": "查看" + plugin.name, "aria-pressed": "false" },
        el("span", { class: "startup-glyph" }, icon(plugin.icon, 20)),
        el("span", { class: "startup-plugin-text" }, el("strong", { class: "startup-plugin-name" }, plugin.name),
          el("span", { class: "startup-plugin-summary" }, plugin.summary)));
      const container = el("div", { class: "startup-row", "data-plugin-id": plugin.id }, select);
      let toggle = null;
      if (plugin.required) container.append(el("span", { class: "startup-required", role: "img", "aria-label": plugin.name + "必需，不能停用", title: plugin.reason }, icon("lock")));
      else {
        toggle = el("button", { class: "startup-toggle", type: "button", role: "switch", "aria-checked": "false" },
          el("span", { class: "startup-toggle-track", "aria-hidden": "true" }));
        listen(toggle, "click", () => {
          operationIssue = "";
          controller.setEnabled(plugin.id, !draft[plugin.id].enabled); syncState(); updateList(); updateFooter();
          if (container.hidden) search.focus();
        });
        container.append(toggle);
      }
      listen(select, "click", () => { selected = plugin.id; updateList(); renderDetail(); });
      rows.set(plugin.id, { container, select, toggle }); group.append(container);
    }
    groups.push({ node: group, ids, count }); list.append(group);
  }
  list.append(empty);
  listen(search, "input", updateList);
  listen(filter, "change", updateList);
  function updateControls() {
    for (const tag of ["input", "select"]) detail.querySelectorAll(tag).forEach(input => { input.disabled = !state.canEdit || launching; });
  }
  function refresh({ detailChanged = true } = {}) {
    if (!active) return;
    syncState(); updateList();
    if (detailChanged) renderDetail();
    updateFooter(); updateControls();
  }
  function operation(run, { reload = false } = {}) {
    operationIssue = "";
    const result = run(); refresh({ detailChanged: false });
    const completed = () => {
      if (!active) return;
      refresh({ detailChanged: reload || controller.snapshot().saved });
      if (state.saved) search.focus();
    };
    if (result && typeof result.then === "function") result.then(completed, error => {
      if (active) { operationIssue = error?.message ?? String(error); refresh({ detailChanged: false }); }
    });
    else completed();
  }
  listen(discard, "click", () => {
    operation(controller.discard, { reload: true }); search.focus();
  });
  listen(save, "click", () => {
    operation(controller.save);
  });
  if (retry) listen(retry, "click", () => {
    operation(controller.reload, { reload: true });
  });
  if (start && onStart) listen(start, "click", () => {
    if ((!state.canStart && !canResume()) || launching) return;
    operationIssue = ""; launching = true; refresh({ detailChanged: false });
    const completed = error => {
      if (!active) return;
      launching = false;
      if (error) operationIssue = `工作区启动失败：${error?.message ?? error}`;
      refresh({ detailChanged: false });
    };
    try {
      const result = onStart();
      if (result && typeof result.then === "function") result.then(() => completed(), completed);
      else completed();
    } catch (error) { completed(error); }
  });
  updateList(); renderDetail(); updateFooter();
  if (state.phase === "loading") controller.ready.then(() => refresh());
  return Object.freeze({
    refresh,
    notifyError(text) { if (active) { operationIssue = text; updateFooter(); } },
    dispose() {
    if (!active) return; active = false;
    detailCleanups.splice(0).forEach(stop => stop()); cleanups.splice(0).forEach(stop => stop());
    list.replaceChildren(); detail.replaceChildren(); mounted.delete(root);
  } });
}
