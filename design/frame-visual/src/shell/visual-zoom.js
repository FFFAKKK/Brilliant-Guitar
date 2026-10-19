import { h } from "./dom.js";
import { graphic } from "./visual-controls.js";
import { openPopover, closePopover, popoverAnchor } from "./popover.js";
import { WORKSPACE_COMMANDS as C } from "../host/workspace-commands.js";
import { isWorkspaceZoomValue, WORKSPACE_ZOOM_MAX, WORKSPACE_ZOOM_MIN, WORKSPACE_ZOOM_STEP } from "../host/workspace-view-state.js";

const formatZoom = value => `${Number(value).toFixed(1).replace(/\.0$/, "")}%`;

// The runtime version uses the host's single continuous view state. The
// no-view branch remains for standalone historical shell fixtures.
export function createVisualZoom(router, view) {
  if (!view) return createLegacyVisualZoom(router);

  let value = view.snapshot().zoom;
  let controls = null;
  let inputDrafting = false;
  const label = h("span", {}, formatZoom(value));
  const element = h("button", { type: "button", class: "v-zoom", id: "zoom-trigger",
    "aria-label": "谱面缩放", "aria-expanded": "false", onclick: open }, label, graphic("chevron"));

  function update(next) {
    value = next.zoom;
    label.textContent = formatZoom(value);
    element.setAttribute("data-zoom", formatZoom(value));
    if (controls) {
      controls.range.value = String(value);
      if (!inputDrafting || document.activeElement !== controls.input) controls.input.value = String(value);
      controls.range.setAttribute("aria-valuenow", value);
      controls.readout.textContent = formatZoom(value);
    }
  }
  function setZoom(next) {
    const result = router.execute(C.zoom, { value: Number(next) });
    if (!result.ok) update(view.snapshot());
  }
  function open() {
    inputDrafting = false;
    const range = h("input", { type: "range", min: WORKSPACE_ZOOM_MIN, max: WORKSPACE_ZOOM_MAX,
      step: WORKSPACE_ZOOM_STEP, value, id: "zoom-range", "aria-label": "谱面缩放百分比",
      "aria-valuemin": WORKSPACE_ZOOM_MIN, "aria-valuemax": WORKSPACE_ZOOM_MAX, "aria-valuenow": value,
      oninput: () => setZoom(range.value) });
    const input = h("input", { type: "number", min: WORKSPACE_ZOOM_MIN, max: WORKSPACE_ZOOM_MAX,
      step: WORKSPACE_ZOOM_STEP, value, id: "zoom-value", "aria-label": "谱面缩放百分比",
      oninput: () => {
        inputDrafting = true;
        const accepted = isWorkspaceZoomValue(input.value);
        input.setAttribute("aria-invalid", String(!accepted));
        if (accepted) setZoom(input.value);
      },
      onblur: () => {
        inputDrafting = false;
        input.setAttribute("aria-invalid", "false");
        input.value = String(view.snapshot().zoom);
      } });
    const readout = h("strong", {}, formatZoom(value));
    const fitActions = h("div", { class: "v-zoom-fit-actions" }, ...[
      ["width", "适应谱宽"], ["page", "整页"],
    ].map(([mode, label]) => h("button", { type: "button", class: "v-zoom-fit",
      "aria-label": label, onclick: () => {
        router.execute(C.fit, { mode }); closePopover();
      } }, label)));
    controls = { range, input, readout };
    const content = h("div", { class: "v-zoom-panel", role: "dialog", "aria-label": "谱面缩放" },
      h("div", { class: "v-zoom-readout" }, h("span", {}, "当前缩放"), readout),
      h("div", { class: "v-zoom-control" }, range, h("span", {}, "%")),
      h("label", { class: "v-zoom-number" }, h("span", {}, "数值"), input, h("span", {}, "%")), fitActions);
    const panel = openPopover(element, content, { label: "谱面缩放", align: "end" });
    if (!panel) { controls = null; return; }
    panel.classList.add("v-overlay"); panel.dataset.layer = "context";
    const anchor = element.getBoundingClientRect(), box = panel.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(innerWidth - box.width - 8, anchor.right - box.width)) + "px";
    panel.style.top = Math.max(42, anchor.top - box.height - 4) + "px";
  }

  const unsubscribe = view.subscribe(update);
  return { element, dispose() {
    unsubscribe();
    if (popoverAnchor() === element) closePopover({ restoreFocus: false });
  } };
}

function createLegacyVisualZoom(router) {
  const presets = [["整页", "fit"], ["75%", 75], ["100%", 100], ["125%", 125], ["150%", 150], ["200%", 200]];
  let value = "fit";
  const label = h("span", {}, "整页");
  const element = h("button", { type: "button", class: "v-zoom", id: "zoom-trigger",
    "aria-label": "谱面缩放", "aria-expanded": "false", onclick: open }, label, graphic("chevron"));
  function open() {
    const content = h("div", { role: "menu" }, ...presets.map(([name, next]) =>
      h("button", { class: "v-menu-item", type: "button", role: "menuitemradio", "aria-checked": String(next === value),
        "aria-label": name, onclick() {
          const result = router.execute(C.zoom, { value: next });
          if (result.ok) { value = next; label.textContent = name; }
          closePopover();
        } }, graphic(next === value ? "check" : "full"), h("span", {}, name))));
    const panel = openPopover(element, content, { label: "谱面缩放", align: "end" });
    if (!panel) return;
    panel.classList.add("v-overlay"); panel.dataset.layer = "context";
    const anchor = element.getBoundingClientRect(), box = panel.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(innerWidth - box.width - 8, anchor.right - box.width)) + "px";
    panel.style.top = Math.max(42, anchor.top - box.height - 4) + "px";
  }
  return { element, dispose() { if (popoverAnchor() === element) closePopover({ restoreFocus: false }); } };
}
