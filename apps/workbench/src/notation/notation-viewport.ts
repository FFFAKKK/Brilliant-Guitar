import type { StaffView } from "../contracts/notation.ts";
import { layoutStaff } from "./staff-layout.ts";

export const SCORE_ZOOM = { min: 50, max: 200, step: 25, default: 100 } as const;

export function clampScoreZoom(percent: number): number {
  return Number.isFinite(percent) ? Math.min(SCORE_ZOOM.max, Math.max(SCORE_ZOOM.min, Math.round(percent))) : SCORE_ZOOM.default;
}

/** Reflow in logical engraving units, then scale only the drawing, never its panel. */
export function layoutNotationViewport(view: StaffView, width: number, percent: number) {
  const scale = clampScoreZoom(percent) / 100;
  const layout = layoutStaff(view, width / scale);
  return { layout, scale, displayWidth: layout.width * scale, displayHeight: layout.height * scale };
}
