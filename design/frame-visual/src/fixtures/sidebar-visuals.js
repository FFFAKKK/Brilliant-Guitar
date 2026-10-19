/* Neutral visual review material; never registered as runtime/plugin content. */
import { h } from "../shell/dom.js";
import { canEditLayout } from "./layout-edit-state.js";
import { rowsFor } from "./preview-scenarios.js";

export const REVIEW_CONTENT = [
  { id: "A", name: "示例 A", icon: "page", width: "full", supports: ["full"], height: 128, removable: true, allowed: ["left", "right"] },
  { id: "B", name: "示例 B", icon: "grid", width: "half", supports: ["half", "full"], height: 96, removable: true, allowed: ["left", "right"] },
  { id: "C", name: "示例 C", icon: "tone", width: "half", supports: ["half", "full"], height: 112, removable: true, allowed: ["left", "right"] },
  { id: "D", name: "示例 D · 固定内容", icon: "page", width: "full", supports: ["full"], height: 96, removable: false, allowed: ["left"] },
  { id: "E", name: "示例 E", icon: "grid", width: "half", supports: ["half"], height: 96, removable: true, allowed: ["left", "right"] },
];

export function applySidebarReview(state, params) {
  const presentation = params.get("presentation");
  if (!["grid", "list", "tabs", "mixed"].includes(presentation)) return;
  const side = params.get("contentSide") === "right" ? "right" : "left";
  Object.assign(state, {
    presentation, contentSide: side, activeContent: "A", contentInputs: {}, contentChoices: {}, contentScroll: {}, contentExpanded: {},
    iconOrder: REVIEW_CONTENT.map(item => item.id), hiddenIcons: [],
    enabled: side === "left" ? ["A", "B", "C", "D", "E"] : ["A", "B", "C", "E"],
    leftOpen: side === "left", rightOpen: true, rightPage: 3,
    title: "侧栏呈现审阅", status: "中性视觉示例", showModuleCatalog: false,
  });
  switch (params.get("sample")) {
    case "empty": state.enabled = []; break;
    case "unavailable": state.unavailable = ["E"]; break;
    case "long": state.reviewLong = true; break;
    case "editing": state.editing = true; state.selectedModule = "B"; break;
    case "width-limit": state.editing = true; state.selectedModule = "B"; state.widths.B = "full"; state.reviewHalfMinimums = { B: 128 }; break;
    case "unselected": state.editing = true; state.selectedModule = null; break;
    case "fixed": state.editing = true; state.selectedModule = "D"; break;
    case "half-only": state.editing = true; state.selectedModule = "E"; break;
    case "empty-editing": state.enabled = []; state.editing = true; state.selectedModule = null; break;
    case "library": state.layer = { type: "library" }; break;
    default: break;
  }
}

export function reviewSections(state, items) {
  const enabled = state.enabled.map(id => items.find(item => item.id === id)).filter(Boolean);
  if (state.presentation !== "mixed") return [{ id: "content", title: "内容", presentation: state.presentation ?? "grid", items: enabled }];
  return [
    { id: "focus", title: "页签区", presentation: "tabs", items: enabled.filter(item => ["A", "D"].includes(item.id)) },
    { id: "tools", title: "网格区", presentation: "grid", items: enabled.filter(item => ["B", "C"].includes(item.id)) },
    { id: "details", title: "列表区", presentation: "list", items: enabled.filter(item => !["A", "B", "C", "D"].includes(item.id)) },
  ].filter(section => section.items.length);
}

export function moveReviewContent(state, items, id, delta) {
  const section = reviewSections(state, items).find(section => section.presentation === "grid" && section.items.some(item => item.id === id));
  if (!section) return [...state.enabled];
  const ids = section.items.map(item => item.id);
  const moved = moveVisualItem(ids, id, delta);
  let index = 0;
  return state.enabled.map(value => ids.includes(value) ? moved[index++] : value);
}

export function reviewHalfSpace(state, item) {
  // 16px panel inset; review content adds 24px padding and an 8px grid gap.
  // The original empty-module fixture instead uses 16px padding and no gap.
  const available = Math.max(0, Math.floor((state[(state.contentSide ?? "left") + "Width"] - (state.presentation ? 48 : 32)) / 2));
  const minimum = state.reviewHalfMinimums?.[item.id] ?? 0;
  return { available, minimum, allowed: available >= minimum };
}

function reviewWidthStatus(state, selected) {
  const width = state.widths[selected.id] ?? selected.width, half = reviewHalfSpace(state, selected);
  const reason = [selected.supports.length < 2 ? "仅支持" + (width === "full" ? "整行" : "半行") : "",
    !selected.removable ? "固定内容不可移出" : "",
    !half.allowed ? "半行可用 " + half.available + " px，至少需要 " + half.minimum + " px。" : ""].filter(Boolean).join(" · ");
  return { width, limited: !half.allowed && width === "full", reason };
}

export function updateReviewCapacity(element, state, items) {
  const selected = items.find(item => item.id === state.selectedModule);
  const button = element.querySelector("#content-width"), reason = element.querySelector(".v-editor-reason");
  if (!selected || !button || !reason) return;
  const status = reviewWidthStatus(state, selected);
  button.disabled = !canEditLayout(state) || selected.supports.length < 2 || status.limited;
  reason.textContent = status.reason; reason.hidden = !status.reason;
}

export function reviewEditTools({ state, items, button, wordButton, dispatch }) {
  const gridIds = reviewSections(state, items).filter(section => section.presentation === "grid").flatMap(section => section.items.map(item => item.id));
  const selected = items.find(item => item.id === state.selectedModule && gridIds.includes(item.id));
  if (!gridIds.length) return h("p", { class: "v-content-note" }, state.enabled.length ? "当前页面没有网格区；内容可照常浏览。" : "当前页面暂无内容，可从内容库加入。");
  const target = h("select", { id: "layout-content-target", class: "v-layout-target", "aria-label": "选择网格内容", disabled: !canEditLayout(state),
    onchange: event => { if (canEditLayout(state) && gridIds.includes(event.currentTarget.value)) dispatch("content-select", event.currentTarget.value); } },
    h("option", { value: "", selected: !selected }, "选择网格内容"),
    ...gridIds.map(id => h("option", { value: id, selected: selected?.id === id }, items.find(item => item.id === id).name)));
  if (!selected) return h("div", { class: "v-content-editor" }, target, h("p", { class: "v-content-note" }, "尚未选中内容。选择后查看占宽、顺序与限制。"));
  const index = gridIds.indexOf(selected.id);
  const { width, limited, reason } = reviewWidthStatus(state, selected);
  return h("div", { class: "v-content-editor", "aria-label": "内容编辑操作" },
    target,
    h("div", { class: "v-editor-current" }, selected.name, h("span", {}, width === "full" ? "整行" : "半行")),
    h("p", { class: "v-editor-location" }, (state.contentSide === "right" ? "右侧栏" : "左侧栏") + " · " + (state.presentation === "mixed" ? "网格区" : "内容页 / 网格")),
    h("div", { class: "v-editor-actions" },
      wordButton("占宽", "module-width", selected.id, { disabled: !canEditLayout(state) || selected.supports.length < 2 || limited, id: "content-width" }),
      button("上移选中内容", "up", "module-move", { id: selected.id, delta: -1 }, { disabled: !canEditLayout(state) || index === 0 }),
      button("下移选中内容", "down", "module-move", { id: selected.id, delta: 1 }, { disabled: !canEditLayout(state) || index === gridIds.length - 1 }),
      wordButton("移出", "module-remove", selected.id, { disabled: !canEditLayout(state) || !selected.removable })),
    h("p", { class: "v-editor-reason", hidden: !reason }, reason),
    selected.allowed ? h("p", { class: "v-editor-location" }, "允许区域：" + selected.allowed.map(side => side === "left" ? "左侧栏" : "右侧栏").join("、")) : null);
}

export function orderedVisualContent(items, order = []) {
  const byId = new Map(items.map(item => [item.id, item]));
  const ids = [...new Set([...order, ...byId.keys()])];
  return ids.filter(id => byId.has(id)).map(id => byId.get(id));
}

export function moveVisualItem(order, id, delta) {
  const next = [...order];
  const index = next.indexOf(id);
  if (index < 0) return next;
  const destination = Math.max(0, Math.min(next.length - 1, index + delta));
  next.splice(index, 1);
  next.splice(destination, 0, id);
  return next;
}

export function reviewBody(item, state) {
  const id = item.id;
  const inputRow = h("label", { class: "v-neutral-field" }, h("span", {}, "名称"),
    h("input", { id: "content-input-" + id, "aria-label": item.name + "名称", value: state.contentInputs[id] ?? item.name,
      oninput: event => { state.contentInputs[id] = event.currentTarget.value; } }));
  const unavailable = state.unavailable.includes(id);
  if (unavailable) return h("div", { class: "v-neutral-body" }, h("p", { class: "v-content-reason" }, "暂不可用"),
    h("p", { class: "v-content-note" }, "示例来源尚未准备好，可在内容库查看状态。"));
  const options = h("div", { class: "v-neutral-options", "aria-label": item.name + "通用选择" }, ...["选项一", "选项二"].map((label, i) => {
    const control = h("button", { type: "button", "aria-label": item.name + label,
      "aria-pressed": String((state.contentChoices[id] ?? 0) === i), onclick: () => {
        state.contentChoices[id] = i;
        for (const node of options.children) node.setAttribute("aria-pressed", String(node === control));
      } }, label);
    return control;
  }));
  return h("div", { class: "v-neutral-body", inert: state.editing }, inputRow, options,
    h("p", { class: "v-content-note" }, "视觉示例"),
    state.reviewLong ? h("div", { class: "v-neutral-long" }, ...Array.from({ length: 24 }, (_, i) =>
      h("p", {}, "示例信息 " + (i + 1) + " · 用于检查长内容"))) : null);
}

export function reviewContentPanel({ side, state, items, graphic, button, wordButton, grip, dispatch }) {
  const sections = reviewSections(state, items);
  const enabled = sections.flatMap(section => section.items);
  const tabs = sections.filter(section => section.presentation === "tabs").flatMap(section => section.items);
  const active = tabs.find(item => item.id === state.activeContent) ?? tabs[0];
  if (active) state.activeContent = active.id;
  const scrollKey = state.presentation === "tabs" ? active?.id : state.presentation;
  const grids = sections.filter(section => section.presentation === "grid").flatMap(section => section.items);
  if (canEditLayout(state) && state.selectedModule && !grids.some(item => item.id === state.selectedModule)) state.selectedModule = null;
  const content = h("div", {
    class: "v-review-content " + (side === "left" ? "v-modules" : "v-page-content"),
    dataset: { presentation: state.presentation }, "aria-label": "侧栏内容",
    onscroll: event => { if (event.currentTarget.isConnected) state.contentScroll[scrollKey] = event.currentTarget.scrollTop; },
  });
  const select = id => dispatch("content-select", id);
  const card = (item, width = "full", presentation = "tabs") => {
    const editing = canEditLayout(state) && presentation === "grid";
    const name = h("span", { class: "v-review-name", title: item.name }, item.name);
    const head = h("div", { class: "v-review-card-head" },
      editing ? h("button", { type: "button", id: "module-" + item.id, class: "v-drag-button", draggable: "true",
        "aria-label": "选择并移动" + item.name, onclick: () => select(item.id),
        ondragstart: event => {
          event.dataTransfer.setData("text/plain", item.id);
          dispatch("content-drag", item.id);
        }, ondragend: () => dispatch("content-drag-end") }, graphic("drag")) : null,
      name);
    return h("section", { class: "v-review-card " + width,
      "aria-label": item.name, dataset: { module: item.id, editing: String(editing), selected: String(editing && state.selectedModule === item.id) },
      onclick: () => { if (editing && state.selectedModule !== item.id) select(item.id); },
      ondragover: event => {
        if (!editing || !state.movingContent || state.movingContent === item.id) return;
        event.preventDefault(); event.currentTarget.dataset.drop = "true";
      }, ondragleave: event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.dataset.drop = "false"; },
      ondrop: event => { if (editing) { event.preventDefault(); dispatch("content-drop", item.id); } },
    }, head, reviewBody(item, state));
  };
  if (!enabled.length) content.append(h("div", { class: "v-review-empty" },
    h("p", {}, "侧栏暂无内容"), h("span", {}, "从内容库加入所需内容。"), wordButton("打开内容库", "library")));
  for (const section of sections) {
    if (!section.items.length) continue;
    const region = h("div", { class: "v-review-section", dataset: { section: section.id, presentation: section.presentation } });
    if (state.presentation === "mixed") region.append(h("span", { class: "v-review-section-name" }, section.title));
    if (section.presentation === "tabs") {
    const index = section.items.indexOf(active);
    region.append(h("div", { class: "v-review-page-position" }, h("span", {}, "内容"),
      h("div", { class: "v-page-navigation" }, button("上一个内容", "collapseLeft", "content-step", -1, { disabled: index === 0 }),
        h("span", {}, (index + 1) + " / " + section.items.length),
        button("下一个内容", "collapseRight", "content-step", 1, { disabled: index === section.items.length - 1 }))),
      card(active));
  } else if (section.presentation === "list") {
    for (const item of section.items) region.append(h("details", { class: "v-review-list-item", dataset: { module: item.id }, open: state.contentExpanded[item.id] !== false,
      ontoggle: event => { state.contentExpanded[item.id] = event.currentTarget.open; } },
      h("summary", {}, graphic(item.icon), h("span", { title: item.name }, item.name), graphic("down")), reviewBody(item, state)));
  } else {
    const rows = rowsFor({ ...state, enabled: section.items.map(item => item.id) }, items);
    for (const row of rows) region.append(h("div", { class: "v-module-row v-review-grid-row" },
      ...row.map(item => card(item, item.width, "grid")),
      row.length === 1 && row[0].width === "half" ? h("div", { class: "v-review-gap" }, canEditLayout(state) ? "保留空位" : "") : null));
  }
    content.append(region);
  }
  const head = h("div", { class: "v-region-header" }, h("span", { class: "v-region-name" }, side === "left" ? "左侧栏" : "右侧栏"),
    button("收起" + (side === "left" ? "左" : "右") + "侧栏", side === "left" ? "collapseLeft" : "collapseRight", "region", side));
  const surface = h("div", { class: "v-panel-surface v-review-surface " + (side === "left" ? "v-left-surface" : "v-page") }, head,
    content, wordButton("内容库", "library", null, { class: "v-add-module", id: "add-module" }));
  surface.style.gridTemplateRows = "32px minmax(0,1fr) 52px";
  return h("section", { class: side === "left" ? "v-left" : "v-right", "aria-label": side === "left" ? "左侧栏" : "右侧栏",
    hidden: !state[side + "Open"] }, surface, grip(side));
}
