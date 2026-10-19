import { workspaceGripKeyDelta } from "./workspace-grip-input.js";
import { h } from "./dom.js";
import { graphic, visualButton as button } from "./visual-controls.js";
import { WORKSPACE_COMMANDS as C } from "../host/workspace-commands.js";
import { createVisualZoom } from "./visual-zoom.js";
import { createFrameCommandBar } from "./frame-command-bar.js";
import { WORKSPACE_DEFAULT_SIZES, WORKSPACE_MINIMUMS, WORKSPACE_SIZE_KEYS } from "../workspace-geometry.js";
import { captureFocusRecovery, isPlainKey } from "../host/focus-boundary.js";
import { WORKSPACE_MENU_DEFINITIONS } from "../host/workspace-menus.js";
import { createCommandMenuBar } from "./command-menu-bar.js";
import { createDisposalScope, rollback } from "../runtime/runtime-support.js";
import { prepareFrameReading, installFrameReading } from "./frame-accessibility.js";
import { applyWorkspaceShellGeometry } from "./workspace-shell-geometry.js";
import { createFrameEdgeGestures } from "../host/frame-edge-gestures.js";
import { createFramePointerPresentation } from "../host/frame-pointer-presentation.js";
import { createFrameRegionPresentation } from "../host/frame-region-presentation.js";
import { createFrameContentOrderPresentation } from "../host/frame-content-order-presentation.js";

// Chrome mounts once. Updates touch geometry, chrome attributes and the active persistent cell.
export function createVisualWorkbench(options) {
  const scope = createDisposalScope();
  try { return buildWorkbench(options, scope); }
  catch (error) { rollback(scope, error); }
}

function buildWorkbench({ root, panels, scoreView, layout, view, router, sidebar, horizontal = null, presentationHints = {}, menuBinding, documentRead = null, animationService = null, onGeometrySettled = null }, scope) {
  const execute = (id, payload) => router.execute(id, payload);
  const shell = h("div", { class: "visual-shell", dataset: { platform: "windows", runtime: "workspace" } });
  const pointerPresentation = createFramePointerPresentation(shell);
  scope.add(() => pointerPresentation.dispose());
  scope.add(() => shell.remove());
  scope.add(() => sidebar.dispose());
  if (horizontal) scope.add(() => horizontal.dispose());
  const grips = new Map(), tabs = new Map();
  const listeners = new AbortController();
  installFrameReading(root, { signal: listeners.signal });
  scope.add(() => listeners.abort());
  function finishAdjustment(confirm) {
    const result = execute(C.finish, { confirm });
    if (result.ok) tabs.get(sidebar.describe(layout.snapshot()).activeRight?.id)?.focus({ preventScroll: true });
  }

  function grip(side) {
    const key = WORKSPACE_SIZE_KEYS[side];
    const horizontal = side === "top" || side === "voice";
    const minimum = WORKSPACE_MINIMUMS[side];
    const resize = value => execute(C.resize, { side, value });
    const node = h("button", { class: "v-grip", id: "grip-" + side, type: "button", role: "separator",
      "aria-label": "调整" + ({ left: "左侧栏宽度", right: "右侧栏宽度", top: "上侧栏高度", voice: "下侧栏高度" })[side],
      "aria-orientation": horizontal ? "horizontal" : "vertical", "aria-valuemin": minimum,
      ondblclick: () => resize(WORKSPACE_DEFAULT_SIZES[side]),
      onkeydown(event) {
        if (!isPlainKey(event)) return;
        const delta = workspaceGripKeyDelta(side, event.key);
        if (delta == null) return;
        event.preventDefault();
        resize(layout.snapshot()[key] + delta);
      },

    });
    grips.set(side, node);
    return node;
  }

  const menuView = menuBinding ? createCommandMenuBar(menuBinding, { fallbackFocus: () => stage, pointerPresentation }) : null;
  if (menuView) scope.add(() => menuView.dispose());
  const menus = menuView?.element ?? h("nav", { class: "v-menus", "aria-label": "应用菜单" },
    ...WORKSPACE_MENU_DEFINITIONS.map(({ label }) => button(label, null, null, { className: "v-menu", disabled: true })));
  const tempoLabel = h("span", { class: "v-slot-label", dataset: documentRead ? { documentTempo: "" } : null }, "96");
  const measureLabel = h("span", { class: "v-slot-label", hidden: !documentRead,
    dataset: documentRead ? { documentMeasures: "" } : null }, "");
  // There is no score-page tracking port yet. A fixed page number must not be
  // presented as the current position of a real document.
  const scorePageLabel = h("span", { class: "v-slot-label", hidden: Boolean(documentRead) }, "1 / 1");
  const stateNode = documentRead ? h("span", { class: "v-doc-state", role: "status" }) : null;
  const titleBar = createFrameCommandBar(menus);
  const slot = (side, ...children) => h("div", { class: "v-slot", dataset: { slot: side } }, ...children);
  const modeName = h("span", { class: "v-mode-name" });
  const modeDetail = h("span", { class: "v-mode-detail" });
  const modeActions = h("div", { class: "v-mode-actions" },
    button("取消", null, () => finishAdjustment(false), { id: "assembly-cancel", "aria-label": "取消内容编辑", title: "取消内容编辑", "data-tooltip": "取消内容编辑" }),
    button("确认", null, () => finishAdjustment(true), { id: "assembly-done", "aria-label": "确认内容编辑", title: "确认内容编辑", "data-tooltip": "确认内容编辑", className: "primary" }));
  const topItems = horizontal?.has("top") ? h("div", { class: "v-region-slot-items", "aria-label": "上侧栏内容" }) : null;
  const topSlots = [slot("left", modeName, ...(topItems ? [topItems] : [])), slot("center", modeDetail), slot("right", modeActions)];
  const topContent = animationService ? h("div", { dataset: { frameRegionMotion: "top" }, style: {
    display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto auto", gridColumn: "1 / -1", alignItems: "center", gap: "inherit",
  } }, ...topSlots) : null;
  const top = h("section", { class: "v-top", "aria-label": "上侧栏" }, ...(topContent ? [topContent] : topSlots), grip("top"));
  const modulePanelTrigger = button("模块面板", "grid", () => execute(C.region, { region: "left" }), { id: "module-panel-trigger", className: "v-rail-button" });
  const rail = h("nav", { class: "v-rail v-icon-rail", "aria-label": "图标栏" },
    h("div", { class: "v-rail-actions", "aria-label": "模块面板操作" }, modulePanelTrigger),
    h("div", { class: "v-rail-list", "aria-label": "模块开关" }),
    h("div", { class: "v-rail-footer" }, button("模块库", "plus", null, { id: "library-trigger", className: "v-rail-button", disabled: true }),
      button("设置", "settings", null, { id: "settings-trigger", className: "v-rail-button", disabled: true })));
  const leftEmpty = h("p", { class: "v-left-empty" }, "暂无内容");
  const leftContent = h("div", { class: "v-modules", "aria-label": "模块网格" }, leftEmpty);
  const left = h("section", { class: "v-left", "aria-label": "左侧栏" },
    h("div", { class: "v-panel-surface v-left-surface" },
      h("div", { class: "v-region-header" }, h("span", { class: "v-region-name" }, "左侧栏 · 模块"),
        button("收起左侧栏", "collapseLeft", () => execute(C.region, { region: "left" }), { id: "collapse-left" })),
      leftContent,
      button("添加模块", null, null, { className: "v-add-module", disabled: true })), grip("left"));
  // The runtime preview must consume the registered score view. The old static
  // approved-score image belongs to the visual fixture and is deliberately not
  // a runtime fallback: silently showing it would hide a broken plugin install
  // and make the preview look healthy while no notation component is mounted.
  const paperContent = scoreView ?? h("p", { class: "score-view-message", role: "status" }, "核心谱面 view 未注册");
  const paper = h("div", { class: "v-paper", "aria-label": scoreView ? "谱面纸张" : "五线谱纸张" }, paperContent);
  const scroll = h("div", { class: "v-paper-scroll", id: "score-scroll" }, h("div", { class: "v-paper-space" }, paper));
  const stage = h("main", { class: "v-stage", id: "score-stage", tabindex: 0, "aria-label": "谱面舞台" }, scroll);
  const pageTitle = h("span", { class: "v-region-name" });
  const previous = button("上一页", "collapseLeft", () => execute(C.step, { delta: -1 }), { id: "page-previous" });
  const next = button("下一页", "collapseRight", () => execute(C.step, { delta: 1 }), { id: "page-next" });
  const pageCount = h("span");
  const page = h("section", { class: "v-page v-panel-surface" },
    h("div", { class: "v-page-header" }, pageTitle, h("div", { class: "v-page-navigation" }, previous, pageCount, next)));
  const ghosts = [h("div", { class: "v-page-ghost second", "aria-hidden": "true" }), h("div", { class: "v-page-ghost first", "aria-hidden": "true" })];
  const right = h("section", { class: "v-right", "aria-label": "右侧栏" }, ...ghosts, page, grip("right"));
  for (const definition of panels) {
    tabs.set(definition.id, button(definition.title, definition.icon, () => execute(C.page, { id: definition.id }), {
      id: "page-tab-" + definition.id, className: "v-rail-button", role: "tab", "aria-controls": "cell-" + definition.id,
    }));
  }
  const pageTabs = h("div", { class: "v-rail-list", role: "tablist", "aria-label": "右侧栏页面", "aria-orientation": "vertical" }, ...tabs.values());
  const pageRail = h("nav", { class: "v-rail v-page-rail", "aria-label": "页签条" }, pageTabs);
  const contentOrder = animationService ? createFrameContentOrderPresentation({ root: leftContent, workspaceRoot: root, service: animationService }) : null;
  if (contentOrder) scope.add(() => contentOrder.dispose());
  const tabOrder = animationService ? createFrameContentOrderPresentation({ root: pageTabs, workspaceRoot: root, service: animationService }) : null;
  if (tabOrder) scope.add(() => tabOrder.dispose());
  if (tabOrder) for (const tab of tabs.values()) pageTabs.append(tabOrder.item(tab));
  const regions = {
    left: { element: leftContent, variant: "panel", item: contentOrder?.item, decorate(cell, id) {
      cell.classList.remove("runtime-page-cell"); cell.id = "cell-" + id;
      cell.removeAttribute("role"); cell.removeAttribute("aria-labelledby");
    } },
    right: { element: page, variant: "page", decorate(cell, id) {
      cell.classList.add("runtime-page-cell"); cell.id = "cell-" + id;
      cell.setAttribute("role", "tabpanel"); cell.setAttribute("aria-labelledby", "page-tab-" + id);
    } },
  };
  const voiceGlyph = graphic("up");
  const voiceFeedback = h("span", { class: "v-voice-icon", "aria-hidden": "true" }, voiceGlyph);
  const voiceTrigger = h("button", { class: "v-voice-trigger", id: "voice-trigger", type: "button", "aria-label": "下侧栏",
    onclick: () => execute(C.region, { region: "voice" }) }, voiceFeedback);
  const voiceGrip = grip("voice");
  const voicePlaceholder = h("div", { class: "v-voice-placeholder", "aria-label": "面板内容占位" },
    h("i", { class: "v-placeholder-line" }), h("i", { class: "v-placeholder-line" }));
  const bottomItems = horizontal?.has("bottom") ? h("div", { class: "v-region-slot-items", "aria-label": "下侧栏内容" }) : null;
  const voiceSurface = animationService || bottomItems ? h("div", {}, voicePlaceholder, ...(bottomItems ? [bottomItems] : [])) : voicePlaceholder;
  const voice = h("section", { class: "v-voice-content", "aria-label": "下侧栏" }, voiceSurface);
  const zoom = createVisualZoom(router, view);
  scope.add(() => zoom.dispose());
  const footer = h("footer", { class: "v-footer", "aria-label": "底部" },
    h("div", { class: "v-voice-header" }, voiceTrigger, voiceGrip), voice,
    h("div", { class: "v-merge", "aria-label": "合并栏" },
      slot("left", button("播放", "play", null, { disabled: true }), button("停止", "stop", null, { disabled: true })),
      slot("center", button("节拍器", "metronome", null, { disabled: true }), tempoLabel),
      slot("right", stateNode, scorePageLabel, measureLabel, zoom.element)));
  // The permanent transport row belongs to the frame, not to the folding voice region.
  const merge = footer.querySelector(".v-merge");
  shell.append(titleBar, top, h("div", { class: "v-middle" }, rail, left, stage, right, pageRail), footer, merge);
  root.append(shell);
  if (documentRead) {
    const renderDocument = () => {
      const state = documentRead.snapshot(), name = state.title || "未命名乐谱";
      stage.setAttribute("aria-label", name + " · 谱面舞台");
      const description = state.message || (state.busy ? "正在读取作品" : `${state.saved ? "已保存" : "未保存"} · ${state.measureCount} 小节`);
      const warnings = state.warnings ?? [];
      stateNode.replaceChildren(graphic(state.message ? "info" : state.busy ? "timerReset" : warnings.length ? "info" : "page"));
      stateNode.title = [name, description, ...warnings.map(warning => warning.message)].join(" · "); stateNode.setAttribute("aria-label", stateNode.title);
      stateNode.dataset.warning = String(warnings.length > 0);
      stateNode.dataset.save = state.message ? "failed" : state.saved ? "saved" : "unsaved";
      tempoLabel.textContent = state.tempoBpm === null ? "—" : String(state.tempoBpm);
      tempoLabel.setAttribute("aria-label", state.tempoBpm === null ? "速度尚不可用" : `速度 ${state.tempoBpm} BPM`);
      measureLabel.textContent = state.documentId === null ? "—" : `${state.measureCount} 小节`;
      measureLabel.setAttribute("aria-label", state.documentId === null ? "小节数尚不可用" : `共 ${state.measureCount} 小节`);
    };
    renderDocument(); scope.add(documentRead.subscribe(renderDocument));
  }
  const frameRegions = { top: { element: top, content: topContent },
    left: { element: left, content: left.querySelector(".v-left-surface") },
    right: { element: right, content: page, backdrops: ghosts }, voice: { element: voice, content: voiceSurface, header: footer.querySelector(".v-voice-header") } };
  // Every region animates a complete artwork plane, using the accepted right
  // page as the reference. The outer clip/grip and score remain static owners.
  if (animationService) for (const [side, { element, content }] of Object.entries(frameRegions)) {
    content.classList.add("v-frame-region-surface"); content.dataset.frameRegionMotion = side;
    element.dataset.frameRegionClip = side;
  }
  if (animationService) footer.dataset.frameRegionChrome = "voice";
  const frameControls = new Map();
  frameControls.set("module", { button: modulePanelTrigger, glyph: "grid", accepted: state => state.leftOpen });
  for (const [index, definition] of panels.entries()) frameControls.set("page-" + index, {
    button: tabs.get(definition.id), glyph: definition.icon, accepted: state => state.rightOpen && tabs.get(definition.id).getAttribute("aria-selected") === "true",
  });
  frameControls.set("voice", { button: voiceTrigger, feedbackTarget: voiceFeedback, surface: false, glyph: "up", accepted: state => state.voiceOpen,
    nextGlyph: state => state.voiceOpen ? "down" : "up" });
  const regionPresentation = animationService ? createFrameRegionPresentation({ root: shell, workspaceRoot: root,
    regions: frameRegions, stage, service: animationService, controls: frameControls, onGeometrySettled }) : null;
  if (regionPresentation) scope.add(() => regionPresentation.dispose());

  const edgeGestures = createFrameEdgeGestures({ root: shell, workspaceRoot: root, layout, execute, grips,
    edges: { left: rail, right: pageRail, top: titleBar, voice: footer.querySelector(".v-voice-header") },
    pointerPresentation, service: animationService });
  scope.add(() => edgeGestures.dispose());

  let orderState = null;
  function render(state, compositionSnapshot) {
    const recoverFocus = captureFocusRecovery(shell);
    contentOrder?.beforeRender(); tabOrder?.beforeRender();
    const pointer = pointerPresentation.current();
    const topVisible = state.topOpen;
    applyWorkspaceShellGeometry(shell, regionPresentation?.beforeRender(state, { pointer }) ?? state);
    shell.dataset.arrangement = state.arrangement;
    if (!regionPresentation) { left.hidden = !state.leftOpen; right.hidden = !state.rightOpen; top.hidden = !topVisible; voice.hidden = !state.voiceOpen; }
    voiceGrip.hidden = !state.voiceOpen;
    modeActions.hidden = !state.adjusting;
    modeName.textContent = state.adjusting ? "内容编辑" : "";
    modeDetail.textContent = "";
    modulePanelTrigger.setAttribute("aria-pressed", String(state.leftOpen));
    for (const [side, node] of grips) {
      node.disabled = !state[side + "Open"];
      node.setAttribute("aria-valuenow", state[WORKSPACE_SIZE_KEYS[side]]);
      node.setAttribute("aria-valuemax", state.limits[side]);
    }
    voiceTrigger.setAttribute("aria-expanded", String(state.voiceOpen));
    const voiceAction = state.voiceOpen ? "收起下侧栏" : "展开下侧栏";
    voiceTrigger.setAttribute("title", voiceAction); voiceTrigger.setAttribute("data-tooltip", voiceAction);
    voiceGlyph.replaceChildren(graphic(state.voiceOpen ? "down" : "up").firstChild);
    const model = sidebar.describe(state, compositionSnapshot);
    const definition = model.activeRight;
    const index = model.right.findIndex(item => item.id === definition?.id);
    pageTitle.textContent = definition?.title ?? "右侧栏";
    page.setAttribute("aria-label", definition?.title ?? "右侧栏");
    page.style.gridTemplateRows = "32px minmax(0,1fr) " + (presentationHints[definition?.id]?.footerHeight ?? 0) + "px";
    pageCount.textContent = (index + 1) + " / " + model.right.length;
    previous.disabled = index <= 0; next.disabled = index < 0 || index === model.right.length - 1;
    ghosts[0].hidden = model.right.length - index - 1 < 2; ghosts[1].hidden = model.right.length - index - 1 < 1;
    leftEmpty.hidden = model.left.length > 0;
    horizontal?.render(state, { top: { element: topItems }, bottom: { element: bottomItems, placeholder: voicePlaceholder } });
    const renderedContent = sidebar.render(model, regions);
    for (const [id, tab] of tabs) {
      const selected = id === definition?.id;
      tab.hidden = !model.right.some(item => item.id === id);
      if (tabOrder) tab.parentNode.hidden = tab.hidden;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    const orderedTabs = model.right.map(item => tabs.get(item.id)).filter(Boolean).map(tab => tabOrder ? tab.parentNode : tab);
    for (const [index, tab] of orderedTabs.entries()) {
      if (pageTabs.children[index] !== tab) pageTabs.insertBefore(tab, pageTabs.children[index] ?? null);
    }
    regionPresentation?.update(state, { pointer });
    edgeGestures.update(state);
    const stable = orderState && ["leftOpen", "rightOpen", "topOpen", "voiceOpen", "leftWidth", "rightWidth", "topHeight", "voiceHeight", "arrangement", "currentPage", "adjusting"].every(key => state[key] === orderState[key]);
    contentOrder?.update(renderedContent.left, { pointer, stable, open: state.leftOpen });
    tabOrder?.update(model.right.map(item => tabs.get(item.id)).filter(Boolean), { pointer, stable, open: state.rightOpen });
    orderState = state;
    prepareFrameReading(shell);
    const activeTab = tabs.get(definition?.id);
    const editCancel = state.adjusting && state.rightOpen ? root.querySelector("#layout-cancel") : null;
    recoverFocus(editCancel ?? (activeTab && !activeTab.hidden ? activeTab : stage));
  }

  pageRail.addEventListener("keydown", event => {
    if (!isPlainKey(event)) return;
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const model = sidebar.describe(layout.snapshot());
    if (!model.right.length) return;
    const current = model.right.findIndex(item => item.id === model.activeRight?.id);
    const index = event.key === "Home" ? 0 : event.key === "End" ? model.right.length - 1 : Math.max(0, Math.min(model.right.length - 1, current + (event.key === "ArrowUp" ? -1 : 1)));
    execute(C.page, { id: model.right[index].id, toggle: false });
    tabs.get(model.right[index].id)?.focus({ preventScroll: true });
  }, { signal: listeners.signal });
  function handleKeyDown(event) {
    if (isPlainKey(event) && event.key === "Escape" && layout.snapshot().adjusting) {
      event.preventDefault(); finishAdjustment(false);
    }
  }

  return Object.freeze({
    shell, stage, scroll, paper, render, handleKeyDown,
    settleGeometry(state) {
      applyWorkspaceShellGeometry(shell, regionPresentation?.beforeRender(state) ?? state);
      regionPresentation?.settleGeometry();
    },
    dispose: () => scope.dispose(),
  });
}
