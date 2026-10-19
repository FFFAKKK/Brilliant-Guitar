// An internal UI host adapter. It projects existing owners; it registers neither
// plugins nor commands, and keeps no second layout or selection state.
export function createSidebarPresentation({ catalog, composition, components }) {
  const cells = new Map();
  let disposed = false;

  function describe(workspace, snapshot = composition.snapshot()) {
    const definitions = new Map(catalog.list({ kind: "panel" }).map(item => [item.id, item]));
    const placements = snapshot.panels.filter(item => definitions.get(item.id)?.componentId === item.componentId);
    const region = slot => Object.freeze(placements.filter(item => item.enabled && item.slot === slot).map(item => definitions.get(item.id)));
    const left = region("left"), right = region("right");
    const activeRight = right.find(item => item.id === workspace.currentPage) ?? right[0] ?? null;
    return Object.freeze({ left, right, activeRight, placements: Object.freeze(placements),
      leftOpen: workspace.leftOpen, rightOpen: workspace.rightOpen });
  }

  function render(model, regions) {
    if (disposed) throw new Error("侧栏呈现已释放");
    // Leaf display follows selection/enablement; the region owns folding. Keep
    // the existing DOM display rules while reporting actual visibility separately.
    const displayed = new Set([...model.left.map(item => item.id), ...(model.activeRight ? [model.activeRight.id] : [])]);
    const visible = new Set([
      ...(model.leftOpen ? model.left.map(item => item.id) : []),
      ...(model.rightOpen && model.activeRight ? [model.activeRight.id] : []),
    ]);
    const positions = new Map(model.placements.map(item => [item.id, item]));
    const descriptors = new Map([...model.left, ...model.right].map(item => [item.id, item]));
    for (const [id, record] of cells) if (!components.has(record.componentId, record.element)) {
      if (record.carrier !== record.element) record.carrier?.remove();
      cells.delete(id);
    }
    // Only genuinely visible content mounts for the first time.
    for (const id of visible) {
      const descriptor = descriptors.get(id), position = positions.get(id);
      if (!cells.has(id)) cells.set(id, { componentId: descriptor.componentId,
        element: components.ensure(descriptor.componentId, regions[position.slot].variant) });
    }
    for (const [id, record] of cells) {
      if (!components.has(record.componentId, record.element)) { cells.delete(id); continue; }
      const position = positions.get(id);
      if (!position) {
        record.element.hidden = true;
        components.setVisible(record.componentId, false);
        record.element.remove();
        if (record.carrier !== record.element) record.carrier?.remove();
        continue;
      }
      const target = regions[position.slot];
      components.setVariant(record.componentId, target.variant);
      target.decorate?.(record.element, id);
      record.element.hidden = !displayed.has(id);
      const carrier = target.item?.(record.element) ?? record.element;
      carrier.hidden = record.element.hidden;
      if (carrier.parentNode !== target.element) target.element.append(carrier);
      // Wrapping has already moved the cell. Never remove the old carrier if
      // it was the cell itself; only dispose a superseded host wrapper.
      if (record.carrier && record.carrier !== record.element && record.carrier !== carrier) record.carrier.remove();
      record.carrier = carrier;
      components.setVisible(record.componentId, visible.has(id));
    }
    // The current left presentation is a list. Hidden records do not participate
    // in its display order, and unrelated elements remain owned by the shell.
    const ordered = model.left.map(item => cells.get(item.id)?.carrier).filter(Boolean);
    const current = [...regions.left.element.children].filter(element => ordered.includes(element));
    if (ordered.some((element, index) => element !== current[index])) {
      for (const element of ordered) regions.left.element.append(element);
    }
    return { left: model.left.map(item => cells.get(item.id)?.element).filter(Boolean) };
  }

  return Object.freeze({ describe, render,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const record of [...cells.values()].reverse()) {
        components.release(record.componentId, record.element);
        if (record.carrier !== record.element) record.carrier?.remove();
      }
      cells.clear();
    },
  });
}
