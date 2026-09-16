import { useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import type { ScoreSessionRead } from "../contracts/score-session";
import type { InputPitch } from "../contracts/note-input";
import type { ReturnTypeOfScoreInput } from "./score-input-types";
import { resolveNoteOverview, selectedNoteAction, stepNoteDuration, toggleNoteDot } from "./note-overview";
import type { NoteChange } from "./note-overview";
import { useScoreSelection } from "./use-score-selection";
import { resolveScorePosition } from "./score-position";
import { adjacentEventAtPoint, eventEndPoint, eventStartPoint, measureStartPoint,
  moveScoreEditPoint, previousEventAtPoint } from "./score-navigation";
import { capacityUnits, usedUnits } from "../notation/input-position";
import { accidentalForEvent, alterForAccidental, inheritedAlterBeforeEvent } from "./accidental-state";
import type { AccidentalState } from "./accidental-state";

type ControllerChange = Exclude<NoteChange, { readonly kind: "alter" }>
  | { readonly kind: "accidental"; readonly value: AccidentalState };

/** Feature interaction shared by the score and its tool. The visual host remains headless. */
export function useNoteOverview(input: ReturnTypeOfScoreInput, session: ScoreSessionRead | null,
  blocked: boolean, focusRef: RefObject<HTMLDivElement | null>, loadEpoch = 0) {
  const selection = useScoreSelection(session, loadEpoch);
  const [stepDraft, setStepDraft] = useState<{ readonly eventId: string; readonly step: InputPitch["step"] } | null>(null);
  const inputMeasure = session?.notation.kind === "staff" ? session.notation.measures.find((measure) => measure.id === input.measureId) : undefined;
  const selectedAccidental = selection.event && selection.measure ? accidentalForEvent(selection.measure, selection.event.id) : "none";
  const resolved = resolveNoteOverview({ ...input, pitch: input.previewPitch }, selection.event,
    selection.measure?.meter ?? inputMeasure?.meter, selectedAccidental);
  const activeStep = selection.event?.content.kind === "note" && stepDraft?.eventId === selection.id ? stepDraft.step : null;
  const value = activeStep && resolved.pitch ? { ...resolved, pitch: { ...resolved.pitch, step: activeStep, octave: null } } : resolved;
  const position = session?.notation.kind === "staff"
    ? resolveScorePosition(session.notation, input.point, selection.id) : null;
  const focus = () => focusRef.current?.focus({ preventScroll: true });
  function change(change: ControllerChange, completionFocus?: HTMLElement) {
    if (blocked) return;
    if (selection.event) {
      if (input.pending) return;
      const concrete: NoteChange = change.kind === "accidental" && selection.measure && selection.event.content.kind === "note"
        ? { kind: "alter", value: alterForAccidental(change.value,
          inheritedAlterBeforeEvent(selection.measure, selection.event.id, selection.event.content.pitch)) }
        : change.kind === "accidental" ? { kind: "alter", value: 0 } : change;
      const action = selectedNoteAction(selection.event, concrete);
      if (action?.kind === "set-event-properties") { setStepDraft(null); input.applyProperties(action, completionFocus); }
      if (action?.kind === "delete-event") input.deleteEvent(action.eventId);
    } else {
      if (change.kind === "duration" && change.value.base !== 32) input.setDuration(change.value);
      if (change.kind === "accidental") input.setAccidental(change.value, completionFocus);
      if (change.kind === "pitch") input.setPitch(change.value, completionFocus);
      if (change.kind === "rest") input.setRest(change.value);
    }
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("input, select, textarea, button") || event.nativeEvent.isComposing) return;
    if (blocked) return;
    const view = session?.notation.kind === "staff" ? session.notation : null;
    if (view && (event.key === "ArrowLeft" || event.key === "ArrowRight") && !event.altKey) {
      event.preventDefault();
      if (input.pending) return;
      setStepDraft(null);
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      if (event.ctrlKey || event.metaKey) {
        const currentMeasureId = selection.measure?.id ?? input.point?.measureId;
        const index = view.measures.findIndex((measure) => measure.id === currentMeasureId);
        const target = view.measures[Math.max(0, Math.min(view.measures.length - 1, index + direction))];
        const first = target?.events[0];
        if (first) selection.select(first.id);
        else if (target) { selection.clear(); input.setEditPoint(measureStartPoint(view, target, input.point?.preferredPitch ?? null)); }
        return;
      }
      if (selection.event) {
        const events = view.measures.flatMap((measure) => measure.events);
        const index = events.findIndex((item) => item.id === selection.event?.id);
        const next = events[index + direction];
        const measure = selection.measure;
        const atMeasureEdge = measure && (direction > 0 ? measure.events.at(-1)?.id : measure.events[0]?.id) === selection.event.id;
        const freeTail = direction > 0 && atMeasureEdge && measure && usedUnits(measure) < capacityUnits(measure);
        if (freeTail) {
          const point = eventEndPoint(view, selection.event.id, input.point?.preferredPitch ?? null);
          selection.clear(); if (point) input.setEditPoint(point);
        } else if (next) selection.select(next.id);
        else if (direction > 0 && measure) {
          const measureIndex = view.measures.findIndex((item) => item.id === measure.id);
          const following = view.measures[measureIndex + 1];
          if (following) { selection.clear(); input.setEditPoint(measureStartPoint(view, following, input.point?.preferredPitch ?? null)); }
        }
      } else if (input.point) {
        const adjacent = adjacentEventAtPoint(view, input.point, direction);
        if (adjacent) selection.select(adjacent);
        else input.setEditPoint(moveScoreEditPoint(view, input.point, direction));
      }
      return;
    }
    if (view && (event.key === "Home" || event.key === "End") && !event.altKey) {
      event.preventDefault();
      if (input.pending) return;
      setStepDraft(null);
      const score = event.ctrlKey || event.metaKey;
      const currentId = selection.measure?.id ?? input.point?.measureId;
      const current = view.measures.find((measure) => measure.id === currentId) ?? view.measures[0]!;
      const measure = score ? event.key === "Home" ? view.measures[0]! : view.measures.at(-1)! : current;
      const target = event.key === "Home" ? measure.events[0] : measure.events.at(-1);
      if (target) selection.select(target.id);
      else { selection.clear(); input.setEditPoint(measureStartPoint(view, measure, input.point?.preferredPitch ?? null)); }
      return;
    }
    if (selection.event && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === "Escape") {
        event.preventDefault(); setStepDraft(null); focus(); return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (!event.repeat && !input.pending && selection.canDelete) { setStepDraft(null); input.deleteEvent(selection.event.id); }
        return;
      }
      if (["+", "=", "-", "_", "."].includes(event.key)) {
        event.preventDefault();
        if (!event.repeat) change({ kind: "duration", value: event.key === "." ? toggleNoteDot(value.duration)
          : stepNoteDuration(value.duration, event.key === "+" || event.key === "=" ? 1 : -1, value.rest) });
        return;
      }
      if (/^[2-6]$/.test(event.key) && activeStep && selection.event.content.kind === "note") {
        event.preventDefault();
        if (!event.repeat && !input.pending) change({ kind: "pitch", value: { ...selection.event.content.pitch, step: activeStep, octave: Number(event.key) } });
        return;
      }
      if (/^[a-g]$/i.test(event.key) && selection.event.content.kind === "note") {
        event.preventDefault();
        if (!event.repeat && !input.pending) setStepDraft({ eventId: selection.event.id, step: event.key.toUpperCase() as InputPitch["step"] });
        return;
      }
      if (/^r$/i.test(event.key)) {
        event.preventDefault();
        if (!event.repeat && !input.pending) { setStepDraft(null); change({ kind: "rest", value: true }); }
        return;
      }
    }
    if (view && !selection.event && event.key === "Backspace") {
      event.preventDefault();
      if (!event.repeat && !input.pending && input.point) {
        const previous = previousEventAtPoint(view, input.point);
        if (previous) { input.setEditPoint(previous.start); input.deleteEvent(previous.id); }
      }
      return;
    }
    input.keyboard(event, !input.enabled && !event.ctrlKey && !event.metaKey && !event.altKey && /^[a-gr]$/i.test(event.key));
  }
  return { value, position, disabled: blocked || (!!selection.event && input.pending > 0), pending: input.pending,
    message: input.message || input.draftMessage, retryable: input.retryable, retry: input.retry,
    change, selectedEventId: selection.id, onKeyDown,
    onSelectEvent: (id: string) => {
      if (blocked || input.pending) return;
      setStepDraft(null);
      if (session?.notation.kind === "staff") {
        const point = eventStartPoint(session.notation, id);
        if (point) input.setEditPoint(point);
      }
      input.exit(); input.clearFeedback(); selection.select(id); focus();
    },
    onLocate: (point: Parameters<typeof input.locate>[0], pitch: InputPitch, writeNow: boolean) => {
      if (blocked || input.pending) return;
      setStepDraft(null); selection.clear(); input.locate(point, pitch, writeNow);
    },
  };
}
