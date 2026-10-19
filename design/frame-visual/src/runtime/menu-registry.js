// Menus are data: host declares top-level menus, anyone contributes items that point at command ids.
import { captureConfig, isRecord, notifyObservers } from "./runtime-support.js";
export function createMenuRegistry(definitions, { onObserverError } = {}) {
  const menus = captureConfig(definitions);
  const items = [];
  const listeners = new Set();
  const changed = () => notifyObservers(listeners, onObserverError);
  return {
    has: (id) => menus.some((menu) => menu.id === id),
    contribute(owner, raw) {
      const item = captureConfig(raw, "menuItem");
      if (!isRecord(item) || typeof item.command !== "string") throw new Error("菜单贡献需要对象和命令 id");
      if (!menus.some((menu) => menu.id === item.menu)) throw new Error(`unknown menu ${item.menu}`);
      const entry = Object.freeze({ group: 0, order: 0, ...item, owner });
      items.push(entry);
      changed();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const index = items.indexOf(entry);
        if (index < 0) return;
        items.splice(index, 1);
        changed();
      };
    },
    // Empty menus are not shown: a menu appears only when something can actually be executed.
    resolve() {
      return menus.map((menu) => {
        const own = items.filter((item) => item.menu === menu.id).sort((a, b) => a.group - b.group || a.order - b.order);
        const groups = [];
        own.forEach((item) => { const last = groups.at(-1); if (last?.group === item.group) last.items.push(item); else groups.push({ group: item.group, items: [item] }); });
        return { ...menu, groups: groups.map((group) => group.items) };
      }).filter((menu) => menu.groups.length);
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
