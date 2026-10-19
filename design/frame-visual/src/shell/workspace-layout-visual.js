import { h } from "./dom.js";
import { graphic, visualButton } from "./visual-controls.js";
import { LAYOUT_REGIONS, LAYOUT_DIMENSIONS, layoutChanges, layoutDimension, layoutArrangementPreview } from "./layout-visual-state.js";
import { WORKSPACE_SIZE_KEYS } from "../workspace-geometry.js";
import { WORKSPACE_COMMANDS as C } from "../host/workspace-commands.js";
import { applyActionPresentation } from "./action-presentation.js";
import { isWorkspaceZoomValue, WORKSPACE_ZOOM_MAX, WORKSPACE_ZOOM_MIN, WORKSPACE_ZOOM_STEP } from "../host/workspace-view-state.js";
import { attachWorkspaceLayoutRegionMotion } from "./workspace-layout-motion.js";
import { createWorkspaceLayoutPreview } from "./workspace-layout-preview.js";
import { createWorkspaceLayoutSelection } from "./workspace-layout-selection.js";
import { createWorkspaceLayoutToggleMotion } from "./workspace-layout-toggle-motion.js";
import { createWorkspaceLayoutEditMotion } from "./workspace-layout-edit-motion.js";

export function createWorkspaceLayoutVisual({ state, before, begin, finish, region, resize, arrange, view, zoom, fit, sections = [], editGroups = [] }) {
  let current = state;
  let pendingMode = null, lastUpdate;
  const geometryKey = value => JSON.stringify([value.arrangement, ...LAYOUT_REGIONS.map(entry => value[entry.key]),
    ...Object.values(WORKSPACE_SIZE_KEYS).map(key => value[key]), value.limits]);
  let acceptedGeometry = geometryKey(state);
  let presentation = null, motionIssue = () => {}, pointerUpdate = false, visible = true, released = false;
  const canUse = control => !released && visible && !control.disabled;
  const reportMotionIssue = error => { try { motionIssue(error); } catch { /* Presentation diagnostics cannot alter layout. */ } };
  const detachMotion = () => {
    const previous = presentation; presentation = null;
    try { previous?.dispose(); } catch (error) { reportMotionIssue(error); }
    try { preview.detachMotion(); } catch (error) { reportMotionIssue(error); }
    try { selection.detachMotion(); } catch (error) { reportMotionIssue(error); }
    try { toggleMotion.detachMotion(); } catch (error) { reportMotionIssue(error); }
    try { editMotion.detachMotion(); } catch (error) { reportMotionIssue(error); }
  };
  const present = operation => {
    try { operation(presentation); } catch (error) { detachMotion(); reportMotionIssue(error); }
  };
  const preview = createWorkspaceLayoutPreview({ state, onIssue: error => { detachMotion(); reportMotionIssue(error); } });
  const maps = preview.regions, switches = new Map(), sizes = new Map(), arrangements = new Map();
  const editAction = (event, action) => {
    if (released) return;
    pointerUpdate = event.detail > 0;
    try { return action(); } finally { pointerUpdate = false; }
  };
  const edit = visualButton("编辑内容", null, event => editAction(event, () => { if (!current.editing) begin(event.currentTarget); }),
    { id: "composer-edit", dataset: { frameFocusFallback: "layout-cancel" } });
  const actions = finish ? h("div", { class: "v-mode-actions" },
    visualButton("取消", null, event => editAction(event, () => finish(false)), { id: "layout-cancel", "aria-label": "取消内容编辑", "data-tooltip": "取消内容编辑", title: "取消内容编辑", dataset: { frameFocusFallback: "composer-edit" } }),
    visualButton("确认", null, event => editAction(event, () => finish(true)), { id: "layout-confirm", "aria-label": "确认内容编辑", "data-tooltip": "确认内容编辑", title: "确认内容编辑", className: "primary", dataset: { frameFocusFallback: "composer-edit" } })) : null;
  const status = h("span", { id: "layout-session", class: "v-layout-session v-sr-only", role: "status" });
  const editMotion = createWorkspaceLayoutEditMotion({ edit, actions, groups: editGroups, state,
    onIssue: error => { detachMotion(); reportMotionIssue(error); } });
  const changeLabel = h("summary", {}, "本次修改");
  const changeList = h("div", { class: "v-layout-change-list" });
  const changes = h("details", { class: "v-layout-changes" }, changeLabel, changeList);
  const diagram = preview.element;
  const regionSizeGroup = h("section", { class: "v-layout-group v-layout-region-size-group", "aria-label": "区域尺寸" });
  for (const entry of LAYOUT_REGIONS) {
    const button = h("button", { type: "button", id: "layout-" + entry.side, class: "v-layout-control v-layout-region-toggle slot-choice", "aria-label": entry.label,
      onclick: event => {
        if (released) return;
        pointerUpdate = event.detail > 0;
        try { region(entry.side); } finally { pointerUpdate = false; }
      } }, h("span", { class: "v-layout-control-tile", "aria-hidden": "true" }), graphic(entry.glyph, 16));
    switches.set(entry.side, button);
  }
  for (const entry of LAYOUT_DIMENSIONS) {
    const id = "layout-size-" + entry.side;
    const rangeId = "layout-range-" + entry.side;
    const focusFallback = { frameFocusFallback: "layout-" + entry.side };
    const canResize = control => canUse(control) && !!current[entry.side + "Open"];
    const help = h("p", { class: "v-sr-only v-layout-limit", id: "layout-limit-" + entry.side });
    const range = h("input", { type: "range", id: rangeId, dataset: focusFallback, min: 0, max: 0, step: 1, "aria-label": entry.label + "滑条", "aria-describedby": help.id,
      oninput() {
        if (!canResize(range)) return;
        const value = Number(range.value);
        if (Number.isFinite(value)) resize(entry.side, value);
        input.value = current[WORKSPACE_SIZE_KEYS[entry.side]];
        updateRange(entry.side);
      },
    });
    const input = h("input", { type: "number", id, dataset: focusFallback, min: 0, step: 4, "aria-label": entry.label, "aria-describedby": help.id + " layout-session",
      oninput() {
        if (!canResize(input)) return;
        const value = Number(input.value), meta = layoutDimension(current, entry.side);
        if (input.value !== "" && Number.isFinite(value) && value >= meta.minimum && value <= meta.maximum) {
          resize(entry.side, value);
          input.value = current[WORKSPACE_SIZE_KEYS[entry.side]];
        }
        updateRange(entry.side, input.value);
      },
      onblur() {
        if (released) return;
        const entered = input.value === "" ? null : Number(input.value);
        if (canResize(input) && entered !== null && Number.isFinite(entered)) resize(entry.side, entered);
        input.value = current[WORKSPACE_SIZE_KEYS[entry.side]];
        updateRange(entry.side);
      },
    });
    const restore = visualButton("恢复" + entry.label, "reset", () => {
      if (canResize(restore)) resize(entry.side, layoutDimension(current, entry.side).restore);
    }, { id: "layout-reset-" + entry.side, dataset: focusFallback, className: "v-layout-reset", size: 14 });
    const rangeFill = h("span", { class: "v-layout-range-fill", "aria-hidden": "true" });
    const rangeTrack = h("span", { class: "v-layout-range-track", "aria-hidden": "true" }, rangeFill);
    const rangeControl = h("span", { class: "v-layout-range" }, rangeTrack, range);
    const row = h("div", { class: "v-layout-region-size-row v-layout-size-entry", dataset: { region: entry.side }, role: "group", "aria-label": entry.label },
      switches.get(entry.side),
      h("div", { class: "v-layout-size" }, h("label", { class: "v-sr-only", for: id }, entry.label), rangeControl,
        h("span", { class: "v-size-input" }, input, h("span", {}, "px")), restore), help);
    sizes.set(entry.side, { input, range, rangeFill, help, restore, row });
    regionSizeGroup.append(row);
  }
  const zoomNodes = view && zoom ? (() => {
    let inputDrafting = false;
    const zoomHint = "Ctrl 加滚轮连续调整谱面缩放";
    const help = h("span", { class: "v-layout-zoom-help", role: "img", "aria-label": zoomHint, title: zoomHint, "data-tooltip": zoomHint }, graphic("scrollZoom", 15));
    const range = h("input", { type: "range", id: "layout-zoom-range", min: WORKSPACE_ZOOM_MIN,
      max: WORKSPACE_ZOOM_MAX, step: WORKSPACE_ZOOM_STEP, "aria-label": "谱面缩放滑条",
      oninput: () => { if (canUse(range)) zoom(Number(range.value)); } });
    const input = h("input", { type: "number", id: "layout-zoom-value", min: WORKSPACE_ZOOM_MIN,
      max: WORKSPACE_ZOOM_MAX, step: WORKSPACE_ZOOM_STEP, "aria-label": "谱面缩放百分比",
      oninput: () => {
        if (!canUse(input)) return;
        inputDrafting = true;
        const accepted = isWorkspaceZoomValue(input.value);
        input.setAttribute("aria-invalid", String(!accepted));
        if (accepted) zoom(Number(input.value));
      },
      onblur: () => {
        if (released) return;
        inputDrafting = false;
        input.setAttribute("aria-invalid", "false");
        input.value = String(view.snapshot().zoom);
      } });
    const fitButton = visualButton("适应谱宽", "fit", () => { if (canUse(fitButton)) fit?.(); }, { id: "layout-zoom-fit", className: "v-layout-reset", size: 14 });
    const fill = h("span", { class: "v-layout-range-fill", "aria-hidden": "true" });
    const track = h("span", { class: "v-layout-range-track", "aria-hidden": "true" }, fill);
    const control = h("span", { class: "v-layout-range" }, track, range);
    const group = h("section", { class: "v-layout-group v-layout-zoom-group", "aria-label": "谱面缩放" },
      h("span", { class: "v-layout-group-label" }, "谱面缩放"),
      h("div", { class: "v-layout-zoom" }, control, h("span", { class: "v-size-input" }, input, h("span", {}, "%")), fitButton, help));
    return { group, range, input, fill, help, fitButton, isDrafting: () => inputDrafting };
  })() : null;
  const toggleMotion = createWorkspaceLayoutToggleMotion({ buttons: switches, state,
    onIssue: error => { detachMotion(); reportMotionIssue(error); } });
  const arrangeRows = h("div", { class: "v-layout-control-row v-layout-arrange-row slot-choices", role: "group", "aria-label": "排布预览" });
  const arrangeChoices = [["预览均衡排布", "balanced", "alignLeft"], ["预览紧凑排布", "compact", "combine"], ["恢复默认", "default", "reset"]];
  for (const [label, mode, glyph] of arrangeChoices) {
    const button = h("button", { type: "button", class: "v-layout-control slot-choice", id: "layout-" + mode, "aria-label": label, title: label, "data-tooltip": label,
      onclick: event => {
        if (released) return;
        pointerUpdate = event.detail > 0;
        try {
          if (mode === "default") { pendingMode = null; arrange(mode); update(...lastUpdate); }
          else { pendingMode = mode; update(...lastUpdate); }
        } finally { pointerUpdate = false; }
      } }, h("span", { class: "v-layout-control-tile", "aria-hidden": "true" }), graphic(glyph, 16));
    arrangements.set(mode, button); arrangeRows.append(button);
  }
  const selection = createWorkspaceLayoutSelection({ row: arrangeRows, state,
    choices: arrangeChoices.map(([, mode, glyph]) => ({ mode, glyph, button: arrangements.get(mode) })),
    onIssue: error => { detachMotion(); reportMotionIssue(error); } });
  const applyArrangement = visualButton("应用排布", "check", event => {
    if (released || !pendingMode || applyArrangement.disabled) return;
    const mode = pendingMode;
    pendingMode = null; pointerUpdate = event.detail > 0;
    try {
      const result = arrange(mode);
      if (result?.ok === false) pendingMode = mode;
      update(...lastUpdate);
    } finally { pointerUpdate = false; }
  }, { id: "layout-apply-arrangement", className: "v-layout-apply", title: "应用排布" });
  const arrangement = h("section", { class: "v-layout-group", "aria-label": "工作区排布预览" },
    h("div", { class: "v-layout-group-heading" }, h("span", { class: "v-layout-group-label" }, "排布预览"), applyArrangement), arrangeRows);
  const element = h("section", { class: "v-composer", "aria-label": "工作区布局组件" },
    h("div", { class: "v-composer-header" }, h("span", { class: "v-composer-name" }, "布局设置"), edit, actions),
    h("div", { class: "v-layout-content", "aria-label": "布局设置内容" }, status, diagram, arrangement, regionSizeGroup,
      ...(zoomNodes ? [zoomNodes.group] : []), ...sections, changes));

  function updateRange(side, draft) {
    const meta = layoutDimension(current, side), nodes = sizes.get(side);
    nodes.input.setAttribute("aria-invalid", "false");
    nodes.range.setAttribute("aria-invalid", "false");
    nodes.help.dataset.boundary = meta.boundary; nodes.help.title = meta.reason;
    let message = meta.range;
    if (draft !== undefined) {
      const value = Number(draft);
      if (draft === "") {
        message = nodes.input.validity.badInput ? "请输入数字；离开后恢复当前值。" : "输入尺寸；离开后恢复当前值。";
        if (nodes.input.validity.badInput) nodes.input.setAttribute("aria-invalid", "true");
      }
      else if (!Number.isFinite(value) || value < meta.minimum || value > meta.maximum) {
        message = "允许 " + meta.minimum + "–" + meta.maximum + " px；离开后按范围限制。";
        nodes.input.setAttribute("aria-invalid", "true");
      }
    }
    nodes.help.textContent = message;
    nodes.range.min = meta.trackMinimum;
    nodes.range.max = meta.trackMaximum;
    nodes.range.setAttribute("aria-valuemin", meta.minimum);
    nodes.range.setAttribute("aria-valuemax", meta.maximum);
    nodes.range.setAttribute("aria-valuenow", meta.value);
    // The thumb and fill always represent the accepted host value. A number
    // field may contain an unfinished draft, but it does not resize the track.
    const progress = meta.trackMaximum === meta.trackMinimum ? 0 : (meta.value - meta.trackMinimum) / (meta.trackMaximum - meta.trackMinimum);
    nodes.range.style.setProperty("--range-progress", Math.max(0, Math.min(1, progress)) * 100 + "%");
    nodes.rangeFill.style.width = Math.max(0, Math.min(1, progress)) * 100 + "%";
    nodes.range.value = meta.value;
  }
  function update(next, entered, componentChanges = [], actionSnapshot = null, viewSnapshot = view?.snapshot()) {
    if (released) return;
    lastUpdate = [next, entered, componentChanges, actionSnapshot, viewSnapshot];
    const nextGeometry = geometryKey(next);
    const geometryChanged = nextGeometry !== acceptedGeometry;
    if (geometryChanged) pendingMode = null;
    acceptedGeometry = nextGeometry;
    current = next;
    const display = pendingMode ? layoutArrangementPreview(next, pendingMode) : next;
    const previewing = geometryKey(display) !== nextGeometry;
    element.dataset.previewing = String(previewing);
    diagram.setAttribute("aria-label", previewing ? "排布预览 · 尚未应用" : "当前工作区布局");
    applyActionPresentation(applyArrangement, actionSnapshot, C.arrange, { disabled: !previewing, hint: "应用排布" });
    const modifications = next.editing ? [...layoutChanges(next, entered), ...componentChanges] : [];
    element.dataset.editing = String(next.editing); element.dataset.changes = String(modifications.length);
    edit.firstChild.textContent = "编辑内容";
    applyActionPresentation(edit, actionSnapshot, C.begin, { disabled: next.editing, hint: edit.textContent });
    edit.hidden = !!actions && next.editing;
    if (actions) {
      actions.hidden = !next.editing;
      for (const node of actions.children) applyActionPresentation(node, actionSnapshot, C.finish, { hint: node.getAttribute("aria-label") });
    }
    status.textContent = next.editing ? modifications.length ? "已修改 " + modifications.length + " 项" : "编辑中 · 未修改" : "";
    status.hidden = !next.editing;
    changes.hidden = !modifications.length;
    changeLabel.textContent = "查看本次修改 · " + modifications.length + " 项";
    changeList.replaceChildren(...modifications.map(change => h("p", {}, change.text)));
    for (const entry of LAYOUT_REGIONS) {
      const button = switches.get(entry.side);
      button.setAttribute("aria-pressed", String(next[entry.key])); button.title = (next[entry.key] ? "收起" : "展开") + entry.name;
      button.setAttribute("data-tooltip", button.title);
      applyActionPresentation(button, actionSnapshot, C.region, { hint: button.title });
    }
    for (const entry of LAYOUT_DIMENSIONS) {
      const meta = layoutDimension(next, entry.side), nodes = sizes.get(entry.side);
      const regionEntry = LAYOUT_REGIONS.find(region => region.side === entry.side);
      const open = !!next[regionEntry.key];
      const adjustable = meta.maximum > meta.minimum;
      const sizeHint = adjustable ? entry.label : meta.reason;
      nodes.row.dataset.open = String(open);
      nodes.row.dataset.adjustable = String(adjustable);
      nodes.input.min = meta.minimum; nodes.input.max = meta.maximum;
      nodes.range.min = meta.trackMinimum; nodes.range.max = meta.trackMaximum;
      nodes.input.title = sizeHint; nodes.range.title = sizeHint;
      applyActionPresentation(nodes.input, actionSnapshot, C.resize, { disabled: !open || !adjustable, hint: sizeHint });
      applyActionPresentation(nodes.range, actionSnapshot, C.resize, { disabled: !open || !adjustable, hint: sizeHint });
      if (document.activeElement !== nodes.input || nodes.input.disabled) nodes.input.value = meta.value;
      nodes.restore.title = meta.restoreLabel; nodes.restore.setAttribute("data-tooltip", meta.restoreLabel);
      applyActionPresentation(nodes.restore, actionSnapshot, C.resize, { disabled: !open || meta.value === meta.restore, hint: meta.restoreLabel });
      updateRange(entry.side, document.activeElement === nodes.input ? nodes.input.value : undefined);
    }
    for (const [mode, button] of arrangements) {
      applyActionPresentation(button, actionSnapshot, C.arrange, { hint: button.getAttribute("aria-label") });
      button.setAttribute("aria-pressed", String(mode !== "default" && mode === display.arrangement));
    }
    if (zoomNodes && viewSnapshot) {
      const value = viewSnapshot.zoom;
      zoomNodes.range.value = value;
      if (!zoomNodes.isDrafting() || document.activeElement !== zoomNodes.input) zoomNodes.input.value = value;
      zoomNodes.range.setAttribute("aria-valuemin", WORKSPACE_ZOOM_MIN);
      zoomNodes.range.setAttribute("aria-valuemax", WORKSPACE_ZOOM_MAX);
      zoomNodes.range.setAttribute("aria-valuenow", value);
      const progress = (value - WORKSPACE_ZOOM_MIN) / (WORKSPACE_ZOOM_MAX - WORKSPACE_ZOOM_MIN);
      zoomNodes.fill.style.width = Math.max(0, Math.min(1, progress)) * 100 + "%";
      applyActionPresentation(zoomNodes.range, actionSnapshot, C.zoom, { hint: "谱面缩放" });
      applyActionPresentation(zoomNodes.input, actionSnapshot, C.zoom, { hint: "谱面缩放百分比" });
      applyActionPresentation(zoomNodes.fitButton, actionSnapshot, C.fit, { hint: "适应谱宽" });
    }
    // The host snapshot and semantic controls have already been accepted.
    // Unknown/programmatic/async updates are conservatively immediate; only
    // synchronous pointer toggles/presets animate the permitted local artwork.
    const options = { immediate: !pointerUpdate || !visible };
    present(active => { preview.update(display, options); selection.update(display, options); toggleMotion.update(next, options); editMotion.update(next, { ...options, geometryChanged }); active?.update(display, options); });
  }
  update(state, before);
  return { element, update,
    attachMotion(bind, { onIssue = () => {}, shapeTransition = false, selectionTransition = false, toggleTransition = false, editTransition = false } = {}) {
      if (released || presentation || preview.motionBound) throw new TypeError("Layout presentation already bound or released");
      if (typeof bind !== "function" || typeof onIssue !== "function" || [shapeTransition, selectionTransition, toggleTransition, editTransition].some(option => typeof option !== "boolean")) throw new TypeError("Invalid layout presentation binding");
      motionIssue = onIssue;
      // Explicit engineering opt-in only after formal shape permission exists.
      // The default retains today's formally registered opacity targets.
      try {
        if (shapeTransition) preview.attachMotion(bind, element);
        else presentation = attachWorkspaceLayoutRegionMotion({ bind, root: element, regions: maps, state: current });
        if (selectionTransition) selection.attachMotion(bind, element);
        if (toggleTransition) toggleMotion.attachMotion(bind, element);
        if (editTransition) editMotion.attachMotion(bind, element);
      } catch (error) { detachMotion(); throw error; }
    },
    setVisible(next) {
      if (typeof next !== "boolean") throw new TypeError("Invalid layout visibility");
      visible = next;
      if (!next && pendingMode) { pendingMode = null; update(...lastUpdate); }
      present(active => { preview.setVisible(next); selection.setVisible(next); toggleMotion.setVisible(next); editMotion.setVisible(next); if (!next) active?.settle(); });
    },
    dispose() { if (released) return; released = true; detachMotion(); preview.dispose(); selection.dispose(); toggleMotion.dispose(); editMotion.dispose(); },
  };
}
