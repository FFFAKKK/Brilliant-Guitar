// Data projection over the fixed startup catalog and composition. No registry, writes or DOM.
import { UI_PANEL_SLOTS } from "../runtime/ui-plugin-contract.js";

const names = { left: "左侧栏", right: "右侧栏" };
export function createSidebarContentReadPort({ catalog, composition, changes, reservedPanelIds = [] }) {
  const reserved = new Set(reservedPanelIds);
  function snapshot() {
    const definitions = new Map(catalog.list({ kind: "panel" }).map(panel => [panel.id, panel]));
    const placements = composition.snapshot().panels;
    const positions = new Map(placements.map(panel => [panel.id, panel]));
    const ids = [...new Set([...placements.map(panel => panel.id), ...definitions.keys()])];
    const panels = ids.flatMap(id => {
      if (reserved.has(id)) return [];
      const definition = definitions.get(id), position = positions.get(id);
      const slots = Object.freeze((definition?.slots ?? []).filter(slot => UI_PANEL_SLOTS.includes(slot)));
      if (!position && !slots.length) return [];
      const available = !!position && !!definition && position.componentId === definition.componentId && slots.includes(position.slot);
      const reason = !definition ? "该组件贡献当前不可用。" : !position ? "该组件未加入当前运行会话。"
        : !available ? "该组件的登记身份或允许位置已变化。" : "";
      const siblings = placements.filter(panel => panel.slot === position?.slot && !reserved.has(panel.id));
      const index = siblings.findIndex(panel => panel.id === id);
      return [Object.freeze({ id, componentId: position?.componentId ?? definition.componentId,
        title: definition?.title ?? "不可用组件", slots, slot: position?.slot ?? null,
        enabled: position?.enabled ?? false, order: position?.order ?? null, available, reason,
        previousOrder: index > 0 ? siblings[index - 1].order : null,
        nextOrder: index >= 0 && index < siblings.length - 1 ? siblings[index + 1].order : null,
      })];
    });
    const modifications = (changes?.() ?? []).filter(change => !reserved.has(change.id)).map(change => {
      const title = definitions.get(change.id)?.title ?? "不可用组件", details = [];
      if (change.before.enabled !== change.after.enabled) details.push(change.after.enabled ? "已加入侧栏" : "已移出侧栏");
      if (change.before.slot !== change.after.slot) details.push(names[change.before.slot] + " → " + names[change.after.slot]);
      if (change.before.order !== change.after.order) details.push("顺序 " + (change.before.order + 1) + " → " + (change.after.order + 1));
      return Object.freeze({ key: "panel:" + change.id, text: title + "：" + details.join("；") });
    });
    return Object.freeze({ panels: Object.freeze(panels), changes: Object.freeze(modifications) });
  }
  return Object.freeze({ snapshot, subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("组件管理订阅者必须是函数");
    return composition.subscribe(() => listener(snapshot()));
  } });
}
