import { durationUnits } from "../contracts/note-input.ts";
import type { InputPitch, InputSequenceAnchor } from "../contracts/note-input.ts";
import type { StaffMeasure, StaffView } from "../contracts/notation.ts";
import { capacityUnits, usedUnits } from "../notation/input-position.ts";

export interface ScoreEditPoint {
  readonly partId: string;
  readonly staffId: string;
  readonly measureId: string;
  readonly voiceId: string;
  readonly anchor: InputSequenceAnchor;
  readonly offsetUnits: number;
  readonly preferredPitch: InputPitch | null;
}

function point(view: StaffView, measure: StaffMeasure, anchor: InputSequenceAnchor, offsetUnits: number,
  preferredPitch: InputPitch | null = null): ScoreEditPoint {
  return { partId: view.partId, staffId: view.staffId, measureId: measure.id, voiceId: measure.voiceId, anchor, offsetUnits, preferredPitch };
}

export function sameScoreEditPoint(a: ScoreEditPoint | null, b: ScoreEditPoint | null): boolean {
  if (!a || !b) return a === b;
  return a.partId === b.partId && a.staffId === b.staffId && a.measureId === b.measureId
    && a.voiceId === b.voiceId && a.offsetUnits === b.offsetUnits;
}

export function measureStartPoint(view: StaffView, measure: StaffMeasure, preferredPitch: InputPitch | null = null): ScoreEditPoint {
  return point(view, measure, { kind: "start" }, 0, preferredPitch);
}

export function measureTailPoint(view: StaffView, measure: StaffMeasure, preferredPitch: InputPitch | null = null): ScoreEditPoint {
  const last = measure.events.at(-1);
  return point(view, measure, last ? { kind: "after-event", eventId: last.id } : { kind: "start" }, usedUnits(measure), preferredPitch);
}

export function defaultScoreEditPoint(view: StaffView): ScoreEditPoint {
  const measure = view.measures.find((item) => usedUnits(item) < capacityUnits(item)) ?? view.measures[0]!;
  return measureTailPoint(view, measure);
}

export function normalizeScoreEditPoint(view: StaffView, current: ScoreEditPoint | null): ScoreEditPoint {
  if (!current || current.partId !== view.partId || current.staffId !== view.staffId) return defaultScoreEditPoint(view);
  const measure = view.measures.find((item) => item.id === current.measureId);
  if (!measure || measure.voiceId !== current.voiceId) return defaultScoreEditPoint(view);
  const exact = measureEditPoints(view, measure).find((candidate) => candidate.offsetUnits === current.offsetUnits);
  return exact ? { ...exact, preferredPitch: current.preferredPitch } : measureTailPoint(view, measure, current.preferredPitch);
}

export function eventStartPoint(view: StaffView, eventId: string, preferredPitch: InputPitch | null = null): ScoreEditPoint | null {
  for (const measure of view.measures) {
    const index = measure.events.findIndex((event) => event.id === eventId);
    if (index < 0) continue;
    const previous = measure.events[index - 1];
    const offset = measure.events.slice(0, index).reduce((sum, event) => sum + durationUnits(event.duration), 0);
    return point(view, measure, previous ? { kind: "after-event", eventId: previous.id } : { kind: "start" }, offset, preferredPitch);
  }
  return null;
}

export function eventEndPoint(view: StaffView, eventId: string, preferredPitch: InputPitch | null = null): ScoreEditPoint | null {
  for (const measure of view.measures) {
    const index = measure.events.findIndex((event) => event.id === eventId);
    if (index >= 0) {
      const offset = measure.events.slice(0, index + 1).reduce((sum, event) => sum + durationUnits(event.duration), 0);
      return point(view, measure, { kind: "after-event", eventId }, offset, preferredPitch);
    }
  }
  return null;
}

function measureEditPoints(view: StaffView, measure: StaffMeasure): ScoreEditPoint[] {
  const points = [measureStartPoint(view, measure)];
  let offset = 0;
  for (const event of measure.events) {
    offset += durationUnits(event.duration);
    points.push(point(view, measure, { kind: "after-event", eventId: event.id }, offset));
  }
  const capacity = capacityUnits(measure), beat = 64 / measure.meter.denominator;
  const tailAnchor = measure.events.at(-1)
    ? { kind: "after-event" as const, eventId: measure.events.at(-1)!.id } : { kind: "start" as const };
  for (let beatOffset = (Math.floor(offset / beat) + 1) * beat; beatOffset < capacity; beatOffset += beat) {
    points.push(point(view, measure, tailAnchor, beatOffset));
  }
  return points;
}

export function scoreEditPoints(view: StaffView): readonly ScoreEditPoint[] {
  return view.measures.flatMap((measure) => measureEditPoints(view, measure));
}

/** Resolve the occupied beat beside an empty insertion boundary. */
export function adjacentEventAtPoint(view: StaffView, current: ScoreEditPoint, direction: -1 | 1): string | null {
  const normalized = normalizeScoreEditPoint(view, current), points = scoreEditPoints(view);
  const index = pointIndex(view, normalized);
  if (direction < 0 && normalized.anchor.kind === "after-event") return normalized.anchor.eventId;
  for (let offset = index + direction; offset >= 0 && offset < points.length; offset += direction) {
    const candidate = points[offset]!;
    if (candidate.anchor.kind === "after-event") return candidate.anchor.eventId;
  }
  return null;
}

function pointIndex(view: StaffView, current: ScoreEditPoint): number {
  return scoreEditPoints(view).findIndex((candidate) => sameScoreEditPoint(candidate, current));
}

export function moveScoreEditPoint(view: StaffView, current: ScoreEditPoint, direction: -1 | 1): ScoreEditPoint {
  const normalized = normalizeScoreEditPoint(view, current), points = scoreEditPoints(view);
  const index = pointIndex(view, normalized);
  const next = points[Math.max(0, Math.min(points.length - 1, index + direction))] ?? normalized;
  return { ...next, preferredPitch: current.preferredPitch };
}

export function jumpScoreEditPoint(view: StaffView, current: ScoreEditPoint, direction: -1 | 1): ScoreEditPoint {
  const normalized = normalizeScoreEditPoint(view, current);
  const index = view.measures.findIndex((measure) => measure.id === normalized.measureId);
  const measure = view.measures[Math.max(0, Math.min(view.measures.length - 1, index + direction))] ?? view.measures[0]!;
  return measureStartPoint(view, measure, current.preferredPitch);
}

export function edgeScoreEditPoint(view: StaffView, current: ScoreEditPoint, edge: "measure-start" | "measure-end" | "score-start" | "score-end"): ScoreEditPoint {
  const normalized = normalizeScoreEditPoint(view, current);
  const currentMeasure = view.measures.find((measure) => measure.id === normalized.measureId) ?? view.measures[0]!;
  const measure = edge === "score-start" ? view.measures[0]! : edge === "score-end" ? view.measures.at(-1)! : currentMeasure;
  if (edge === "measure-start" || edge === "score-start") return measureStartPoint(view, measure, current.preferredPitch);
  const last = measureEditPoints(view, measure).at(-1) ?? measureTailPoint(view, measure);
  return { ...last, preferredPitch: current.preferredPitch };
}

export function previousEventAtPoint(view: StaffView, current: ScoreEditPoint): { readonly id: string; readonly start: ScoreEditPoint } | null {
  const normalized = normalizeScoreEditPoint(view, current);
  const measure = view.measures.find((item) => item.id === normalized.measureId)!;
  let offset = 0;
  let previous: StaffMeasure["events"][number] | undefined;
  for (const event of measure.events) {
    offset += durationUnits(event.duration);
    if (offset > normalized.offsetUnits) break;
    previous = event;
  }
  if (previous) return { id: previous.id, start: eventStartPoint(view, previous.id, current.preferredPitch)! };
  const previousMeasure = view.measures[view.measures.indexOf(measure) - 1];
  const previousMeasureEvent = previousMeasure?.events.at(-1);
  return previousMeasureEvent ? { id: previousMeasureEvent.id, start: eventStartPoint(view, previousMeasureEvent.id, current.preferredPitch)! } : null;
}

export function editPointOffsetUnits(view: StaffView, current: ScoreEditPoint): number | null {
  const normalized = normalizeScoreEditPoint(view, current);
  const measure = view.measures.find((item) => item.id === normalized.measureId);
  return measure ? normalized.offsetUnits : null;
}
