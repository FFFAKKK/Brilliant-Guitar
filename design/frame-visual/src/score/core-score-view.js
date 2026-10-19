import { normalizeStaffSnapshot } from "./notation-model.js";
import { renderStaff } from "./vexflow-staff-renderer.js";
import { icon } from "../fixtures/preview-icons.js";
import { captureFocusRecovery } from "../host/focus-boundary.js";
import { createScoreSelectionPresentation } from "./score-selection-presentation.js";
import { createScoreEventControls } from "./score-event-controls.js";

export function createCoreScoreView({ score = null, snapshot = undefined, renderSnapshot = renderStaff,
  selection = null, execute = null, input = null, properties = false, measures = false, keySignatures = false, staffClefs = false, metadata = false } = {}) {
  let element = null, current = null, stopScore = null, ownsTabIndex = false;
  let currentDrawing = null, selectionPresentation = null;
  let stopInput = null, inputFeedback = null;
  let content = null, eventControls = null;
  let disposed = false, lastRead = score ? score.snapshot() : snapshot ?? null;
  const state = { snapshot: lastRead === null ? null : normalizeStaffSnapshot(lastRead) };
  const sourceStatus = () => score?.status?.() ?? { status: state.snapshot === null ? "empty" : "ready" };
  function refreshInputFeedback() {
    if (!element || !input || disposed) return;
    inputFeedback?.remove();
    if (sourceStatus().status !== "ready") return;
    const value = input.snapshot();
    inputFeedback ??= element.ownerDocument.createElement("span");
    inputFeedback.className = "score-input-state"; inputFeedback.setAttribute("role", "status");
    const label = value.message ?? (value.pending ? "正在处理谱面操作，请等待" : value.draft
      ? `音名 ${value.draft}，请输入组号 2–6` : value.selected ? "已选中事件，可修改音高、时值和附点" : `当前时值 1/${value.duration.base}${value.duration.dots ? " 附点" : ""}；音名 A–G 加组号 2–6，R 输入休止`);
    inputFeedback.title = label; inputFeedback.setAttribute("aria-label", label);
    inputFeedback.setAttribute("data-input-state", value.pending ? "pending" : value.message ? "message" : value.draft ? "composing" : "ready");
    inputFeedback.innerHTML = icon(value.pending ? "timerReset" : "note");
    for (const [key, val] of Object.entries(eventControls
      ? { position: "static", "margin-left": "auto", color: "#527de2" }
      : { position: "absolute", top: "8px", right: "8px", color: "#527de2" })) inputFeedback.style.setProperty(key, val);
    (eventControls?.element ?? element).append(inputFeedback);
  }
  function updateContent(change) {
    const recover = captureFocusRecovery(element);
    change(); recover(element); refreshInputFeedback();
  }
  function retryButton(label, action) {
    const button = element.ownerDocument.createElement("button");
    button.type = "button"; button.className = "score-view-retry";
    button.setAttribute("aria-label", label); button.title = label; button.innerHTML = icon("timerReset");
    button.addEventListener("click", action); return button;
  }
  function showMessage(text, retry = null) {
    if (!element) return;
    const message = element.ownerDocument.createElement("p");
    message.className = "score-view-message"; message.textContent = text;
    updateContent(() => {
      content.replaceChildren(message);
      if (retry) content.append(retryButton(retry.label, retry.action));
    });
  }
  function showReadFailure() {
    if (!element || disposed) return;
    selectionPresentation?.refresh();
    const status = sourceStatus();
    element.dataset.readState = "error";
    const text = status.message || "作品暂时无法读取";
    const retry = { label: "重新读取作品", action: () => { void score?.retry?.(); } };
    if (!element.querySelector(".score-view-svg")) {
      current?.abort(); element.dataset.renderState = "error"; showMessage(text, retry); return;
    }
    // Preserve the last accepted SVG and its same-render geometry, with an explicit failure indicator.
    const feedback = element.ownerDocument.createElement("div"); feedback.className = "score-view-read-error";
    feedback.setAttribute("role", "alert"); feedback.title = text;
    feedback.style.setProperty("position", "absolute"); feedback.style.setProperty("inset", "8px 8px auto auto");
    feedback.append(retryButton(text + "；重新读取作品", retry.action));
    updateContent(() => { element.querySelector(".score-view-read-error")?.remove(); content.append(feedback); });
  }
  function render() {
    if (!element || disposed) return;
    current?.abort(); delete element._scoreInteraction; currentDrawing = null; selectionPresentation?.refresh();
    const status = sourceStatus(); element.dataset.readState = status.status;
    if (status.status === "error") { showReadFailure(); return; }
    if (state.snapshot === null) {
      element.dataset.renderState = "empty";
      showMessage(status.status === "unsupported" ? status.message : status.status === "loading" ? "正在读取作品…" : "尚未提供谱面快照"); return;
    }
    const controller = new AbortController(); current = controller;
    const acceptedSnapshot = state.snapshot;
    const sourceRevision = selection?.snapshot().sourceRevision ?? null;
    element.dataset.renderState = "loading"; showMessage("正在显示五线谱…");
    void Promise.resolve().then(() => renderSnapshot(acceptedSnapshot, { signal: controller.signal })).then(result => {
      if (disposed || controller.signal.aborted || current !== controller) return;
      const svg = result.svg;
      svg.setAttribute("viewBox", `0 0 ${result.layout.width} ${result.layout.height}`);
      svg.setAttribute("preserveAspectRatio", "xMidYMin meet"); svg.removeAttribute("width"); svg.removeAttribute("height");
      svg.style.removeProperty("width"); svg.style.removeProperty("height"); svg.classList.add("score-view-svg");
      element.style.setProperty("aspect-ratio", eventControls ? "auto" : `${result.layout.width} / ${result.layout.height}`);
      updateContent(() => content.replaceChildren(svg)); element.dataset.renderState = "ready"; element._scoreInteraction = result.interaction;
      currentDrawing = { svg, interaction: result.interaction, snapshot: acceptedSnapshot, sourceRevision };
      selectionPresentation?.refresh();
      if (sourceStatus().status === "error") showReadFailure();
    }).catch(error => {
      if (disposed || controller.signal.aborted || current !== controller) return;
      element.dataset.renderState = "error";
      showMessage("五线谱暂时无法显示：" + (error?.message ?? String(error)), { label: "重新显示五线谱", action: render });
    });
  }
  function sourceChanged(value) {
    if (disposed) return;
    const status = sourceStatus();
    if (status.status === "error") { showReadFailure(); return; }
    element.dataset.readState = status.status; updateContent(() => element.querySelector(".score-view-read-error")?.remove());
    if (value === lastRead && element.dataset.renderState === "ready") return;
    lastRead = value; state.snapshot = value === null ? null : normalizeStaffSnapshot(value); render();
  }
  return {
    setSnapshot(value) { if (disposed) return; lastRead = value; state.snapshot = value === null ? null : normalizeStaffSnapshot(value); render(); },
    mount(target) {
      element = target; element.classList.add("core-score-view"); element.setAttribute("aria-label", "五线谱");
      ownsTabIndex = element.getAttribute("tabindex") === null;
      if (ownsTabIndex) element.setAttribute("tabindex", "-1");
      element.dataset.renderState = "loading";
      content = element;
      if (input && (properties || measures || keySignatures || staffClefs || metadata)) {
        eventControls = createScoreEventControls({ element, input, execute, measures, keySignatures, staffClefs, metadata, focusScore: () => element?.focus({ preventScroll: true }) });
        content = element.ownerDocument.createElement("div"); content.className = "score-view-content"; element.append(content);
      }
      if (selection) selectionPresentation = createScoreSelectionPresentation({ element, selection, execute, drawing: () => currentDrawing, input });
      if (input) stopInput = input.subscribe(refreshInputFeedback);
      if (score) stopScore = score.subscribe(sourceChanged);
      render(); return this;
    },
    dispose() {
      if (disposed) return; disposed = true;
      try { selectionPresentation?.dispose(); } finally { selectionPresentation = null; stopScore?.(); stopScore = null; }
      stopInput?.(); stopInput = null; inputFeedback?.remove(); inputFeedback = null;
      eventControls?.dispose(); eventControls = null; content = null;
      current?.abort(); current = null; currentDrawing = null;
      if (element?._scoreInteraction) delete element._scoreInteraction; element?.replaceChildren();
      if (ownsTabIndex) element?.removeAttribute("tabindex"); element = null;
    },
    setVisible(visible) { if (element) element.hidden = !visible; selectionPresentation?.setVisible(visible); eventControls?.setVisible(visible); },
    handleKeyDown(event) { return selectionPresentation?.handleKeyDown(event) ?? false; },
  };
}
