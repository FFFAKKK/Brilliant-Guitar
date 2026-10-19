import { icon } from "../fixtures/preview-icons.js";
import { mountPluginStartupView } from "./plugin-startup-view.js";

const mounted = new WeakSet();
/** Shared presentation only; application/controller ownership stays with the caller. */
export function mountStartupCenterView({ root, application, appearance = null, visualOnly = false }) {
  if (mounted.has(root)) throw new Error("启动中心已挂载");
  const document = root.ownerDocument, node = id => root.querySelector("#" + id);
  const tabs = [...root.querySelectorAll("[data-launch-page]")];
  const pages = new Map(["recent", "plugins", "settings"].map(id => [id, node("launch-" + id)]));
  const list = node("launch-file-list"), search = node("launch-search"), empty = node("launch-empty");
  const preview = node("launch-score-card"), title = node("launch-preview-title"), meta = node("launch-preview-meta");
  const openSelected = node("launch-open-selected"), status = node("launch-status");
  const density = node("launch-density"), fontSize = node("launch-font-size");
  const appearanceStatus = node("launch-appearance-status");
  const newButton = node("launch-new"), openButton = node("launch-open"), pluginRoot = node("startup-root");
  const resume = node("launch-continue"), retry = node("launch-retry"), refresh = node("launch-refresh"), remove = node("launch-remove");
  if (tabs.length !== 3 || [...pages.values(), list, search, empty, preview, title, meta, openSelected, status,
    density, fontSize, newButton, openButton, pluginRoot, ...(!visualOnly ? [resume, retry, refresh, remove, appearanceStatus, appearance] : [])].some(value => !value)) {
    throw new Error("启动中心缺少控件");
  }
  if (visualOnly && appearance) throw new Error("独立视觉预览不能接入产品外观存储");
  let active = true, page = "recent", selectedId = null, visible = [], listKey = null, localIssue = "";
  const cleanups = [], rowCleanups = [];
  const listen = (target, event, callback, scope = cleanups) => {
    target.addEventListener(event, callback); scope.push(() => target.removeEventListener(event, callback));
  };
  const element = (tag, attributes = {}, ...children) => {
    const value = document.createElement(tag); value.setAttribute("data-frame-ui", "");
    for (const [key, text] of Object.entries(attributes)) value.setAttribute(key, text);
    value.append(...children); return value;
  };
  const glyph = name => {
    const value = element("span", { class: "launch-icon", "aria-hidden": "true" });
    value.innerHTML = icon(name, 18); return value;
  };
  const pluginView = mountPluginStartupView({ root: pluginRoot, controller: application.controller, selectedId: "frame.score-info", onStateChange: () => render() });
  mounted.add(root);
  root.querySelectorAll("[data-launch-icon]").forEach(value => value.replaceWith(glyph(value.getAttribute("data-launch-icon"))));
  if (!visualOnly) preview.replaceChildren(element("span", { class: "launch-file-placeholder", title: "暂无作品缩略图", "aria-label": "作品文件" }, glyph("page")));
  const nav = root.querySelector('[role="tablist"]'), media = document.defaultView?.matchMedia?.("(max-width: 440px)");
  if (nav && media) {
    const orientation = () => nav.setAttribute("aria-orientation", media.matches ? "horizontal" : "vertical");
    orientation(); listen(media, "change", orientation);
  }
  function showPage(next, focus = false) {
    if (!active || !pages.has(next)) return;
    page = next;
    for (const [id, panel] of pages) panel.hidden = id !== next;
    for (const tab of tabs) {
      const selected = tab.getAttribute("data-launch-page") === next;
      tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    }
  }
  function updatePreview(model) {
    const selected = visible.find(item => item.id === selectedId);
    preview.hidden = !selected; title.textContent = selected?.name ?? "";
    meta.textContent = selected ? ".bgp.json" : "";
    openSelected.disabled = !selected || !model.canChoose;
    const label = selected ? "打开" + selected.name + (visualOnly ? "（预览）" : "") : "没有所选作品";
    openSelected.setAttribute("aria-label", label); openSelected.title = label;
    if (remove) { remove.hidden = !selected; remove.disabled = model.busy || model.recent.busy; }
    list.querySelectorAll(visualOnly ? "[data-example-id]" : "[data-record-id]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.getAttribute(visualOnly ? "data-example-id" : "data-record-id") === selectedId));
    });
  }
  function invoke(action) {
    if (!active) return;
    localIssue = "";
    try {
      Promise.resolve(action()).then(result => {
        if (active && result?.ok === false) { localIssue = result.message; render(); }
      }, error => { if (active) { localIssue = error?.message ?? String(error); render(); } });
    } catch (error) { localIssue = error?.message ?? String(error); render(); }
  }
  function render() {
    if (!active) return;
    const model = application.snapshot(), entries = model.recent.entries;
    if (appearance) {
      const state = appearance.snapshot();
      density.value = state.value.density; fontSize.value = String(state.value.fontSize);
      root.setAttribute("data-density", state.value.density); root.style.setProperty("--launch-font-size", state.value.fontSize + "px");
      density.disabled = fontSize.disabled = !state.canEdit;
      appearanceStatus.disabled = !state.canRetry; appearanceStatus.dataset.error = String(!!state.issue);
      appearanceStatus.title = state.issue ? state.issue + (state.retryKind === "reload" ? "；点击重新读取" : "；点击重试保存")
        : state.phase !== "ready" ? "正在处理启动中心设置" : state.persisted ? "启动中心设置已保存" : "启动中心默认设置；更改自动保存";
      appearanceStatus.setAttribute("aria-label", appearanceStatus.title);
      appearanceStatus.innerHTML = icon(state.issue ? "undo" : state.phase !== "ready" ? "timerReset" : state.persisted ? "check" : "info");
    }
    const query = search.value.trim().toLowerCase(), key = JSON.stringify([entries, query]);
    if (key !== listKey) {
      listKey = key; rowCleanups.splice(0).forEach(stop => stop()); list.replaceChildren();
      visible = entries.filter(item => (item.name + " " + (item.folder ?? item.location)).toLowerCase().includes(query));
      if (!visible.some(item => item.id === selectedId)) selectedId = visible[0]?.id ?? null;
      for (const item of visible) {
        const date = item.time ?? new Date(item.lastOpenedAt).toLocaleDateString("zh-CN");
        const row = element("button", { class: "launch-file", type: "button", [visualOnly ? "data-example-id" : "data-record-id"]: item.id,
          "aria-label": "预览" + item.name, "aria-pressed": String(item.id === selectedId) },
        element("span", { class: "launch-file-glyph", "aria-hidden": "true" }, glyph("page")),
        element("span", { class: "launch-file-text" }, element("span", { class: "launch-file-name" }, item.name),
          element("span", { class: "launch-file-folder", title: item.folder ?? item.location }, item.folder ?? item.location)),
        element("span", { class: "launch-file-date" }, date));
        listen(row, "click", () => { selectedId = item.id; updatePreview(application.snapshot()); }, rowCleanups);
        listen(row, "dblclick", () => { if (application.snapshot().canChoose) invoke(() => application.enter({ kind: "recent", recordId: item.id })); }, rowCleanups);
        list.append(row);
      }
    }
    empty.hidden = visible.length > 0;
    empty.textContent = model.recent.issue ? "最近作品读取失败" : query ? "没有匹配的作品" : "暂无最近作品";
    newButton.disabled = openButton.disabled = !model.canChoose;
    root.setAttribute("aria-busy", String(model.busy));
    const issue = model.issue || localIssue || model.recent.issue || model.document.warnings?.[0]?.message;
    if (visualOnly) status.textContent = model.message;
    else {
      status.replaceChildren(glyph(issue ? "info" : model.busy || model.recent.loading ? "timerReset" : "check"));
      status.title = issue || (model.busy ? "正在处理" : "就绪"); status.setAttribute("aria-label", status.title);
      status.dataset.error = String(!!issue);
    }
    if (resume) { resume.hidden = !model.canContinue; resume.disabled = model.busy; }
    if (retry) {
      retry.hidden = !model.canRetryStart && !(model.issue && (!model.prepared || model.document.status === "error"));
      retry.disabled = model.busy || model.requiresRestart;
      retry.title = model.canRetryStart ? "重试工作区启动" : "重新读取作品"; retry.setAttribute("aria-label", retry.title);
    }
    if (refresh) { refresh.disabled = model.recent.loading || model.recent.busy || model.busy; refresh.title = model.recent.issue || "刷新最近作品"; }
    updatePreview(model);
  }
  for (const [index, tab] of tabs.entries()) {
    listen(tab, "click", () => showPage(tab.getAttribute("data-launch-page")));
    listen(tab, "keydown", event => {
      if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : (index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : tabs.length - 1)) % tabs.length;
      showPage(tabs[next].getAttribute("data-launch-page"), true);
    });
  }
  listen(search, "input", render);
  listen(newButton, "click", () => { if (application.snapshot().canChoose) invoke(() => application.enter({ kind: "new" })); });
  listen(openButton, "click", () => { if (application.snapshot().canChoose) invoke(() => application.enter({ kind: "open" })); });
  listen(openSelected, "click", () => { if (selectedId && application.snapshot().canChoose) invoke(() => application.enter({ kind: "recent", recordId: selectedId })); });
  if (resume) listen(resume, "click", () => invoke(() => application.enter({ kind: "continue" })));
  if (retry) listen(retry, "click", () => invoke(() => application.snapshot().canRetryStart ? application.retryStart() : application.prepare()));
  if (refresh) listen(refresh, "click", () => invoke(application.refreshRecents));
  if (remove) listen(remove, "click", () => { if (selectedId) invoke(() => application.removeRecent(selectedId)); });
  const changeAppearance = patch => {
    // Appearance failures belong to the local owner, never the document status.
    if (appearance?.snapshot().canEdit) void appearance.set(patch);
  };
  listen(density, "change", () => {
    if (!["compact", "comfortable"].includes(density.value)) return;
    if (appearance) changeAppearance({ density: density.value }); else root.setAttribute("data-density", density.value);
  });
  listen(fontSize, "change", () => {
    if (!["12", "13", "14"].includes(fontSize.value)) return;
    if (appearance) changeAppearance({ fontSize: Number(fontSize.value) }); else root.style.setProperty("--launch-font-size", fontSize.value + "px");
  });
  if (appearance) {
    listen(appearanceStatus, "click", () => { if (appearance.snapshot().canRetry) void appearance.retry(); });
    cleanups.push(appearance.subscribe(render));
  }
  cleanups.push(application.subscribe(render));
  render(); showPage("recent");
  return Object.freeze({ showPage, refresh: render,
    snapshot: () => Object.freeze({ page, selectedId, visibleIds: visible.map(item => item.id), plugins: application.controller.snapshot(), scope: visualOnly ? "visual-only" : "application" }),
    dispose() {
      if (!active) return; active = false;
      cleanups.splice(0).forEach(stop => stop()); rowCleanups.splice(0).forEach(stop => stop());
      try { pluginView.dispose(); } finally { list.replaceChildren(); mounted.delete(root); }
    },
  });
}
