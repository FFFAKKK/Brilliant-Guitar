import type { PaperViewportGeometry } from "./paper-viewport";

/** Percentages are relative to fitting the entire A4 page in the available space. */
export const PAPER_ZOOM = { initial: 175, fit: 100, min: 75, max: 250, step: 25 } as const;

export function clampPaperZoom(value: number): number {
  return Number.isFinite(value) ? Math.min(PAPER_ZOOM.max, Math.max(PAPER_ZOOM.min, value)) : PAPER_ZOOM.fit;
}

export function stepPaperZoom(value: number, direction: -1 | 1): number {
  return clampPaperZoom(value + direction * PAPER_ZOOM.step);
}

export function zoomFittedPaper(fit: Readonly<{ width: number; height: number; scale: number; gutter: number }>,
  percent: number): Pick<PaperViewportGeometry, "paperWidth" | "scale" | "gutter"> & { readonly height: number } {
  const ratio = clampPaperZoom(percent) / 100;
  return { paperWidth: fit.width * ratio, height: fit.height * ratio, scale: fit.scale * ratio, gutter: fit.gutter };
}
