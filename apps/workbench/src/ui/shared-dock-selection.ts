import type { UiSlot } from "./plugin-contract";

export type SharedDockSlot = Extract<UiSlot, "top" | "left" | "right" | "bottom">;
export type SharedDockSelection = Readonly<Record<SharedDockSlot, string | null>>;

export const DEFAULT_SHARED_DOCK_SELECTION: SharedDockSelection = {
  top: null, left: null, right: null, bottom: null,
};

/** The persisted tab may have moved or been removed; the first available item is safe. */
export function activeDockItem(ids: readonly string[], preferred: string | null): string | null {
  return preferred && ids.includes(preferred) ? preferred : ids[0] ?? null;
}

export function selectDockItem(state: SharedDockSelection, slot: SharedDockSlot, id: string,
  availableIds: readonly string[]): SharedDockSelection {
  return !availableIds.includes(id) || state[slot] === id ? state : { ...state, [slot]: id };
}

export type InlineDockZone = "leading" | "center" | "trailing";

/** Explicitly zoned tools may share a horizontal band without taking over tabs. */
export function pairedDockItems<T extends Readonly<{ id: string; inlineZone?: InlineDockZone }>>(
  slot: SharedDockSlot, items: readonly T[]): readonly T[] | null {
  if ((slot !== "top" && slot !== "bottom") || items.length < 2 || items.length > 3) return null;
  const leading = items.find((item) => item.inlineZone === "leading");
  const center = items.find((item) => item.inlineZone === "center");
  const trailing = items.find((item) => item.inlineZone === "trailing");
  if (!leading || !trailing || (items.length === 3 && !center)) return null;
  return center ? [leading, center, trailing] : [leading, trailing];
}
