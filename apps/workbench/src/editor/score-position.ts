import type { StaffView } from "../contracts/notation.ts";
import { capacityUnits } from "../notation/input-position.ts";
import { durationUnits } from "../contracts/note-input.ts";
import type { ScoreEditPoint } from "./score-navigation.ts";
import { editPointOffsetUnits, normalizeScoreEditPoint } from "./score-navigation.ts";

export interface ScorePosition {
  readonly measureNumber: number;
  readonly beat: string;
  readonly atMeasureEnd: boolean;
}

function formatBeat(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/**
 * Resolve the visible editing position without coupling it to the note-control UI.
 * A selection points at the event start; input points at the current measure tail.
 */
export function resolveScorePosition(view: StaffView, inputPoint: ScoreEditPoint | null,
  selectedEventId: string | null = null): ScorePosition | null {
  let measureIndex = view.measures.findIndex((measure) => measure.events.some((event) => event.id === selectedEventId));
  let measure = view.measures[measureIndex];
  let offset = 0;

  if (measure && selectedEventId) {
    const eventIndex = measure.events.findIndex((event) => event.id === selectedEventId);
    offset = measure.events.slice(0, eventIndex).reduce((total, event) => total + durationUnits(event.duration), 0);
  } else {
    if (!inputPoint) return null;
    const normalized = normalizeScoreEditPoint(view, inputPoint);
    measureIndex = view.measures.findIndex((item) => item.id === normalized.measureId);
    measure = view.measures[measureIndex];
    if (!measure) return null;
    offset = editPointOffsetUnits(view, normalized) ?? 0;
  }

  const beatUnit = 64 / measure.meter.denominator;
  return {
    measureNumber: measureIndex + 1,
    beat: formatBeat(1 + offset / beatUnit),
    atMeasureEnd: offset >= capacityUnits(measure),
  };
}
