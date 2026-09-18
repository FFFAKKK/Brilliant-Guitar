import type { NotationInteractionGeometry } from "../notation/notation-renderer.ts";

export interface StaffRangeGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A range follows rhythmic width while its vertical bounds remain tied to the staff. */
export function resolveStaffRangeGeometry(geometry: NotationInteractionGeometry | null,
  measureId: string | null, eventIds: readonly string[]): StaffRangeGeometry | null {
  if (!geometry || !measureId || eventIds.length < 2) return null;
  const measure = geometry.measures.find((item) => item.measureId === measureId);
  if (!measure) return null;
  const selected = eventIds.map((id) => geometry.events.find((event) => event.eventId === id
    && event.measureId === measureId)).filter((event) => event !== undefined);
  if (selected.length !== eventIds.length) return null;
  const x = Math.min(...selected.map((event) => event.x));
  const right = Math.max(...selected.map((event) => event.x + event.width));
  return { x: x - measure.lineSpacing * .3, y: measure.staffBottom - measure.lineSpacing * 4.65,
    width: right - x + measure.lineSpacing * .6, height: measure.lineSpacing * 5.35 };
}
