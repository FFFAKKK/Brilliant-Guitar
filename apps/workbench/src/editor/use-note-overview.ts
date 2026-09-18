import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import type { ScoreSessionRead } from "../contracts/score-session";
import type { InputPitch } from "../contracts/note-input";
import type { ReturnTypeOfScoreInput } from "./score-input-types";
import { resolveNoteOverview, selectedNoteAction, stepNoteDuration, toggleNoteDot } from "./note-overview";
import type { NoteChange, NoteControlChange } from "./note-overview";
import { resolveScoreSelection } from "./score-selection";
import { resolveScorePosition } from "./score-position";
import { adjacentEventAtPoint, eventEndPoint, eventStartPoint, measureStartPoint,
  moveScoreEditPoint, previousEventAtPoint } from "./score-navigation";
import { accidentalForEvent, alterForAccidental, inheritedAlterBeforeEvent } from "./accidental-state";
import { createScoreClipboardFragment } from "../contracts/score-clipboard.ts";
import { ScoreClipboard } from "./score-clipboard.ts";
import { resolveScoreEventRange, selectScoreEventRange, singleEventRange, stepScoreEventRange } from "./range-selection.ts";
import type { ScoreEventRangeSelection } from "./range-selection.ts";

/** Feature interaction shared by the score and its tool. The visual host remains headless. */
export function useNoteOverview(input: ReturnTypeOfScoreInput, session: ScoreSessionRead | null,
  blocked: boolean, focusRef: RefObject<HTMLDivElement | null>, _loadEpoch = 0) {
  const view = session?.notation.kind === "staff" ? session.notation : null;
  const [rangeSelection, setRangeSelection] = useState<ScoreEventRangeSelection | null>(null);
  const clipboard = useRef(new ScoreClipboard());
  const selection = resolveScoreSelection(session, input.selectedEventId);
  const inputMeasure = session?.notation.kind === "staff" ? session.notation.measures.find((measure) => measure.id === input.measureId) : undefined;
  const selectedAccidental = selection.event && selection.measure ? accidentalForEvent(selection.measure, selection.event.id) : "none";
  const resolved = resolveNoteOverview({ ...input, pitch: input.previewPitch }, selection.event,
    selection.measure?.meter ?? inputMeasure?.meter, selectedAccidental);
  const activeStep = selection.event?.content.kind === "note" && input.editorState.composition.kind === "composing"
    && input.editorState.composition.methodId === "staff.pitch" ? input.editorState.composition.draft : null;
  const value = activeStep && resolved.pitch ? { ...resolved,
    pitch: { ...resolved.pitch, step: activeStep, octave: null } } : resolved;
  const position = session?.notation.kind === "staff"
    ? resolveScorePosition(session.notation, input.point, selection.id) : null;
  const selectedRange = view ? resolveScoreEventRange(view, rangeSelection) : null;
  useEffect(() => { setRangeSelection(null); }, [session?.documentId, _loadEpoch]);
  useEffect(() => {
    if (rangeSelection && (!selectedRange || !input.selectedEventId)) setRangeSelection(null);
  }, [input.selectedEventId, rangeSelection, selectedRange]);
  const focus = () => focusRef.current?.focus({ preventScroll: true });
  function focusEvent(id: string) {
    if (!view) return;
    const point = eventStartPoint(view, id, input.point?.preferredPitch ?? null);
    if (point) input.selectEvent(id, point);
  }
  function selectEvent(id: string, extend = false) {
    if (!view) return;
    setRangeSelection(extend ? selectScoreEventRange(view, rangeSelection, selection.id, id) : null);
    focusEvent(id);
  }
  function clipboardRange() {
    return selectedRange ?? (view ? singleEventRange(view, selection.id) : null);
  }
  async function copySelection(cut = false) {
    const range = clipboardRange();
    if (!range) return;
    await clipboard.current.write(createScoreClipboardFragment(range.events));
    if (cut && !blocked && !input.pending) input.deleteRange({ measureId: range.measure.id,
      voiceId: range.measure.voiceId, startEventId: range.events[0]!.id, endEventId: range.events.at(-1)!.id });
  }
  async function pasteSelection() {
    if (blocked || input.pending) return;
    const fragment = await clipboard.current.read();
    if (fragment) input.pasteFragment(fragment);
  }
  function change(change: NoteControlChange, completionFocus?: HTMLElement) {
    if (blocked) return;
    if (selection.event) {
      if (input.pending) return;
      const concrete: NoteChange = change.kind === "accidental" && selection.measure && selection.event.content.kind === "note"
        ? { kind: "alter", value: alterForAccidental(change.value,
          inheritedAlterBeforeEvent(selection.measure, selection.event.id, selection.event.content.pitch)) }
        : change.kind === "accidental" ? { kind: "alter", value: 0 } : change;
      const action = selectedNoteAction(selection.event, concrete);
      if (action?.kind === "set-event-properties") input.applyProperties(action, completionFocus);
      if (action?.kind === "delete-event") input.deleteEvent(action.eventId);
    } else {
      if (change.kind === "duration" && change.value.base !== 32) input.setDuration(change.value);
      if (change.kind === "accidental") input.setAccidental(change.value, completionFocus);
      if (change.kind === "pitch") input.setPitch(change.value, completionFocus);
      if (change.kind === "rest") input.setRest(change.value);
    }
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;
    if ((event.target as HTMLElement).closest("input, select, textarea, button") || event.nativeEvent.isComposing) return;
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && !event.altKey && (key === "c" || key === "x" || key === "v")) {
      event.preventDefault();
      if (key === "c") void copySelection();
      if (key === "x") void copySelection(true);
      if (key === "v") void pasteSelection();
      return;
    }
    if (blocked) return;
    if (view && (event.key === "ArrowLeft" || event.key === "ArrowRight") && !event.altKey) {
      event.preventDefault();
      if (input.pending) return;
      input.cancelComposition();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
        const next = stepScoreEventRange(view, rangeSelection, selection.id, direction);
        if (next) {
          setRangeSelection(next);
          focusEvent(next.focusEventId);
        }
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        const currentMeasureId = selection.measure?.id ?? input.point?.measureId;
        const index = view.measures.findIndex((measure) => measure.id === currentMeasureId);
        const target = view.measures[Math.max(0, Math.min(view.measures.length - 1, index + direction))];
        const first = target?.events[0];
        if (first) selectEvent(first.id);
        else if (target) input.setEditPoint(measureStartPoint(view, target, input.point?.preferredPitch ?? null));
        return;
      }
      if (selection.event) {
        const events = view.measures.flatMap((measure) => measure.events);
        const index = events.findIndex((item) => item.id === selection.event?.id);
        const next = events[index + direction];
        const measure = selection.measure;
        const atMeasureEdge = measure && (direction > 0 ? measure.events.at(-1)?.id : measure.events[0]?.id) === selection.event.id;
        const enterMeasureTail = direction > 0 && atMeasureEdge && measure;
        if (enterMeasureTail) {
          const point = eventEndPoint(view, selection.event.id, input.point?.preferredPitch ?? null);
          if (point) input.setEditPoint(point);
        } else if (next) selectEvent(next.id);
        else if (direction > 0 && measure) {
          const measureIndex = view.measures.findIndex((item) => item.id === measure.id);
          const following = view.measures[measureIndex + 1];
          if (following) input.setEditPoint(measureStartPoint(view, following, input.point?.preferredPitch ?? null));
        }
      } else if (input.point) {
        const adjacent = adjacentEventAtPoint(view, input.point, direction);
        if (adjacent) selectEvent(adjacent);
        else input.setEditPoint(moveScoreEditPoint(view, input.point, direction));
      }
      return;
    }
    if (event.key === "Escape" && selectedRange) {
      event.preventDefault();
      setRangeSelection(null);
      focus();
      return;
    }
    if (view && (event.key === "Home" || event.key === "End") && !event.altKey) {
      event.preventDefault();
      if (input.pending) return;
      input.cancelComposition();
      const score = event.ctrlKey || event.metaKey;
      const currentId = selection.measure?.id ?? input.point?.measureId;
      const current = view.measures.find((measure) => measure.id === currentId) ?? view.measures[0]!;
      const measure = score ? event.key === "Home" ? view.measures[0]! : view.measures.at(-1)! : current;
      const target = event.key === "Home" ? measure.events[0] : measure.events.at(-1);
      if (target) selectEvent(target.id);
      else input.setEditPoint(measureStartPoint(view, measure, input.point?.preferredPitch ?? null));
      return;
    }
    if (selection.event && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (activeStep) input.cancelComposition();
        else {
          const point = view ? eventStartPoint(view, selection.event.id, input.point?.preferredPitch ?? null) : null;
          if (point) input.setEditPoint(point);
        }
        focus(); return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (!event.repeat && !input.pending && selection.canDelete) {
          input.deleteEvent(selection.event.id);
        } else if (!event.repeat && !input.pending && selection.measure) {
          input.rejectEdit("这个休止符维持当前小节的节拍位置，不能直接移除", {
            measureId: selection.measure.id, eventId: selection.event.id, componentId: "score",
          });
        }
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
        if (!event.repeat && !input.pending) change({ kind: "pitch", value: {
          ...selection.event.content.pitch, step: activeStep, octave: Number(event.key),
        } });
        return;
      }
      if (/^[a-g]$/i.test(event.key) && selection.event.content.kind === "note") {
        event.preventDefault();
        if (!event.repeat && !input.pending) input.composePitchStep(event.key.toUpperCase() as InputPitch["step"]);
        return;
      }
      if (/^r$/i.test(event.key)) {
        event.preventDefault();
        if (!event.repeat && !input.pending) { input.cancelComposition(); change({ kind: "rest", value: true }); }
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
    change, draftStep: activeStep ?? input.draft, selectedEventId: selection.id,
    selectedRange: selectedRange ? { measureId: selectedRange.measure.id, eventIds: selectedRange.eventIds } : null,
    onKeyDown,
    onSelectEvent: (id: string, extend = false) => {
      if (blocked || input.pending) return;
      selectEvent(id, extend); focus();
    },
    onLocate: (point: Parameters<typeof input.locate>[0], pitch: InputPitch, writeNow: boolean) => {
      if (blocked || input.pending) return;
      setRangeSelection(null);
      input.locate(point, pitch, writeNow);
    },
  };
}
