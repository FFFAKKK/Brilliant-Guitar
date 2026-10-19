// Pure layout state. No DOM, no storage; every function returns a new object.
export const LAYOUT_VERSION = 1;
export const DOCKS = ["top", "left", "right", "bottom"];
export const SIZE_LIMITS = {
  top: { min: 52, max: 52, initial: 52 },
  bottom: { min: 120, max: 360, initial: 188 },
  left: { min: 220, max: 400, initial: 268 },
  right: { min: 260, max: 460, initial: 320 },
};
export const RESIZABLE = ["left", "right", "bottom"];

const clamp = (value, { min, max }) => Math.round(Math.min(max, Math.max(min, value)));

export function defaultLayout(components) {
  const docks = Object.fromEntries(DOCKS.map((side) => [side, { open: true, size: SIZE_LIMITS[side].initial, active: null }]));
  const placements = {};
  for (const component of components) {
    if (component.role !== "view") placements[component.id] = component.defaultSlot ?? null;
  }
  return { version: LAYOUT_VERSION, docks, placements };
}

// Unknown component ids are kept: a disabled plugin must find its place again when it returns.
export function sanitizeLayout(raw, components) {
  const base = defaultLayout(components);
  if (raw == null) return { layout: base, issues: [] };
  if (typeof raw !== "object") return { layout: base, issues: ["布局数据无法识别，已恢复默认布局"] };
  if (raw.version !== LAYOUT_VERSION) return { layout: base, issues: [`布局版本 ${raw.version} 不受支持，已恢复默认布局`] };
  const issues = [];
  const docks = {};
  for (const side of DOCKS) {
    const saved = raw.docks?.[side] ?? {};
    docks[side] = {
      open: typeof saved.open === "boolean" ? saved.open : true,
      size: Number.isFinite(saved.size) ? clamp(saved.size, SIZE_LIMITS[side]) : base.docks[side].size,
      active: typeof saved.active === "string" ? saved.active : null,
    };
  }
  const placements = { ...base.placements };
  for (const [id, side] of Object.entries(raw.placements ?? {})) {
    const component = components.find((item) => item.id === id);
    if (!component) { placements[id] = side; continue; }
    if (side === null || component.slots.includes(side)) placements[id] = side;
    else issues.push(`${component.title}不能放在该位置，已回到默认位置`);
  }
  return { layout: { version: LAYOUT_VERSION, docks, placements }, issues };
}

export function componentsIn(layout, side, components) {
  return components.filter((component) => layout.placements[component.id] === side);
}

export function setDockOpen(layout, side, open) {
  return { ...layout, docks: { ...layout.docks, [side]: { ...layout.docks[side], open } } };
}

export function setDockSize(layout, side, size) {
  const next = clamp(size, SIZE_LIMITS[side]);
  if (next === layout.docks[side].size) return layout;
  return { ...layout, docks: { ...layout.docks, [side]: { ...layout.docks[side], size: next } } };
}

export function activate(layout, side, componentId) {
  return { ...layout, docks: { ...layout.docks, [side]: { ...layout.docks[side], active: componentId } } };
}

// Moving into a closed dock opens it: the user asked to see the component there.
export function place(layout, component, side) {
  if (side !== null && !component.slots.includes(side)) throw new Error(`${component.id} cannot dock ${side}`);
  let next = { ...layout, placements: { ...layout.placements, [component.id]: side } };
  if (side !== null) next = activate(setDockOpen(next, side, true), side, component.id);
  return next;
}

// The active component of a tabbed dock; falls back to the first placed one.
export function activeIn(layout, side, components) {
  const placed = componentsIn(layout, side, components);
  return placed.find((component) => component.id === layout.docks[side].active) ?? placed[0] ?? null;
}
