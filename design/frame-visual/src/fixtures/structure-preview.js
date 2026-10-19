import { workspaceGripKeyDelta } from "../shell/workspace-grip-input.js";
import { h } from "../shell/dom.js";
import { createFrameCommandBar } from "../shell/frame-command-bar.js";
import { createWorkspaceLayoutVisual } from "../shell/workspace-layout-visual.js";
import { icon } from "./preview-icons.js";
import { workspaceLimits, workspaceValueLimits, workspaceResizeValue, workspaceSizes, constrainWorkspace, WORKSPACE_DEFAULT_SIZES, WORKSPACE_COMPACT_SIZES, WORKSPACE_MINIMUMS, WORKSPACE_SIZE_KEYS } from "../workspace-geometry.js";
import { MODULES, PAGES, PRESETS, SCENARIOS, fixtureFor, rowsFor } from "./preview-scenarios.js";
import { REVIEW_CONTENT, applySidebarReview, orderedVisualContent, moveVisualItem, moveReviewContent, reviewContentPanel, reviewSections, reviewEditTools, reviewHalfSpace, updateReviewCapacity } from "./sidebar-visuals.js";
import { canEditLayout, requiresLayoutEdit, beginLayoutEdit, finishLayoutEdit, prepareLayoutFixture } from "./layout-edit-state.js";
import { applyContentHosting, runHostingAction, hostingChanges } from "./content-hosting-state.js";
import { createContentHostingView } from "./content-hosting-view.js";
import { applyHorizontalSlots, activateSlotContribution } from "./horizontal-slots-state.js";
import { createHorizontalSlotsView } from "./horizontal-slots-view.js";
import { applyFeedbackReview, runFeedbackAction, submitScheme, settleScheme, finishFeedbackEdit } from "./feedback-review-state.js";
import { createFeedbackReviewView } from "./feedback-review-view.js";
import { captureFrameFocus, prepareFrameReading, installFrameReading } from "../shell/frame-accessibility.js";
import { isPlainKey } from "../host/focus-boundary.js";
import { applyWorkspaceShellGeometry } from "../shell/workspace-shell-geometry.js";

const params = new URLSearchParams(location.search);
const root = document.getElementById("app");
const overlays = document.getElementById("overlay-root");
const preferredGeometry = new WeakMap();
installFrameReading(root);
installFrameReading(overlays);
let state = fixtureFor(params.get("scene") ?? "S01", params.get("variant"));
applySidebarReview(state, params);
applyContentHosting(state, params);
applyHorizontalSlots(state, params);
applyFeedbackReview(state, params);
state.iconOrder ??= [];
state.hiddenIcons ??= [];
prepareLayoutFixture(state);
preferredGeometry.set(state, workspaceSizes(state));
let layerAnchor = null;
let modalAnchor = null;
let restoring = false;
const pageMemory = new Map();
let tooltip = null;
let shell = null;
let layoutView = null;
let rememberedPaper = null;
let rememberedWindow = null;

const text = (value, className) => h("span", { class: className }, value);
const graphic = (name, size = 16) => {
  const container = h("span", { class: "v-icon-wrap", "aria-hidden": "true" });
  container.innerHTML = icon(name, size);
  return container;
};
function button(label, glyph, type, value, options = {}) {
  const node = h("button", {
    type: "button", class: (glyph ? "v-icon-button " : "") + (options.class ?? ""),
    id: options.id, "aria-label": options.ariaLabel ?? label, title: options.ariaLabel, disabled: options.disabled,
    role: options.role, tabindex: options.tabindex, "aria-controls": options.controls,
    "aria-pressed": options.pressed == null ? options.selected == null || options.role === "tab" ? null : String(options.selected) : String(options.pressed),
    "aria-selected": options.role === "tab" && options.selected != null ? String(options.selected) : null,
    "aria-expanded": options.expanded == null ? null : String(options.expanded),
    "data-tooltip": options.ariaLabel ?? label,
    onclick: (event) => dispatch(type, value, event.currentTarget),
  }, glyph ? graphic(glyph, options.size ?? 16) : text(label));
  if (options.badge) node.append(text(String(options.badge), "v-badge"));
  return node;
}
function wordButton(label, type, value, options = {}) {
  return button(label, null, type, value, { ...options, class: "v-text-button " + (options.class ?? "") });
}
function allModules() {
  return orderedVisualContent([...(state.presentation ? REVIEW_CONTENT : MODULES), ...Array.from({ length: state.extraModules }, (_, i) => ({
    id: "X" + i, name: "模块 " + (i + 6), icon: "grid", width: "half",
    supports: ["half", "full"], height: 48, available: true, removable: true,
  }))], state.iconOrder);
}
function libraryName() { return state.presentation || state.contentHosting ? "内容库" : "模块库"; }
function hostingView() { return createContentHostingView({ state, dispatch, button, wordButton, graphic, grip }); }
function horizontalView() { return createHorizontalSlotsView({ state, button, wordButton, grip }); }
function feedbackView() { return createFeedbackReviewView({ state, dispatch }); }
function focusFeedbackControl(id) {
  const node = document.getElementById(id);
  if (!node || node.disabled) return;
  node.focus({ preventScroll: true });
  const content = node.closest(".v-page-content");
  if (!content) return;
  const box = node.getBoundingClientRect(), viewport = content.getBoundingClientRect();
  const top = viewport.top + 48; // Keep keyboard targets below the existing sticky composer header.
  if (box.bottom > viewport.bottom - 8) content.scrollTop += box.bottom - viewport.bottom + 8;
  else if (box.top < top && !node.closest(".v-composer-header")) content.scrollTop -= top - box.top;
}
function contentAllowed(module) { return !!module && (!state.presentation || module.allowed?.includes(state.contentSide)); }
function tabItems() { return reviewSections(state, allModules()).filter(section => section.presentation === "tabs").flatMap(section => section.items); }
function reviewPanel(side) {
  return reviewContentPanel({ side, state, items: allModules(), graphic, button, wordButton, grip, dispatch });
}
function allPages() {
  return [...PAGES, ...Array.from({ length: state.extraPages }, (_, i) => ({
    id: "page-" + i, name: "页面 " + (i + PAGES.length + 1), icon: "page", bottom: 0,
  }))].slice(0, state.pageCount);
}
function topVisible() { return state.topOpen; }
function layoutVisible() { return state.rightOpen && allPages()[state.rightPage]?.id === "layout"; }
function constrain() {
  const preferred = preferredGeometry.get(state) ?? workspaceSizes(state);
  const projected = constrainWorkspace({ ...state, ...preferred }, innerWidth, innerHeight);
  Object.assign(state, projected);
}
function setGeometry() {
  applyWorkspaceShellGeometry(shell, state);
}
function rememberPage() {
  const content = root.querySelector(".v-page-content");
  const input = root.querySelector("#page-input");
  if (content) pageMemory.set(state.rightPage, { scroll: content.scrollTop, input: input?.value ?? "" });
}
function draw({ preserveFocus = true } = {}) {
  state.editing = canEditLayout(state);
  const recoverFocus = preserveFocus ? captureFrameFocus(root) : () => {};
  const stageScroll = root.querySelector(".v-paper-scroll");
  const priorPaper = stageScroll?.querySelector(".v-paper")?.getBoundingClientRect();
  const priorScroll = stageScroll ? { x: stageScroll.scrollLeft, y: stageScroll.scrollTop } : null;
  const priorLeft = root.querySelector(".v-modules")?.scrollTop ?? 0;
  const priorRight = state.feedbackReview ? root.querySelector(".v-page-content")?.scrollTop ?? state.feedbackReview.scroll : null;
  constrain();
  layoutView = null;
  shell = h("div", { class: "visual-shell" + (state.contentHosting ? " content-hosting-review" : "") + (state.horizontalSlots ? " horizontal-slots-review" : ""), dataset: { platform: state.platform, scene: state.scene, variant: state.variant, arrangement: state.arrangement } });
  setGeometry();
  const middle = h("div", { class: "v-middle" }, iconRail(), leftPanel(), paperStage(), rightPanel(), pageRail());
  const footer = bottomBar();
  const merge = footer.querySelector(".v-merge");
  shell.append(titleBar(), topBar(), middle, footer, merge);
  root.replaceChildren(shell);
  adjustPaper();
  const savedPage = pageMemory.get(state.rightPage);
  if (savedPage && !state.contentHosting && !(state.presentation && state.contentSide === "right" && !state.reviewLayout)) root.querySelector(".v-page-content").scrollTop = savedPage.scroll;
  if (priorScroll) restorePaperScroll(priorScroll);
  if (priorPaper) {
    restorePaperPosition(priorPaper);
  }
  if (state.presentation && !(state.contentSide === "right" && state.reviewLayout)) {
    root.querySelector(".v-review-content").scrollTop = state.contentScroll[state.presentation === "tabs" ? state.activeContent : state.presentation] ?? 0;
  }
  else if (!state.contentHosting) root.querySelector(".v-modules").scrollTop = priorLeft;
  if (state.contentHosting) {
    hostingView().restore(root);
    layoutView?.update(layoutSnapshot(), state.assemblyBefore, hostingChanges(state, state.assemblyBefore));
  }
  renderLayers();
  if (state.feedbackReview) {
    const content = root.querySelector(".v-page-content");
    if (content) content.scrollTop = state.feedbackReview.scroll = priorRight;
  }
  if (state.horizontalSlots) horizontalView().restore(root);
  prepareFrameReading(root);
  prepareFrameReading(overlays);
  if (preserveFocus && !state.modal && !state.layer && !state.feedbackReview?.detailsOpen) {
    restoring = true;
    recoverFocus();
    restoring = false;
  }
  rememberPaperView();
}
function titleBar() {
  const menu = h("nav", { class: "v-menus", "aria-label": "应用菜单" },
    ...["文件", "编辑", "视图", "谱面", "播放", "插件", "帮助"].map((name) =>
      wordButton(name, "menu", name, { id: "menu-" + name, class: "v-menu", expanded: state.layer?.menu === name })));
  return createFrameCommandBar(menu);
}
function slot(which, ...items) { return h("div", { class: "v-slot", dataset: { slot: which } }, ...items.flat()); }
function topBar() {
  if (state.horizontalSlots) return horizontalView().top();
  const left = slot("left", text(state.assembly ? "内容编辑" : "", "v-mode-name"));
  const center = slot("center", text("", "v-mode-detail"));
  const right = slot("right", h("div", { class: "v-mode-actions" },
    state.assembly ? wordButton("取消", "assembly-cancel", null, { id: "assembly-cancel", ariaLabel: "取消内容编辑" }) : null,
    state.assembly ? wordButton("确认", "assembly-done", null, { id: "assembly-done", ariaLabel: "确认内容编辑", class: "primary" }) : null));
  return h("section", { class: "v-top", "aria-label": "上侧栏", hidden: !topVisible() },
    left, center, right, grip("top"), state.topOverflow ? button("上侧栏更多", "more", "more", "top", { id: "more-top" }) : null);
}
function iconRail() {
  if (state.contentHosting) return hostingView().rail("left");
  const actions = h("div", { class: "v-rail-actions", "aria-label": "模块面板操作" },
    button("模块面板", "grid", "region", "left", { id: "module-panel-trigger", class: "v-rail-button", pressed: state.leftOpen }));
  const list = h("div", { class: "v-rail-list", "aria-label": "模块开关" },
    ...(state.presentation && state.contentSide === "right" ? [] : allModules()).filter((module) => !state.hiddenIcons.includes(module.id) && (state.showModuleCatalog || state.enabled.includes(module.id))).map((module) => button(module.name, module.icon, "content-focus", module.id, {
      id: "rail-" + module.id, class: "v-rail-button",
      disabled: state.unavailable.includes(module.id) || !state.enabled.includes(module.id), pressed: tabItems().some(item => item.id === module.id) ? state.activeContent === module.id : state.enabled.includes(module.id),
      badge: state.badge && module.id === "B" ? 3 : null,
    })));
  return h("nav", { class: "v-rail v-icon-rail", "aria-label": "图标栏" }, actions, list,
    h("div", { class: "v-rail-footer" },
      state.presentation && state.contentSide === "right" ? null : button(libraryName(), "plus", "library", null, { id: "library-trigger", class: "v-rail-button" }),
      button("设置", "settings", "settings", null, { id: "settings-trigger", class: "v-rail-button" })));
}
function leftPanel() {
  if (state.contentHosting) return hostingView().panel("left");
  if (state.presentation && state.contentSide === "left") return reviewPanel("left");
  if (state.presentation && state.contentSide === "right") return h("section", { class: "v-left", "aria-label": "左侧栏", hidden: !state.leftOpen },
    h("div", { class: "v-panel-surface v-left-surface" }, h("div", { class: "v-region-header" }, text("左侧栏", "v-region-name")),
      h("div", { class: "v-modules" }, h("p", { class: "v-left-empty" }, "暂无内容"))), grip("left"));
  const head = h("div", { class: "v-region-header" }, text("左侧栏", "v-region-name"),
    button("收起左侧栏", "collapseLeft", "region", "left", { id: "collapse-left" }));
  const grid = h("div", { class: "v-modules", "aria-label": "模块网格" });
  const rows = rowsFor(state, allModules());
  if (!rows.length) grid.append(h("p", { class: "v-left-empty" }, "暂无内容"));
  for (const row of rows) {
    const minHeight = Math.max(...row.map((item) => item.height));
    const cells = row.map((module) => moduleCell(module, minHeight));
    if (row.length === 1 && row[0].width === "half") {
      cells.push(h("div", { class: "v-module-empty", dataset: { target: String(state.dragging) } }, state.editing ? "拖到这里" : ""));
    }
    grid.append(h("div", { class: "v-module-row" }, cells));
  }
  return h("section", { class: "v-left", "aria-label": "左侧栏", hidden: !state.leftOpen },
    h("div", { class: "v-panel-surface v-left-surface" }, head, grid,
      wordButton("添加模块", "library", null, { id: "add-module", class: "v-add-module" })), grip("left"));
}
function moduleCell(module, height) {
  const head = h("div", { class: "v-module-head" },
    state.editing ? button("选择" + module.name, "drag", "content-select", module.id, { id: "module-" + module.id, class: "v-drag-button" }) : null,
    text(state.editing && module.width === "half" ? module.id : module.name, "v-module-name"));
  const body = h("div", { class: "v-module-body", inert: state.editing, style: { minHeight: height + "px" } },
    h("div", { class: "v-module-dummy", "aria-label": module.name + "内容占位" }));
  return h("section", { class: "v-module " + module.width,
    dataset: { module: module.id, editing: String(state.editing), selected: String(state.editing && state.selectedModule === module.id) },
    "aria-label": module.name }, head, body);
}
function layoutSnapshot() {
  return { ...state, editing: canEditLayout(state), limits: workspaceLimits(state, innerWidth, innerHeight),
    valueLimits: workspaceValueLimits(state, innerWidth, innerHeight) };
}
function layoutComponent() {
  layoutView = createWorkspaceLayoutVisual({ state: layoutSnapshot(), before: state.assemblyBefore,
    begin: anchor => dispatch("assembly", null, anchor), region: side => dispatch("layout-region", side),
    finish: confirm => dispatch(confirm ? "assembly-done" : "assembly-cancel"),
    resize: resizeValue, arrange: mode => dispatch("layout-arrange", mode), sections: layoutSections(),
  });
  layoutView.element.hidden = !layoutVisible();
  return layoutView.element;
}
function layoutSections() {
  const group = (label, ...nodes) => h("section", { class: "v-layout-group", "aria-label": label }, text(label, "v-layout-group-label"), ...nodes);
  const schemes = state.feedbackReview ? feedbackView().schemes() : group("布局方案", h("p", { class: "v-layout-target-name" }, state.preset + (state.custom ? " · 自定义" : " · 内置")),
    wordButton("管理布局方案", "presets", null, { id: "layout-schemes", disabled: !canEditLayout(state) }),
    h("p", { class: "v-layout-note" }, canEditLayout(state) ? "方案修改随本次布局一起确认或撤回。" : "进入内容编辑后管理方案。"));
  if (state.contentHosting) return [...hostingView().layoutSections(), schemes];
  const side = state.contentSide === "right" ? "右侧栏" : "左侧栏";
  const presentation = state.presentation ? group("承载页面",
    h("p", { class: "v-layout-target-name" }, side + " · 内容页"),
    h("div", { class: "v-layout-control-row" }, ...[["页签", "tabs"], ["列表", "list"], ["网格", "grid"], ["分区混用", "mixed"]].map(([label, value]) =>
      h("button", { type: "button", id: "layout-" + value, class: "v-layout-control", "aria-label": label,
        "aria-pressed": String(state.presentation === value), disabled: !canEditLayout(state),
        onclick: event => dispatch("presentation", value, event.currentTarget) }, text(label, "v-layout-control-label")))),
    h("p", { class: "v-layout-note" }, "呈现方式属于承载页面；分区混用保留各区自己的排布。")) : null;
  const content = group("选中内容", ...layoutContentNodes());
  return [presentation, content, schemes].filter(Boolean);
}
function layoutContentNodes() {
  return [
    canEditLayout(state) ? reviewEditTools({ state, items: allModules(), button, wordButton, dispatch })
      : h("p", { class: "v-layout-note" }, state.enabled.length ? "进入编辑后选择网格内容，查看占宽与顺序。" : "当前暂无内容，可先在内容库查看。"),
    state.contentSide === "right" ? wordButton("查看待编辑页面", "review-content", null, { id: "layout-review-content" }) : null,
    wordButton(libraryName(), "library", null, { id: "layout-library" })
  ].filter(Boolean);
}
function paperStage() {
  const paper = h("div", { class: "v-paper", "aria-label": "A4 纯白谱页" },
    !state.blankPaper ? h("img", { src: "fixtures/approved-score.svg", alt: "只读练习谱，16 小节", draggable: "false" }) : null,
    state.paperOverlay ? h("div", { class: "v-paper-overlay", "aria-hidden": "true" },
      h("i", { class: "v-selection" }), h("i", { class: "v-playhead" }), h("i", { class: "v-annotation" })) : null);
  return h("main", { class: "v-stage", id: "score-stage", tabindex: "0", "aria-label": "谱面舞台",
    oncontextmenu: (event) => { event.preventDefault(); openLayer({ type: "context", point: { x: event.clientX, y: event.clientY } }, event.currentTarget); } },
    h("div", { class: "v-paper-scroll", id: "score-scroll" }, h("div", { class: "v-paper-space" }, paper)));
}
function adjustPaper({ recenter = false } = {}) {
  const stage = root.querySelector(".v-stage");
  const rect = stage.getBoundingClientRect();
  // Fit once on entry or explicit zoom. Dock/module changes preserve paper scale.
  if (state.paperWidth == null) {
    const center = innerWidth / 2;
    const centeredWidth = 2 * Math.max(1, Math.min(center - rect.x, rect.right - center) - 20);
    state.paperWidth = state.zoom === "fit"
      ? Math.floor(Math.min(700, centeredWidth, (rect.height - 40) * 700 / 990))
      : 700 * parseFloat(state.zoom) / 100;
  }
  // The window owns the center. Dock changes retain it; window resizing updates it.
  if (state.paperOrigin == null) state.paperOrigin = {
    x: (innerWidth - state.paperWidth) / 2,
    y: rect.y + 20,
  };
  if (recenter) state.paperOrigin.x = (innerWidth - state.paperWidth) / 2;
  shell.style.setProperty("--paper-width", state.paperWidth + "px");
  setPaperPan();
}
function setPaperPan() {
  const rect = root.querySelector(".v-stage").getBoundingClientRect();
  const x = state.paperOrigin.x - rect.x, y = state.paperOrigin.y - rect.y;
  shell.style.setProperty("--paper-left", Math.max(0, x) + "px");
  shell.style.setProperty("--paper-top", Math.max(0, y) + "px");
  shell.style.setProperty("--paper-pan-x", Math.min(0, x) + "px");
  shell.style.setProperty("--paper-pan-y", Math.min(0, y) + "px");
}
function restorePaperScroll(previous) {
  const viewport = root.querySelector(".v-paper-scroll");
  // Retain native scroll capacity when panels close or an explicit zoom shrinks content.
  // A transform-only compensation would leave the page unreachable when scrolling back.
  shell.style.setProperty("--paper-scroll-width", previous.x > 0 ? Math.ceil(viewport.clientWidth + previous.x) + "px" : "0px");
  shell.style.setProperty("--paper-scroll-height", previous.y > 0 ? Math.ceil(viewport.clientHeight + previous.y) + "px" : "0px");
  viewport.scrollLeft = previous.x;
  viewport.scrollTop = previous.y;
}
function restorePaperPosition(priorPaper) {
  const paper = root.querySelector(".v-paper").getBoundingClientRect();
  // Account for subpixel scroll rounding without introducing a hidden pan offset.
  // Explicit zoom keeps the page center; ordinary UI operations keep the full rect.
  state.paperOrigin.x += priorPaper.x + (priorPaper.width - paper.width) / 2 - paper.x;
  state.paperOrigin.y += priorPaper.y - paper.y;
  setPaperPan();
}
function rememberPaperView() {
  const viewport = root.querySelector(".v-paper-scroll");
  const paper = root.querySelector(".v-paper");
  if (!viewport || !paper) return;
  const rect = paper.getBoundingClientRect();
  rememberedPaper = { x: rect.x, y: rect.y, width: rect.width, scrollX: viewport.scrollLeft, scrollY: viewport.scrollTop };
  rememberedWindow = { width: innerWidth, height: innerHeight };
}
root.addEventListener("scroll", event => {
  if (!event.target.matches?.(".v-paper-scroll")) return;
  // Native scroll clamping during a window resize must not overwrite the old view.
  if (rememberedWindow?.width === innerWidth && rememberedWindow?.height === innerHeight) rememberPaperView();
}, { capture: true, passive: true });
function rightPanel() {
  if (state.contentHosting && !state.reviewLayout) return hostingView().panel("right");
  if (state.presentation && state.contentSide === "right" && !state.reviewLayout) return reviewPanel("right");
  const pages = allPages();
  const current = pages[state.rightPage] ?? PAGES[0];
  const header = h("div", { class: "v-page-header" }, text(current.name, "v-region-name"),
    h("div", { class: "v-page-navigation" },
      button("上一页", "collapseLeft", "page-step", -1, { id: "page-previous", disabled: state.rightPage === 0 }),
      text((state.rightPage + 1) + " / " + pages.length),
      button("下一页", "collapseRight", "page-step", 1, { id: "page-next", disabled: state.rightPage >= pages.length - 1 })));
  const content = h("div", { class: "v-page-content", "aria-label": current.name + "内容" },
    layoutComponent(),
    state.rightLong && current.id !== "layout" ? h("div", { class: "v-page-long" }, ...Array.from({ length: 40 }, (_, i) => h("p", {}, "页面内容 " + (i + 1)))) : null);
  const memo = pageMemory.get(state.rightPage);
  if (memo) content.scrollTop = memo.scroll;
  const bottomHeight = state.bottomOverride ?? current.bottom;
  const bottom = h("div", { class: "v-page-bottom", hidden: bottomHeight === 0 },
    bottomHeight ? h("input", { id: "page-input", "aria-label": "页面输入占位", placeholder: "输入…", value: memo?.input ?? state.pageInput,
      oninput: (event) => { pageMemory.set(state.rightPage, { scroll: content.scrollTop, input: event.currentTarget.value }); } }) : null);
  const page = h("section", { class: "v-page v-panel-surface", id: "page-panel-" + state.rightPage, role: "tabpanel", "aria-labelledby": "page-tab-" + state.rightPage, "aria-label": current.name,
    style: { gridTemplateRows: "32px minmax(0,1fr) " + bottomHeight + "px" } }, header, content, bottom);
  const remaining = Math.max(0, pages.length - state.rightPage - 1);
  const right = h("section", { class: "v-right", "aria-label": "右侧栏", hidden: !state.rightOpen || pages.length === 0 },
    remaining > 1 ? h("div", { class: "v-page-ghost second", "aria-hidden": "true" }) : null,
    remaining > 0 ? h("div", { class: "v-page-ghost first", "aria-hidden": "true" }) : null,
    page, grip("right"));
  return right;
}
function pageRail() {
  if (state.contentHosting) return hostingView().rail("right");
  if (state.presentation && state.contentSide === "right") return h("nav", { class: "v-rail v-page-rail", "aria-label": "页签条" },
    h("div", { class: "v-rail-actions" },
      button("右侧内容", "right", "review-content", null, { class: "v-rail-button", pressed: !state.reviewLayout })),
    h("div", { class: "v-rail-list" }, ...allModules().filter(item => state.enabled.includes(item.id) && !state.hiddenIcons.includes(item.id)).map(item =>
      button(item.name, item.icon, "content-focus", item.id,
        { id: "rail-" + item.id, class: "v-rail-button", selected: tabItems().some(tab => tab.id === item.id) && state.activeContent === item.id,
          pressed: !tabItems().some(tab => tab.id === item.id), disabled: state.unavailable.includes(item.id) }))),
    h("div", { class: "v-rail-footer" }, button("工作区布局", "layout", "review-layout", null, { class: "v-rail-button", selected: state.reviewLayout }),
      button(libraryName(), "plus", "library", null, { id: "right-library-trigger", class: "v-rail-button" })));
  return h("nav", { class: "v-rail v-page-rail", "aria-label": "页签条" },
    h("div", { class: "v-rail-list", role: "tablist", "aria-label": "右侧栏页面", "aria-orientation": "vertical",
      onkeydown: event => {
        if (!isPlainKey(event)) return;
        const at = allPages().findIndex((_, index) => "page-tab-" + index === event.target.id);
        if (at < 0 || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        const next = event.key === "Home" ? 0 : event.key === "End" ? allPages().length - 1 : Math.max(0, Math.min(allPages().length - 1, at + (event.key === "ArrowUp" ? -1 : 1)));
        event.preventDefault(); dispatch("page", next); document.getElementById("page-tab-" + next)?.focus({ preventScroll: true });
      } }, ...allPages().map((page, index) =>
      button(page.name, page.icon, "page", index, { id: "page-tab-" + index, class: "v-rail-button", role: "tab", controls: state.rightPage === index ? "page-panel-" + index : null,
        tabindex: state.rightPage === index ? 0 : -1, selected: state.rightPage === index }))));
}
function bottomBar() {
  const head = h("div", { class: "v-voice-header" },
    h("button", { id: "voice-trigger", class: "v-voice-trigger", type: "button", "aria-label": "下侧栏",
      title: state.voiceOpen ? "收起下侧栏" : "展开下侧栏", "data-tooltip": state.voiceOpen ? "收起下侧栏" : "展开下侧栏",
      "aria-expanded": String(state.voiceOpen), onclick: () => dispatch("region", "voice") },
      h("span", { class: "v-voice-icon", "aria-hidden": "true" }, graphic(state.voiceOpen ? "down" : "up"))),
    state.voiceOpen ? grip("voice") : null);
  const body = state.horizontalSlots ? horizontalView().voice() : h("section", { class: "v-voice-content", "aria-label": "下侧栏", hidden: !state.voiceOpen },
    h("div", { class: "v-voice-placeholder", "aria-label": "面板内容占位" }, h("i", { class: "v-placeholder-line" }), h("i", { class: "v-placeholder-line" })));
  const more = (which) => state.slotOverflow === which ? button("更多 · " + ({ left: "播放器", center: "节拍器", right: "谱面" })[which],
    "more", "more", which, { id: "more-" + which }) : null;
  const left = slot("left", !state.emptySlots ? [
    button("播放", "play", null, null, { disabled: true }),
    button("停止", "stop", null, null, { disabled: true }), more("left")] : null);
  const center = slot("center", !state.emptySlots ? [
    button("节拍器", "metronome", null, null, { disabled: true }), text("96", "v-slot-label"), more("center")] : null);
  const right = slot("right", state.feedbackReview ? feedbackView().title() : null, !state.emptySlots ? [
    text("1 / 1", "v-slot-label"), text("16 小节", "v-slot-label"),
    h("button", { class: "v-zoom", id: "zoom-trigger", type: "button", "aria-label": "谱面缩放",
      onclick: (event) => dispatch("zoom", null, event.currentTarget) }, text(state.zoom === "fit" ? "整页" : state.zoom), graphic("chevron")),
    more("right")] : null);
  return h("footer", { class: "v-footer", "aria-label": "底部" }, head, body, state.horizontalSlots ? horizontalView().merge() : h("div", { class: "v-merge", "aria-label": "合并栏" }, left, center, right));
}

function grip(side) {
  const node = h("button", { class: "v-grip", id: "grip-" + side, type: "button", role: "separator",
    "aria-label": "调整" + ({ left: "左侧栏宽度", right: "右侧栏宽度", top: "上侧栏高度", voice: "下侧栏高度" })[side],
    "aria-orientation": side === "top" || side === "voice" ? "horizontal" : "vertical",
    disabled: !state[side + "Open"],
    "aria-valuenow": String(state[WORKSPACE_SIZE_KEYS[side]]),
    "aria-valuemin": String(WORKSPACE_MINIMUMS[side]),
    "aria-valuemax": String(workspaceLimits(state, innerWidth, innerHeight)[side]),
    onpointerdown: (event) => resizeStart(event, side),
    ondblclick: () => { resizeValue(side, WORKSPACE_DEFAULT_SIZES[side]); draw(); },
    onkeydown: (event) => {
      if (!isPlainKey(event)) return;
      const delta = workspaceGripKeyDelta(side, event.key);
      if (delta == null) return;
      event.preventDefault();
      resizeValue(side, state[WORKSPACE_SIZE_KEYS[side]] + delta);
      draw();
    } });
  return node;
}
function resizeValue(side, value) {
  const priorPaper = root.querySelector(".v-paper").getBoundingClientRect();
  const viewport = root.querySelector(".v-paper-scroll");
  const priorScroll = { x: viewport.scrollLeft, y: viewport.scrollTop };
  const next = workspaceResizeValue(state, side, value, innerWidth, innerHeight);
  if (state[WORKSPACE_SIZE_KEYS[side]] === next) return;
  state[WORKSPACE_SIZE_KEYS[side]] = next;
  preferredGeometry.set(state, { ...(preferredGeometry.get(state) ?? workspaceSizes(state)), [WORKSPACE_SIZE_KEYS[side]]: next });
  state.modified = true;
  setGeometry();
  syncSizeControls();
  adjustPaper();
  restorePaperScroll(priorScroll);
  restorePaperPosition(priorPaper);
  rememberPaperView();
}
function syncSizeControls() {
  layoutView?.update(layoutSnapshot(), state.assemblyBefore, state.contentHosting ? hostingChanges(state, state.assemblyBefore) : []);
  if (state.contentHosting) hostingView().sync(root);
  if (state.horizontalSlots) horizontalView().sync(root);
  if (layoutView) updateReviewCapacity(layoutView.element, state, allModules());
  const limits = workspaceLimits(state, innerWidth, innerHeight);
  for (const [region, key] of Object.entries(WORKSPACE_SIZE_KEYS)) {
    const handle = root.querySelector("#grip-" + region);
    handle?.setAttribute("aria-valuenow", state[key]);
    handle?.setAttribute("aria-valuemax", limits[region]);
  }
}
function resizeStart(event, side) {
  if (event.button !== 0) return;
  event.preventDefault();
  closeLayer(false);
  const target = event.currentTarget;
  target.setPointerCapture(event.pointerId);
  const initial = state[WORKSPACE_SIZE_KEYS[side]];
  const horizontal = side === "top" || side === "voice";
  const start = horizontal ? event.clientY : event.clientX;
  target.dataset.resizing = "true";
  shell.dataset.resizing = "true";
  let moved = false;
  const move = (next) => {
    moved = true;
    const difference = (horizontal ? next.clientY : next.clientX) - start;
    resizeValue(side, initial + difference * (side === "left" || side === "top" ? 1 : -1));
  };
  const end = () => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", end);
    target.removeEventListener("pointercancel", end);
    target.dataset.resizing = "false";
    shell.dataset.resizing = "false";
    if (moved) draw();
    document.getElementById("grip-" + side)?.focus({ preventScroll: true });
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", end);
  target.addEventListener("pointercancel", end);
}
function dispatch(type, value, anchor) {
  if (!type) return;
  if (state.feedbackReview && type === "scheme-submit") {
    const token = submitScheme(state);
    draw();
    if (token === null) { focusFeedbackControl("scheme-name"); return; }
    focusFeedbackControl(state.feedbackReview.editor.kind === "delete" ? "scheme-editor-cancel" : "scheme-name");
    const source = state;
    setTimeout(() => {
      const editingName = root.querySelector(".fr-editor")?.contains(document.activeElement);
      if (state !== source || !settleScheme(state, token)) return;
      draw(); if (editingName) focusFeedbackControl("scheme-save");
    }, 900);
    return;
  }
  if (state.feedbackReview && type === "feedback-source") {
    state.feedbackReview.detailsOpen = false;
    state.rightOpen = state.reviewLayout = true; state.rightPage = 3;
    draw(); document.getElementById("composer-edit")?.focus({ preventScroll: true }); return;
  }
  const editorReturn = state.feedbackReview?.editor?.kind;
  if (state.feedbackReview && runFeedbackAction(state, type, value)) {
    if (type === "feedback-details") { state.layer = null; hideTooltip(); }
    draw();
    if (type === "scheme-editor") focusFeedbackControl(value === "delete" ? "scheme-submit" : "scheme-name");
    if (type === "scheme-editor-cancel") focusFeedbackControl("scheme-" + editorReturn);
    if (type === "feedback-details" && state.feedbackReview.detailsOpen) document.getElementById("feedback-close")?.focus({ preventScroll: true });
    if (type === "feedback-close") (document.getElementById("feedback-status") ?? document.getElementById("score-stage"))?.focus({ preventScroll: true });
    if (type === "feedback-check") focusFeedbackControl(state.feedbackReview.detailsOpen ? "feedback-close" : canEditLayout(state) ? "scheme-save" : "composer-edit");
    return;
  }
  if (type === "slot-activate" && activateSlotContribution(state, value)) {
    const returnId = state.layer?.type === "more" ? "more-" + state.layer.slot : anchor?.id;
    state.notice = state.horizontalSlots.result;
    closeLayer(false); draw();
    document.getElementById(returnId)?.focus({ preventScroll: true });
    return;
  }
  if (state.contentHosting && runHostingAction(state, type, value)) {
    if (type === "hosting-focus" || type === "hosting-page") state.layer = null;
    draw();
    if (type === "hosting-focus") {
      const node = root.querySelector('[data-content="' + value + '"]');
      const container = node?.closest(".ch-content");
      if (container && container.dataset.mode !== "tabs") container.scrollTop += node.getBoundingClientRect().top - container.getBoundingClientRect().top;
    }
    return;
  }
  if (requiresLayoutEdit(type) && !canEditLayout(state) && !(type === "modal-confirm" && state.modal?.type === "message")) return;
  switch (type) {
    case "region":
      if (value === "top") state.topOpen = !state.topOpen;
      else if (value === "voice") state.voiceOpen = !state.voiceOpen;
      else state[value + "Open"] = !state[value + "Open"];
      if (value === "top" && state.topOpen) state.topContributed = true;
      state.modified = true;
      draw();
      break;
    case "layout-region":
      if (value === "top") {
        state.topOpen = !state.topOpen;
        state.topContributed = true;
      } else if (value === "voice") state.voiceOpen = !state.voiceOpen;
      else state[value + "Open"] = !state[value + "Open"];
      state.modified = true;
      draw();
      break;
    case "layout-arrange":
      if (value === "default") {
        state.arrangement = "balanced";
        state.topContributed = state.assembly;
        state.topOpen = true;
        state.leftOpen = false;
        state.rightOpen = true;
        state.voiceOpen = false;
      } else state.arrangement = value;
      const arranged = state.arrangement === "compact" ? WORKSPACE_COMPACT_SIZES : WORKSPACE_DEFAULT_SIZES;
      preferredGeometry.set(state, { leftWidth: arranged.left, rightWidth: arranged.right, topHeight: arranged.top, voiceHeight: arranged.voice });
      constrain();
      state.modified = true;
      draw();
      break;
    case "module":
      if (state.unavailable.includes(value) || !contentAllowed(allModules().find(item => item.id === value)) || (state.enabled.includes(value) && !allModules().find(item => item.id === value)?.removable)) return;
      if (state.enabled.includes(value)) state.enabled = state.enabled.filter((id) => id !== value);
      else { state.enabled.push(value); state[state.presentation ? state.contentSide + "Open" : "leftOpen"] = true; state.reviewLayout = false; }
      state.modified = true; draw();
      break;
    case "module-remove": {
      const module = allModules().find((entry) => entry.id === value);
      if (!module?.removable) return;
      state.enabled = state.enabled.filter((id) => id !== value);
      state.modified = true; state.layer = null; draw();
      break;
    }
    case "module-width": {
      const module = allModules().find((entry) => entry.id === value);
      if (module.supports.length < 2) return;
      if ((state.widths[value] ?? module.width) === "full" && !reviewHalfSpace(state, module).allowed) return;
      state.widths[value] = (state.widths[value] ?? module.width) === "full" ? "half" : "full";
      state.modified = true; draw();
      break;
    }
    case "module-move": {
      const { id, delta } = value;
      state.enabled = moveReviewContent(state, allModules(), id, delta);
      state.selectedModule = id; state.modified = true; state.layer = null; draw();
      document.getElementById("module-" + id)?.focus({ preventScroll: true });
      break;
    }
    case "content-select": state.selectedModule = value; draw(); break;
    case "content-focus": {
      if (!state.enabled.includes(value)) return;
      const tabs = tabItems();
      if (tabs.some(item => item.id === value)) state.activeContent = value;
      state[state.presentation ? state.contentSide + "Open" : "leftOpen"] = true;
      state.reviewLayout = false; draw();
      const node = root.querySelector('[data-module="' + value + '"]');
      const container = root.querySelector(state.presentation ? ".v-review-content" : ".v-modules");
      if (node && container && !tabs.some(item => item.id === value)) container.scrollTop += node.getBoundingClientRect().top - container.getBoundingClientRect().top;
      break;
    }
    case "content-step": {
      const tabs = tabItems();
      const index = tabs.findIndex(item => item.id === state.activeContent);
      state.activeContent = tabs[Math.max(0, Math.min(tabs.length - 1, index + value))]?.id;
      draw(); break;
    }
    case "review-layout": state.layer = null; state.reviewLayout = true; state.rightPage = 3; state.rightOpen = true; draw(); break;
    case "review-content": {
      const wasLayout = state.reviewLayout;
      state.reviewLayout = false; state.rightOpen = wasLayout || !state.rightOpen; draw(); break;
    }
    case "content-drag":
      state.movingContent = value;
      state.selectedModule = value;
      for (const node of root.querySelectorAll(".v-review-card")) node.dataset.selected = String(node.dataset.module === value);
      break;
    case "content-drag-end":
      state.movingContent = null;
      for (const node of root.querySelectorAll(".v-review-card")) node.dataset.drop = "false";
      break;
    case "content-drop": {
      const source = state.movingContent;
      const ids = reviewSections(state, allModules()).find(section => section.presentation === "grid" && section.items.some(item => item.id === source))?.items.map(item => item.id) ?? [];
      const destination = ids.indexOf(value);
      if (source && source !== value && destination >= 0) {
        state.enabled = moveReviewContent(state, allModules(), source, destination - ids.indexOf(source));
        state.selectedModule = source; state.modified = true;
      }
      state.movingContent = null; draw(); break;
    }
    case "icon-visibility":
      state.hiddenIcons = state.hiddenIcons.includes(value) ? state.hiddenIcons.filter(id => id !== value) : [...state.hiddenIcons, value];
      draw(); break;
    case "icon-order":
      state.iconOrder = moveVisualItem(allModules().map(item => item.id), value.id, value.delta);
      draw(); break;
    case "presentation":
      if (!state.presentation || !["tabs", "list", "grid", "mixed"].includes(value)) return;
      state.presentation = value; state.modified = true; draw(); break;
    case "library-clear":
      state.libraryQuery = "";
      renderLayers(); break;
    case "assembly":
      if (anchor?.id !== "composer-edit" || !beginLayoutEdit(state)) return;
      rememberPage(); state.rightPage = PAGES.findIndex(page => page.id === "layout"); state.rightOpen = true; state.reviewLayout = true;
      draw(); break;
    case "assembly-cancel":
      if (!canEditLayout(state) || !finishFeedbackEdit(state, false)) return;
      if (!finishLayoutEdit(state, false)) return;
      draw(); document.getElementById("composer-edit")?.focus({ preventScroll: true }); break;
    case "assembly-done":
      if (!canEditLayout(state)) return;
      if (!finishFeedbackEdit(state, true)) { draw(); return; }
      if (!finishLayoutEdit(state, true)) return;
      draw(); document.getElementById("composer-edit")?.focus({ preventScroll: true }); break;
    case "fit": state.zoom = "fit"; state.paperWidth = null; draw(); break;
    case "page-step":
      rememberPage(); state.rightPage = Math.max(0, Math.min(state.pageCount - 1, state.rightPage + value)); draw(); break;
    case "page":
      rememberPage();
      if (state.rightPage === value) state.rightOpen = !state.rightOpen;
      else { state.rightPage = value; state.rightOpen = true; }
      draw(); break;
    case "preset":
      Object.assign(state, structuredClone(PRESETS[value]));
      preferredGeometry.set(state, workspaceSizes(state));
      state.preset = value; state.custom = false; state.modified = false; state.layer = null; state.widths = {}; draw(); break;
    case "restore":
      Object.assign(state, structuredClone(PRESETS[state.preset] ?? PRESETS["写谱"]));
      preferredGeometry.set(state, workspaceSizes(state));
      state.modified = false; state.layer = null; state.notice = "已恢复默认布局"; draw(); break;
    case "zoom-value":
      state.zoom = value; state.paperWidth = null; state.layer = null; draw(); break;
    case "notice-close": state.notice = null; renderLayers(); break;
    case "layer-close": closeLayer(); break;
    case "modal":
      state.layer = null; state.modal = { type: value, cancellable: true }; modalAnchor = anchor?.id; renderLayers(); break;
    case "modal-cancel": closeModal(); break;
    case "modal-confirm": {
      const kind = state.modal?.type;
      const name = document.getElementById("preset-name")?.value.trim();
      if (kind === "delete") { Object.assign(state, structuredClone(PRESETS["写谱"])); state.preset = "写谱"; state.custom = false; }
      else if (kind === "save" || kind === "rename") {
        if (!name) { document.getElementById("preset-name")?.focus(); return; }
        state.preset = name; state.custom = true;
      }
      state.modal = null; state.modified = false; state.notice = kind === "delete" ? "预设已删除" : "已保存"; draw();
      document.getElementById("settings-trigger")?.focus({ preventScroll: true });
      break;
    }
    case "library": openLayer({ type: "library" }, anchor); break;
    case "menu": openLayer({ type: "menu", menu: value }, anchor); break;
    case "module-menu":
      state.selectedModule = value;
      if (state.presentation) draw();
      for (const module of root.querySelectorAll(".v-module,.v-review-card")) {
        module.dataset.selected = String(state.editing && module.dataset.module === value);
      }
      openLayer({ type: "module", module: value }, state.presentation ? document.getElementById("module-" + value) : anchor);
      break;
    case "preset-manage": openLayer({ type: "preset-manage" }, anchor); break;
    case "presets": openLayer({ type: "presets" }, anchor); break;
    case "zoom": openLayer({ type: "zoom" }, anchor); break;
    case "more": openLayer({ type: "more", slot: value }, anchor); break;
    case "settings": openLayer({ type: "settings" }, anchor); break;
    case "commands": openLayer({ type: "commands" }, anchor); break;
    case "search": openLayer({ type: "search" }, anchor); break;
    default: break;
  }
}
function openLayer(layer, anchor) {
  hideTooltip();
  if (state.feedbackReview) state.feedbackReview.detailsOpen = false;
  if (state.layer?.type === layer.type && state.layer?.menu === layer.menu && layerAnchor === anchor) { closeLayer(); return; }
  state.layer = layer;
  layerAnchor = anchor ?? root.querySelector("#score-stage");
  layerAnchor?.setAttribute("aria-expanded", "true");
  renderLayers();
}
function closeLayer(restore = true) {
  const anchor = layerAnchor?.isConnected ? layerAnchor : state.layer ? defaultAnchor(state.layer) : null;
  state.layer = null;
  anchor?.setAttribute("aria-expanded", "false");
  if (restore && anchor?.isConnected) {
    restoring = true; anchor.focus({ preventScroll: true }); restoring = false;
  }
  renderLayers();
}
function closeModal() {
  state.modal = null;
  renderLayers();
  document.getElementById(modalAnchor ?? "settings-trigger")?.focus({ preventScroll: true });
}
function menuItem(label, glyph, type, value, { disabled = false, shortcut = "", checked = false } = {}) {
  return h("button", { type: "button", class: "v-menu-item", disabled: disabled || (requiresLayoutEdit(type) && !canEditLayout(state)), role: "menuitem",
    "aria-label": label, onclick: (event) => { state.layer = null; dispatch(type, value, event.currentTarget); } },
    graphic(checked ? "check" : glyph || "info"), text(label), shortcut ? h("kbd", {}, shortcut) : null);
}
function layerContent(layer) {
  const rule = () => h("div", { class: "v-menu-rule", role: "separator" });
  switch (layer.type) {
    case "presets":
      return [h("div", { class: "v-menu-caption" }, "工作区布局" + (state.modified ? " · 已修改" : "")),
        ...[...Object.keys(PRESETS), ...(state.custom ? [state.preset] : [])].map((name) =>
          menuItem(name, "layout", PRESETS[name] ? "preset" : "layer-close", name, { checked: state.preset === name })),
        h("div", { class: "v-menu-rule", role: "separator" }), menuItem("管理布局方案…", "settings", "preset-manage")];
    case "preset-manage":
      return [menuItem("恢复默认", "reset", "restore", null, { disabled: state.custom || !state.modified }),
        menuItem("另存为…", "plus", "modal", "save"), rule(),
        menuItem("重命名…", "pencil", "modal", "rename", { disabled: !state.custom }),
        menuItem("删除预设…", "close", "modal", "delete", { disabled: !state.custom })];
    case "module": {
      const module = allModules().find((entry) => entry.id === layer.module);
      const index = state.enabled.indexOf(layer.module);
      return [menuItem("上移", "up", "module-move", { id: module.id, delta: -1 }, { disabled: index <= 0 }),
        menuItem("下移", "down", "module-move", { id: module.id, delta: 1 }, { disabled: index >= state.enabled.length - 1 }),
        rule(), menuItem("整行 / 半行", "half", "module-width", module.id, { disabled: module.supports.length < 2 }),
        menuItem("移出内容", "close", "module-remove", module.id, { disabled: !module.removable })];
    }
    case "zoom":
      return [menuItem("整页", "fit", "zoom-value", "fit", { checked: state.zoom === "fit" }),
        menuItem("100%", "full", "zoom-value", "100%", { checked: state.zoom === "100%" })];
    case "menu":
      if (layer.menu === "视图") return [menuItem("命令面板", "search", "commands"), menuItem("搜索", "search", "search"), rule(),
        menuItem("左侧栏", "left", "region", "left", { checked: state.leftOpen }),
        menuItem("右侧栏", "right", "region", "right", { checked: state.rightOpen }),
        menuItem("下侧栏", "bottom", "region", "voice", { checked: state.voiceOpen })];
      if (layer.menu === "编辑") return [menuItem("撤销", "undo", null, null, { disabled: true }), rule(),
        menuItem("工作区布局…", "layout", "review-layout"), menuItem("命令面板", "search", "commands")];
      if (layer.menu === "插件") return [menuItem(libraryName(), "library", "library")];
      if (layer.menu === "谱面") return [menuItem("工作区布局…", "layout", "review-layout"), menuItem("适应整页", "fit", "fit")];
      return [menuItem("打开…", "page", null, null, { disabled: true }),
        menuItem("保存", "check", null, null, { disabled: true }), rule(), menuItem("命令面板", "search", "commands")];
    case "more":
      if (state.horizontalSlots) return horizontalView().menu(layer.slot);
      return [menuItem(layer.slot === "top" ? "附加工具" : "槽位项目", "grid", null, null, { disabled: true }),
        menuItem("设置", "settings", "settings")];
    case "settings":
      return [menuItem(libraryName(), "library", "library"), menuItem("工作区布局…", "layout", "review-layout"),
        menuItem("命令面板", "search", "commands")];
    case "selection":
      return [menuItem("选择", "select", null, null, { disabled: true }), menuItem("适应整页", "fit", "fit")];
    default:
      return [menuItem("适应整页", "fit", "fit"), menuItem("100%", "full", "zoom-value", "100%"),
        rule(), menuItem("工作区布局…", "layout", "review-layout")];
  }
}
function panelContent(layer) {
    const name = ({ library: libraryName(), commands: "命令面板", search: "搜索" })[layer.type];
  const input = h("input", { id: "layer-search", type: "search", "aria-label": "搜索" + name, placeholder: "搜索…",
    value: layer.type === "library" ? state.libraryQuery : "", oninput: (event) => {
      if (layer.type === "library") state.libraryQuery = event.currentTarget.value;
      if (layer.type === "library") document.getElementById("library-clear")?.toggleAttribute("disabled", !state.libraryQuery);
      fillPanelList(layer, event.currentTarget.value);
    } });
  return [
    h("div", { class: "v-layer-title" }, h("strong", {}, name), button("关闭" + name, "close", "layer-close")),
    h("label", { class: "v-search" }, graphic("search"), input,
      layer.type === "library" ? button("清空搜索", "close", "library-clear", null, { id: "library-clear", disabled: !state.libraryQuery }) : null),
    layer.type === "library" ? h("p", { class: "v-library-help" }, canEditLayout(state) ? "内容编辑中 · 加入、移出和图标调整可统一取消。" : "开启内容编辑后才能加入、移出或调整图标。") : null,
    layer.type === "library" && !canEditLayout(state) ? wordButton("前往工作区布局", "review-layout", null, { id: "library-layout" }) : null,
    h("div", { class: "v-layer-list", id: "panel-list" }),
  ];
}
function fillPanelList(layer, query = "") {
  const list = document.getElementById("panel-list");
  if (!list) return;
  if (state.contentHosting && layer.type === "library") { hostingView().library(list, query); prepareFrameReading(overlays); return; }
  if (layer.type === "library") {
    const modules = allModules().filter((module) => module.name.toLowerCase().includes(query.toLowerCase()));
    const order = allModules().map(module => module.id);
    list.replaceChildren(...modules.map(module => {
      const enabled = state.enabled.includes(module.id);
      const hidden = state.hiddenIcons.includes(module.id);
      const unavailable = state.unavailable.includes(module.id);
      const allowed = contentAllowed(module);
      const source = state.presentation ? "视觉示例" : "内置";
      const location = enabled ? (state.contentSide === "right" ? "右侧栏" : "左侧栏") : "未加入";
      const reason = unavailable ? "暂不可用 · 来源尚未准备好" : !allowed ? "仅允许左侧栏" : enabled && !module.removable ? "固定内容不可移出" : "";
      return h("div", { class: "v-library-entry", dataset: { content: module.id } },
        h("div", { class: "v-library-row" }, graphic(module.icon), h("span", { class: "v-library-name" }, text(module.name), h("small", {}, source + " · " + location), reason ? h("small", {}, reason) : null),
          wordButton(enabled ? "已加入" : "加入", "module", module.id, { id: "library-enable-" + module.id, class: "v-library-enable", pressed: enabled,
            disabled: !canEditLayout(state) || unavailable || !allowed || (enabled && !module.removable) })),
        h("div", { class: "v-library-actions" }, wordButton(hidden ? "显示图标" : "隐藏图标", "icon-visibility", module.id, { id: "library-icon-" + module.id, disabled: !canEditLayout(state) }),
          h("span", { class: "v-library-order" },
            button("上移" + module.name + "图标", "up", "icon-order", { id: module.id, delta: -1 }, { id: "library-up-" + module.id, disabled: !canEditLayout(state) || order.indexOf(module.id) === 0 }),
            button("下移" + module.name + "图标", "down", "icon-order", { id: module.id, delta: 1 }, { id: "library-down-" + module.id, disabled: !canEditLayout(state) || order.indexOf(module.id) === order.length - 1 }))));
    }));
    if (!modules.length) list.append(h("div", { class: "v-empty-result" }, "没有匹配的内容", wordButton("清空搜索", "library-clear")));
  } else {
    const commands = [["切换左侧栏", "left", "region", "left"], ["切换右侧栏", "right", "region", "right"],
      ["下侧栏", "bottom", "region", "voice"], ["工作区布局…", "layout", "review-layout"], [libraryName(), "library", "library"], ["适应整页", "fit", "fit"]];
    const filtered = commands.filter(([name]) => name.includes(query));
    list.replaceChildren(...filtered.map(([label, glyph, action, value]) => menuItem(label, glyph, action, value)));
    if (!filtered.length) list.append(h("div", { class: "v-empty-result" }, "没有匹配的命令"));
  }
  prepareFrameReading(overlays);
}
function placeLayer(node, layer, anchor) {
  const padding = 8;
  const box = node.getBoundingClientRect();
  const target = anchor?.isConnected ? anchor.getBoundingClientRect() : { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 2, bottom: innerHeight / 2 };
  let x = target.left;
  let y = target.bottom + 4;
  if (layer.point) { x = layer.point.x; y = layer.point.y; }
  if (layer.edge) {
    x = layer.edge.endsWith("Right") ? innerWidth - 2 : 2;
    y = layer.edge.startsWith("bottom") ? innerHeight - 2 : 2;
  }
  if (y + box.height > innerHeight - padding) y = Math.max(42, target.top - box.height - 4);
  if (layer.edge?.startsWith("bottom")) y = innerHeight - box.height - padding;
  x = Math.max(padding, Math.min(x, innerWidth - box.width - padding));
  y = Math.max(42, Math.min(y, innerHeight - box.height - padding));
  node.style.left = x + "px";
  node.style.top = y + "px";
}
function renderLayers() {
  tooltip = null;
  overlays.replaceChildren();
  const oldDialog = document.querySelector(".v-modal");
  oldDialog?.remove();
  if (state.notice) {
    const danger = state.save === "failed" || state.notice.includes("失败");
    overlays.append(h("div", { class: "v-overlay", dataset: { layer: "notice" }, role: "status" },
      graphic(danger ? "info" : "check"), text(state.notice, "v-notice-text" + (danger ? " v-notice-danger" : "")),
      button("关闭通知", "close", "notice-close")));
  }
  if (state.modal) {
    state.layer = null;
    renderModal();
    return;
  }
  if (state.feedbackReview?.detailsOpen) {
    overlays.append(feedbackView().details());
    return;
  }
  if (!state.layer) return;
  const layer = state.layer;
  if (layer.type === "tooltip") {
    const hint = h("div", { class: "v-overlay", role: "tooltip", dataset: { layer: "tooltip" } }, layer.text, layer.shortcut ? h("kbd", {}, layer.shortcut) : null);
    overlays.append(hint); placeLayer(hint, layer, root.querySelector("#rail-E"));
    return;
  }
  const panel = ["library", "commands", "search"].includes(layer.type);
  const node = h("div", { class: "v-overlay " + (layer.type === "library" ? "v-content-library" : ""), dataset: { layer: panel ? "panel" : "context" },
    role: panel ? "dialog" : "menu", "aria-label": panel ? ({ library: libraryName(), commands: "命令面板", search: "搜索" })[layer.type] : "上下文菜单" },
    panel ? panelContent(layer) : layerContent(layer));
  overlays.append(node);
  if (state.horizontalSlots && layer.type === "more") node.dataset.horizontalSlots = "true";
  if (state.horizontalSlots?.result && layer.type === "more") node.append(h("p", { class: "hs-more-note", role: "status" }, state.horizontalSlots.result));
  if (panel) fillPanelList(layer, layer.type === "library" ? state.libraryQuery : "");
  const anchor = layerAnchor?.isConnected ? layerAnchor : defaultAnchor(layer);
  placeLayer(node, layer, anchor);
  prepareFrameReading(overlays);
  restoring = true;
  node.querySelector(panel ? "input" : "button:not(:disabled)")?.focus({ preventScroll: true });
  restoring = false;
}
function defaultAnchor(layer) {
  const id = ({ library: state.presentation && state.contentSide === "right" ? "right-library-trigger" : "library-trigger", presets: "settings-trigger", "preset-manage": "settings-trigger",
    zoom: "zoom-trigger", more: "more-" + layer.slot, menu: "menu-" + (layer.menu ?? "文件"), module: "module-" + layer.module })[layer.type];
  return document.getElementById(id) ?? root.querySelector("#score-stage");
}
function renderModal() {
  const kind = state.modal.type;
  const titles = { save: "另存预设", rename: "重命名预设", delete: "删除预设", message: "未保存提示" };
  const cancellable = state.modal.cancellable !== false;
  const input = ["save", "rename"].includes(kind) ? h("input", { id: "preset-name", "aria-label": "预设名称",
    value: kind === "rename" ? state.preset : "", placeholder: "预设名称", maxlength: "40" }) : null;
  const dialog = h("dialog", { class: "v-modal", "aria-labelledby": "modal-title",
    oncancel: (event) => { event.preventDefault(); if (cancellable) closeModal(); } },
    h("h2", { id: "modal-title" }, titles[kind]), h("p", {}, kind === "delete" ? "删除后将恢复默认工作区布局。" : kind === "message" ? "请完成当前操作后继续。" : "输入此布局方案的名称。"),
    input, h("div", { class: "v-modal-actions" },
      cancellable ? wordButton("取消", "modal-cancel") : null,
      wordButton(kind === "delete" ? "删除" : kind === "message" ? "知道了" : "保存", "modal-confirm", null,
        { class: kind === "delete" ? "danger" : "primary", disabled: kind !== "message" && !canEditLayout(state) })));
  overlays.append(dialog);
  dialog.showModal();
  dialog.querySelector("input,button")?.focus();
}

function hideTooltip() {
  tooltip?.remove();
  tooltip = null;
}
function showTooltip(target) {
  hideTooltip();
  if (restoring || state.layer || state.modal || !target?.dataset.tooltip) return;
  tooltip = h("div", { class: "v-overlay", dataset: { layer: "tooltip" }, role: "tooltip" }, target.dataset.tooltip);
  overlays.append(tooltip);
  const box = target.getBoundingClientRect();
  const hint = tooltip.getBoundingClientRect();
  let x = box.right + 4;
  let y = box.top + (box.height - hint.height) / 2;
  if (box.top < 34 || box.top > innerHeight - 80) { x = box.left; y = box.top > innerHeight / 2 ? box.top - hint.height - 4 : box.bottom + 4; }
  if (x + hint.width > innerWidth - 8) x = box.left - hint.width - 4;
  tooltip.style.left = Math.max(8, Math.min(x, innerWidth - hint.width - 8)) + "px";
  tooltip.style.top = Math.max(42, Math.min(y, innerHeight - hint.height - 8)) + "px";
}
document.addEventListener("pointerover", (event) => {
  const target = event.target.closest?.("button[data-tooltip]");
  if (target && shell?.contains(target)) showTooltip(target);
});
document.addEventListener("pointerout", (event) => {
  if (event.target.closest?.("button[data-tooltip]") && !event.target.closest("button")?.contains(event.relatedTarget)) hideTooltip();
});
document.addEventListener("focusin", (event) => {
  const target = event.target.closest?.("button[data-tooltip]");
  if (target && shell?.contains(target)) showTooltip(target);
});
document.addEventListener("focusout", () => hideTooltip());
document.addEventListener("pointerdown", (event) => {
  const layer = overlays.querySelector('[data-layer="context"],[data-layer="panel"]');
  if (layer && !layer.contains(event.target) && !layerAnchor?.contains(event.target)) closeLayer(false);
}, true);
document.addEventListener("keydown", (event) => {
  if (!isPlainKey(event)) return;
  if (event.key === "Escape" && !state.modal) {
    if (state.feedbackReview?.detailsOpen) { event.preventDefault(); dispatch("feedback-close"); return; }
    if (state.feedbackReview?.editor && !state.layer && state.feedbackReview.operation?.status !== "unknown") {
      event.preventDefault(); dispatch("scheme-editor-cancel"); return;
    }
    if (tooltip) { event.preventDefault(); hideTooltip(); }
    if (state.layer) { event.preventDefault(); closeLayer(); return; }
    if (state.assembly) { event.preventDefault(); dispatch("assembly-cancel"); return; }
  }
  const context = event.target.closest?.('[data-layer="context"]');
  if (context && ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
    const items = [...context.querySelectorAll("button:not(:disabled)")];
    const index = items.indexOf(document.activeElement);
    let next = (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    event.preventDefault(); items[next]?.focus();
  }
  if (state.layer?.type === "menu" && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    const menus = ["文件", "编辑", "视图", "谱面", "播放", "插件", "帮助"];
    const index = menus.indexOf(state.layer.menu);
    const next = menus[(index + (event.key === "ArrowLeft" ? -1 : 1) + menus.length) % menus.length];
    event.preventDefault(); openLayer({ type: "menu", menu: next }, document.getElementById("menu-" + next));
  }
});
document.addEventListener("pointerover", (event) => {
  const target = event.target.closest?.(".v-menu");
  if (state.layer?.type === "menu" && target && state.layer.menu !== target.textContent) openLayer({ type: "menu", menu: target.textContent }, target);
});
addEventListener("resize", () => {
  const viewport = root.querySelector(".v-paper-scroll");
  const priorPaper = rememberedPaper ?? root.querySelector(".v-paper").getBoundingClientRect();
  const priorScroll = { x: 0, y: rememberedPaper?.scrollY ?? viewport.scrollTop };
  constrain();
  setGeometry();
  syncSizeControls();
  adjustPaper({ recenter: true });
  restorePaperScroll(priorScroll);
  restorePaperPosition({ x: (innerWidth - state.paperWidth) / 2, y: priorPaper.y, width: state.paperWidth });
  rememberPaperView();
  if (state.layer || state.notice || state.modal || state.feedbackReview?.detailsOpen) renderLayers();
  prepareFrameReading(root);
  prepareFrameReading(overlays);
});
function setScenario(id, variant) {
  state = fixtureFor(id, variant);
  state.iconOrder = []; state.hiddenIcons = [];
  prepareLayoutFixture(state);
  preferredGeometry.set(state, workspaceSizes(state));
  pageMemory.clear();
  layerAnchor = null;
  draw({ preserveFocus: false });
  if (state.focusTarget) document.getElementById(state.focusTarget)?.focus({ preventScroll: true });
}
function metrics() {
  const names = { title: ".v-title", top: ".v-top", iconRail: ".v-icon-rail", left: ".v-left", stage: ".v-stage",
    right: ".v-right", pageRail: ".v-page-rail", voiceTitle: ".v-voice-header", voice: ".v-voice-content",
    merge: ".v-merge", footer: ".v-footer", paper: ".v-paper", page: ".v-page" };
  return Object.fromEntries(Object.entries(names).map(([name, selector]) => {
    const node = root.querySelector(selector);
    const rect = node.getBoundingClientRect();
    return [name, { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      background: getComputedStyle(node).backgroundColor, visible: !node.hidden }];
  }));
}
draw({ preserveFocus: false });
if (state.focusTarget) document.getElementById(state.focusTarget)?.focus({ preventScroll: true });
if (params.has("debug")) {
  window.__visualPreview = {
    setScenario, metrics, scenarios: SCENARIOS,
    getState: () => structuredClone(state),
    setState: (patch) => {
      rememberPage(); Object.assign(state, structuredClone(patch));
      if (Object.values(WORKSPACE_SIZE_KEYS).some(key => Object.hasOwn(patch, key))) preferredGeometry.set(state, workspaceSizes(state));
      draw();
    },
  };
}
