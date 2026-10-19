// One shared dock. Owns geometry and switching only; never renders component content itself.
// States: empty (nothing placed) | closed (user hid it) | expanded | rail (auto-narrowed by window size).
import { h } from "./dom.js";
import { icon } from "./icons.js";
import { RESIZABLE } from "../layout/layout-model.js";

const COLLAPSE_ICON = { left: "collapseLeft", right: "collapseRight", bottom: "collapseDown" };
const VARIANT = { top: "compact-horizontal", bottom: "compact-horizontal", left: "compact-vertical", right: "compact-vertical" };

export function createDock(side, { host, onActivate, onClose, onResize, onRailOpen }) {
  const tabs = h("div", { class: "dock-tabs", role: "tablist", "aria-label": "区域内组件" });
  const actions = h("div", { class: "dock-actions" });
  const header = h("div", { class: "dock-header" }, tabs, actions);
  const body = h("div", { class: "dock-body" });
  const rail = h("div", { class: "dock-rail", role: "toolbar", "aria-orientation": side === "bottom" ? "horizontal" : "vertical" });
  const grip = RESIZABLE.includes(side) ? h("div", { class: "dock-grip", role: "separator", tabindex: "0", "aria-orientation": side === "bottom" ? "horizontal" : "vertical" }) : null;
  const root = h("aside", { class: `dock dock-${side}`, dataset: { side, state: "empty" } }, header, body, rail, grip);
  let placed = [];
  let active = null;

  if (side !== "top") {
    const collapse = h("button", { class: "dock-action", type: "button", "aria-label": "收起区域", title: "收起区域", onclick: () => onClose(side) });
    collapse.innerHTML = icon(COLLAPSE_ICON[side], 16);
    actions.append(collapse);
  }

  function tabButton(component) {
    const selected = component.id === active?.id;
    const button = h("button", {
      class: "dock-tab", type: "button", role: "tab", "aria-selected": String(selected), tabindex: selected ? "0" : "-1",
      dataset: { component: component.id }, text: component.title, onclick: () => onActivate(side, component.id),
    });
    return button;
  }

  function railButton(component) {
    const button = h("button", { class: "rail-button", type: "button", "aria-label": component.title, title: component.title, dataset: { component: component.id }, onclick: (event) => onRailOpen(side, component.id, event.currentTarget) });
    button.innerHTML = component.icon ?? `<span class="rail-initial">${component.title.slice(0, 1)}</span>`;
    return button;
  }

  tabs.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key) || placed.length < 2) return;
    const at = placed.findIndex((component) => component.id === active?.id);
    const next = placed[(at + (event.key === "ArrowRight" ? 1 : -1) + placed.length) % placed.length];
    onActivate(side, next.id);
    tabs.querySelector(`[data-component="${next.id}"]`)?.focus();
  });

  if (grip) bindResize(grip, side, root, onResize);

  return {
    root,
    // The shell calls this after every layout or size change.
    render({ components, activeComponent, open, size, mode }) {
      placed = components;
      active = activeComponent;
      const state = !components.length ? "empty" : !open ? "closed" : mode;
      root.dataset.state = state;
      root.dataset.stacked = String(side === "top" || components.length < 2 ? "flat" : "tabs");
      root.style.setProperty("--dock-size", `${size}px`);
      root.inert = state === "empty" || state === "closed";
      tabs.replaceChildren(...components.map(tabButton));
      rail.replaceChildren(...components.map(railButton));
      if (grip) grip.setAttribute("aria-valuenow", String(size));
      // Top dock shows every component in a row; other docks show the active one.
      const visible = state !== "expanded" ? [] : side === "top" ? components : [activeComponent];
      for (const component of visible) body.append(host.ensure(component.id, VARIANT[side]));
      [...body.children].forEach((cell) => { cell.hidden = !visible.some((component) => component.id === cell.dataset.component); });
      return state;
    },
    body,
  };
}

function bindResize(grip, side, root, onResize) {
  const axis = side === "bottom" ? "clientY" : "clientX";
  const sign = side === "left" ? 1 : -1;
  grip.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    grip.setPointerCapture(event.pointerId);
    const start = event[axis];
    const initial = parseFloat(root.style.getPropertyValue("--dock-size"));
    root.classList.add("is-resizing");
    const move = (next) => onResize(side, initial + (next[axis] - start) * sign, { live: true });
    const end = (last) => { grip.removeEventListener("pointermove", move); root.classList.remove("is-resizing"); onResize(side, initial + (last[axis] - start) * sign, { live: false }); };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", end, { once: true });
    grip.addEventListener("pointercancel", end, { once: true });
  });
  grip.addEventListener("keydown", (event) => {
    const grow = side === "left" ? "ArrowRight" : side === "right" ? "ArrowLeft" : "ArrowUp";
    const shrink = side === "left" ? "ArrowLeft" : side === "right" ? "ArrowRight" : "ArrowDown";
    if (event.key !== grow && event.key !== shrink) return;
    event.preventDefault();
    const current = parseFloat(root.style.getPropertyValue("--dock-size"));
    onResize(side, current + (event.key === grow ? 16 : -16), { live: false });
  });
}
