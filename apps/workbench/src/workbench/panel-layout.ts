/** Workbench configuration, independent of music data and renderer settings. */
export interface PanelDefinition {
  readonly id: string;
  readonly title: string;
  readonly minWidth: number;
  readonly minHeight: number;
}

export type PanelSize = { readonly mode: "fill" } | { readonly mode: "fixed"; readonly width: number; readonly height: number };
export const DEFAULT_PANEL_SIZE: PanelSize = { mode: "fill" };
export interface PanelDimensions { readonly width: number; readonly height: number }
export type ResizeEdge = "right" | "bottom" | "corner";

/** Geometry lives in the workbench; pointer resizing never scales the content. */
export function resizePanel(start: PanelDimensions, delta: { x: number; y: number }, edge: ResizeEdge,
  bounds: PanelDimensions, definition: PanelDefinition): Extract<PanelSize, { mode: "fixed" }> {
  const limit = (value: number, minimum: number, available: number) => {
    const maximum = Math.max(1, Math.floor(available));
    return Math.min(maximum, Math.max(Math.min(minimum, maximum), Math.round(value)));
  };
  return { mode: "fixed",
    width: limit(start.width + (edge === "bottom" ? 0 : delta.x), definition.minWidth, bounds.width),
    height: limit(start.height + (edge === "right" ? 0 : delta.y), definition.minHeight, bounds.height),
  };
}
