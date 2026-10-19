import { h } from "./dom.js";
import { graphic } from "./visual-controls.js";
import { WORKSPACE_LAYOUT_ANIMATIONS } from "../features/workspace-layout-motion-recipes.js";

let sequence = 0;

// Optional, owner-bound artwork. One clip window reveals both the selection
// surface and its bright icon copy. No independent color timer or executor.
export function createWorkspaceLayoutSelection({ row, choices, state, onIssue }) {
  const doc = row.ownerDocument, viewport = doc.defaultView;
  let current = state.arrangement, port = null, indicator, copy, mask;
  let previous = null, frame = null, visible = true, released = false, pending = null;
  const cancelFrame = () => { if (frame !== null) viewport.cancelAnimationFrame(frame); frame = null; };
  function render(immediate = true, force = false) {
    if (released || !port) return;
    const selected = choices.find(choice => choice.mode !== "default" && choice.mode === current);
    if (!selected) { copy.hidden = true; return; }
    const outer = row.getBoundingClientRect(), bounds = selected.button.getBoundingClientRect();
    if (bounds.width < 16 || bounds.height < 16) return;
    copy.hidden = false;
    const to = { x: bounds.left - outer.left + 4, y: bounds.top - outer.top + 5 };
    const width = bounds.width - 8, height = bounds.height - 10;
    if (!force && previous?.x === to.x && previous?.y === to.y && previous?.width === width && previous?.height === height) return;
    indicator.setAttribute("width", String(width)); indicator.setAttribute("height", String(height));
    const request = { intent: "selection-transition", target: "arrangement:selection", to };
    if (immediate || !visible || doc.hidden) { pending = null; port.place(request); }
    else {
      const token = {}; pending = token;
      const playback = port.play(request);
      if (typeof playback?.finished?.then !== "function") throw new TypeError("Invalid layout selection playback");
      playback.finished.then(() => { if (pending === token) pending = null; },
        error => { if (!released && pending === token) onIssue(error); });
    }
    previous = { ...to, width, height };
  }
  function paint(immediate = true) {
    cancelFrame();
    if (!port) return;
    if (!immediate && visible && !doc.hidden && typeof viewport.requestAnimationFrame === "function") {
      frame = viewport.requestAnimationFrame(() => {
        frame = null; try { render(false); } catch (error) { onIssue(error); }
      });
    } else render(immediate);
  }
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    const immediate = frame === null; cancelFrame();
    try { render(immediate); } catch (error) { onIssue(error); }
  }) : null;
  observer?.observe(row);
  const onResize = () => { cancelFrame(); try { render(true, true); } catch (error) { onIssue(error); } };
  viewport?.addEventListener("resize", onResize);
  const onVisibility = () => {
    cancelFrame(); pending = null;
    try { render(true, true); } catch (error) { onIssue(error); }
  };
  doc.addEventListener("visibilitychange", onVisibility);
  function detachMotion() {
    cancelFrame(); const old = port; port = null; previous = null; pending = null;
    try { old?.dispose?.(); } finally {
      copy?.remove(); mask?.remove(); row.removeAttribute("data-selection-owned");
    }
  }
  return Object.freeze({
    update(next, { immediate = true } = {}) { if (!released) { current = next.arrangement; paint(immediate); } },
    attachMotion(bind, root) {
      if (released || port) throw new TypeError("Layout selection already bound or released");
      const id = "layout-arrangement-mask-" + ++sequence;
      const svg = tag => row.ownerDocument.createElementNS
        ? row.ownerDocument.createElementNS("http://www.w3.org/2000/svg", tag) : row.ownerDocument.createElement(tag);
      mask = svg("svg"); mask.setAttribute("class", "v-layout-selection-mask");
      mask.setAttribute("aria-hidden", "true"); mask.setAttribute("focusable", "false");
      const defs = svg("defs"), clip = svg("clipPath");
      clip.setAttribute("id", id); clip.setAttribute("clipPathUnits", "userSpaceOnUse");
      indicator = svg("rect"); indicator.setAttribute("class", "v-layout-selection-window");
      indicator.setAttribute("rx", "4"); clip.append(indicator); defs.append(clip); mask.append(defs);
      copy = h("div", { class: "v-layout-arrange-active-copy", "aria-hidden": "true" },
        ...choices.map(({ mode, glyph }) => h("span", { class: "v-layout-arrange-copy", dataset: { choice: mode } }, graphic(glyph, 16))));
      copy.style.clipPath = `url(#${id})`; row.append(copy, mask);
      try {
        port = bind({ root, targets: { "arrangement:selection": { node: indicator, intents: ["selection-transition"] } },
          animations: { "selection-transition": WORKSPACE_LAYOUT_ANIMATIONS["selection-transition"] } }) ?? null;
        if (!port) { detachMotion(); return; }
        if (["place", "play", "dispose"].some(key => typeof port[key] !== "function")) throw new TypeError("Invalid layout selection port");
        row.dataset.selectionOwned = "true"; render(true, true);
      } catch (error) { try { detachMotion(); } catch (cleanupError) { onIssue(cleanupError); } throw error; }
    },
    detachMotion,
    setVisible(next) { cancelFrame(); visible = next; render(true, true); },
    dispose() {
      if (released) return;
      try { detachMotion(); } finally {
        released = true; observer?.disconnect(); viewport?.removeEventListener("resize", onResize);
        doc.removeEventListener("visibilitychange", onVisibility);
      }
    },
  });
}
