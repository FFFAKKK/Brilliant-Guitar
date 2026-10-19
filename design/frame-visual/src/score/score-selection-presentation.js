import { resolveStaffPointerTarget, rhythmCaretCenterY, yForPitch, noteheadSymbol } from "../vendor/score-interaction.js";
import { SCORE_NAVIGATION_KEYS, SCORE_SELECTION_COMMANDS as C } from "../contracts/score-selection.js";
import { isReservedKey } from "../host/focus-boundary.js";
import { SCORE_INPUT_KEY_COMMAND, SCORE_INPUT_POINTER_COMMAND } from "../contracts/score-note-input.js";
import { SCORE_CLIPBOARD_COMMANDS as K } from "../contracts/score-clipboard.js";

/** Same-drawing feedback; never changes engraving, viewport or document data. */
export function createScoreSelectionPresentation({ element, selection, execute, drawing, input = null }) {
  let overlay = null, hover = null, hoverTarget = null, disposed = false, visible = true;
  const current = () => {
    const frame = drawing(), state = selection.snapshot();
    return !disposed && visible && state.available && frame?.sourceRevision === state.sourceRevision
      ? { frame, state } : null;
  };
  function refresh() {
    clearHover();
    overlay?.remove(); overlay = null;
    if (disposed) return;
    const value = current(), target = value?.state.target;
    element.dataset.scoreTarget = target?.kind ?? "unavailable";
    element.removeAttribute("aria-description");
    if (!value || target.kind === "unavailable") return;
    const { frame } = value;
    const geometry = frame.interaction;
    const measureNumber = frame.snapshot.measures.findIndex(item => item.id === target.point.measureId) + 1;
    let box;
    if (value.state.range) {
      const boxes = value.state.range.eventIds.map(id => geometry.events.find(item => item.eventId === id));
      if (boxes.every(Boolean)) {
        const x = Math.min(...boxes.map(item => item.x)), y = Math.min(...boxes.map(item => item.y));
        box = { x, y, width: Math.max(...boxes.map(item => item.x + item.width)) - x,
          height: Math.max(...boxes.map(item => item.y + item.height)) - y };
      }
    } else if (target.kind === "event") box = geometry.events.find(item => item.eventId === target.eventId);
    else {
      const anchor = geometry.anchors.find(item => item.measureId === target.point.measureId
        && item.offsetUnits === target.point.offsetUnits);
      const measure = geometry.measures.find(item => item.measureId === target.point.measureId);
      if (anchor && measure) {
        const size = measure.lineSpacing * 1.45;
        box = { x: anchor.x - measure.lineSpacing * .1, y: rhythmCaretCenterY(anchor) - size / 2,
          width: Math.max(1, measure.lineSpacing * .2), height: size };
      }
    }
    if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite)) return;
    overlay = element.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
    overlay.setAttribute("data-score-selection", value.state.range ? "range" : target.kind);
    for (const key of ["x", "y", "width", "height"]) overlay.setAttribute(key, String(box[key]));
    overlay.setAttribute("rx", target.kind === "event" ? "2" : "0");
    overlay.setAttribute("fill", target.kind === "event" ? "#527de222" : "#527de2");
    overlay.setAttribute("stroke", "#527de2"); overlay.setAttribute("stroke-width", "0.7");
    overlay.setAttribute("pointer-events", "none"); overlay.setAttribute("aria-hidden", "true");
    frame.svg.append(overlay);
    element.setAttribute("aria-description", value.state.range ? `已选择第${measureNumber}小节的${value.state.range.eventIds.length}个事件` : target.kind === "event"
      ? `已选择第${measureNumber}小节的音符或休止` : `已定位第${measureNumber}小节，偏移${target.point.offsetUnits / 16}个四分音符`);
  }
  function pointerTarget(event, writeNow = false) {
    const value = current();
    if (!value || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey
      || (event.button !== undefined && event.button !== 0 && !(event.type === "pointermove" && event.button === -1))) return;
    const { frame, state } = value;
    if (!frame.svg.contains(event.target) || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    let eventId = null, measureId = null;
    for (let node = event.target; node && node !== frame.svg; node = node.parentNode) {
      eventId ??= node.getAttribute?.("data-event-id");
      measureId ??= node.getAttribute?.("data-measure-id");
    }
    if (eventId) measureId = frame.interaction.events.find(item => item.eventId === eventId)?.measureId;
    if (!measureId) return;
    let point;
    try {
      const inverse = frame.svg.getScreenCTM?.()?.inverse();
      if (!inverse) return;
      point = { x: inverse.a * event.clientX + inverse.c * event.clientY + inverse.e,
        y: inverse.b * event.clientX + inverse.d * event.clientY + inverse.f };
    } catch { return; }
    if (![point.x, point.y].every(Number.isFinite)) return;
    const target = resolveStaffPointerTarget({ view: frame.snapshot, interaction: frame.interaction, measureId,
      eventId, ...point, writeNow });
    return target ? { target, ...value } : null;
  }
  function click(event, writeNow = false) {
    const value = pointerTarget(event, writeNow);
    if (!value || (writeNow && event.shiftKey)) return;
    const { target, state } = value;
    const result = target?.kind === "event"
      ? execute(C.select, { sourceRevision: state.sourceRevision, eventId: target.eventId, ...(event.shiftKey ? { extend: true } : {}) })
      : target?.kind === "caret" && !event.shiftKey ? input
        ? execute(SCORE_INPUT_POINTER_COMMAND, { sourceRevision: state.sourceRevision, measureId: target.point.measureId,
          offsetUnits: target.point.offsetUnits, pitch: target.pitch, writeNow })
        : execute(C.locate, { sourceRevision: state.sourceRevision, measureId: target.point.measureId, offsetUnits: target.point.offsetUnits }) : null;
    if (result?.ok) element.focus({ preventScroll: true });
  }
  const doubleClick = event => click(event, true);
  function clearHover() { hover?.remove(); hover = null; hoverTarget = null; }
  function preview(event) {
    clearHover();
    if (!input || input.snapshot().pending || (event.buttons !== undefined && event.buttons !== 0)) return;
    const value = pointerTarget(event);
    if (!value || value.state.transaction.kind !== "idle") return;
    const { target, frame, state } = value;
    if (target.kind === "event") {
      if (state.target.kind === "event" && state.target.eventId === target.eventId) return;
      const box = frame.interaction.events.find(item => item.eventId === target.eventId);
      if (!box) return;
      hover = element.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect");
      for (const key of ["x", "y", "width", "height"]) hover.setAttribute(key, String(box[key]));
      hover.setAttribute("data-score-hover", "event");
    } else {
      if (input.snapshot().rest) return;
      const anchor = frame.interaction.anchors.find(item => item.measureId === target.point.measureId && item.offsetUnits === target.point.offsetUnits);
      const measure = frame.interaction.measures.find(item => item.measureId === target.point.measureId);
      if (!anchor || !measure) return;
      hover = element.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "text");
      hover.setAttribute("x", String(anchor.x));
      hover.setAttribute("y", String(yForPitch(target.pitch, measure.staffBottom, measure.lineSpacing, frame.snapshot.clef)));
      hover.setAttribute("font-size", String(measure.lineSpacing * 4)); hover.setAttribute("text-anchor", "middle");
      hover.setAttribute("font-family", "Bravura"); hover.textContent = noteheadSymbol(input.snapshot().duration);
      hover.setAttribute("data-score-hover", "caret");
    }
    hover.setAttribute("class", "score-pointer-hover"); hover.setAttribute("pointer-events", "none"); hover.setAttribute("aria-hidden", "true");
    hoverTarget = event.target; frame.svg.append(hover);
  }
  const stop = selection.subscribe(refresh);
  if (typeof stop !== "function") throw new TypeError("选择呈现订阅需要释放函数");
  element.addEventListener("click", click);
  element.addEventListener("dblclick", doubleClick);
  element.addEventListener("pointermove", preview); element.addEventListener("pointerleave", clearHover);
  const stopInput = input?.subscribe(() => { if (hoverTarget) clearHover(); });
  return Object.freeze({ refresh,
    handleKeyDown(event) {
      if (disposed || !visible || isReservedKey(event) || event.altKey) return false;
      const state = selection.snapshot(), value = current();
      if (!state.available) return false;
      const isMac = globalThis.navigator?.platform?.includes("Mac") ?? false;
      if (isMac ? event.ctrlKey : event.metaKey) return false;
      if ((isMac ? event.metaKey : event.ctrlKey) && !event.shiftKey && input && value) {
        const method = ({ c: "copy", x: "cut", v: "paste" })[event.key.toLowerCase()];
        if (!method) return false;
        if (event.repeat) return true;
        const result = execute(K[method], { sourceRevision: value.state.sourceRevision, selectionRevision: value.state.selectionRevision });
        return result?.ok === true && result.handled === true;
      }
      const shiftedInput = /^[A-GR+_]$/i.test(event.key);
      if (event.ctrlKey || event.metaKey || (event.shiftKey && !shiftedInput && !["ArrowLeft", "ArrowRight"].includes(event.key))) return false;
      if (input) {
        const result = execute(SCORE_INPUT_KEY_COMMAND, { sourceRevision: state.sourceRevision, key: event.key, repeat: event.repeat === true });
        if (result?.ok && result.handled) return true;
      }
      if (!value || !SCORE_NAVIGATION_KEYS.includes(event.key)) return false;
      const result = execute(C.navigate, { sourceRevision: value.state.sourceRevision, key: event.key, ...(event.shiftKey ? { extend: true } : {}) });
      return result?.ok === true && result.changed === true;
    },
    setVisible(value) { visible = value; refresh(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { stop(); } finally {
        stopInput?.(); element.removeEventListener("click", click); element.removeEventListener("dblclick", doubleClick);
        element.removeEventListener("pointermove", preview); element.removeEventListener("pointerleave", clearHover);
        clearHover(); overlay?.remove(); overlay = null;
        delete element.dataset.scoreTarget; element.removeAttribute("aria-description");
      }
    },
  });
}
