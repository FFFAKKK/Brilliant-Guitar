import { h } from "./dom.js";
import { graphic } from "./visual-controls.js";
import { SIDEBAR_COMMANDS as S } from "../host/sidebar-commands.js";
import { actionState, actionReason, applyActionPresentation } from "./action-presentation.js";

const names = { left: "左侧栏", right: "右侧栏" };
const errors = {
  "command.disabled": "该操作当前不可用。", "command.missing": "该操作当前不可用。",
  "layout.edit-required": "请先进入内容编辑。",
  "permission.denied": "当前组件没有配置侧栏内容的权限。", "layout.reserved-panel": "工作区布局是固定配置入口。",
  "sidebar.invalid-slot": "该组件不支持这个侧栏。", "sidebar.invalid-order": "内容顺序已变化，请重试。",
  "sidebar.unknown-panel": "该组件不在当前运行会话中。", "layout.edit-desynchronized": "编辑会话已变化，请重新进入编辑。",
  "layout.busy": "布局正在更新，请重试。", "component.contents-unavailable": "该组件贡献当前不可用。",
  "command.state-error": "该操作的状态读取失败，请重试。",
};

// Selection is view state only; configuration and rollback stay in their existing owners.
export function createSidebarContentSettings({ execute, notify }) {
  let current = { panels: [] }, editing = false, selectedId = "", disposed = false, actionSnapshot = null;
  const options = new Map(), locations = new Map();
  const placeholder = h("option", { value: "" }, "选择组件…");
  const select = h("select", { id: "layout-content-choice", class: "v-layout-target", "aria-label": "选择侧栏组件",
    "aria-describedby": "layout-content-info layout-content-help", onchange() {
      selectedId = select.value; feedback.textContent = ""; update(current, editing, actionSnapshot);
    } }, placeholder);
  const info = h("p", { id: "layout-content-info", class: "v-layout-target-name v-sr-only" });
  const capabilities = h("p", { class: "v-layout-note v-sr-only" });
  const help = h("p", { id: "layout-content-help", class: "v-layout-note v-sr-only" });
  const feedback = h("p", { id: "layout-content-feedback", class: "v-layout-note", role: "status", "aria-live": "polite" });
  const selected = () => current.panels.find(panel => panel.id === selectedId);
  function report(text) {
    feedback.textContent = text;
    try { notify?.(text, "error"); } catch { /* visible feedback remains available if notice delivery fails */ }
  }
  function apply(command, payload, success) {
    if (disposed) return;
    const panel = selected();
    if (!editing) { report("请先进入内容编辑。"); return; }
    if (!panel?.available) { report(panel?.reason || "请先选择可用组件。"); return; }
    const state = actionState(actionSnapshot, command);
    if (state?.enabled === false) { report(actionReason(state)); return; }
    let result;
    try { result = execute(command, payload); }
    catch { report("组件配置失败，请重试。"); return; }
    if (result?.ok) feedback.textContent = success;
    else report(errors[result?.code] ?? "组件配置失败，请重试。");
  }
  const control = (id, label, glyph, action) => h("button", { id, type: "button", class: "v-layout-control", dataset: { frameFocusFallback: "layout-content-choice" }, "aria-label": label, "data-tooltip": label, onclick: action },
    graphic(glyph, 16));
  const toggle = control("layout-content-toggle", "添加到侧栏", "plus", () => {
    const panel = selected();
    apply(S.enabled, { id: selectedId, enabled: !panel?.enabled }, panel?.title + (panel?.enabled ? "已移出侧栏。" : "已加入侧栏。"));
  });
  for (const slot of ["left", "right"]) locations.set(slot, control("layout-content-" + slot, names[slot], slot, () => {
    const panel = selected();
    if (panel && !panel.slots.includes(slot)) { report("该组件不支持" + names[slot] + "。"); return; }
    apply(S.move, { id: selectedId, slot }, panel?.title + "已放置于" + names[slot] + "。");
  }));
  const reorder = direction => {
    const panel = selected(), index = panel?.[direction === "up" ? "previousOrder" : "nextOrder"];
    if (index == null) return;
    apply(S.reorder, { id: selectedId, index }, panel.title + "顺序已调整。");
  };
  const up = control("layout-content-up", "上移", "up", () => reorder("up"));
  const down = control("layout-content-down", "下移", "down", () => reorder("down"));
  const editGroups = [
    h("div", { class: "v-layout-control-row v-layout-content-actions" }, toggle),
    h("div", { class: "v-layout-control-row" }, ...locations.values()),
    h("div", { class: "v-layout-control-row" }, up, down),
  ];
  const element = h("section", { id: "layout-content-manager", class: "v-layout-group", "aria-label": "栏内组件" },
    h("span", { class: "v-layout-group-label" }, "栏内组件"), select, info, capabilities,
    ...editGroups, help, feedback);

  function update(snapshot, nextEditing, nextActions = null) {
    if (disposed) return;
    current = snapshot;
    actionSnapshot = nextActions;
    if (editing !== nextEditing) feedback.textContent = "";
    editing = nextEditing;
    const ids = new Set(current.panels.map(panel => panel.id));
    for (const [id, option] of options) if (!ids.has(id)) { option.remove(); options.delete(id); }
    for (const panel of current.panels) {
      if (!options.has(panel.id)) { const option = h("option", { value: panel.id }); options.set(panel.id, option); select.append(option); }
      options.get(panel.id).textContent = panel.title + " · " + (!panel.available ? "不可用" : panel.enabled ? names[panel.slot] : "可添加");
    }
    const ordered = [placeholder, ...current.panels.map(panel => options.get(panel.id))];
    for (const [index, option] of ordered.entries()) if (select.children[index] !== option) select.insertBefore(option, select.children[index] ?? null);
    if (!ids.has(selectedId)) selectedId = "";
    select.value = selectedId; select.disabled = current.panels.length === 0;
    const panel = selected(), configurable = editing && panel?.available;
    info.textContent = panel ? panel.title + " · " + (panel.enabled ? "已加入" : "未加入") + (panel.slot ? " · " + names[panel.slot] : "") : "";
    capabilities.textContent = panel?.slots.length ? "允许位置：" + panel.slots.map(slot => names[slot]).join("、") : "";
    help.textContent = !current.panels.length ? "当前没有可配置的侧栏组件。" : !panel ? "选择组件后查看配置。"
      : !panel.available ? panel.reason : !editing ? "进入内容编辑后调整组件。"
        : "添加和移出只改变侧栏配置；确认保留，取消恢复。";
    const toggleLabel = panel?.enabled ? "移出侧栏" : "添加到侧栏";
    toggle.replaceChildren(graphic(panel?.enabled ? "close" : "plus", 16));
    toggle.setAttribute("data-tooltip", toggleLabel);
    applyActionPresentation(toggle, actionSnapshot, S.enabled, { disabled: !configurable, hint: toggleLabel });
    toggle.setAttribute("aria-pressed", String(panel?.enabled ?? false));
    toggle.setAttribute("aria-label", toggleLabel);
    for (const [slot, button] of locations) {
      button.setAttribute("aria-pressed", String(panel?.slot === slot));
      button.title = !panel ? "请先选择组件。" : !panel.slots.includes(slot) ? "该组件不支持" + names[slot] + "。"
        : !editing ? "进入内容编辑后修改。" : panel.slot === slot ? "当前位于" + names[slot] + "。" : "移到" + names[slot];
      applyActionPresentation(button, actionSnapshot, S.move, {
        disabled: !configurable || !panel.slots.includes(slot) || panel.slot === slot, hint: button.title,
      });
    }
    applyActionPresentation(up, actionSnapshot, S.reorder, { disabled: !configurable || panel.previousOrder == null, hint: "上移" });
    applyActionPresentation(down, actionSnapshot, S.reorder, { disabled: !configurable || panel.nextOrder == null, hint: "下移" });
    if (configurable && actionSnapshot && [S.enabled, S.move, S.reorder].every(id => !actionState(actionSnapshot, id)?.enabled)) {
      help.textContent = actionReason(actionState(actionSnapshot, S.enabled));
    }
  }
  update(current, editing);
  return { element, editGroups, update, dispose() { disposed = true; } };
}
