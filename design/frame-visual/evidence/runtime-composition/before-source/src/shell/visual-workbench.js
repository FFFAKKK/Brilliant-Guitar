import { h } from "./dom.js";
import { graphic, visualButton as button } from "./visual-controls.js";
import { WORKSPACE_COMMANDS as C } from "../host/workspace-commands.js";
import { createVisualZoom } from "./visual-zoom.js";
import { fitVisualTitle } from "./visual-title.js";
import { WORKSPACE_DEFAULT_SIZES, WORKSPACE_MINIMUMS, WORKSPACE_SIZE_KEYS } from "../workspace-geometry.js";
import { captureFocusRecovery, isPlainKey } from "../host/focus-boundary.js";
import { WORKSPACE_MENU_DEFINITIONS } from "../host/workspace-menus.js";
import { createCommandMenuBar } from "./command-menu-bar.js";

// Chrome mounts once. Updates touch geometry, chrome attributes and the active persistent cell.
export function createVisualWorkbench({ root, panels, layout, router, sidebar, presentationHints = {}, menuBinding }) {
  const execute = (id, payload) => router.execute(id, payload);
  const shell = h("div", { class: "visual-shell", dataset: { platform: "windows", runtime: "workspace" } });
  const title = "谱面尺寸验证";
  const regionButtons = new Map(), grips = new Map(), tabs = new Map();
  const listeners = new AbortController();
  const dragCleanups = new Set();
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
        const delta = (side === "top" ? { ArrowUp: -4, ArrowDown: 4 } : { ArrowLeft: -4, ArrowRight: 4, ArrowUp: 4, ArrowDown: -4 })[event.key];
        if (delta == null) return;
        event.preventDefault();
        resize(layout.snapshot()[key] + delta);
      },
      onpointerdown(event) {
        if (event.button !== 0) return;
        event.preventDefault();
        node.setPointerCapture(event.pointerId);
        const initial = layout.snapshot()[key];
        const start = horizontal ? event.clientY : event.clientX;
        shell.dataset.resizing = node.dataset.resizing = "true";
        const move = next => resize(initial + ((horizontal ? next.clientY : next.clientX) - start) * (side === "left" || side === "top" ? 1 : -1));
        const end = () => {
          node.removeEventListener("pointermove", move);
          node.removeEventListener("pointerup", end);
          node.removeEventListener("pointercancel", end);
          node.removeEventListener("lostpointercapture", end);
          if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
          shell.dataset.resizing = node.dataset.resizing = "false";
          dragCleanups.delete(end);
        };
        dragCleanups.add(end);
        node.addEventListener("pointermove", move);
        node.addEventListener("pointerup", end);
        node.addEventListener("pointercancel", end);
        node.addEventListener("lostpointercapture", end);
      },
    });
    grips.set(side, node);
    return node;
  }

  const menuView = menuBinding ? createCommandMenuBar(menuBinding, { fallbackFocus: () => stage }) : null;
  const menus = menuView?.element ?? h("nav", { class: "v-menus", "aria-label": "应用菜单" },
    ...WORKSPACE_MENU_DEFINITIONS.map(({ label }) => button(label, null, null, { className: "v-menu", disabled: true })));
  for (const [label, side, glyph] of [["上侧栏", "top", "top"], ["左侧栏", "left", "left"], ["右侧栏", "right", "right"], ["下侧栏", "voice", "bottom"]]) {
    regionButtons.set(side, button(label, glyph, () => execute(C.region, { region: side }), { id: "region-" + side }));
  }
  const start = h("div", { class: "v-title-start" }, h("span", { class: "v-app-mark" }, graphic("app")), menus);
  const documentName = h("span", { class: "v-document", title, "aria-label": title }, title);
  const end = h("div", { class: "v-title-end" },
    h("span", { class: "v-doc-state", dataset: { save: "saved" }, title: "只读练习谱 · 16 小节" }, "只读练习谱 · 16 小节"),
    h("div", { class: "v-region-switches", "aria-label": "区域开关" }, ...regionButtons.values()),
    h("div", { class: "v-window-buttons", "aria-label": "窗口按钮示意" },
      ...[["最小化", "minimize"], ["最大化", "maximize"], ["关闭", "close"]].map(([label, glyph]) => button(label, glyph, null, { disabled: true }))));
  const titleBar = h("header", { class: "v-title", "aria-label": "标题栏" }, start, documentName, end);
  const slot = (side, ...children) => h("div", { class: "v-slot", dataset: { slot: side } }, ...children);
  const modeName = h("span", { class: "v-mode-name" });
  const modeDetail = h("span", { class: "v-mode-detail" });
  const modeActions = h("div", { class: "v-mode-actions" },
    button("取消", null, () => finishAdjustment(false), { id: "assembly-cancel" }),
    button("确认", null, () => finishAdjustment(true), { id: "assembly-done", className: "primary" }));
  const top = h("section", { class: "v-top", "aria-label": "上侧栏" }, slot("left", modeName), slot("center", modeDetail), slot("right", modeActions), grip("top"));
  const modulePanelTrigger = button("模块面板", "grid", () => execute(C.region, { region: "left" }), { id: "module-panel-trigger", className: "v-rail-button" });
  const rail = h("nav", { class: "v-rail v-icon-rail", "aria-label": "图标栏" },
    h("div", { class: "v-rail-actions", "aria-label": "模块面板操作" }, modulePanelTrigger),
    h("div", { class: "v-rail-list", "aria-label": "模块开关" }),
    h("div", { class: "v-rail-footer" }, button("模块库", "plus", null, { id: "library-trigger", className: "v-rail-button", disabled: true }),
      button("设置", "settings", null, { id: "settings-trigger", className: "v-rail-button", disabled: true })));
  const leftEmpty = h("p", { class: "v-left-empty" }, "从模块库添加模块");
  const leftContent = h("div", { class: "v-modules", "aria-label": "模块网格" }, leftEmpty);
  const left = h("section", { class: "v-left", "aria-label": "左侧栏" },
    h("div", { class: "v-panel-surface v-left-surface" },
      h("div", { class: "v-region-header" }, h("span", { class: "v-region-name" }, "左侧栏 · 模块"),
        button("收起左侧栏", "collapseLeft", () => execute(C.region, { region: "left" }), { id: "collapse-left" })),
      leftContent,
      button("添加模块", null, null, { className: "v-add-module", disabled: true })), grip("left"));
  const paper = h("div", { class: "v-paper", "aria-label": "A4 纯白谱页" }, h("img", { src: "fixtures/approved-score.svg", alt: "只读练习谱，16 小节", draggable: "false" }));
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
  const pageTabs = h("div", { class: "v-rail-list", role: "tablist", "aria-orientation": "vertical" }, ...tabs.values());
  const pageRail = h("nav", { class: "v-rail v-page-rail", "aria-label": "页签条" }, pageTabs);
  const regions = {
    left: { element: leftContent, variant: "panel", decorate(cell, id) {
      cell.classList.remove("runtime-page-cell"); cell.id = "cell-" + id;
      cell.removeAttribute("role"); cell.removeAttribute("aria-labelledby");
    } },
    right: { element: page, variant: "page", decorate(cell, id) {
      cell.classList.add("runtime-page-cell"); cell.id = "cell-" + id;
      cell.setAttribute("role", "tabpanel"); cell.setAttribute("aria-labelledby", "page-tab-" + id);
    } },
  };
  const voiceTrigger = h("button", { class: "v-voice-trigger", id: "voice-trigger", type: "button", "aria-label": "下侧栏",
    onclick: () => execute(C.region, { region: "voice" }) }, graphic("up"), h("span", {}, "下侧栏"));
  const voiceGrip = grip("voice");
  const voice = h("section", { class: "v-voice-content", "aria-label": "下侧栏" },
    h("div", { class: "v-voice-placeholder", "aria-label": "面板内容占位" }, h("i", { class: "v-placeholder-line" }), h("i", { class: "v-placeholder-line" })));
  const zoom = createVisualZoom(router);
  const footer = h("footer", { class: "v-footer", "aria-label": "底部" },
    h("div", { class: "v-voice-header" }, voiceTrigger, voiceGrip), voice,
    h("div", { class: "v-merge", "aria-label": "合并栏" },
      slot("left", button("播放", "play", null, { disabled: true }), button("停止", "stop", null, { disabled: true })),
      slot("center", button("节拍器", "metronome", null, { disabled: true }), h("span", { class: "v-slot-label" }, "96")),
      slot("right", h("span", { class: "v-slot-label" }, "1 / 1"), h("span", { class: "v-slot-label" }, "16 小节"), zoom.element)));
  // The permanent transport row belongs to the frame, not to the folding voice region.
  const merge = footer.querySelector(".v-merge");
  shell.append(titleBar, top, h("div", { class: "v-middle" }, rail, left, stage, right, pageRail), footer, merge);
  root.append(shell);

  function adjustDocument() {
    fitVisualTitle(shell, title, innerWidth);
  }

  function render(state, compositionSnapshot) {
    const recoverFocus = captureFocusRecovery(shell);
    const topVisible = state.topOpen;
    shell.style.setProperty("--left-w", (state.leftOpen ? state.leftWidth : 0) + "px");
    shell.style.setProperty("--right-w", (state.rightOpen ? state.rightWidth : 0) + "px");
    shell.style.setProperty("--left-capacity", state.leftWidth + "px");
    shell.style.setProperty("--right-capacity", state.rightWidth + "px");
    shell.style.setProperty("--top-h", state.topHeight + "px");
    shell.style.setProperty("--visible-top", (topVisible ? state.topHeight : 0) + "px");
    shell.style.setProperty("--voice-content", (state.voiceOpen ? state.voiceHeight : 0) + "px");
    shell.dataset.arrangement = state.arrangement;
    left.hidden = !state.leftOpen; right.hidden = !state.rightOpen; top.hidden = !topVisible; voice.hidden = voiceGrip.hidden = !state.voiceOpen;
    modeActions.hidden = !state.adjusting;
    modeName.textContent = state.adjusting ? "布局调整" : "";
    modeDetail.textContent = state.adjusting ? "栏内组件配置" : "";
    for (const [side, node] of regionButtons) node.setAttribute("aria-pressed", String(state[side + "Open"]));
    modulePanelTrigger.setAttribute("aria-pressed", String(state.leftOpen));
    for (const [side, node] of grips) {
      node.disabled = false;
      node.setAttribute("aria-valuenow", state[WORKSPACE_SIZE_KEYS[side]]);
      node.setAttribute("aria-valuemax", state.limits[side]);
    }
    voiceTrigger.setAttribute("aria-expanded", String(state.voiceOpen));
    voiceTrigger.firstChild.replaceChildren(graphic(state.voiceOpen ? "down" : "up").firstChild);
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
    sidebar.render(model, regions);
    for (const [id, tab] of tabs) {
      const selected = id === definition?.id;
      tab.hidden = !model.right.some(item => item.id === id);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    const orderedTabs = model.right.map(item => tabs.get(item.id)).filter(Boolean);
    for (const [index, tab] of orderedTabs.entries()) {
      if (pageTabs.children[index] !== tab) pageTabs.insertBefore(tab, pageTabs.children[index] ?? null);
    }
    adjustDocument();
    const activeTab = tabs.get(definition?.id);
    recoverFocus(activeTab && !activeTab.hidden ? activeTab : stage);
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
    dispose() {
      listeners.abort();
      menuView?.dispose();
      zoom.dispose();
      [...dragCleanups].forEach(cleanup => cleanup());
      sidebar.dispose();
      shell.remove();
    },
  });
}
