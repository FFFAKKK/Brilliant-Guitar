// Workspace geometry is host state. It never enters the score document or its undo history.
import { workspaceLimits, workspaceValueLimits, workspaceResizeValue, workspaceSizes, constrainWorkspace, WORKSPACE_DEFAULT_SIZES, WORKSPACE_COMPACT_SIZES, WORKSPACE_SIZE_KEYS } from "../workspace-geometry.js";
import { notifyObservers } from "../runtime/runtime-support.js";
import { createStateTransaction } from "./state-transaction.js";
const DEFAULT_GEOMETRY = Object.freeze({
  leftOpen: false, rightOpen: true, topOpen: true, voiceOpen: false,
  leftWidth: WORKSPACE_DEFAULT_SIZES.left, rightWidth: WORKSPACE_DEFAULT_SIZES.right,
  topHeight: WORKSPACE_DEFAULT_SIZES.top, voiceHeight: WORKSPACE_DEFAULT_SIZES.voice, arrangement: "balanced",
});
const SIDES = WORKSPACE_SIZE_KEYS;
const REGIONS = { left: "leftOpen", right: "rightOpen", top: "topOpen", voice: "voiceOpen" };
const invalid = () => ({ ok: false, code: "workspace.invalid-payload" });

export function createWorkspaceState({ pageIds, layoutPageId, width = 1024, height = 720, onObserverError }) {
  const pages = Object.freeze([...pageIds]);
  if (!pages.length || new Set(pages).size !== pages.length || !pages.includes(layoutPageId)) {
    throw new Error("工作区需要唯一的页面 id 和已注册的布局页");
  }
  if (![width, height].every(value => typeof value === "number" && Number.isFinite(value) && value > 0)) {
    throw new Error("工作区视口尺寸必须是有限正数");
  }
  let viewport = { width, height };
  let state = { ...DEFAULT_GEOMETRY, currentPage: layoutPageId, adjusting: false };
  let preferredSizes = workspaceSizes(state);
  let snapshot;
  const listeners = new Set();
  const pending = [];
  let delivering = false;
  function notify() {
    pending.push(snapshot);
    if (delivering) return;
    delivering = true;
    try {
      while (pending.length) {
        const published = pending.shift();
        notifyObservers([...listeners].map(listener => () => listener(published)), onObserverError);
      }
    } finally { delivering = false; }
  }
  const transaction = createStateTransaction({ capture: () => ({ state, snapshot, viewport, preferredSizes }),
    restore: saved => { ({ state, snapshot, viewport, preferredSizes } = saved); }, notify });

  function limits(next) {
    return workspaceLimits(next, viewport.width, viewport.height);
  }

  function constrain(next) {
    return constrainWorkspace({ ...next, ...preferredSizes }, viewport.width, viewport.height);
  }

  function project() {
    return Object.freeze({ ...state, limits: limits(state),
      valueLimits: workspaceValueLimits(state, viewport.width, viewport.height) });
  }

  function publish(next, force = false) {
    if (!force && Object.keys(next).every(key => next[key] === state[key])) return { ok: true, changed: false };
    state = next;
    snapshot = project();
    transaction.changed();
    return { ok: true, changed: true };
  }
  state = constrain(state);
  snapshot = project();
  // Only this port is injected into content and the shell; no mutable store escapes it.
  const read = Object.freeze({
    snapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  });

  return Object.freeze({
    read, batch: transaction.batch,
    toggleRegion(region) {
      if (typeof region !== "string" || !Object.hasOwn(REGIONS, region)) return invalid();
      const key = REGIONS[region];
      return publish({ ...state, [key]: !state[key] });
    },
    setRegionOpen(region, open) {
      if (typeof region !== "string" || !Object.hasOwn(REGIONS, region) || typeof open !== "boolean") return invalid();
      return publish({ ...state, [REGIONS[region]]: open });
    },
    resize(side, value) {
      if (typeof side !== "string" || !Object.hasOwn(SIDES, side) || typeof value !== "number" || !Number.isFinite(value)) return invalid();
      const key = SIDES[side];
      const applied = workspaceResizeValue(state, side, value, viewport.width, viewport.height);
      const preferenceChanged = preferredSizes[key] !== applied;
      preferredSizes = { ...preferredSizes, [key]: applied };
      return publish({ ...state, [key]: applied }, preferenceChanged);
    },
    arrange(mode) {
      if (!["balanced", "compact", "default"].includes(mode)) return invalid();
      const compact = mode === "compact";
      const sizes = compact ? WORKSPACE_COMPACT_SIZES : WORKSPACE_DEFAULT_SIZES;
      const nextPreferences = { leftWidth: sizes.left, rightWidth: sizes.right, topHeight: sizes.top, voiceHeight: sizes.voice };
      const preferenceChanged = Object.keys(nextPreferences).some(key => nextPreferences[key] !== preferredSizes[key]);
      preferredSizes = nextPreferences;
      return publish(constrain({ ...state,
        ...(mode === "default" ? DEFAULT_GEOMETRY : {}),
        arrangement: compact ? "compact" : "balanced",
      }), preferenceChanged);
    },
    selectPage(id, toggle = true, activeId = state.currentPage) {
      if (!pages.includes(id) || !pages.includes(activeId) || typeof toggle !== "boolean") return invalid();
      return publish({ ...state, currentPage: id, rightOpen: toggle && activeId === id ? !state.rightOpen : true });
    },
    // Presentation-aware navigation chooses an id without changing region visibility.
    navigatePage(id) {
      if (!pages.includes(id)) return invalid();
      return publish({ ...state, currentPage: id });
    },
    stepPage(delta) {
      if (delta !== -1 && delta !== 1) return invalid();
      const index = Math.max(0, Math.min(pages.length - 1, pages.indexOf(state.currentPage) + delta));
      return publish({ ...state, currentPage: pages[index] });
    },
    beginAdjustment() {
      if (state.adjusting) return { ok: true, changed: false };
      return publish({ ...state, adjusting: true, rightOpen: true, currentPage: layoutPageId });
    },
    finishAdjustment(confirm) {
      if (typeof confirm !== "boolean") return invalid();
      if (!state.adjusting) return { ok: false, code: "workspace.no-adjustment" };
      return publish({ ...state, adjusting: false });
    },
    setViewport(width, height) {
      if (![width, height].every(value => typeof value === "number" && Number.isFinite(value) && value > 0)) return invalid();
      if (viewport.width === width && viewport.height === height) return { ok: true, changed: false };
      viewport = { width, height };
      return publish(constrain(state), true);
    },
  });
}
