import { h } from "./dom.js";
import { LAYOUT_REGIONS } from "./layout-visual-state.js";
import { WORKSPACE_SIZE_KEYS } from "../workspace-geometry.js";
import { LAYOUT_PREVIEW_SHAPE } from "../features/workspace-layout-motion-recipes.js";
import { LAYOUT_PREVIEW_PLANE, projectLayoutPreview } from "./workspace-layout-preview-geometry.js";

// Author-owned visual projection. State and permitted execution come from the
// caller; this module has no store, engine, coordinator or SDK dependency.
export function createWorkspaceLayoutPreview({ state, onIssue }) {
  const regions = new Map(LAYOUT_REGIONS.map(({ side }) => [side,
    h("span", { class: "v-map-region v-map-" + side, "aria-hidden": "true" })]));
  const stage = h("span", { class: "v-map-stage", "aria-hidden": "true" });
  const shapes = new Map([...regions, ["stage", stage]]);
  const canvas = h("div", { class: "v-layout-map-canvas", "aria-hidden": "true" }, ...shapes.values());
  const element = h("div", { class: "v-layout-map", role: "img", "aria-label": "工作区区域示意" }, canvas);
  let current = state, port = null, previous = null, visible = true, released = false;
  let frame = null;
  const doc = element.ownerDocument, viewport = doc.defaultView;
  const pending = new Map();

  function cancelFrame() {
    if (frame !== null) viewport.cancelAnimationFrame(frame);
    frame = null;
  }
  function paint(immediate = true) {
    cancelFrame();
    // Presets also change this component's containing sidebar. Measure after
    // that accepted layout has settled, rather than starting on its old width
    // and having ResizeObserver cancel the trajectory in the same frame.
    if (!immediate && visible && !doc.hidden && typeof viewport.requestAnimationFrame === "function") {
      frame = viewport.requestAnimationFrame(() => {
        frame = null;
        try { render(false); } catch (error) { onIssue(error); }
      });
    } else render(immediate);
  }

  function writeStatic(node, rect) {
    node.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
    node.style.clipPath = `inset(0px ${LAYOUT_PREVIEW_PLANE - rect.width}px ${LAYOUT_PREVIEW_PLANE - rect.height}px 0px round 2px)`;
    node.style.opacity = String(rect.opacity);
  }
  function render(immediate = true, force = false) {
    if (released) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    // Hidden/unmounted views accept state now, then paint statically on resize.
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 32 || height < 32) return;
    const sizes = Object.fromEntries(LAYOUT_REGIONS.map(({ side }) => [side, current[WORKSPACE_SIZE_KEYS[side]]]));
    const opens = Object.fromEntries(LAYOUT_REGIONS.map(({ side, key }) => [side, !!current[key]]));
    const rects = projectLayoutPreview({ sizes, regions: opens }, width, height);
    for (const [side, to] of Object.entries(rects)) {
      if (!force && previous?.[side] && Object.keys(to).every(key => to[key] === previous[side][key])) continue;
      if (!port) writeStatic(shapes.get(side), to);
      else {
        const request = { intent: "shape-transition", target: `shape:${side}`, to };
        if (immediate || !visible || doc.hidden) { pending.delete(side); port.place(request); }
        else {
          const token = {}; pending.set(side, token);
          const playback = port.play(request);
          if (typeof playback?.finished?.then !== "function") throw new TypeError("Invalid layout presentation playback");
          playback.finished.then(() => {
            if (pending.get(side) === token) pending.delete(side);
          }, error => {
            if (!released && pending.get(side) === token) onIssue(error);
          });
        }
      }
    }
    previous = rects;
  }
  function detachMotion() {
    cancelFrame();
    const old = port; port = null; pending.clear(); previous = null;
    try { old?.dispose(); } finally { render(true, true); }
  }
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    // An unchanged observation must not place/cancel an active trajectory.
    // If the accepted preset is waiting for its first measurement, this is
    // also a valid post-layout measurement of that same presentation.
    const immediate = frame === null;
    cancelFrame();
    try { render(immediate); } catch (error) { onIssue(error); }
  }) : null;
  observer?.observe(canvas);
  const onViewportResize = () => {
    cancelFrame();
    try { render(true, true); } catch (error) { onIssue(error); }
  };
  viewport?.addEventListener("resize", onViewportResize);
  // The executor can settle its running tracks, but it does not own this
  // author's queued measurement frame or completion tokens. Cancel both even
  // when hidden geometry cannot be measured; restoration paints statically.
  const onVisibility = () => {
    cancelFrame(); pending.clear();
    try { render(true, true); } catch (error) { onIssue(error); }
  };
  doc.addEventListener("visibilitychange", onVisibility);

  return Object.freeze({
    element, regions,
    get motionBound() { return port !== null; },
    update(next, { immediate = true } = {}) {
      if (released) return;
      current = next;
      for (const { side, key } of LAYOUT_REGIONS) regions.get(side).dataset.shown = String(!!next[key]);
      element.setAttribute("aria-label", "工作区区域示意：" + LAYOUT_REGIONS
        .map(({ name, key }) => name + (next[key] ? "展开" : "收起")).join("，"));
      paint(immediate);
    },
    attachMotion(bind, root) {
      if (released || port) throw new TypeError("Layout preview already bound or released");
      const targets = Object.fromEntries([...shapes].map(([side, node]) => [`shape:${side}`, { node, intents: ["shape-transition"] }]));
      try {
        port = bind({ root, targets, animations: { "shape-transition": LAYOUT_PREVIEW_SHAPE } }) ?? null;
        if (!port) return;
        if (["place", "play", "dispose"].some(key => typeof port[key] !== "function")) throw new TypeError("Invalid layout presentation port");
        render(true, true);
      } catch (error) {
        try { detachMotion(); } catch (cleanupError) { onIssue(cleanupError); }
        throw error;
      }
    },
    detachMotion,
    setVisible(next) { cancelFrame(); visible = next; pending.clear(); render(true, true); },
    dispose() {
      if (released) return;
      try { detachMotion(); } finally {
        released = true; observer?.disconnect(); viewport?.removeEventListener("resize", onViewportResize);
        doc.removeEventListener("visibilitychange", onVisibility);
      }
    },
  });
}
