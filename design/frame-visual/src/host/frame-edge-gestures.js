import { h } from "../shell/dom.js";
import { WORKSPACE_COMMANDS as C } from "./workspace-commands.js";
import { WORKSPACE_MINIMUMS, WORKSPACE_SIZE_KEYS } from "../workspace-geometry.js";
import { captureAnimationContribution } from "../contracts/animation.js";
import { isPlainKey } from "./focus-boundary.js";

const THRESHOLD = 24;
const sides = { left: { axis: "clientX", sign: 1, x: -6, y: 0, label: "左侧栏" },
  right: { axis: "clientX", sign: -1, x: 6, y: 0, label: "右侧栏" },
  top: { axis: "clientY", sign: 1, x: 0, y: -6, label: "上侧栏" },
  voice: { axis: "clientY", sign: -1, x: 0, y: 6, label: "下侧栏" } };
const declaration = Object.freeze({ owner: "frame.builtin", id: "frame.builtin.edge-handles",
  permissions: Object.freeze({ animations: Object.freeze(["content-transition"]) }), animations: captureAnimationContribution({ contractVersion: 1, definitions: {
    "content-transition": { defaultVariant: "enter", variants: Object.fromEntries(["enter", "exit"].map(name => [name, {
      type: "tween", duration: name === "enter" ? .18 : .12, fadeDuration: name === "enter" ? .18 : .12,
      exitDuration: name === "enter" ? .18 : .12, ease: [.23, 1, .32, 1],
    }])) },
  } }) });

// Transient input only. The existing workspace remains the only geometry owner.
export function createFrameEdgeGestures({ root, workspaceRoot, layout, execute, grips, edges, pointerPresentation, service = null }) {
  const records = new Map(), listeners = [], doc = root.ownerDocument, viewport = doc.defaultView;
  let observer, sizeObserver, drag = null, released = false, mutating = false;
  const available = () => !workspaceRoot.hidden && workspaceRoot.style.display !== "none" && doc.visibilityState !== "hidden";
  const listen = (node, type, callback, options) => {
    node.addEventListener(type, callback, options); listeners.push(() => node.removeEventListener(type, callback, options));
  };
  const request = (side, shown) => ({ intent: "content-transition", target: "edge:" + side,
    to: shown ? { x: 0, y: 0, opacity: 1 } : { x: sides[side].x, y: sides[side].y, opacity: 0 } });
  function alignHorizontalHandles() {
    if (released) return;
    const shell = root.getBoundingClientRect();
    if (![shell.left, shell.width].every(Number.isFinite) || shell.width <= 0) return;
    const end = shell.left + shell.width, menu = edges.top.querySelector(".v-title-start")?.getBoundingClientRect();
    const start = Math.min(end, Math.max(shell.left, Number.isFinite(menu?.right) ? menu.right + 8 : shell.left));
    const width = Math.min(64, end - start);
    const center = Math.min(end - width / 2, Math.max(start + width / 2, shell.left + shell.width / 2)) - shell.left;
    // All horizontal markers use the same shell-relative anchor. A narrow
    // command bar shifts both together and shrinks only into free menu space.
    const values = { x: center, left: center - width / 2, width };
    for (const [key, value] of Object.entries(values)) {
      const name = "--frame-horizontal-handle-" + key, text = value + "px";
      if (root.style.getPropertyValue(name) !== text) root.style.setProperty(name, text);
    }
  }
  function insideHost(host, point) {
    if (!point || point.pointerType === "touch" || !Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) return false;
    const bounds = host.getBoundingClientRect();
    return point.clientX >= bounds.left && point.clientX <= bounds.right
      && point.clientY >= bounds.top && point.clientY <= bounds.bottom;
  }
  function settleReveal(side, point = null, immediate = false) {
    const r = records.get(side);
    reveal(side, doc.activeElement === r.button || insideHost(r.host, point), immediate);
  }
  function reveal(side, shown, immediate = false) {
    const r = records.get(side);
    shown = !!shown && !r.open && available();
    if (r.shown === shown && !immediate) return;
    r.shown = shown;
    r.button.dataset.revealed = String(shown);
    if (!r.port) { r.ink.style.opacity = shown ? "1" : "0"; return; }
    const policy = service.snapshot();
    if (immediate || !["full", "slow"].includes(policy.mode) || policy.profile === "quiet") r.port.place(request(side, shown));
    else { r.component.setProfile(shown ? "enter" : "exit"); r.port.play(request(side, shown)); }
  }
  function stop({ point = null, transitioning = false } = {}) {
    if (!drag) return;
    const old = drag; drag = null;
    for (const [type, callback] of old.listeners) old.node.removeEventListener(type, callback);
    old.node.dataset.resizing = root.dataset.resizing = "false";
    if (old.node.hasPointerCapture?.(old.id)) old.node.releasePointerCapture(old.id);
    // A completed/cancelled pull must not leave its earlier hover reveal behind.
    // Region transitions settle after their command; cancellation has no hover point.
    if (old.opening && !transitioning) settleReveal(old.side, point, !point);
  }
  function operate(operation) {
    mutating = true;
    try { return operation(); } finally { mutating = false; }
  }
  function configure(side, open, event, focused) {
    const result = operate(() => pointerPresentation.runGesture(event, () => execute(C.configureRegion, { region: side, open })));
    if (result.ok && focused) (open ? grips.get(side) : records.get(side).button).focus({ preventScroll: true });
    if (open) settleReveal(side, event);
  }
  function start(side, opening, event, node) {
    if (released || drag || event.button !== 0 || event.isPrimary === false || !available()
      || !Number.isFinite(event.pointerId) || !Number.isFinite(event[sides[side].axis])
      || !!layout.snapshot()[side + "Open"] === opening) return;
    event.preventDefault();
    try { node.setPointerCapture(event.pointerId); } catch { return; }
    const key = WORKSPACE_SIZE_KEYS[side], initial = layout.snapshot()[key], start = event[sides[side].axis];
    const record = { side, node, id: event.pointerId, opening, base: initial, origin: start, accepted: initial, listeners: [] };
    drag = record; node.dataset.resizing = root.dataset.resizing = "true";
    const advance = next => {
      if (drag !== record || next.pointerId !== record.id) return;
      const coordinate = next[sides[side].axis];
      if (!Number.isFinite(coordinate)) return;
      const distance = (coordinate - record.origin) * sides[side].sign;
      const focused = doc.activeElement === node;
      if (opening) {
        if (distance >= THRESHOLD) { stop({ transitioning: true }); configure(side, true, next, focused); }
      } else {
        const raw = record.base + distance;
        const result = operate(() => execute(C.resize, { side, value: Math.max(WORKSPACE_MINIMUMS[side], raw) }));
        record.accepted = layout.snapshot()[key];
        if (drag !== record || !available()) return;
        // Consume maximum overshoot so reversing does not leave a dead zone.
        if (result.ok && raw > record.accepted) { record.base = record.accepted; record.origin = coordinate; }
        // A rejected resize must never be followed by an unrelated collapse.
        if (result.ok && raw <= WORKSPACE_MINIMUMS[side] - THRESHOLD && record.accepted === WORKSPACE_MINIMUMS[side]) {
          stop(); configure(side, false, next, focused);
        }
      }
    };
    const move = next => {
      if (next.pointerId !== record.id) return;
      // Pointer events report the whole button chord. Releasing the primary
      // button may leave buttons=2/4/etc and produce no pointerup until the
      // last held button is released; that motion no longer owns this drag.
      if (!(next.buttons & 1)) stop({ point: next }); else advance(next);
    };
    const end = next => {
      if (next.pointerId === record.id && drag === record)
        stop({ point: next.type === "pointerup" && next.button === 0 ? next : null });
    };
    const up = next => {
      if (next.pointerId !== record.id || drag !== record) return;
      if (next.button === 0) advance(next);
      end(next);
    };
    record.listeners = [["pointermove", move], ["pointerup", up], ["pointercancel", end], ["lostpointercapture", end]];
    for (const [type, callback] of record.listeners) node.addEventListener(type, callback);
    if (opening) reveal(side, true);
  }
  function update(state) {
    if (released) return;
    if (drag && !mutating && (state[drag.side + "Open"] === drag.opening || state[WORKSPACE_SIZE_KEYS[drag.side]] !== drag.accepted)) stop();
    for (const [side, r] of records) {
      const open = !!state[side + "Open"], changed = r.open !== open;
      r.open = open; r.button.hidden = open; r.button.disabled = open;
      if (changed) reveal(side, false, true);
    }
  }
  function proximity(event) {
    if (drag || event.pointerType === "touch") return;
    for (const side of records.keys()) {
      // Only permanent chrome activates a handle; never put a hit plane over the score.
      settleReveal(side, event);
    }
  }
  const reset = () => {
    stop(); alignHorizontalHandles(); for (const r of records.values()) r.component?.setVisible(available());
    for (const [side, r] of records) reveal(side, doc.activeElement === r.button && available(), true);
  };
  function dispose() {
    if (released) return; stop(); released = true; observer?.disconnect(); sizeObserver?.disconnect();
    for (const cleanup of listeners.splice(0).reverse()) cleanup();
    const errors = [];
    for (const r of records.values()) {
      try { r.component?.dispose(); } catch (error) { errors.push(error); } finally { r.button.remove(); }
    }
    if (errors.length) throw new AggregateError(errors, "Edge handle cleanup failed");
  }
  try {
    for (const [side, host] of Object.entries(edges)) {
      const ink = h("span", { class: "v-edge-ink", "aria-hidden": "true" });
      const button = h("button", { class: "v-edge-handle", id: "edge-handle-" + side, type: "button",
        "aria-label": "展开" + sides[side].label, title: "拉出" + sides[side].label,
        dataset: { edge: side, revealed: "false" } }, ink);
      host.append(button);
      const r = { button, ink, host, open: null, shown: null }; records.set(side, r);
      if (service) {
        r.component = service.forComponent(declaration, button);
        r.port = r.component.bind({ ["edge:" + side]: { node: ink, intents: ["content-transition"] } });
      }
      listen(grips.get(side), "pointerdown", event => start(side, false, event, grips.get(side)));
      listen(button, "pointerdown", event => start(side, true, event, button));
      listen(button, "focus", () => reveal(side, true, true));
      listen(button, "blur", () => reveal(side, false));
      listen(button, "click", event => {
        // A short pointer pull is deliberately a no-op; keyboard activation stays available.
        if (event.detail > 0 || drag) return;
        const result = operate(() => execute(C.configureRegion, { region: side, open: true }));
        if (result.ok) grips.get(side).focus({ preventScroll: true });
      });
    }
    listen(root, "pointermove", proximity, { passive: true });
    listen(root, "pointerleave", () => { if (!drag) for (const [side, r] of records) reveal(side, doc.activeElement === r.button); });
    listen(root, "keydown", event => { if (drag && event.key === "Escape" && isPlainKey(event)) { stop(); event.preventDefault(); event.stopPropagation(); } }, true);
    listen(viewport, "blur", reset); listen(viewport, "resize", reset); listen(doc, "visibilitychange", reset);
    if (typeof MutationObserver === "function") {
      observer = new MutationObserver(reset);
      observer.observe(workspaceRoot, { attributes: true, attributeFilter: ["hidden", "style"] });
    }
    if (typeof ResizeObserver === "function") {
      sizeObserver = new ResizeObserver(alignHorizontalHandles); sizeObserver.observe(root);
      const menu = edges.top.querySelector(".v-title-start"); if (menu) sizeObserver.observe(menu);
    }
    alignHorizontalHandles();
    update(layout.snapshot());
    return Object.freeze({ update, dispose });
  } catch (error) { dispose(); throw error; }
}
