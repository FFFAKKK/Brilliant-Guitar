// A fixed startup collection of placements. Definitions, DOM, geometry and styles have
// other owners. Both regions consume the same panel contract and keep its stable id.
import { isRecord, notifyObservers } from "../runtime/runtime-support.js";
import { UI_CONTRIBUTION_KINDS, UI_PANEL_SLOTS } from "../runtime/ui-plugin-contract.js";
import { UI_SLOTS } from "../runtime/plugin-facets.js";
import { createStateTransaction } from "./state-transaction.js";

const finite = value => typeof value === "number" && Number.isFinite(value);
const identity = value => typeof value === "string" && /^[a-z][\w-]*(\.[a-z][\w-]*)+$/.test(value);
const failure = code => ({ ok: false, code: `sidebar.${code}` });

export function createSidebarCompositionState({ contributions, onObserverError } = {}) {
  if (!Array.isArray(contributions)) throw new TypeError("侧栏编排需要贡献数组");
  if (onObserverError !== undefined && typeof onObserverError !== "function") throw new TypeError("观察者错误回调必须是函数");
  const capabilities = new Map(), components = new Set(), initial = [];
  for (const entry of contributions) {
    if (!isRecord(entry) || !UI_CONTRIBUTION_KINDS.includes(entry.kind)) throw new Error("侧栏编排需要规范化的贡献描述");
    if (entry.kind !== "panel") continue;
    if (!identity(entry.id) || !identity(entry.componentId)) throw new Error("panel 需要稳定 id 和 componentId");
    if (!Array.isArray(entry.slots) || !entry.slots.length || entry.slots.some(slot => !UI_SLOTS.includes(slot))
      || new Set(entry.slots).size !== entry.slots.length) throw new Error(`${entry.id}: panel slots 无效`);
    if (entry.defaultSlot !== undefined && !entry.slots.includes(entry.defaultSlot)) throw new Error(`${entry.id}: 默认位置超出允许范围`);
    if (entry.defaultEnabled !== undefined && typeof entry.defaultEnabled !== "boolean") throw new Error(`${entry.id}: 默认启用状态无效`);
    if (entry.order !== undefined && !finite(entry.order)) throw new Error(`${entry.id}: 默认顺序无效`);
    const slots = entry.slots.filter(slot => UI_PANEL_SLOTS.includes(slot));
    if (!slots.length) continue; // Legacy chrome content remains in the catalog, outside this state.
    if (capabilities.has(entry.id)) throw new Error(`${entry.id}: panel id 重复`);
    if (components.has(entry.componentId)) throw new Error(`${entry.componentId}: 同一组件不能同时编排为多个实例`);
    capabilities.set(entry.id, Object.freeze([...slots]));
    components.add(entry.componentId);
    const defaultSlot = entry.defaultSlot ?? entry.slots[0];
    initial.push({ id: entry.id, componentId: entry.componentId, slot: slots.includes(defaultSlot) ? defaultSlot : slots[0],
      // Do not silently take over a legacy panel whose initial placement is in chrome.
      enabled: entry.defaultEnabled === true && slots.includes(defaultSlot), order: entry.order ?? 0 });
  }
  initial.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const normalize = records => Object.freeze(UI_PANEL_SLOTS.flatMap(slot => records.filter(record => record.slot === slot)
    .map((record, order) => Object.freeze({ id: record.id, componentId: record.componentId, slot, enabled: record.enabled, order }))));
  let placements = normalize(initial), snapshot = Object.freeze({ panels: placements });
  const listeners = new Set(), pending = [];
  let delivering = false;
  function notify() {
    pending.push(snapshot);
    // Reentrant changes queue their snapshots so every observer sees the same order.
    if (delivering) return;
    delivering = true;
    try {
      while (pending.length) {
        const published = pending.shift();
        notifyObservers([...listeners].map(listener => () => listener(published)), onObserverError);
      }
    } finally { delivering = false; }
  }
  const transaction = createStateTransaction({ capture: () => ({ placements, snapshot }),
    restore: saved => { ({ placements, snapshot } = saved); }, notify });

  function publish(next) {
    const accepted = normalize(next);
    if (accepted.every((item, index) => Object.keys(item).every(key => item[key] === placements[index][key]))) return { ok: true, changed: false };
    placements = accepted;
    snapshot = Object.freeze({ panels: placements });
    transaction.changed();
    return { ok: true, changed: true };
  }

  function move(id, slot, index) {
    const current = placements.find(item => item.id === id);
    if (!current) return failure("unknown-panel");
    if (!capabilities.get(id).includes(slot)) return failure("invalid-slot");
    const target = placements.filter(item => item.slot === slot && item.id !== id);
    const position = index === undefined ? (current.slot === slot ? current.order : target.length) : index;
    if (!Number.isInteger(position) || position < 0 || position > target.length) return failure("invalid-order");
    target.splice(position, 0, { ...current, slot });
    return publish(UI_PANEL_SLOTS.flatMap(region => region === slot ? target : placements.filter(item => item.slot === region && item.id !== id)));
  }

  const read = Object.freeze({
    snapshot: () => snapshot,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("侧栏订阅者必须是函数");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return Object.freeze({
    read, move, batch: transaction.batch,
    restore(value) {
      if (!isRecord(value) || Object.keys(value).some(key => key !== "panels") || !Array.isArray(value.panels)
        || value.panels.length !== placements.length) return failure("invalid-snapshot");
      const ids = new Set(), orders = new Map();
      for (const item of value.panels) {
        const current = placements.find(record => record.id === item?.id);
        if (!isRecord(item) || Object.keys(item).some(key => !["id", "componentId", "slot", "enabled", "order"].includes(key))
          || !current || ids.has(item.id) || item.componentId !== current.componentId || !capabilities.get(item.id).includes(item.slot)
          || typeof item.enabled !== "boolean" || !Number.isInteger(item.order) || item.order < 0) return failure("invalid-snapshot");
        ids.add(item.id);
        const key = item.slot;
        if (!orders.has(key)) orders.set(key, []);
        orders.get(key).push(item.order);
      }
      if ([...orders.values()].some(indices => indices.sort((a, b) => a - b).some((index, position) => index !== position))) return failure("invalid-snapshot");
      return publish([...value.panels].sort((a, b) => a.order - b.order));
    },
    setEnabled(id, enabled) {
      if (typeof enabled !== "boolean") return failure("invalid-payload");
      if (!capabilities.has(id)) return failure("unknown-panel");
      return publish(placements.map(item => item.id === id ? { ...item, enabled } : item));
    },
    reorder(id, index) {
      const current = placements.find(item => item.id === id);
      if (!current) return failure("unknown-panel");
      if (index === undefined) return failure("invalid-order");
      return move(id, current.slot, index);
    },
  });
}
