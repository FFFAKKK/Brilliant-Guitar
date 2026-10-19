// Host-owned commands: layout, library placement, document file entry points.
// Menus, shortcuts and frame buttons all execute these ids.
import { DOCKS, place, setDockOpen } from "../layout/layout-model.js";

const SIDE_KEYS = { top: "Mod+Alt+ArrowUp", left: "Mod+Alt+ArrowLeft", right: "Mod+Alt+ArrowRight", bottom: "Mod+Alt+ArrowDown" };
const SIDE_LABEL = { top: "上区域", left: "左区域", right: "右区域", bottom: "下区域" };

export function registerFrameCommands({ router, menus, layout, components, notices }) {
  const occupied = (side) => components.list().some((component) => layout.get().placements[component.id] === side);

  for (const side of DOCKS) {
    router.register("host", {
      id: `frame.dock.${side}`, label: SIDE_LABEL[side], keys: [SIDE_KEYS[side]],
      enabled: () => occupied(side),
      checked: () => layout.get().docks[side].open,
      run: () => layout.update((current) => setDockOpen(current, side, !current.docks[side].open)),
    });
    menus.contribute("host", { menu: "view", group: 1, order: DOCKS.indexOf(side), command: `frame.dock.${side}` });
  }

  router.register("host", {
    id: "frame.place", label: "放置组件",
    run({ componentId, slot }) {
      const component = components.get(componentId);
      if (!component) return { ok: false, code: "component.missing" };
      if (slot !== null && !component.slots.includes(slot)) return { ok: false, code: "slot.illegal" };
      layout.update((current) => place(current, component, slot));
      return { ok: true };
    },
  });
  router.register("host", {
    id: "frame.layout.reset", label: "恢复默认布局",
    run: () => { layout.reset(); notices.push({ text: "已恢复默认布局" }); },
  });
  menus.contribute("host", { menu: "view", group: 2, command: "frame.layout.reset" });
}

// File entry points exist in the frame but stay disabled until a document service is connected.
export function registerDocumentEntries({ router, menus }) {
  const entries = [["file.new", "新建", "Mod+N"], ["file.open", "打开…", "Mod+O"], ["file.save", "保存", "Mod+S"], ["file.save-as", "另存为…", "Mod+Shift+S"]];
  entries.forEach(([id, label, key], order) => {
    router.register("host", { id, label, keys: [key], enabled: () => false, run: () => ({ ok: false }) });
    menus.contribute("host", { menu: "file", group: order < 2 ? 0 : 1, order, command: id });
  });
}
