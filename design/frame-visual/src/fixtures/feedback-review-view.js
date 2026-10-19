import { h } from "../shell/dom.js";
import { graphic, visualButton } from "../shell/visual-controls.js";
import { feedbackTitle } from "./feedback-review-state.js";

export function createFeedbackReviewView({ state, dispatch }) {
  const memory = state.feedbackReview;
  const action = (label, type, value, props = {}) => visualButton(label, null,
    event => dispatch(type, value, event.currentTarget), props);
  const busy = () => !!memory.operation;
  const enabled = () => state.assembly && !busy();

  function title() {
    const summary = feedbackTitle(state);
    if (!memory.report) return h("span", { class: "v-doc-state", dataset: { save: state.save }, title: state.status }, state.status);
    return h("button", { type: "button", id: "feedback-status", class: "v-doc-state fr-title",
      dataset: { status: summary.status, essential: String(summary.attention) },
      "aria-label": summary.label + "，查看详情", "aria-expanded": String(memory.detailsOpen), "aria-controls": "feedback-details",
      onclick: event => dispatch("feedback-details", null, event.currentTarget) },
      graphic(summary.attention ? "info" : "more", 14), h("span", { class: "fr-title-text" }, summary.label));
  }

  function schemes() {
    const book = state.schemeBook, entry = book.entries.find(item => item.id === book.current);
    const selector = h("select", { class: "v-layout-target", id: "scheme-choice", "aria-label": "当前布局方案",
      disabled: !enabled() || !!memory.editor, onchange: event => dispatch("scheme-select", event.currentTarget.value) },
      ...book.entries.map(item => h("option", { value: item.id, selected: item.id === book.current }, item.name + (item.builtin ? " · 内置" : ""))));
    const tools = h("div", { class: "fr-actions" },
      action("另存方案", "scheme-editor", "save", { id: "scheme-save", disabled: !enabled() || !!memory.editor }),
      action("重命名", "scheme-editor", "rename", { id: "scheme-rename", disabled: !enabled() || !!memory.editor || entry.builtin }),
      action("删除", "scheme-editor", "delete", { id: "scheme-delete", disabled: !enabled() || !!memory.editor || entry.builtin }));
    const panel = h("section", { class: "v-layout-group fr-schemes", "aria-label": "布局方案", dataset: { sample: memory.sample } },
      h("span", { class: "v-layout-group-label" }, "布局方案"), selector, tools,
      h("p", { class: "v-layout-note" }, state.assembly ? "内容与方案随本次布局一起确认或撤回。" : "进入内容编辑后管理方案。"));
    if (memory.editor) panel.append(editor());
    if (memory.report && memory.report.code !== "source-unavailable") panel.append(localReport());
    panel.append(h("p", { id: "scheme-result", class: "v-layout-note fr-result", role: "status", "aria-live": "polite" }, memory.message));
    return panel;
  }

  function editor() {
    const current = memory.editor, pending = memory.operation?.status === "pending", unknown = memory.operation?.status === "unknown";
    const name = h("input", { type: "text", id: "scheme-name", value: current.name, class: "fr-name",
      "aria-label": "方案名称", "aria-invalid": String(!!memory.fieldError), "aria-describedby": "scheme-name-help",
      readonly: pending || unknown,
      oninput: event => { current.name = event.currentTarget.value; memory.fieldError = "";
        event.currentTarget.setAttribute("aria-invalid", "false");
        const help = document.getElementById("scheme-name-help"); help.dataset.error = "false"; help.textContent = "最多 40 个字符，名称不能重复。"; },
      onkeydown: event => {
        if (event.isComposing) return;
        if (event.key === "Enter") { event.preventDefault(); dispatch("scheme-submit"); }
      } });
    return h("div", { class: "fr-editor", "aria-label": current.kind === "delete" ? "移除方案确认" : "方案名称编辑" },
      h("p", { class: "fr-editor-label" }, current.kind === "save" ? "另存为" : current.kind === "rename" ? "重命名" : "删除「" + current.name + "」？"),
      current.kind !== "delete" ? name : h("p", { class: "v-layout-note" }, "将使用默认方案；确认布局前仍可撤回。"),
      current.kind !== "delete" ? h("p", { id: "scheme-name-help", class: "v-layout-note", dataset: { error: String(!!memory.fieldError) }, role: memory.fieldError ? "status" : null }, memory.fieldError || "最多 40 个字符，名称不能重复。") : null,
      h("div", { class: "fr-actions" },
        action(current.kind === "delete" ? "移除方案" : "应用名称", "scheme-submit", null, { id: "scheme-submit", disabled: pending || unknown, className: "fr-primary" }),
        action(pending ? "停止等待" : "取消", "scheme-editor-cancel", null, { id: "scheme-editor-cancel", disabled: unknown })));
  }

  function localReport() {
    const item = memory.report;
    return h("div", { class: "fr-report", dataset: { status: item.status }, role: "status", "aria-live": "polite" },
      h("p", { class: "fr-report-label" }, item.summary),
      item.status === "progress" ? h("div", { class: "fr-progress", role: "progressbar", "aria-label": "方案正在处理" }) : null,
      h("p", { class: "v-layout-note" }, item.status === "unknown" ? "先核对结果，避免重复提交。" : item.status === "error" ? item.detail : ""),
      item.status === "unknown" ? action("核对结果", "feedback-check", null, { id: "scheme-check" }) : null);
  }

  function details() {
    const item = memory.report;
    return h("section", { class: "fr-details", id: "feedback-details", role: "region", "aria-label": "问题详情",
      tabindex: "-1", dataset: { provider: memory.providerAvailable ? "review" : "basic" } },
      h("div", { class: "fr-details-head" }, h("span", { class: "fr-details-title" }, item?.summary || "当前没有待处理问题"),
        visualButton("关闭详情", "close", () => dispatch("feedback-close"), { id: "feedback-close" })),
      h("div", { class: "fr-details-body" },
        h("p", {}, item?.detail || memory.message || "当前操作没有遗留问题。"),
        item ? h("p", { class: "v-layout-note" }, "已查看 · " + (item.status === "progress" ? "仍在处理" : "仍未解决")) : null,
        item?.status === "unknown" ? action("核对结果", "feedback-check", null, { id: "feedback-check" }) : null,
        item?.code === "source-unavailable" && memory.providerAvailable ? action("回到来源", "feedback-source", null, { id: "feedback-source" }) : null,
        item?.code === "configuration-unavailable" ? h("p", { class: "v-layout-note" }, "布局组件中仍可管理基础方案；原配置不会在预览中被覆盖。") : null));
  }
  return { title, schemes, details };
}
