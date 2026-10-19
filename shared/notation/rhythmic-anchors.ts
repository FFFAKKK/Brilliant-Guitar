import { capacityUnits, durationUnits } from "./note-properties.ts";
import type { EventDuration, InputSequenceAnchor } from "./note-properties.ts";
import type { EditAnchorGeometry } from "./notation-renderer.ts";

export interface SequenceMeasure {
  readonly id: string;
  readonly meter: { readonly numerator: number; readonly denominator: number };
  readonly events: readonly { readonly id: string; readonly duration: EventDuration }[];
}

/** Invisible trailing tickables share the original binary spacing rule. */
export function trailingGhostDurations(measure: SequenceMeasure): readonly string[] {
  let remaining = capacityUnits(measure) - measure.events.reduce((sum, event) => sum + durationUnits(event.duration), 0);
  const durations: string[] = [];
  for (const base of [1, 2, 4, 8, 16, 32, 64]) {
    while (remaining >= 64 / base) { durations.push(String(base)); remaining -= 64 / base; }
  }
  return durations;
}

/** Positions are supplied by the same formatted voice that drew the visible glyphs. */
export function rhythmicAnchors(measure: SequenceMeasure, geometry: {
  readonly noteStart: number; readonly noteEnd: number;
  readonly centers: readonly { readonly x: number; readonly y: number }[];
  readonly tailX: number; readonly tailY: number; readonly cursorY: number;
  readonly lineSpacing: number; readonly scale: number;
}): readonly EditAnchorGeometry[] {
  const { noteStart, noteEnd, centers, tailX, tailY, cursorY, lineSpacing, scale } = geometry;
  const capacity = capacityUnits(measure);
  const used = measure.events.reduce((sum, event) => sum + durationUnits(event.duration), 0);
  const xForOffset = (offset: number) => noteStart + (noteEnd - noteStart) * Math.min(1, Math.max(0, offset / capacity));
  const make = (anchor: InputSequenceAnchor, offsetUnits: number, x: number, y: number): EditAnchorGeometry => ({
    measureId: measure.id, anchor, offsetUnits, x: x * scale, y: y * scale,
    y1: (cursorY - lineSpacing * 0.85) * scale, y2: (cursorY + lineSpacing * 0.85) * scale,
  });
  const startX = centers.length ? Math.max(noteStart - 6, centers[0]!.x - lineSpacing) : tailX;
  const anchors = [make({ kind: "start" }, 0, startX, centers[0]?.y ?? tailY)];
  let offset = 0;
  measure.events.forEach((event, index) => {
    offset += durationUnits(event.duration);
    const next = centers[index + 1];
    const x = next === undefined ? tailX : (centers[index]!.x + next.x) / 2;
    anchors.push(make({ kind: "after-event", eventId: event.id }, offset, x, next?.y ?? tailY));
  });
  const beat = 64 / measure.meter.denominator;
  const last = measure.events.at(-1);
  const tailAnchor = last ? { kind: "after-event" as const, eventId: last.id } : { kind: "start" as const };
  for (let remaining = (Math.floor(used / beat) + 1) * beat; remaining < capacity; remaining += beat) {
    anchors.push(make(tailAnchor, remaining, xForOffset(remaining), tailY));
  }
  return anchors;
}
