import type { StaffView } from "../contracts/notation.ts";
import type { KeyPressSignal } from "../input/input-signal.ts";
import { adjacentEventAtPoint, edgeScoreEditPoint, eventEndPoint, eventStartPoint, measureStartPoint,
  moveScoreEditPoint } from "./score-navigation.ts";
import type { ScoreEditPoint } from "./score-navigation.ts";
import { stepScoreEventRange } from "./range-selection.ts";
import type { ScoreEventRangeSelection } from "./range-selection.ts";

export type StaffNavigationAction =
  | { readonly kind: "select-event"; readonly eventId: string }
  | { readonly kind: "select-range"; readonly selection: ScoreEventRangeSelection }
  | { readonly kind: "locate"; readonly point: ScoreEditPoint }
  | { readonly kind: "clear-range" }
  | { readonly kind: "cancel-composition" };

export interface StaffNavigationResolution {
  readonly cancelComposition: boolean;
  readonly action?: StaffNavigationAction;
}

export interface StaffNavigationContext {
  readonly view: StaffView;
  readonly point: ScoreEditPoint | null;
  readonly selectedEventId: string | null;
  readonly rangeSelection: ScoreEventRangeSelection | null;
  readonly composingPitch: boolean;
}

function has(signal: KeyPressSignal, modifier: "shift" | "ctrl" | "meta" | "alt") {
  return signal.modifiers.includes(modifier);
}

function selectedLocation(view: StaffView, eventId: string | null) {
  if (!eventId) return null;
  for (const measure of view.measures) {
    const index = measure.events.findIndex((event) => event.id === eventId);
    if (index >= 0) return { measure, index };
  }
  return null;
}

/** Pure five-line staff navigation policy. It changes interaction focus, never document data. */
export function resolveStaffNavigation(signal: KeyPressSignal,
  context: StaffNavigationContext): StaffNavigationResolution | null {
  const { view, point, selectedEventId, rangeSelection } = context;
  const command = has(signal, "ctrl") || has(signal, "meta");
  if (signal.key === "Escape") {
    if (rangeSelection) return { cancelComposition: false, action: { kind: "clear-range" } };
    if (!selectedEventId) return null;
    if (context.composingPitch) return { cancelComposition: false, action: { kind: "cancel-composition" } };
    const destination = eventStartPoint(view, selectedEventId, point?.preferredPitch ?? null);
    return destination ? { cancelComposition: false, action: { kind: "locate", point: destination } } : null;
  }
  if ((signal.key === "Home" || signal.key === "End") && !has(signal, "alt")) {
    const selected = selectedLocation(view, selectedEventId);
    const currentId = selected?.measure.id ?? point?.measureId;
    const current = view.measures.find((measure) => measure.id === currentId) ?? view.measures[0]!;
    const measure = command ? signal.key === "Home" ? view.measures[0]! : view.measures.at(-1)! : current;
    const target = signal.key === "Home" ? measure.events[0] : measure.events.at(-1);
    const fallback = measureStartPoint(view, measure, point?.preferredPitch ?? null);
    return { cancelComposition: true, action: target
      ? { kind: "select-event", eventId: target.id }
      : { kind: "locate", point: signal.key === "End"
        ? edgeScoreEditPoint(view, fallback, command ? "score-end" : "measure-end") : fallback } };
  }
  if ((signal.key !== "ArrowLeft" && signal.key !== "ArrowRight") || has(signal, "alt")) return null;
  const direction = signal.key === "ArrowLeft" ? -1 : 1;
  if (has(signal, "shift") && !command) {
    const selection = stepScoreEventRange(view, rangeSelection, selectedEventId, direction);
    if (selection) return { cancelComposition: true, action: { kind: "select-range", selection } };
    if (!point) return { cancelComposition: true };
    const adjacent = adjacentEventAtPoint(view, point, direction);
    return { cancelComposition: true, action: adjacent
      ? { kind: "select-event", eventId: adjacent }
      : { kind: "locate", point: moveScoreEditPoint(view, point, direction) } };
  }
  const selected = selectedLocation(view, selectedEventId);
  if (command) {
    const currentId = selected?.measure.id ?? point?.measureId;
    const index = view.measures.findIndex((measure) => measure.id === currentId);
    const target = view.measures[Math.max(0, Math.min(view.measures.length - 1, index + direction))];
    const first = target?.events[0];
    if (first) return { cancelComposition: true, action: { kind: "select-event", eventId: first.id } };
    if (target) return { cancelComposition: true,
      action: { kind: "locate", point: measureStartPoint(view, target, point?.preferredPitch ?? null) } };
    return { cancelComposition: true };
  }
  if (selected) {
    const events = view.measures.flatMap((measure) => measure.events);
    const index = events.findIndex((event) => event.id === selectedEventId);
    const next = events[index + direction];
    const atMeasureEdge = (direction > 0 ? selected.measure.events.at(-1)?.id : selected.measure.events[0]?.id) === selectedEventId;
    if (direction > 0 && atMeasureEdge) {
      const destination = eventEndPoint(view, selectedEventId!, point?.preferredPitch ?? null);
      return { cancelComposition: true, ...(destination ? { action: { kind: "locate", point: destination } as const } : {}) };
    }
    if (next) return { cancelComposition: true, action: { kind: "select-event", eventId: next.id } };
    if (direction > 0) {
      const following = view.measures[view.measures.indexOf(selected.measure) + 1];
      if (following) return { cancelComposition: true,
        action: { kind: "locate", point: measureStartPoint(view, following, point?.preferredPitch ?? null) } };
    }
    return { cancelComposition: true };
  }
  if (!point) return { cancelComposition: true };
  const adjacent = adjacentEventAtPoint(view, point, direction);
  return { cancelComposition: true, action: adjacent
    ? { kind: "select-event", eventId: adjacent }
    : { kind: "locate", point: moveScoreEditPoint(view, point, direction) } };
}
