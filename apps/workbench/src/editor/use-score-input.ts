import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import type { NoteInputPreferencesV1 } from "../contracts/application-settings.ts";
import type { ScoreSessionRead } from "../contracts/score-session";
import type { DeleteTimePolicy, InputDuration, InputPitch, ScoreEditAction, ScoreEditRequest, ScoreEventRange } from "../contracts/note-input";
import type { ScoreClipboardFragmentV1 } from "../contracts/score-clipboard.ts";
import type { PitchDraft } from "./pitch-entry";
import type { WorkbenchClient } from "../services/workbench-client";
import { stepInputDuration } from "./input-duration";
import { defaultScoreEditPoint, edgeScoreEditPoint, jumpScoreEditPoint,
  measureTailPoint, moveScoreEditPoint } from "./score-navigation";
import type { ScoreEditPoint } from "./score-navigation";
import { alterForAccidental, inheritedAlterAtPoint } from "./accidental-state";
import type { AccidentalState } from "./accidental-state";
import { isWorkbenchIssue } from "../contracts/workbench-issue.ts";
import { adaptWorkbenchIssue, localWorkbenchIssue } from "../feedback/workbench-feedback.ts";
import type { WorkbenchFeedback, WorkbenchFeedbackContext } from "../feedback/workbench-feedback.ts";
import type { WorkbenchTaskRuntime } from "../runtime/workbench-runtime.tsx";
import { useEditorMachine } from "./use-editor-machine.ts";
import type { StaffInputContext, StaffInputOutput, StaffInsertIntent } from "./staff-input-adapter.ts";
import { scoreIntentToAction } from "../application/edit/score-edit-intent.ts";
import type { ScoreEditIntent } from "../application/edit/score-edit-intent.ts";
import { reconcileScoreFocus } from "../application/edit/score-focus-reconciler.ts";
import { ScoreEditController } from "../application/edit/score-edit-controller.ts";
import type { ScoreEditResolution } from "../application/edit/score-edit-controller.ts";
import { keyPressSignal } from "../input/input-signal.ts";
import type { NotationInteractionRegistry } from "../input/notation-interaction-registry.ts";

interface Queued {
  intent: ScoreEditIntent;
  context: WorkbenchFeedbackContext;
  generation: number;
  request?: ScoreEditRequest;
  completionFocus?: HTMLElement;
  operationToken?: string;
  point?: ScoreEditPoint;
  preserveSelection?: boolean;
}
type PropertyEditAction = Extract<ScoreEditAction, {
  kind: "set-event-properties" | "set-title" | "set-document-metadata" | "set-measure-meter"
    | "set-key-signature" | "set-staff-clef";
}>;

function feedbackContext(session: ScoreSessionRead, point: ScoreEditPoint | null, intent: ScoreEditIntent): WorkbenchFeedbackContext {
  if (intent.kind === "insert-event") return { ...(point ? { measureId: point.measureId } : {}), componentId: "score" };
  if (intent.kind === "delete-event" || intent.kind === "update-event") {
    const measure = session.notation.kind === "staff"
      ? session.notation.measures.find((item) => item.events.some((event) => event.id === intent.eventId)) : null;
    return { ...(measure ? { measureId: measure.id } : {}), eventId: intent.eventId, componentId: "note-control" };
  }
  if (intent.kind === "delete-range") return { measureId: intent.range.measureId, componentId: "score" };
  if (intent.kind === "paste") return { measureId: intent.measureId, componentId: "score" };
  if (intent.kind === "insert-measure" || intent.kind === "remove-measure") {
    return { measureId: intent.measureId, componentId: "score" };
  }
  if (intent.kind === "set-measure-meter") {
    return { measureId: intent.measureId, componentId: "score-properties" };
  }
  if (intent.kind === "set-key-signature") {
    return { measureId: intent.measureId, componentId: "score-properties" };
  }
  if (intent.kind === "set-staff-clef") return { componentId: "score-properties" };
  return { componentId: intent.kind === "document" ? "document" : "score" };
}
export function useScoreInput(session: ScoreSessionRead | null, client: WorkbenchClient, onSession: (session: ScoreSessionRead) => void,
  focusRef: RefObject<HTMLDivElement | null>, loadEpoch = 0, deleteTimePolicy: DeleteTimePolicy = "preserve",
  noteInputPreferences: NoteInputPreferencesV1, interactions: NotationInteractionRegistry, runtime?: WorkbenchTaskRuntime) {
  const editor = useEditorMachine<ScoreEditPoint, NonNullable<PitchDraft>>();
  const point = editor.state.target.kind === "unavailable" ? null : editor.state.target.point;
  const enabled = editor.state.target.kind === "caret";
  const draft = enabled ? interactions.readDraft<NonNullable<PitchDraft>>("staff", editor.state.composition) : null;
  const selectedEventId = editor.state.target.kind === "event" ? editor.state.target.eventId : null;
  const retryable = editor.state.transaction.kind === "failed" && editor.state.transaction.retryable;
  const [duration, setDuration] = useState<InputDuration>(noteInputPreferences.defaultDuration);
  const [draftMessage, setDraftMessage] = useState("");
  const [alter, setAlter] = useState<-1 | 0 | 1>(0);
  const [accidental, setAccidental] = useState<AccidentalState>("none");
  const [rest, setRest] = useState(false);
  const [previewPitch, setPreviewPitch] = useState<InputPitch | null>(null);
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState("");
  const [feedbackTarget, setFeedbackTarget] = useState<"score" | "properties">("score");
  const [feedback, setFeedback] = useState<WorkbenchFeedback | null>(null);
  const feedbackSequence = useRef(0);
  const snapshot = useRef(session); snapshot.current = session;
  const mounted = useRef(true);
  const generation = useRef(0);
  const noteInputPreferencesRef = useRef(noteInputPreferences);
  noteInputPreferencesRef.current = noteInputPreferences;
  const controllerRef = useRef<ScoreEditController<Queued> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new ScoreEditController<Queued>((state) => {
      if (mounted.current) setPending(state.pending);
    });
  }
  const controller = controllerRef.current;
  const currentPoint = () => editor.current.current.target.kind === "unavailable" ? null : editor.current.current.target.point;
  function clearDraft() { editor.send({ type: "cancel-composition" }); setDraftMessage(""); }
  function updatePoint(next: ScoreEditPoint) { editor.send({ type: "point-updated", point: next }); }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      for (const item of controller.reset()) {
        if (item.operationToken) runtime?.operations.finish(item.operationToken);
      }
    };
  }, [controller, runtime?.operations.finish]);
  useEffect(() => {
    generation.current += 1;
    for (const item of controller.reset()) {
      if (item.operationToken) runtime?.operations.finish(item.operationToken);
    }
    setMessage(""); setFeedback(null);
    setPreviewPitch(null);
    editor.send({ type: "reset", point: session?.notation.kind === "staff" ? defaultScoreEditPoint(session.notation) : null });
  }, [controller, session?.documentId, loadEpoch, runtime?.operations.finish]);
  useEffect(() => {
    setDuration(noteInputPreferences.defaultDuration);
  }, [noteInputPreferences.defaultDuration.base, noteInputPreferences.defaultDuration.dots]);
  const focus = () => focusRef.current?.focus({ preventScroll: true });
  function clearFeedback() {
    if (!controller.blocked) {
      setMessage(""); setFeedback(null);
      editor.send({ type: "dismiss-failure" });
    }
  }
  function rejectEdit(message: string, context: WorkbenchFeedbackContext) {
    const issue = localWorkbenchIssue(message, context, { code: "editor.operation-rejected", retryable: false });
    const nextFeedback = runtime?.feedback.report(issue, context) ?? (() => {
      feedbackSequence.current += 1;
      return adaptWorkbenchIssue(issue, context, feedbackSequence.current);
    })();
    setFeedbackTarget("score");
    setMessage("");
    setFeedback(nextFeedback);
  }
  async function execute(item: Queued): Promise<ScoreEditResolution> {
    if (!mounted.current || item.generation !== generation.current) return "discard-current";
    const current = snapshot.current;
    if (!current) return "discard-current";
    const editPoint = item.point ?? currentPoint();
    const action = scoreIntentToAction(item.intent, editPoint, deleteTimePolicy);
    if (!action) {
      const invalidTargetMessage = "当前输入目标已经失效，请重新定位";
      rejectEdit(invalidTargetMessage, item.context);
      setMessage(invalidTargetMessage);
      return "discard-all";
    }
    item.context = feedbackContext(current, editPoint, item.intent);
    item.request ??= { requestId: crypto.randomUUID(), documentId: current.documentId,
      expectedVersion: current.documentVersion, action };
    if (!item.operationToken && runtime) {
      item.operationToken = runtime.operations.begin("score.edit", item.context.componentId ?? "score");
    }
    editor.send({ type: "submit", operation: item.intent.kind, requestId: item.request.requestId });
    try {
      const result = await client.edit(item.request);
      if (!mounted.current || item.generation !== generation.current
        || snapshot.current?.documentId !== result.documentId) {
        if (item.operationToken) runtime?.operations.finish(item.operationToken);
        return "discard-current";
      }
      snapshot.current = result; onSession(result);
      if (action.kind === "set-event-properties" || action.kind === "set-title"
        || action.kind === "set-document-metadata" || action.kind === "set-measure-meter"
        || action.kind === "set-staff-clef") {
        const destination = item.completionFocus?.isConnected ? item.completionFocus : focusRef.current;
        destination?.focus({ preventScroll: true });
      }
      const selectedId = item.preserveSelection === false ? null
        : editor.current.current.target.kind === "event" ? editor.current.current.target.eventId : null;
      const focusResolution = reconcileScoreFocus(current, result, action, editPoint, selectedId);
      editor.send({ type: "commit", requestId: item.request.requestId, target: focusResolution.target });
      if (action.kind === "append" && noteInputPreferencesRef.current.retention !== "all") {
        const preferences = noteInputPreferencesRef.current;
        if (preferences.retention === "reset") setDuration(preferences.defaultDuration);
        setAccidental("none");
        setAlter(0);
        setRest(false);
        setPreviewPitch(null);
        editor.send({ type: "cancel-composition" });
        setDraftMessage("");
      }
      if (item.operationToken) runtime?.operations.finish(item.operationToken);
      return "committed";
    } catch (error) {
      if (!mounted.current || item.generation !== generation.current) {
        if (item.operationToken) runtime?.operations.finish(item.operationToken);
        return "discard-current";
      }
      const propertyEdit = action.kind === "set-event-properties" || action.kind === "set-title"
        || action.kind === "set-document-metadata" || action.kind === "set-measure-meter"
        || action.kind === "set-staff-clef";
      setFeedbackTarget(propertyEdit ? "properties" : "score");
      const requestIssue = error instanceof Error && "issue" in error && isWorkbenchIssue(error.issue) ? error.issue : null;
      const errorMessage = error instanceof Error ? error.message : "操作失败，请重试";
      const status = error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : 0;
      const definiteRejection = status >= 400 && status < 500;
      const issue = requestIssue ?? localWorkbenchIssue(errorMessage, item.context, {
        code: definiteRejection ? "editor.operation-rejected" : "bridge.operation-unconfirmed",
        retryable: !definiteRejection, source: definiteRejection ? "editor" : "bridge",
      });
      const nextFeedback = runtime?.feedback.report(issue, item.context) ?? (() => {
        feedbackSequence.current += 1;
        return adaptWorkbenchIssue(issue, item.context, feedbackSequence.current);
      })();
      setFeedback(nextFeedback);
      if (item.operationToken) runtime?.operations.fail(item.operationToken, issue, !definiteRejection);
      editor.send({ type: "reject", requestId: item.request.requestId, retryable: !definiteRejection });
      // The retained client may predate a development hot reload. Class identity
      // can change, but a definite HTTP rejection still must not become a retry.
      if (definiteRejection) {
        if (status === 409) {
          try {
            const fresh = await client.read();
            if (fresh && mounted.current && item.generation === generation.current) {
              snapshot.current = fresh; onSession(fresh);
            }
          } catch { /* The original conflict remains visible. */ }
        }
        setMessage(action.kind === "append" ? `${issue.message}。后续排队输入已停止。` : issue.message);
        return "discard-all";
      }
      setMessage(issue.message);
      return "retryable";
    }
  }
  function drain() { void controller.drain(execute); }
  function enqueue(intent: ScoreEditIntent, completionFocus?: HTMLElement,
    options: { readonly point?: ScoreEditPoint; readonly preserveSelection?: boolean } = {}) {
    const point = options.point ?? currentPoint();
    if (!snapshot.current || snapshot.current.notation.kind !== "staff" || (intent.kind === "insert-event" && !point)
      || controller.blocked) return false;
    const context = feedbackContext(snapshot.current, point, intent);
    setMessage(""); setFeedback(null);
    const accepted = controller.enqueue({ intent, context, generation: generation.current,
      ...(options.point ? { point: options.point } : {}),
      ...(options.preserveSelection === undefined ? {} : { preserveSelection: options.preserveSelection }),
      ...(completionFocus ? { completionFocus } : {}) });
    if (accepted) drain();
    return accepted;
  }
  function write(pitch: Pick<InputPitch, "step" | "octave">, asRest = rest) {
    const view = snapshot.current?.notation;
    const point = currentPoint();
    const inherited = view?.kind === "staff" && point ? inheritedAlterAtPoint(view, point, pitch) : 0;
    const writtenPitch = { ...pitch, alter: alterForAccidental(accidental, inherited) };
    if (!asRest) {
      setPreviewPitch(writtenPitch);
      if (point) updatePoint({ ...point, preferredPitch: writtenPitch });
    }
    enqueue({ kind: "insert-event", event: { duration, content: asRest ? { kind: "rest" } : { kind: "note", pitch: writtenPitch } } });
  }
  function locate(nextPoint: ScoreEditPoint, pitch: InputPitch, writeNow: boolean) {
    if (controller.pending) return;
    editor.send({ type: "locate", point: { ...nextPoint, preferredPitch: pitch } }); focus();
    if (writeNow) write(pitch);
  }
  function locateMeasure(id: string, pitch: InputPitch, writeNow: boolean) {
    const view = snapshot.current?.notation;
    if (view?.kind !== "staff") return;
    const measure = view.measures.find((item) => item.id === id);
    if (measure) locate(measureTailPoint(view, measure, pitch), pitch, writeNow);
  }
  function keyboard(event: KeyboardEvent, resumeInput = false) {
    const element = event.target as HTMLElement;
    if (element.closest("input, select, textarea, button") || event.nativeEvent.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault(); clearDraft(); enqueue({ kind: "history", direction: event.shiftKey ? "redo" : "undo" }); return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") { clearDraft(); return; }
    if ((!enabled && !resumeInput) || retryable) return;
    if (editor.current.current.transaction.kind === "failed") clearFeedback();
    if (resumeInput && !enabled && currentPoint()) editor.send({ type: "locate", point: currentPoint()! });
    if (event.key === "+" || event.key === "=" || event.key === "-" || event.key === "_") {
      event.preventDefault();
      if (event.repeat) return;
      const offset = event.key === "+" || event.key === "=" ? 1 : -1;
      setDuration((value) => stepInputDuration(value, offset));
      return;
    }
    if (event.key === ".") {
      event.preventDefault();
      if (!event.repeat) setDuration((value) => ({ ...value, dots: value.dots ? 0 : 1 }));
      return;
    }
    const state = editor.current.current;
    const view = snapshot.current?.notation;
    const editPoint = currentPoint();
    const output = interactions.translate<StaffInputContext, NonNullable<PitchDraft>, StaffInsertIntent>("staff", keyPressSignal(event), {
      focusScope: "score",
      target: state.target.kind,
      notationKind: view?.kind === "staff" ? "staff" : "unknown",
      capabilities: ["locate", "navigate", "compose", "insert", "update", "delete", "paste", "history"],
      composing: state.composition.kind === "composing",
      composition: state.composition,
      duration,
      rest,
      resolveAlter: (pitch) => {
        const inherited = view?.kind === "staff" && editPoint ? inheritedAlterAtPoint(view, editPoint, pitch) : 0;
        return alterForAccidental(accidental, inherited);
      },
    }) as StaffInputOutput | null;
    if (!output || (output.kind === "ignored" && !output.handled)) return;
    event.preventDefault();
    if (output.kind === "ignored") return;
    if (output.kind === "compose") {
      editor.send({ type: "compose", methodId: output.methodId, draft: output.draft });
      setDraftMessage(output.message ?? "");
      setRest(false);
      return;
    }
    if (output.kind === "cancel-composition") {
      clearDraft();
      setDraftMessage(output.message ?? "");
      return;
    }
    clearDraft();
    setDraftMessage("");
    if (output.intent.kind !== "insert-event") return;
    if (output.intent.event.content.kind === "note") {
      const pitch = output.intent.event.content.pitch;
      setPreviewPitch(pitch);
      setRest(false);
      if (editPoint) updatePoint({ ...editPoint, preferredPitch: pitch });
    } else {
      setRest(true);
    }
    enqueue(output.intent);
  }
  function navigate(nextPoint: ScoreEditPoint) {
    if (controller.pending || controller.blocked) return;
    editor.send({ type: "locate", point: nextPoint }); focus();
  }
  function withView(action: (view: Extract<ScoreSessionRead["notation"], { readonly kind: "staff" }>, current: ScoreEditPoint) => ScoreEditPoint) {
    const view = snapshot.current?.notation, current = currentPoint();
    if (view?.kind !== "staff" || !current) return;
    navigate(action(view, current));
  }
  function propertyIntent(action: PropertyEditAction): ScoreEditIntent {
    if (action.kind === "set-title" || action.kind === "set-document-metadata") return { kind: "document", action };
    if (action.kind === "set-measure-meter") return { kind: "set-measure-meter", measureId: action.measureId,
      meter: action.meter, scope: action.scope };
    if (action.kind === "set-key-signature") return { kind: "set-key-signature", partId: action.partId,
      measureId: action.measureId, change: action.change };
    if (action.kind === "set-staff-clef") return { kind: "set-staff-clef", staffId: action.staffId, clef: action.clef };
    return { kind: "update-event", eventId: action.eventId, properties: action.properties };
  }
  function applyPropertyChanges(actions: readonly PropertyEditAction[], completionFocus?: HTMLElement) {
    if (!actions.length || controller.pending || controller.blocked) return false;
    const dialog = document.activeElement?.closest<HTMLElement>('[role="dialog"]');
    clearDraft();
    return actions.every((action) => enqueue(propertyIntent(action), dialog ?? completionFocus));
  }
  return { editorState: editor.state, selectedEventId, enabled, duration, draft, draftMessage, alter, accidental, rest,
    previewPitch, point, measureId: point?.measureId ?? "",
    pending, message, feedbackTarget, feedback, retryable, locate, locateMeasure, keyboard, clearFeedback, rejectEdit,
    setEditPoint: navigate,
    moveEditPoint: (direction: -1 | 1) => withView((view, current) => moveScoreEditPoint(view, current, direction)),
    jumpEditPoint: (direction: -1 | 1) => withView((view, current) => jumpScoreEditPoint(view, current, direction)),
    edgeEditPoint: (edge: "measure-start" | "measure-end" | "score-start" | "score-end") =>
      withView((view, current) => edgeScoreEditPoint(view, current, edge)),
    activate: () => { if (currentPoint()) editor.send({ type: "locate", point: currentPoint()! }); focus(); },
    applyProperties: (action: PropertyEditAction, completionFocus?: HTMLElement) =>
      applyPropertyChanges([action], completionFocus),
    applyPropertyChanges,
    exit: clearDraft,
    selectEvent: (eventId: string, nextPoint: ScoreEditPoint) => {
      editor.send({ type: "select", eventId, point: nextPoint }); clearFeedback(); focus();
    },
    clearSelection: () => { if (currentPoint()) editor.send({ type: "locate", point: currentPoint()! }); focus(); },
    composePitchStep: (step: InputPitch["step"]) => {
      clearFeedback();
      const composition = interactions.startComposition("staff", step);
      if (composition) editor.send({ type: "compose", ...composition });
    },
    cancelComposition: clearDraft,
    deleteEvent: (eventId: string, timePolicy?: DeleteTimePolicy) => {
      clearDraft(); enqueue({ kind: "delete-event", eventId, ...(timePolicy ? { timePolicy } : {}) }); focus();
    },
    deleteRange: (range: ScoreEventRange) => { clearDraft(); enqueue({ kind: "delete-range", range }); focus(); },
    insertRestAt: (target: ScoreEditPoint) => {
      clearDraft();
      enqueue({ kind: "insert-event", event: { duration, content: { kind: "rest" } } }, undefined,
        { point: target, preserveSelection: false });
      focus();
    },
    insertMeasure: (measureId: string, position: "before" | "after") => {
      clearDraft(); enqueue({ kind: "insert-measure", measureId, position }); focus();
    },
    removeMeasure: (measureId: string) => { clearDraft(); enqueue({ kind: "remove-measure", measureId }); focus(); },
    pasteFragment: (fragment: ScoreClipboardFragmentV1) => {
      const target = editor.current.current.target;
      const editPoint = currentPoint();
      if (!editPoint) return;
      const anchor = target.kind === "event" ? { kind: "after-event" as const, eventId: target.eventId } : editPoint.anchor;
      clearDraft();
      enqueue({ kind: "paste", measureId: editPoint.measureId, voiceId: editPoint.voiceId, anchor,
        ...(target.kind === "caret" ? { offsetUnits: editPoint.offsetUnits } : {}), fragment });
      focus();
    },
    setDuration: (value: InputDuration) => { setDuration(value); focus(); },
    setAlter: (value: -1 | 0 | 1, completionFocus?: HTMLElement) => {
      setAlter(value);
      if (completionFocus?.isConnected) completionFocus.focus({ preventScroll: true }); else focus();
    },
    setAccidental: (value: AccidentalState, completionFocus?: HTMLElement) => {
      setAccidental(value);
      setAlter(value === "flat" ? -1 : value === "sharp" ? 1 : 0);
      if (completionFocus?.isConnected) completionFocus.focus({ preventScroll: true }); else focus();
    },
    setPitch: (value: InputPitch, completionFocus?: HTMLElement) => {
      setPreviewPitch(value); setAlter(value.alter); setRest(false);
      if (completionFocus?.isConnected) completionFocus.focus({ preventScroll: true }); else focus();
    },
    setRest: (value: boolean) => { clearDraft(); setRest(value); focus(); },
    toggle: () => { clearDraft(); clearFeedback(); if (currentPoint()) editor.send({ type: "locate", point: currentPoint()! }); focus(); },
    history: (kind: "undo" | "redo") => { clearDraft(); enqueue({ kind: "history", direction: kind }); focus(); },
    retry: () => {
      const dialog = document.activeElement?.closest<HTMLElement>('[role="dialog"]');
      const current = controller.current();
      if (dialog && current) current.completionFocus = dialog;
      if (current?.operationToken) runtime?.operations.recover(current.operationToken);
      if (current?.request) editor.send({ type: "retry", requestId: current.request.requestId });
      if (!controller.recover()) return;
      setMessage("");
      if (dialog) dialog.focus({ preventScroll: true }); else focus();
      drain();
    },
  };
}
