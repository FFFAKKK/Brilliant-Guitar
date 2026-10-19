// Workbench shell: geometry only. Fixed frame + stage + four shared docks.
// It reads the component registry and layout store; it never knows what a component does.
import { h } from "./dom.js";
import { createFrameBar } from "./frame-bar.js";
import { createDock } from "./dock.js";
import { dockModes } from "./adaptive.js";
import { openPopover, closePopover } from "./popover.js";
import { renderLibrary, renderLayoutPanel, renderNotices } from "./frame-panels.js";
import { DOCKS, componentsIn, activeIn, activate, setDockOpen, setDockSize } from "../layout/layout-model.js";

const FRAME_HEIGHT = 34;

export function createShell(root, runtime) {
  const { components, layout, host, notices } = runtime;
  const stage = h("main", { class: "stage", "aria-label": "工作区" });
  const docks = Object.fromEntries(DOCKS.map((side) => [side, createDock(side, {
    host,
    onActivate: (dockSide, id) => layout.update((current) => activate(current, dockSide, id)),
    onClose: (dockSide) => runtime.router.execute(`frame.dock.${dockSide}`),
    onResize: resize,
    onRailOpen: openFlyout,
  })]));
  const middle = h("div", { class: "middle" }, stage, docks.left.root, docks.right.root);
  const frameBar = createFrameBar({
    ...runtime,
    onLibrary: (anchor) => openPopover(anchor, renderLibrary(runtime), { label: "组件库", align: "end" }),
    onLayout: (anchor) => openPopover(anchor, renderLayoutPanel(runtime), { label: "布局", align: "end" }),
    onNotices: (anchor) => { notices.markRead(); openPopover(anchor, renderNotices(runtime), { label: "通知", align: "end" }); },
  });
  const app = h("div", { class: "workbench" }, frameBar, docks.top.root, middle, docks.bottom.root);
  root.replaceChildren(app);
  app.style.setProperty("--frame-h", `${FRAME_HEIGHT}px`);

  let flyout = null;
  let lastStates = {};

  function resize(side, size, { live }) {
    if (live) { docks[side].root.style.setProperty("--dock-size", `${Math.round(size)}px`); applyRows(); return; }
    layout.update((current) => setDockSize(current, side, size));
  }

  function applyRows() {
    const top = lastStates.top === "expanded" ? "var(--top-size)" : "0px";
    const bottom = { expanded: "var(--bottom-size)", rail: "var(--rail-h)" }[lastStates.bottom] ?? "0px";
    app.style.setProperty("--top-size", docks.top.root.style.getPropertyValue("--dock-size"));
    app.style.setProperty("--bottom-size", docks.bottom.root.style.getPropertyValue("--dock-size"));
    app.style.gridTemplateRows = `var(--frame-h) ${top} minmax(0, 1fr) ${bottom}`;
  }

  function render() {
    const current = layout.get();
    const all = components.list();
    const occupied = Object.fromEntries(DOCKS.map((side) => [side, componentsIn(current, side, all).length > 0]));
    const modes = dockModes({ width: innerWidth, height: innerHeight, frameHeight: FRAME_HEIGHT, layout: current, occupied });
    lastStates = {};
    for (const side of DOCKS) {
      lastStates[side] = docks[side].render({
        components: componentsIn(current, side, all),
        activeComponent: activeIn(current, side, all),
        open: current.docks[side].open,
        size: current.docks[side].size,
        mode: modes[side],
      });
    }
    applyRows();
    // Left/right are overlays: the stage keeps its size, it only learns which lanes are covered.
    for (const side of ["left", "right"]) {
      const covered = { expanded: `${current.docks[side].size}px`, rail: "var(--rail-w)" }[lastStates[side]] ?? "0px";
      stage.style.setProperty(`--cover-${side}`, covered);
    }
    renderStage(all);
    releaseUnplaced(current, all);
    if (flyout && lastStates[flyout.side] !== "rail") closeFlyout();
    restoreFocus();
    runtime.router.refresh();
  }

  function renderStage(all) {
    const view = all.find((component) => component.role === "view");
    if (!view) { if (!stage.querySelector(".stage-empty")) stage.replaceChildren(h("div", { class: "stage-empty" })); return; }
    const cell = host.ensure(view.id, "workspace");
    if (!stage.contains(cell)) stage.replaceChildren(cell);
  }

  // A component removed from every slot is disposed; hidden docks keep their components mounted.
  function releaseUnplaced(current, all) {
    for (const id of host.mounted()) {
      const definition = all.find((component) => component.id === id);
      if (!definition) { host.release(id); continue; }
      if (definition.role !== "view" && current.placements[id] == null) host.release(id);
    }
  }

  // Focus that lived inside a dock which just disappeared returns to the stage (foundation audit §渲染、焦点).
  function restoreFocus() {
    const focused = document.activeElement;
    if (!focused || focused === document.body) return;
    const dock = focused.closest?.(".dock");
    if (dock && dock.inert) stage.focus({ preventScroll: true });
  }

  function openFlyout(side, componentId, anchor) {
    if (flyout?.componentId === componentId) { closeFlyout(); return; }
    closeFlyout();
    const panel = h("div", { class: `dock-flyout flyout-${side}`, role: "dialog", "aria-label": components.get(componentId).title });
    panel.append(host.ensure(componentId, "panel"));
    host.ensure(componentId, "panel").hidden = false;
    middle.append(panel);
    anchor.setAttribute("aria-pressed", "true");
    const onPointer = (event) => { if (!panel.contains(event.target) && !anchor.contains(event.target)) closeFlyout(); };
    const onKey = (event) => { if (event.key === "Escape") { closeFlyout(); anchor.focus(); } };
    document.addEventListener("pointerdown", onPointer, true);
    panel.addEventListener("keydown", onKey);
    flyout = { side, componentId, panel, anchor, cleanup: () => document.removeEventListener("pointerdown", onPointer, true) };
  }

  function closeFlyout() {
    if (!flyout) return;
    const { panel, anchor, cleanup, side, componentId } = flyout;
    flyout = null;
    cleanup();
    anchor.removeAttribute("aria-pressed");
    // Hand the cell back to its dock before the flyout goes away, so it is never remounted.
    const cell = host.ensure(componentId, side === "bottom" ? "compact-horizontal" : "compact-vertical");
    cell.hidden = true;
    docks[side].body.append(cell);
    panel.remove();
  }

  stage.tabIndex = -1;
  layout.subscribe(render);
  components.subscribe(render);
  addEventListener("resize", () => { closePopover({ restoreFocus: false }); render(); });
  render();
  return { render, stage };
}
