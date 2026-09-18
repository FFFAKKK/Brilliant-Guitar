import type { StaffEvent, StaffMeasure, StaffView } from "../contracts/notation.ts";

export interface ScoreEventRangeSelection {
  readonly measureId: string;
  readonly voiceId: string;
  readonly anchorEventId: string;
  readonly focusEventId: string;
}

export interface ResolvedScoreEventRange {
  readonly selection: ScoreEventRangeSelection;
  readonly measure: StaffMeasure;
  readonly events: readonly StaffEvent[];
  readonly eventIds: readonly string[];
}

function eventLocation(view: StaffView, eventId: string) {
  for (const measure of view.measures) {
    const index = measure.events.findIndex((event) => event.id === eventId);
    if (index >= 0) return { measure, index };
  }
  return null;
}

export function resolveScoreEventRange(view: StaffView, selection: ScoreEventRangeSelection | null): ResolvedScoreEventRange | null {
  if (!selection) return null;
  const measure = view.measures.find((item) => item.id === selection.measureId && item.voiceId === selection.voiceId);
  if (!measure) return null;
  const anchor = measure.events.findIndex((event) => event.id === selection.anchorEventId);
  const focus = measure.events.findIndex((event) => event.id === selection.focusEventId);
  if (anchor < 0 || focus < 0) return null;
  const lower = Math.min(anchor, focus), upper = Math.max(anchor, focus);
  const events = measure.events.slice(lower, upper + 1);
  return events.length ? { selection, measure, events, eventIds: events.map((event) => event.id) } : null;
}

export function selectScoreEventRange(view: StaffView, current: ScoreEventRangeSelection | null,
  selectedEventId: string | null, focusEventId: string): ScoreEventRangeSelection | null {
  const focus = eventLocation(view, focusEventId);
  if (!focus) return null;
  const currentResolved = resolveScoreEventRange(view, current);
  const anchorId = currentResolved?.selection.anchorEventId ?? selectedEventId ?? focusEventId;
  const anchor = eventLocation(view, anchorId);
  if (!anchor || anchor.measure.id !== focus.measure.id || anchor.measure.voiceId !== focus.measure.voiceId) return null;
  return { measureId: focus.measure.id, voiceId: focus.measure.voiceId,
    anchorEventId: anchorId, focusEventId };
}

export function stepScoreEventRange(view: StaffView, current: ScoreEventRangeSelection | null,
  selectedEventId: string | null, direction: -1 | 1): ScoreEventRangeSelection | null {
  const resolved = resolveScoreEventRange(view, current);
  const focusId = resolved?.selection.focusEventId ?? selectedEventId;
  if (!focusId) return null;
  const focus = eventLocation(view, focusId);
  if (!focus) return null;
  const next = focus.measure.events[Math.max(0, Math.min(focus.measure.events.length - 1, focus.index + direction))];
  return next ? selectScoreEventRange(view, current, selectedEventId, next.id) : null;
}

export function singleEventRange(view: StaffView, eventId: string | null): ResolvedScoreEventRange | null {
  if (!eventId) return null;
  const location = eventLocation(view, eventId);
  return location ? resolveScoreEventRange(view, { measureId: location.measure.id, voiceId: location.measure.voiceId,
    anchorEventId: eventId, focusEventId: eventId }) : null;
}
