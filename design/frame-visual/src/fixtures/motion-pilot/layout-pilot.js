import { LAYOUT_PREVIEW_MOTION_CONTRIBUTION, LAYOUT_RELEASE_WINDOW, layoutContentTravel } from "./layout-motion-definitions.js";
import { icon } from "../../shell/icons.js";
import { createLayoutPreview } from "./layout-preview.js";

// A local visual fixture for the existing layout responsibility. It does not
// register a new real plugin or contribute business controls to the workbench.
let layoutMotionSequence = 0;

export function mountLayoutMotionPilot(root, { motion, profile = () => "continuous", onState = () => {} }) {
  const instanceId = "layout-motion-" + ++layoutMotionSequence;
  const selectionMaskId = instanceId + "-selection";
  root.innerHTML = `
    <div class="pilot-tabs" role="tablist" aria-label="布局内容">
      <button type="button" role="tab" aria-selected="true" aria-controls="${instanceId}-regions" id="${instanceId}-regions-tab" data-view="regions">区域</button>
      <button type="button" role="tab" aria-selected="false" aria-controls="${instanceId}-arrangement" id="${instanceId}-arrangement-tab" data-view="arrangement" tabindex="-1">排布</button>
      <div class="pilot-tabs-active-copy" aria-hidden="true"></div>
      <svg class="pilot-selection-mask" aria-hidden="true" focusable="false" width="0" height="0"><defs><clipPath id="${selectionMaskId}" clipPathUnits="userSpaceOnUse"><rect class="pilot-tab-indicator" x="0" y="0" rx="4"/></clipPath></defs></svg>
    </div>
    <div class="pilot-content-viewport">
      <section class="pilot-content" role="tabpanel" aria-labelledby="${instanceId}-regions-tab" id="${instanceId}-regions" data-pane="regions">
      </section>
      <section class="pilot-content" role="tabpanel" aria-labelledby="${instanceId}-arrangement-tab" id="${instanceId}-arrangement" data-pane="arrangement" aria-hidden="true" inert>
        <div class="pilot-arrangement" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><div class="pilot-dimensions"><span>承载 <strong>混合</strong></span><span>排列 <strong>紧凑</strong></span></div>
    <div class="pilot-order-heading"><span>内容顺序</span><span class="pilot-order-hint">拖动调整</span></div>
    <div class="pilot-order-list" aria-label="布局内容排序">
      ${[{ id: "regions", name: "区域与尺寸", glyph: "layout" }, { id: "content", name: "内容排布", glyph: "library" }, { id: "view", name: "视图", glyph: "maximize" }].map(item => `<button type="button" class="pilot-order-item" data-item="${item.id}" aria-label="拖动${item.name}；上下方向键调整顺序">${icon(item.glyph, 18)}<span>${item.name}</span><span class="pilot-drag-handle" aria-hidden="true"><svg width="14" height="18" viewBox="0 0 14 18"><path d="M5 5h.1M9 5h.1M5 9h.1M9 9h.1M5 13h.1M9 13h.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></button>`).join("")}
    </div></section></div>`;
  const panes = new Map([...root.querySelectorAll("[data-pane]")].map(node => [node.dataset.pane, node]));
  const tabs = [...root.querySelectorAll("[data-view]")];
  const indicator = root.querySelector(".pilot-tab-indicator");
  const activeCopy = root.querySelector(".pilot-tabs-active-copy");
  // One moving clip reveals both the blue surface and the bright label copy.
  // Semantic selection commits immediately; visible ink follows this same
  // physical window, including interruption. No independent color timer.
  activeCopy.replaceChildren(...tabs.map(tab => {
    const label = document.createElement("span"); label.className = "pilot-tab-copy";
    label.textContent = tab.textContent; return label;
  }));
  activeCopy.style.clipPath = `url(#${selectionMaskId})`;
  const tabBounds = tabs[0].getBoundingClientRect();
  indicator.setAttribute("width", String(tabBounds.width));
  indicator.setAttribute("height", String(tabBounds.height));
  const list = root.querySelector(".pilot-order-list"), rows = [...list.children];
  let notify = () => {};
  const preview = createLayoutPreview(panes.get("regions"), { instanceId, onState: () => notify() });
  const targets = Object.fromEntries([...panes].map(([id, node]) => [`page:${id}`, { node, intents: ["content-transition"] }]));
  Object.assign(targets, preview.targets);
  targets.selection = { node: indicator, intents: ["selection-transition"] };
  rows.forEach(node => { targets[`item:${node.dataset.item}`] = { node, intents: ["drag-settle"] }; });
  const port = motion.bind({ ...LAYOUT_PREVIEW_MOTION_CONTRIBUTION, root, targets });
  const events = new AbortController();
  let view = "regions", order = rows.map(node => node.dataset.item), drag = null, disposed = false;
  const snapshot = () => Object.freeze({ view, order: [...order], dragging: Boolean(drag), ...preview.snapshot() });
  notify = () => onState(snapshot());
  preview.connect(port);

  function selectView(next, immediate = false) {
    if (next === view || disposed) return;
    preview.settle(); finishDrag(true);
    const previous = view;
    const nextPosition = port.hold({ intent: "content-transition", target: `page:${next}` });
    const oldPosition = port.hold({ intent: "content-transition", target: `page:${previous}` });
    view = next; // The accepted view is authoritative before any presentation starts.
    tabs.forEach(tab => { const active = tab.dataset.view === view; tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1; });
    port.play({ intent: "selection-transition", target: "selection", to: { x: tabs.find(tab => tab.dataset.view === view).offsetLeft, y: 0 }, immediate });
    for (const [id, node] of panes) { node.inert = id !== view; node.setAttribute("aria-hidden", String(id !== view)); }
    port.place({ intent: "content-transition", target: `page:${view}`, to: nextPosition });
    port.place({ intent: "content-transition", target: `page:${previous}`, to: oldPosition });
    const direction = view === "arrangement" ? 1 : -1;
    const travel = layoutContentTravel(profile(), direction);
    // An incoming page already on screen continues from there. A hidden page
    // starts near its source; never clear a running transform back to zero.
    const from = nextPosition.opacity < .02 ? { ...travel.incoming, opacity: 0 } : undefined;
    port.play({ intent: "content-transition", target: `page:${view}`, from, to: { x: 0, y: 0, opacity: 1 }, immediate });
    port.play({ intent: "content-transition", target: `page:${previous}`, to: { ...travel.outgoing, opacity: 0 }, immediate });
    notify();
  }
  for (const tab of tabs) {
    tab.addEventListener("click", event => selectView(tab.dataset.view, event.detail === 0), { signal: events.signal });
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : tabs.find(value => value !== tab);
      selectView(next.dataset.view, true); next.focus({ preventScroll: true });
    }, { signal: events.signal });
  }
  function reorder(id, index, immediate = false, velocity = { x: 0, y: 0 }) {
    const focus = rows.find(node => node === document.activeElement);
    const before = new Map(rows.map(node => [node.dataset.item, node.getBoundingClientRect()]));
    order = order.filter(value => value !== id); order.splice(index, 0, id);
    order.forEach(value => list.append(rows.find(node => node.dataset.item === value)));
    for (const node of rows) {
      const target = `item:${node.dataset.item}`, old = before.get(node.dataset.item);
      port.place({ intent: "drag-settle", target, to: { x: 0, y: 0 } });
      const current = node.getBoundingClientRect();
      const from = { x: old.x - current.x, y: old.y - current.y };
      // Slot placement is constrained travel, not a free fling. Keep measured
      // momentum toward the slot, bounded by its remaining travel over 120ms.
      // At the slot/boundary there is no distance left to spend on momentum.
      const direction = Math.sign(-from.y);
      const release = node.dataset.item === id ? { x: 0, y: direction * Math.max(0, Math.min(direction * velocity.y, Math.abs(from.y) / LAYOUT_RELEASE_WINDOW)) } : undefined;
      port.play({ intent: "drag-settle", target, from, to: { x: 0, y: 0 }, immediate, velocity: release });
    }
    focus?.focus({ preventScroll: true });
    notify();
  }
  function previewOrder(index) {
    if (index === drag.index) return;
    drag.index = index;
    const preview = order.filter(id => id !== drag.node.dataset.item);
    preview.splice(index, 0, drag.node.dataset.item);
    for (const row of rows) {
      if (row === drag.node) continue;
      // Preview only the accepted slot's presentation. DOM/business order stays
      // unchanged until release, and a reversed pointer retargets the same spring.
      const y = drag.slots[preview.indexOf(row.dataset.item)] - row.offsetTop;
      port.play({ intent: "drag-settle", target: `item:${row.dataset.item}`, to: { x: 0, y } });
    }
  }
  function finishDrag(cancel = false) {
    if (!drag) return;
    const current = drag; drag = null;
    current.node.classList.remove("is-dragging");
    if (current.node.hasPointerCapture(current.pointerId)) current.node.releasePointerCapture(current.pointerId);
    // Business order commits now; spring completion never writes the order.
    reorder(current.node.dataset.item, cancel ? current.initialIndex : current.index, cancel, current.velocity);
  }
  for (const node of rows) {
    node.addEventListener("pointerdown", event => {
      if (event.button !== 0 || drag || disposed) return;
      rows.forEach(row => port.hold({ intent: "drag-settle", target: `item:${row.dataset.item}` }));
      const base = node.getBoundingClientRect(), position = port.hold({ intent: "drag-settle", target: `item:${node.dataset.item}` });
      drag = { node, pointerId: event.pointerId, startY: event.clientY, position, base,
        slots: order.map(id => rows.find(row => row.dataset.item === id).offsetTop),
        index: order.indexOf(node.dataset.item), initialIndex: order.indexOf(node.dataset.item), lastOffset: 0, lastTime: event.timeStamp, velocity: { x: 0, y: 0 } };
      node.setPointerCapture(event.pointerId); node.classList.add("is-dragging"); notify();
    }, { signal: events.signal });
    node.addEventListener("pointermove", event => {
      if (!drag || drag.node !== node || drag.pointerId !== event.pointerId) return;
      const container = list.getBoundingClientRect();
      const delta = event.clientY - drag.startY;
      const offset = Math.max(container.top - drag.base.top, Math.min(container.bottom - drag.base.bottom, delta));
      port.place({ intent: "drag-settle", target: `item:${node.dataset.item}`, to: { x: drag.position.x, y: drag.position.y + offset } });
      const elapsed = event.timeStamp - drag.lastTime;
      // The pointer can keep moving outside the list while the row is clamped.
      // Release velocity must describe the visible row, not that offscreen path.
      if (elapsed > 0) drag.velocity.y = Math.max(-1600, Math.min(1600, (offset - drag.lastOffset) / elapsed * 1000));
      drag.lastOffset = offset; drag.lastTime = event.timeStamp;
      const center = drag.base.top + offset + drag.base.height / 2;
      const centers = drag.slots.map(top => container.top + top + drag.base.height / 2);
      previewOrder(centers.reduce((best, value, index) => Math.abs(value - center) < Math.abs(centers[best] - center) ? index : best, 0));
    }, { signal: events.signal });
    node.addEventListener("pointerup", event => { if (drag?.pointerId === event.pointerId) { if (event.timeStamp - drag.lastTime > 80) drag.velocity.y = 0; finishDrag(); } }, { signal: events.signal });
    node.addEventListener("pointercancel", () => finishDrag(true), { signal: events.signal });
    node.addEventListener("lostpointercapture", () => finishDrag(true), { signal: events.signal });
    node.addEventListener("keydown", event => {
      if (event.key === "Escape" && drag) { finishDrag(true); return; }
      if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault(); const index = order.indexOf(node.dataset.item);
      reorder(node.dataset.item, Math.max(0, Math.min(order.length - 1, index + (event.key === "ArrowUp" ? -1 : 1))), true);
      node.focus({ preventScroll: true });
    }, { signal: events.signal });
  }
  const visibility = () => { if (document.hidden) finishDrag(true); };
  document.addEventListener("visibilitychange", visibility, { signal: events.signal });
  notify();
  return Object.freeze({
    selectView, settle: () => finishDrag(true),
    replay(immediate = false) { finishDrag(true); selectView(view === "regions" ? "arrangement" : "regions", immediate); },
    snapshot,
    dispose() { if (disposed) return; finishDrag(true); disposed = true; events.abort(); preview.dispose(); port.dispose(); },
  });
}
