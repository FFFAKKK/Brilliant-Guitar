import type { ScoreSessionRead } from "../../contracts/score-session.ts";
import type { InputPitch, ScoreEditAction } from "../../contracts/note-input.ts";
import type { EditTarget } from "../../editor/editor-machine.ts";
import { defaultScoreEditPoint, eventEndPoint, eventStartPoint, measureStartPoint,
  measureTailPoint, normalizeScoreEditPoint, scoreEditPoints } from "../../editor/score-navigation.ts";
import type { ScoreEditPoint } from "../../editor/score-navigation.ts";
import { nextMeasure } from "../../notation/input-position.ts";
import type { FocusDirective } from "./edit-contracts.ts";

export interface ScoreFocusResolution {
  readonly directive: FocusDirective;
  readonly target: EditTarget<ScoreEditPoint>;
}

function preferredPitch(point: ScoreEditPoint | null): InputPitch | null {
  return point?.preferredPitch ?? null;
}

function pointAtOffset(view: Extract<ScoreSessionRead["notation"], { readonly kind: "staff" }>,
  measureId: string, offsetUnits: number, pitch: InputPitch | null): ScoreEditPoint {
  const exact = scoreEditPoints(view).find((point) => point.measureId === measureId && point.offsetUnits === offsetUnits);
  if (exact) return { ...exact, preferredPitch: pitch };
  const measure = view.measures.find((item) => item.id === measureId);
  return measure ? measureTailPoint(view, measure, pitch) : defaultScoreEditPoint(view);
}

function applyDirective(view: Extract<ScoreSessionRead["notation"], { readonly kind: "staff" }>,
  directive: FocusDirective, pitch: InputPitch | null): EditTarget<ScoreEditPoint> {
  if (directive.kind === "clear") return { kind: "unavailable" };
  if (directive.kind === "keep-selection") {
    const point = eventStartPoint(view, directive.eventId, pitch);
    return point ? { kind: "event", eventId: directive.eventId, point }
      : { kind: "caret", point: defaultScoreEditPoint(view) };
  }
  if (directive.kind === "after-insert") {
    const point = eventEndPoint(view, directive.eventId, pitch);
    return point ? { kind: "caret", point } : { kind: "caret", point: defaultScoreEditPoint(view) };
  }
  const measure = view.measures.find((item) => item.id === directive.measureId);
  if (!measure) return { kind: "caret", point: defaultScoreEditPoint(view) };
  if (directive.kind === "at-measure-start") return { kind: "caret", point: measureStartPoint(view, measure, pitch) };
  if (directive.kind === "at-measure-end") return { kind: "caret", point: measureTailPoint(view, measure, pitch) };
  return { kind: "caret", point: pointAtOffset(view, directive.measureId, directive.offsetUnits, pitch) };
}

/** Resolve one explicit post-operation focus result from the old and new projections. */
export function reconcileScoreFocus(before: ScoreSessionRead, after: ScoreSessionRead, action: ScoreEditAction,
  currentPoint: ScoreEditPoint | null, selectedEventId: string | null): ScoreFocusResolution {
  if (after.notation.kind !== "staff") return { directive: { kind: "clear" }, target: { kind: "unavailable" } };
  const view = after.notation, pitch = preferredPitch(currentPoint);
  let normalized = normalizeScoreEditPoint(view, currentPoint);
  let directive: FocusDirective = { kind: "at-offset", measureId: normalized.measureId, offsetUnits: normalized.offsetUnits };

  if (action.kind === "append") {
    const previousMeasure = before.notation.kind === "staff"
      ? before.notation.measures.find((measure) => measure.id === action.measureId) : undefined;
    const next = view.measures.find((measure) => measure.id === action.measureId);
    const previousIds = new Set(previousMeasure?.events.map((event) => event.id) ?? []);
    const inserted = next?.events.filter((event) => !previousIds.has(event.id)).at(-1);
    const oldTail = previousMeasure?.events.at(-1);
    const insertedAtTail = action.anchor.kind === "start" ? !oldTail : oldTail?.id === action.anchor.eventId;
    const nextMeasureId = nextMeasure(view, action.measureId);
    if (insertedAtTail && nextMeasureId !== action.measureId) {
      directive = { kind: "at-measure-start", measureId: nextMeasureId };
    } else if (inserted) {
      directive = { kind: "after-insert", eventId: inserted.id };
    }
  }

  if (action.kind === "paste-fragment") {
    const previousMeasure = before.notation.kind === "staff"
      ? before.notation.measures.find((measure) => measure.id === action.measureId) : undefined;
    const next = view.measures.find((measure) => measure.id === action.measureId);
    const previousIds = new Set(previousMeasure?.events.map((event) => event.id) ?? []);
    const inserted = next?.events.filter((event) => !previousIds.has(event.id)).at(-1);
    if (inserted) directive = { kind: "after-insert", eventId: inserted.id };
  }

  if (action.kind === "insert-measure") {
    const previousIds = new Set(before.notation.kind === "staff" ? before.notation.measures.map((measure) => measure.id) : []);
    const inserted = view.measures.find((measure) => !previousIds.has(measure.id));
    if (inserted) directive = { kind: "at-measure-start", measureId: inserted.id };
  }

  if (action.kind === "remove-measure") {
    const previousIndex = before.notation.kind === "staff"
      ? before.notation.measures.findIndex((measure) => measure.id === action.measureId) : 0;
    const destination = view.measures[Math.max(0, Math.min(view.measures.length - 1, previousIndex))] ?? view.measures.at(-1);
    if (destination) directive = { kind: "at-measure-start", measureId: destination.id };
  }

  const clearsSelection = action.kind === "delete-event" || action.kind === "delete-range"
    || action.kind === "paste-fragment" || action.kind === "insert-measure" || action.kind === "remove-measure";
  if (selectedEventId && !clearsSelection && eventStartPoint(view, selectedEventId, pitch)) {
    directive = { kind: "keep-selection", eventId: selectedEventId };
  }

  const target = applyDirective(view, directive, pitch);
  if (target.kind !== "unavailable") normalized = target.point;
  return { directive, target: target.kind === "caret" ? { kind: "caret", point: normalized } : target };
}

