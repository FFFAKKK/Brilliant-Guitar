/** Fixed-session horizontal contributions, mounted by the same ComponentHost as panels. */
export function createHorizontalSlotPresentation({ catalog, components }) {
  const cells = new Map();
  let disposed = false;
  const entries = Object.freeze(Object.fromEntries(["top", "bottom"].map(slot => [slot,
    catalog.list({ kind: "slotItem", slot }).filter(item => item.defaultSlot === slot),
  ])));
  return Object.freeze({
    has: slot => (entries[slot]?.length ?? 0) > 0,
    render(workspace, regions) {
      if (disposed) throw new Error("横向内容承载已释放");
      for (const slot of ["top", "bottom"]) {
        const region = regions[slot], visible = slot === "top" ? workspace.topOpen : workspace.voiceOpen;
        if (!region?.element) continue;
        region.element.hidden = entries[slot].length === 0;
        if (region.placeholder) region.placeholder.hidden = entries[slot].length > 0;
        for (const item of entries[slot]) {
          let element = cells.get(item.componentId);
          if (element && !components.has(item.componentId, element)) { cells.delete(item.componentId); element = null; }
          if (!element && visible) {
            element = components.ensure(item.componentId, slot);
            element.classList.add("runtime-slot-cell");
            element.style.setProperty("min-width", `${item.minWidth}px`);
            cells.set(item.componentId, element); region.element.append(element);
          }
          if (element) components.setVisible(item.componentId, visible);
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [id, element] of [...cells].reverse()) components.release(id, element);
      cells.clear();
    },
  });
}
