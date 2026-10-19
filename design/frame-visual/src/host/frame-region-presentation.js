import { captureAnimationContribution } from "../contracts/animation.js";
import { createFrameTogglePresentation } from "./frame-toggle-presentation.js";
import { createFrameRegionAperture } from "./frame-region-aperture.js";
import { createFrameWorkbenchReveal } from "./frame-workbench-reveal.js";

const variants = Object.freeze(Object.fromEntries(["enter", "exit"].map(name => [name, Object.freeze({
  type: "tween", duration: name === "enter" ? .30 : .28,
  fadeDuration: name === "enter" ? .30 : .28, exitDuration: name === "enter" ? .30 : .28,
  ease: Object.freeze([.77, 0, .175, 1]),
})])));
export const FRAME_REGION_ANIMATIONS = captureAnimationContribution({ contractVersion: 1, definitions: {
  "content-transition": { defaultVariant: "enter", variants },
} });
// Internal presentation declaration of the existing frame owner, not a plugin.
const declaration = Object.freeze({ owner: "frame.builtin", id: "frame.builtin.region-presentation",
  permissions: Object.freeze({ animations: Object.freeze(["content-transition"]) }), animations: FRAME_REGION_ANIMATIONS });
const direction = { left: { x: -24, y: 0 }, right: { x: 24, y: 0 }, top: { x: 0, y: -24 }, voice: { x: 0, y: 24 } };
const styleKeys = ["position", "left", "top", "width", "height", "clipPath", "overflow", "pointerEvents", "zIndex"];
const box = node => {
  const r = node.getBoundingClientRect(); return { x: r.x ?? r.left, y: r.y ?? r.top, width: r.width, height: r.height };
};

// The frame owns static geometry/clipping. The shared animation port only owns
// each content plane's bounded translation and opacity; no score target exists.
export function createFrameRegionPresentation({ root, workspaceRoot, regions, stage, service, controls = new Map(), onGeometrySettled = null }) {
  const component = service.forComponent(declaration, root);
  const viewport = workspaceRoot.ownerDocument.defaultView;
  const workbenchReveal = createFrameWorkbenchReveal(stage);
  let port, toggles, released = false, last = null, geometryQueued = false;
  const records = new Map(Object.entries(regions).map(([side, { element, content, header, backdrops }]) => [side, {
    element, content, original: Object.fromEntries(styleKeys.map(key => [key, element.style[key]])),
    aperture: createFrameRegionAperture({ viewport, side, element, content, header, backdrops,
      onProgress(alpha) { records.get(side).alpha = alpha; workbenchReveal.advance(side, alpha); } }),
    open: null, token: null, rect: null, retained: false, alpha: 1,
  }]));
  const restore = r => { r.aperture.stop(); for (const key of styleKeys) r.element.style[key] = r.original[key]; r.element.removeAttribute("data-frame-region-exiting"); };
  const request = (side, to) => ({ intent: "content-transition", target: "region:" + side, to });
  const available = () => !workspaceRoot.hidden && workspaceRoot.style.display !== "none" && workspaceRoot.ownerDocument.visibilityState !== "hidden";
  function accessibility(r, open) {
    r.element.inert = !open;
    if (open) { r.element.removeAttribute("inert"); r.element.removeAttribute("aria-hidden"); }
    else { r.element.setAttribute("inert", ""); r.element.setAttribute("aria-hidden", "true"); }
  }
  const sizesChanged = state => last && ["leftWidth", "rightWidth", "topHeight", "voiceHeight", "arrangement"].some(key => state[key] !== last[key]);
  const pageChanged = state => last && state.currentPage !== last.currentPage;
  const canAnimate = (state, { pointer = false, force = false } = {}, side) => {
    const policy = service.snapshot();
    // Navigation settles old content, but must not skip a simultaneous right
    // region opening. Sizes and arrangement still settle immediately.
    const pageAllowsEntry = !pageChanged(state) || (side === "right" && !last.rightOpen && state.rightOpen);
    return pointer && !force && !sizesChanged(state) && pageAllowsEntry && available() && ["full", "slow"].includes(policy.mode) && policy.profile !== "quiet";
  };
  const validRect = rect => rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
  function queueGeometrySettlement() {
    if (geometryQueued || released) return;
    if (!onGeometrySettled) { settleGeometry(); return; }
    geometryQueued = true;
    // Run outside the current render/provider callback, through the original
    // viewport preservation owner. Never submit a layout command on completion.
    queueMicrotask(() => { geometryQueued = false; if (!released) onGeometrySettled(); });
  }
  function releaseLane(r) {
    if (!r.retained) return;
    r.retained = false;
    queueGeometrySettlement();
  }
  function settleGeometry() {
    workbenchReveal.restoreGeometry();
    workbenchReveal.project(box(stage), [...records].filter(([, r]) => r.token).map(([side, r]) => {
      const rect = box(r.element);
      return [side, { extent: side === "left" || side === "right" ? rect.width : rect.height, alpha: r.alpha }];
    }));
  }
  function finish(side, r, token) {
    if (released || r.token !== token) return;
    workbenchReveal.advance(side, r.open ? 1 : 0);
    r.token = null; restore(r); r.element.hidden = !r.open; releaseLane(r);
    if (workbenchReveal.has(side)) queueGeometrySettlement();
  }
  function instant(side, r, open) {
    r.token = null; restore(r); r.element.hidden = !open; accessibility(r, open); releaseLane(r);
    port.place(request(side, { x: 0, y: 0, opacity: open ? 1 : 0 }));
  }
  function retainLane(side, r, accepted) {
    if (!r.retained || !validRect(r.rect) || !validRect(accepted)) return false;
    const w = r.rect.width;
    const horizontal = side === "left" || side === "right";
    const top = horizontal ? Math.max(r.rect.y, accepted.y)
      : side === "top" ? accepted.y - r.rect.height : Math.max(r.rect.y, accepted.y + accepted.height);
    const h = horizontal ? Math.min(r.rect.y + r.rect.height, accepted.y + accepted.height) - top : r.rect.height;
    if (h <= 0) return false;
    const left = side === "left" ? accepted.x - w : side === "right" ? accepted.x + accepted.width : r.rect.x;
    // The original slot is still reserved. Keep its complete original content
    // visible outside the stage; clipping must not reduce it to a 12px remnant.
    Object.assign(r.element.style, { position: "fixed", left: left + "px", top: top + "px", width: w + "px", height: h + "px",
      overflow: "clip", pointerEvents: "none", zIndex: "4", clipPath: "inset(0px)" });
    r.element.dataset.frameRegionExiting = "true"; r.element.hidden = false;
    return true;
  }
  function beforeRender(state = last, options = {}) {
    if (released || !state) return state;
    workbenchReveal.restoreGeometry();
    for (const r of records.values()) if (r.open && !r.element.hidden && !r.element.hasAttribute?.("data-frame-region-exiting")) r.rect = box(r.element);
    const policy = service.snapshot();
    const invalid = options.force || sizesChanged(state) || pageChanged(state) || !available() || !["full", "slow"].includes(policy.mode) || policy.profile === "quiet";
    let projected = state;
    for (const [side, r] of records) {
      const open = !!state[side + "Open"];
      if (invalid || open || (!r.token && r.open === open)) r.retained = false;
      else if (r.open === true && !open) r.retained = canAnimate(state, options, side) && validRect(r.rect);
      if (r.retained) { if (projected === state) projected = { ...state }; projected[side + "Open"] = true; }
    }
    // Presentation-only projection. The accepted business state stays closed,
    // with inert content/disabled grips immediately; no second layout store.
    return projected;
  }
  function update(state, { pointer = false, force = false } = {}) {
    if (released) return;
    workbenchReveal.restoreGeometry();
    const policy = service.snapshot();
    const geometryChanged = sizesChanged(state);
    const navigationChanged = pageChanged(state);
    const accepted = box(stage);
    for (const [side, r] of records) {
      const open = !!state[side + "Open"], changed = r.open !== open;
      if (!changed && !force && !geometryChanged && !navigationChanged) continue;
      const first = r.open === null, hadMotion = r.token !== null;
      r.open = open;
      if (!canAnimate(state, { pointer, force }, side) || first || !changed) { instant(side, r, open); continue; }
      r.token = null;
      const current = hadMotion ? port.hold({ intent: "content-transition", target: "region:" + side }) : null;
      restore(r); accessibility(r, open);
      if (!open && !retainLane(side, r, accepted)) { instant(side, r, open); continue; }
      const initial = current ?? (open ? { ...direction[side], opacity: 0 } : { x: 0, y: 0, opacity: 1 });
      if (open) {
        r.element.style.overflow = "clip";
        // Write the motion surface and the reveal boundary while the carrier
        // is still hidden. This prevents opaque page artwork/ghosts from
        // flashing as a full black rectangle before the provider starts.
        port.place(request(side, initial));
        r.aperture.prepare(initial.opacity);
        r.element.hidden = false;
      } else {
        r.element.hidden = false;
        port.place(request(side, initial));
      }
      component.setProfile(open ? "enter" : "exit");
      const token = {}; r.token = token;
      const to = open ? { x: 0, y: 0, opacity: 1 } : { ...direction[side], opacity: 0 };
      try {
        const playback = port.play(request(side, to));
        r.aperture.start();
        playback.finished.then(() => finish(side, r, token));
        // Static/instant providers or synchronous completion need no retained DOM.
        if (r.content.style.opacity === String(to.opacity)) { port.place(request(side, to)); finish(side, r, token); }
      } catch (error) { instant(side, r, open); throw error; }
    }
    toggles?.update(state, { immediate: !pointer || force || !!geometryChanged || !!navigationChanged || !available() || ["reduced", "none"].includes(policy.mode), profile: policy.profile });
    last = state;
    settleGeometry();
  }
  const reset = () => {
    const settle = () => { component.setVisible(available()); if (last) update(last, { force: true }); };
    // Capture the paper before force-settling removes an entry's temporary
    // canvas. Completion already uses this same host preservation boundary.
    if (onGeometrySettled) onGeometrySettled(settle);
    else settle();
  };
  let observer;
  try {
    port = component.bind(Object.fromEntries([...records].map(([side, r]) => ["region:" + side, { node: r.content, intents: ["content-transition"] }])));
    if (controls.size) toggles = createFrameTogglePresentation({ controls, service });
    viewport.addEventListener("resize", reset); workspaceRoot.ownerDocument.addEventListener("visibilitychange", reset);
    if (typeof MutationObserver === "function") {
      observer = new MutationObserver(reset); observer.observe(workspaceRoot, { attributes: true, attributeFilter: ["hidden", "style"] });
    }
    return Object.freeze({
      beforeRender,
      update,
      settleGeometry,
      dispose() {
        if (released) return; released = true;
        observer?.disconnect(); viewport.removeEventListener("resize", reset); workspaceRoot.ownerDocument.removeEventListener("visibilitychange", reset);
        workbenchReveal.dispose();
        try { toggles?.dispose(); } finally { try { component.dispose(); } finally { for (const r of records.values()) { r.token = null; r.retained = false; restore(r); r.element.hidden = !r.open; } } }
      },
    });
  } catch (error) { observer?.disconnect(); viewport.removeEventListener("resize", reset); workspaceRoot.ownerDocument.removeEventListener("visibilitychange", reset); workbenchReveal.dispose(); toggles?.dispose(); component.dispose(); throw error; }
}
