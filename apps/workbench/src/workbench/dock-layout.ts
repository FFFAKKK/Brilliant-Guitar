export type DockSide = "top" | "right" | "bottom" | "left";

export interface DockLayoutState {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export type DockVisibilityState = Readonly<Record<DockSide, boolean>>;

export interface DockViewport {
  readonly width: number;
  readonly height: number;
}

export interface DockSizeBounds {
  readonly min: number;
  readonly max: number;
}

export const DOCK_LAYOUT_DEFAULTS: DockLayoutState = {
  left: 208,
  right: 280,
  top: 56,
  bottom: 136,
};

export const DOCK_VISIBILITY_DEFAULTS: DockVisibilityState = {
  top: true,
  right: true,
  bottom: true,
  left: true,
};

/** The smallest track kept visible when a dock is collapsed. */
export const COLLAPSED_DOCK_SIZE = 32;

const CENTER_MIN_WIDTH = 480;
const CENTER_MIN_HEIGHT = 280;
const COMPACT_BREAKPOINT = 920;
const COMPACT_RAIL = 44;
const DESKTOP_MIN_SIDE = 144;
const MAX_SIDE = 420;
const MIN_BAND = 40;
const MAX_BAND = 240;

export function dockSizeBounds(side: DockSide, viewport: DockViewport): DockSizeBounds {
  const horizontal = side === "left" || side === "right";
  return horizontal
    ? { min: viewport.width <= COMPACT_BREAKPOINT ? COMPACT_RAIL : DESKTOP_MIN_SIDE, max: MAX_SIDE }
    : { min: MIN_BAND, max: MAX_BAND };
}

export function clampDockLayout(layout: DockLayoutState, viewport: DockViewport): DockLayoutState {
  const compact = viewport.width <= COMPACT_BREAKPOINT;
  const sideMin = compact ? COMPACT_RAIL : DESKTOP_MIN_SIDE;
  if (compact) {
    const verticalCapacity = Math.max(MIN_BAND * 2, viewport.height - CENTER_MIN_HEIGHT);
    const requestedBands = Math.min(verticalCapacity, Math.max(MIN_BAND * 2, layout.top + layout.bottom));
    const topRatio = layout.top / Math.max(1, layout.top + layout.bottom);
    const top = Math.round(Math.min(MAX_BAND, Math.max(MIN_BAND, requestedBands * topRatio)));
    const bottom = Math.round(Math.min(MAX_BAND, Math.max(MIN_BAND, requestedBands - top)));
    return { left: COMPACT_RAIL, right: COMPACT_RAIL, top, bottom };
  }
  const horizontalCapacity = Math.max(sideMin * 2, viewport.width - CENTER_MIN_WIDTH);
  const requestedSides = Math.min(horizontalCapacity, Math.max(sideMin * 2, layout.left + layout.right));
  const leftRatio = layout.left / Math.max(1, layout.left + layout.right);
  const left = Math.round(Math.min(MAX_SIDE, Math.max(sideMin, requestedSides * leftRatio)));
  const right = Math.round(Math.min(MAX_SIDE, Math.max(sideMin, requestedSides - left)));

  const verticalCapacity = Math.max(MIN_BAND * 2, viewport.height - CENTER_MIN_HEIGHT);
  const requestedBands = Math.min(verticalCapacity, Math.max(MIN_BAND * 2, layout.top + layout.bottom));
  const topRatio = layout.top / Math.max(1, layout.top + layout.bottom);
  const top = Math.round(Math.min(MAX_BAND, Math.max(MIN_BAND, requestedBands * topRatio)));
  const bottom = Math.round(Math.min(MAX_BAND, Math.max(MIN_BAND, requestedBands - top)));

  return { left, right, top, bottom };
}

export function resizeDock(layout: DockLayoutState, side: DockSide, delta: number, viewport: DockViewport): DockLayoutState {
  const next = { ...layout };
  if (side === "left") next.left += delta;
  if (side === "right") next.right -= delta;
  if (side === "top") next.top += delta;
  if (side === "bottom") next.bottom -= delta;
  return clampDockLayout(next, viewport);
}

/** Temporary responsive compression must not overwrite an untouched preference. */
export function mergeDockPreferences(preferred: DockLayoutState, displayed: DockLayoutState, next: DockLayoutState): DockLayoutState {
  const merged = { ...preferred };
  for (const side of ["left", "right", "top", "bottom"] as const) {
    if (Number.isFinite(next[side]) && next[side] !== displayed[side]) merged[side] = next[side];
  }
  return merged;
}

export function resetDockSize(layout: DockLayoutState, side: DockSide, viewport: DockViewport): DockLayoutState {
  return clampDockLayout({ ...layout, [side]: DOCK_LAYOUT_DEFAULTS[side] }, viewport);
}

export function dockTrackSize(layout: DockLayoutState, visibility: DockVisibilityState, side: DockSide): number {
  return visibility[side] ? layout[side] : COLLAPSED_DOCK_SIZE;
}

export function keyboardResizeDock(layout: DockLayoutState, side: DockSide, key: string, step: number, viewport: DockViewport): DockLayoutState | null {
  const pointerDelta = side === "left"
    ? key === "ArrowRight" ? step : key === "ArrowLeft" ? -step : null
    : side === "right"
      ? key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : null
      : side === "top"
        ? key === "ArrowDown" ? step : key === "ArrowUp" ? -step : null
        : key === "ArrowUp" ? -step : key === "ArrowDown" ? step : null;
  return pointerDelta === null ? null : resizeDock(layout, side, pointerDelta, viewport);
}

export function toggleDockVisibility(visibility: DockVisibilityState, side: DockSide): DockVisibilityState {
  return { ...visibility, [side]: !visibility[side] };
}

export function dockViewport(): DockViewport {
  return { width: window.innerWidth, height: window.innerHeight - 48 };
}
