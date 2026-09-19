import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import type { ScoreSessionRead } from "../contracts/score-session";
import type { ReturnTypeOfScoreInput } from "./score-input-types";
import { resolveNoteOverview, selectedNoteAction } from "./note-overview";
import type { NoteChange, NoteControlChange } from "./note-overview";
import { resolveScoreSelection } from "./score-selection";
import { resolveScorePosition } from "./score-position";
import { eventStartPoint } from "./score-navigation";
import { accidentalForEvent, alterForAccidental, inheritedAlterBeforeEvent } from "./accidental-state";
import { createScoreClipboardFragment } from "../contracts/score-clipboard.ts";
import { ScoreClipboard } from "./score-clipboard.ts";
import { resolveScoreEventRange, selectScoreEventRange, singleEventRange } from "./range-selection.ts";
import type { ScoreEventRangeSelection } from "./range-selection.ts";
import type { StaffPointerSignal } from "./staff-input-adapter.ts";
import type { ControlChangeSignal } from "../input/input-signal.ts";
import { keyPressSignal } from "../input/input-signal.ts";
import type { StaffNavigationContext, StaffNavigationResolution } from "./staff-navigation-policy.ts";
import type { StaffEditKeyContext, StaffEditKeyResolution } from "./staff-edit-key-policy.ts";
import type { NotationInteractionRegistry } from "../input/notation-interaction-registry.ts";
import { keySignatureAlterForStep, keySignatureFifthsAtMeasure } from "../notation/key-signature.ts";

/** Feature interaction shared by the score and its tool. The visual host remains headless. */
export function useNoteOverview(input: ReturnTypeOfScoreInput, session: ScoreSessionRead | null,
  blocked: boolean, focusRef: RefObject<HTMLDivElement | null>, interactions: NotationInteractionRegistry,
  _loadEpoch = 0) {
  const view = session?.notation.kind === "staff" ? session.notation : null;
  const [rangeSelection, setRangeSelection] = useState<ScoreEventRangeSelection | null>(null);
  const clipboard = useRef(new ScoreClipboard());
  const selection = resolveScoreSelection(session, input.selectedEventId);
  const inputMeasure = session?.notation.kind === "staff" ? session.notation.measures.find((measure) => measure.id === input.measureId) : undefined;
  const selectedBaseline = view && selection.measure && selection.event?.content.kind === "note"
    ? keySignatureAlterForStep(keySignatureFifthsAtMeasure(view, selection.measure.id), selection.event.content.pitch.step) : 0;
  const selectedAccidental = selection.event && selection.measure
    ? accidentalForEvent(selection.measure, selection.event.id, selectedBaseline) : "none";
  const resolved = resolveNoteOverview({ ...input, pitch: input.previewPitch }, selection.event,
    selection.measure?.meter ?? inputMeasure?.meter, selectedAccidental);
  // Composition belongs to the editing session, not to the current selection.
  // Keeping it visible at a caret or on a rest lets Backspace cancel the draft
  // before any event-deletion policy is considered.
  const activeStep = interactions.readDraft<NonNullable<ReturnTypeOfScoreInput["draft"]>>(
    "staff", input.editorState.composition,
  );
  const value = activeStep && selection.event?.content.kind === "note" && resolved.pitch ? { ...resolved,
    pitch: { ...resolved.pitch, step: activeStep, octave: null } } : resolved;
  const position = session?.notation.kind === "staff"
    ? resolveScorePosition(session.notation, input.point, selection.id) : null;
  const selectedRange = view ? resolveScoreEventRange(view, rangeSelection) : null;
  const selectedRangeContract = selectedRange ? { measureId: selectedRange.measure.id,
    voiceId: selectedRange.measure.voiceId, startEventId: selectedRange.events[0]!.id,
    endEventId: selectedRange.events.at(-1)!.id } : null;
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
          inheritedAlterBeforeEvent(selection.measure, selection.event.id, selection.event.content.pitch, selectedBaseline)) }
        : change.kind === "accidental" ? { kind: "alter", value: 0 } : change;
      const action = selectedNoteAction(selection.event, concrete);
      if (action?.kind === "set-event-properties") input.applyProperties(action, completionFocus);
      if (action?.kind === "delete-event") input.deleteEvent(action.eventId, action.timePolicy);
    } else {
      if (change.kind === "duration" && change.value.base !== 32) input.setDuration(change.value);
      if (change.kind === "accidental") input.setAccidental(change.value, completionFocus);
      if (change.kind === "pitch") input.setPitch(change.value, completionFocus);
      if (change.kind === "rest") input.setRest(change.value);
    }
  }
  function onControlInput(signal: ControlChangeSignal<NoteControlChange>, completionFocus?: HTMLElement) {
    if (signal.control !== signal.value.kind) return;
    change(signal.value, completionFocus);
  }
  function onStaffInput(signal: StaffPointerSignal) {
    if (blocked || input.pending) return;
    setRangeSelection(null);
    if (signal.kind === "pointer-select") {
      selectEvent(signal.target, signal.extend);
      focus();
      return;
    }
    input.locate(signal.position.point, signal.position.pitch, signal.writeNow);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;
    if ((event.target as HTMLElement).closest("input, select, textarea, button") || event.nativeEvent.isComposing) return;
    const signal = keyPressSignal(event);
    const modifier = signal.modifiers.includes("ctrl") || signal.modifiers.includes("meta");
    const key = signal.key.toLowerCase();
    if (modifier && !event.altKey && (key === "c" || key === "x" || key === "v")) {
      event.preventDefault();
      if (key === "c") void copySelection();
      if (key === "x") void copySelection(true);
      if (key === "v") void pasteSelection();
      return;
    }
    if (blocked) return;
    const navigation = view ? interactions.navigate<StaffNavigationContext, StaffNavigationResolution>("staff", signal,
      { view, point: input.point, selectedEventId: selection.id, rangeSelection, composingPitch: Boolean(activeStep) }) : null;
    if (navigation) {
      event.preventDefault();
      if (input.pending) return;
      if (navigation.cancelComposition) input.cancelComposition();
      const action = navigation.action;
      if (!action) return;
      if (action.kind === "clear-range") { setRangeSelection(null); focus(); return; }
      if (action.kind === "cancel-composition") { input.cancelComposition(); focus(); return; }
      if (action.kind === "select-range") {
        setRangeSelection(action.selection);
        focusEvent(action.selection.focusEventId);
        return;
      }
      setRangeSelection(null);
      if (action.kind === "select-event") selectEvent(action.eventId);
      else input.setEditPoint(action.point);
      return;
    }
    const editKey = view ? interactions.edit<StaffEditKeyContext, StaffEditKeyResolution>("staff", signal,
      { view, point: input.point, selectedEvent: selection.event ?? null,
        selectedMeasureId: selection.measure?.id ?? null, canDelete: selection.canDelete, activeStep,
        selectedRange: selectedRangeContract, overview: value }) : null;
    if (editKey?.handled) {
      event.preventDefault();
      if (input.pending || !editKey.action) return;
      const action = editKey.action;
      if (action.kind === "delete-event") {
        if (action.locateFirst) input.setEditPoint(action.locateFirst);
        input.deleteEvent(action.eventId);
      } else if (action.kind === "delete-range") {
        setRangeSelection(null);
        input.deleteRange(action.range);
      } else if (action.kind === "cancel-composition") {
        input.cancelComposition();
      } else if (action.kind === "reject-delete") {
        input.rejectEdit("这个休止符维持当前小节的节拍位置，不能直接移除", {
          measureId: action.measureId, eventId: action.eventId, componentId: "score",
        });
      } else if (action.kind === "compose-pitch") {
        input.composePitchStep(action.step);
      } else {
        if (action.change.kind === "rest") input.cancelComposition();
        change(action.change);
      }
      return;
    }
    input.keyboard(event, !input.enabled && !modifier && !signal.modifiers.includes("alt") && /^[a-gr]$/i.test(signal.key));
  }
  function insertRest() {
    if (blocked || input.pending || !view) return;
    const firstEventId = selectedRange?.events[0]?.id ?? selection.id;
    const target = firstEventId ? eventStartPoint(view, firstEventId, input.point?.preferredPitch ?? null) : input.point;
    if (!target) return;
    setRangeSelection(null);
    input.insertRestAt(target);
  }
  return { value, position, disabled: blocked || (!!selection.event && input.pending > 0), pending: input.pending,
    message: input.message || input.draftMessage, retryable: input.retryable, retry: input.retry,
    onControlInput, draftStep: activeStep ?? input.draft, selectedEventId: selection.id,
    selectedMeasureId: selection.measure?.id ?? null,
    selectedRange: selectedRange ? { measureId: selectedRange.measure.id, eventIds: selectedRange.eventIds } : null,
    insertRest, canInsertRest: Boolean(view && input.point && !blocked && !input.pending),
    onKeyDown,
    focusScore: input.activate,
    onStaffInput,
  };
}
