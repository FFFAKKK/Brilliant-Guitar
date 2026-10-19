/* Visual-only transaction. Runtime command/state contracts are maintained separately. */
import { HOSTING_MUTATIONS } from "./content-hosting-state.js";
const fields = ["topContributed", "presentation", "enabled", "widths",
  "iconOrder", "hiddenIcons", "preset", "custom", "contentHosting", "schemeBook"];
const mutations = new Set(["module", "module-remove", "module-width", "module-move",
  "content-select", "content-drag", "content-drop", "module-menu", "icon-visibility", "icon-order", "presentation", "preset", "restore", "modal-confirm"]);

export function canEditLayout(state) { return state.assembly === true; }
export function requiresLayoutEdit(action) { return mutations.has(action) || HOSTING_MUTATIONS.has(action); }
export function beginLayoutEdit(state) {
  if (canEditLayout(state)) return false;
  state.assemblyBefore = Object.fromEntries(fields.filter(key => Object.hasOwn(state, key)).map(key => [key, structuredClone(state[key])]));
  state.assembly = state.editing = true;
  state.selectedModule = null;
  state.rightOpen = state.reviewLayout = true;
  return true;
}
export function finishLayoutEdit(state, confirm) {
  if (!canEditLayout(state)) return false;
  const before = state.assemblyBefore;
  if (before && !confirm) Object.assign(state, structuredClone(before));
  state.assemblyBefore = null;
  state.assembly = state.editing = state.dragging = false;
  state.movingContent = null;
  if (state.hostingMemory) {
    state.hostingMemory.dragging = null;
    state.hostingMemory.result = confirm ? "内容配置已确认。" : "内容配置已撤回；工作区调整、输入和阅读位置保留。";
  }
  state.layer = null;
  return true;
}

export function prepareLayoutFixture(state) {
  const editing = state.assembly || state.editing;
  state.assembly = state.editing = false;
  if (!editing) return;
  // Explicit review scenes enter the same transaction as the sole UI entry.
  const view = { rightOpen: state.rightOpen, reviewLayout: state.reviewLayout, layer: state.layer, selectedModule: state.selectedModule };
  beginLayoutEdit(state);
  Object.assign(state, view);
}
