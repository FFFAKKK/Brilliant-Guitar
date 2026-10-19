import { icon } from "../preview-icons.js";
import { LAYOUT_REGIONS, LAYOUT_DIMENSIONS } from "../../shell/layout-visual-state.js";
import { WORKSPACE_DEFAULT_SIZES, WORKSPACE_COMPACT_SIZES, WORKSPACE_MINIMUMS, WORKSPACE_MAXIMUMS } from "../../workspace-geometry.js";
import { projectLayoutPreview } from "../../shell/workspace-layout-preview-geometry.js";
export { projectLayoutPreview } from "../../shell/workspace-layout-preview-geometry.js";

export function createLayoutPreview(root, { instanceId, onState }) {
  root.innerHTML = `
    <div class="pilot-map" role="img" aria-label="工作区区域示意"><div class="pilot-map-canvas">
      ${["top", "left", "stage", "right", "voice"].map(side => `<i class="pilot-map-${side}" data-map-region="${side}"></i>`).join("")}
    </div></div>
    <div class="pilot-size-heading">尺寸 <small>Size</small></div>
    <div class="pilot-size-rows">
      ${LAYOUT_DIMENSIONS.map(entry => {
        const region = LAYOUT_REGIONS.find(region => region.side === entry.side);
        return `<div class="pilot-size-row" data-region-row="${entry.side}" role="group" aria-label="${entry.label}">
          <button type="button" class="pilot-region-toggle" data-region="${entry.side}" aria-label="${region.name}" title="${region.name}" aria-pressed="true"><span class="pilot-control-tile" aria-hidden="true"></span>${icon(region.glyph, 16)}</button>
          <span class="pilot-size-range"><span class="pilot-range-track" aria-hidden="true"><span class="pilot-range-fill"></span></span><input type="range" data-size="${entry.side}" aria-label="${entry.label}滑条" min="${WORKSPACE_MINIMUMS[entry.side]}" max="${WORKSPACE_MAXIMUMS[entry.side]}" step="1"></span>
          <span class="pilot-size-number"><input type="number" data-number="${entry.side}" id="${instanceId}-size-${entry.side}" aria-label="${entry.label}" min="${WORKSPACE_MINIMUMS[entry.side]}" max="${WORKSPACE_MAXIMUMS[entry.side]}" step="1"><span>px</span></span>
        </div>`;
      }).join("")}
    </div>
    <div class="pilot-presets" role="group" aria-label="工作区排布"><span>排布 <small>Arrange</small></span><div>
      ${[["balanced", "均衡排布", "balance"], ["compact", "紧凑排布", "compress"], ["default", "恢复默认", "reset"]].map(([id, name, glyph]) => `<button type="button" data-preset="${id}" class="pilot-region-toggle" aria-label="${name}" title="${name}" aria-pressed="false"><span class="pilot-control-tile" aria-hidden="true"></span>${icon(glyph, 16)}</button>`).join("")}
    </div></div>`;
  const canvas = root.querySelector(".pilot-map-canvas");
  const shapes = [...canvas.children];
  const controls = new Map(LAYOUT_DIMENSIONS.map(({ side }) => [side, {
    row: root.querySelector(`[data-region-row="${side}"]`),
    toggle: root.querySelector(`[data-region="${side}"]`),
    range: root.querySelector(`[data-size="${side}"]`),
    number: root.querySelector(`[data-number="${side}"]`),
    fill: root.querySelector(`[data-region-row="${side}"] .pilot-range-fill`),
  }]));
  let sizes = { ...WORKSPACE_DEFAULT_SIZES }, regions = Object.fromEntries(LAYOUT_REGIONS.map(({ side }) => [side, true]));
  let port = null, released = false;
  const events = new AbortController();
  const snapshot = () => Object.freeze({ sizes: Object.freeze({ ...sizes }), regions: Object.freeze({ ...regions }) });
  const targets = Object.fromEntries(shapes.map(node => [`shape:${node.dataset.mapRegion}`, { node, intents: ["shape-transition"] }]));

  function renderControls() {
    for (const [side, control] of controls) {
      control.toggle.setAttribute("aria-pressed", String(regions[side]));
      control.row.dataset.open = String(regions[side]);
      control.range.disabled = control.number.disabled = !regions[side];
      control.range.value = control.number.value = String(sizes[side]);
      control.number.setAttribute("aria-invalid", "false");
      control.fill.style.width = (sizes[side] - WORKSPACE_MINIMUMS[side]) / (WORKSPACE_MAXIMUMS[side] - WORKSPACE_MINIMUMS[side]) * 100 + "%";
    }
    root.querySelector(".pilot-map").setAttribute("aria-label", LAYOUT_REGIONS.map(({ side, name }) => `${name}${regions[side] ? "展开" : "收起"}`).join("，"));
    for (const node of root.querySelectorAll("[data-preset]")) {
      const preset = node.dataset.preset === "compact" ? WORKSPACE_COMPACT_SIZES : WORKSPACE_DEFAULT_SIZES;
      node.setAttribute("aria-pressed", String(node.dataset.preset !== "default" && Object.keys(sizes).every(side => sizes[side] === preset[side])));
    }
  }
  function project(immediate = false) {
    if (!port || released) return;
    // A hidden or not-yet-attached view has no usable geometry. Accept state
    // now; ResizeObserver paints it statically when the canvas becomes visible.
    if (canvas.clientWidth < 32 || canvas.clientHeight < 32) return;
    const rects = projectLayoutPreview(snapshot(), canvas.clientWidth, canvas.clientHeight);
    for (const [side, to] of Object.entries(rects)) {
      const request = { intent: "shape-transition", target: `shape:${side}`, to };
      if (immediate || document.hidden) port.place(request); else port.play(request);
    }
  }
  function commit(immediate) {
    // State and native controls accept first; presentation completion is never
    // a second write path. Retargeting samples the current clipped rectangle.
    renderControls(); project(immediate); onState(snapshot());
  }
  function resize(side, value) {
    if (!Number.isFinite(value) || released || !regions[side]) return;
    sizes[side] = Math.round(Math.max(WORKSPACE_MINIMUMS[side], Math.min(WORKSPACE_MAXIMUMS[side], value)));
    commit(true); // Pointer and number input remain directly coupled.
  }
  for (const [side, control] of controls) {
    control.toggle.addEventListener("click", event => { if (!released) { regions[side] = !regions[side]; commit(event.detail === 0); } }, { signal: events.signal });
    control.range.addEventListener("input", () => resize(side, Number(control.range.value)), { signal: events.signal });
    control.number.addEventListener("input", () => {
      const value = control.number.value === "" ? NaN : Number(control.number.value);
      const valid = Number.isFinite(value) && value >= WORKSPACE_MINIMUMS[side] && value <= WORKSPACE_MAXIMUMS[side];
      control.number.setAttribute("aria-invalid", String(!valid));
      if (valid) resize(side, value);
    }, { signal: events.signal });
    control.number.addEventListener("blur", () => {
      if (control.number.value !== "") resize(side, Number(control.number.value));
      renderControls();
    }, { signal: events.signal });
    control.number.addEventListener("keydown", event => { if (event.key === "Enter") control.number.blur(); }, { signal: events.signal });
  }
  for (const node of root.querySelectorAll("[data-preset]")) node.addEventListener("click", event => {
    if (released) return;
    sizes = { ...(node.dataset.preset === "compact" ? WORKSPACE_COMPACT_SIZES : WORKSPACE_DEFAULT_SIZES) };
    if (node.dataset.preset === "default") regions = Object.fromEntries(LAYOUT_REGIONS.map(({ side }) => [side, true]));
    commit(event.detail === 0);
  }, { signal: events.signal });
  const observer = new ResizeObserver(() => project(true));
  observer.observe(canvas);
  renderControls();
  return Object.freeze({
    targets, snapshot,
    connect(next) { port = next; project(true); },
    settle() { project(true); },
    dispose() { if (released) return; released = true; events.abort(); observer.disconnect(); port = null; },
  });
}
