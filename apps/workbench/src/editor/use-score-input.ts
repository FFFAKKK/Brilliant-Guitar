import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import type { ScoreSessionRead } from "../contracts/score-session";
import type { DeleteTimePolicy, InputDuration, InputPitch, ScoreEditAction, ScoreEditRequest, ScoreEventRange } from "../contracts/note-input";
import type { ScoreClipboardFragmentV1 } from "../contracts/score-clipboard.ts";
import type { PitchDraft } from "./pitch-entry";
import type { WorkbenchClient } from "../services/workbench-client";
import { nextMeasure } from "../notation/input-position";
import { stepInputDuration } from "./input-duration";
import { defaultScoreEditPoint, edgeScoreEditPoint, eventEndPoint, jumpScoreEditPoint,
  eventStartPoint, measureStartPoint, measureTailPoint, moveScoreEditPoint, normalizeScoreEditPoint } from "./score-navigation";
import type { ScoreEditPoint } from "./score-navigation";
import { alterForAccidental, inheritedAlterAtPoint } from "./accidental-state";
import type { AccidentalState } from "./accidental-state";
import { isWorkbenchIssue } from "../contracts/workbench-issue.ts";
import { adaptWorkbenchIssue, localWorkbenchIssue } from "../feedback/workbench-feedback.ts";
import type { WorkbenchFeedback, WorkbenchFeedbackContext } from "../feedback/workbench-feedback.ts";
import type { WorkbenchTaskRuntime } from "../runtime/workbench-runtime.tsx";
import { useEditorMachine } from "./use-editor-machine.ts";
import { resolveStaffKey } from "./staff-input-adapter.ts";
import { scoreIntentToAction } from "./score-edit-intent.ts";
import type { ScoreEditIntent } from "./score-edit-intent.ts";

interface Queued { intent: ScoreEditIntent; context: WorkbenchFeedbackContext; request?: ScoreEditRequest; completionFocus?: HTMLElement; operationToken?: string }

function feedbackContext(session: ScoreSessionRead, point: ScoreEditPoint | null, intent: ScoreEditIntent): WorkbenchFeedbackContext {
  if (intent.kind === "insert") return { ...(point ? { measureId: point.measureId } : {}), componentId: "score" };
  if (intent.kind === "delete" || intent.kind === "update") {
    const measure = session.notation.kind === "staff"
      ? session.notation.measures.find((item) => item.events.some((event) => event.id === intent.eventId)) : null;
    return { ...(measure ? { measureId: measure.id } : {}), eventId: intent.eventId, componentId: "note-control" };
  }
  if (intent.kind === "delete-range") return { measureId: intent.range.measureId, componentId: "score" };
  if (intent.kind === "paste") return { measureId: intent.measureId, componentId: "score" };
  return { componentId: intent.kind === "document" ? "document" : "score" };
}
export function useScoreInput(session: ScoreSessionRead | null, client: WorkbenchClient, onSession: (session: ScoreSessionRead) => void,
  focusRef: RefObject<HTMLDivElement | null>, loadEpoch = 0, deleteTimePolicy: DeleteTimePolicy = "preserve",
  runtime?: WorkbenchTaskRuntime) {
  const editor = useEditorMachine<ScoreEditPoint, NonNullable<PitchDraft>>();
  const point = editor.state.target.kind === "unavailable" ? null : editor.state.target.point;
  const enabled = editor.state.target.kind === "caret";
  const draft = editor.state.composition.kind === "composing" && editor.state.composition.methodId === "staff.pitch"
    && enabled ? editor.state.composition.draft : null;
  const selectedEventId = editor.state.target.kind === "event" ? editor.state.target.eventId : null;
  const retryable = editor.state.transaction.kind === "failed" && editor.state.transaction.retryable;
  const [duration, setDuration] = useState<InputDuration>({ base: 4, dots: 0 });
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
  const queue = useRef<Queued[]>([]), running = useRef(false), blocked = useRef(false), mounted = useRef(true);
  const currentPoint = () => editor.current.current.target.kind === "unavailable" ? null : editor.current.current.target.point;
  function clearDraft() { editor.send({ type: "cancel-composition" }); setDraftMessage(""); }
  function updatePoint(next: ScoreEditPoint) { editor.send({ type: "point-updated", point: next }); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    for (const item of queue.current) if (item.operationToken) runtime?.operations.finish(item.operationToken);
    queue.current = []; blocked.current = false;
    setPending(0); setMessage(""); setFeedback(null);
    setPreviewPitch(null);
    editor.send({ type: "reset", point: session?.notation.kind === "staff" ? defaultScoreEditPoint(session.notation) : null });
  }, [session?.documentId, loadEpoch, runtime?.operations.finish]);
  const focus = () => focusRef.current?.focus({ preventScroll: true });
  function clearFeedback() {
    if (!blocked.current) {
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
  async function drain() {
    if (running.current || blocked.current) return;
    running.current = true;
    try {
      while (queue.current.length && mounted.current) {
        const item = queue.current[0]!, current = snapshot.current;
        if (!current) { queue.current = []; break; }
        const editPoint = currentPoint();
        const action = scoreIntentToAction(item.intent, editPoint, deleteTimePolicy);
        if (!action) { queue.current = []; setPending(0); break; }
        item.context = feedbackContext(current, editPoint, item.intent);
        item.request ??= { requestId: crypto.randomUUID(), documentId: current.documentId, expectedVersion: current.documentVersion, action };
        if (!item.operationToken && runtime) item.operationToken = runtime.operations.begin("score.edit", item.context.componentId ?? "score");
        editor.send({ type: "submit", operation: item.intent.kind, requestId: item.request.requestId });
        try {
          const result = await client.edit(item.request);
          if (!mounted.current || snapshot.current?.documentId !== result.documentId) return;
          snapshot.current = result; onSession(result);
          if (action.kind === "set-event-properties" || action.kind === "set-title") {
            const destination = item.completionFocus?.isConnected ? item.completionFocus : focusRef.current;
            destination?.focus({ preventScroll: true });
          }
          if (result.notation.kind === "staff") {
            const previous = current.notation;
            let nextPoint = normalizeScoreEditPoint(result.notation, currentPoint());
            if (action.kind === "append") {
              const before = previous.kind === "staff" ? previous.measures.find((measure) => measure.id === action.measureId) : undefined;
              const after = result.notation.measures.find((measure) => measure.id === action.measureId);
              const beforeIds = new Set(before?.events.map((event) => event.id) ?? []);
              const inserted = after?.events.filter((event) => !beforeIds.has(event.id)).at(-1);
              const nextMeasureId = nextMeasure(result.notation, action.measureId);
              const oldTail = before?.events.at(-1);
              const insertedAtTail = action.anchor.kind === "start" ? !oldTail
                : oldTail?.id === action.anchor.eventId;
              if (insertedAtTail && nextMeasureId !== action.measureId) {
                const nextMeasure = result.notation.measures.find((measure) => measure.id === nextMeasureId);
                if (nextMeasure) nextPoint = measureStartPoint(result.notation, nextMeasure, currentPoint()?.preferredPitch ?? null);
              } else if (inserted) {
                nextPoint = eventEndPoint(result.notation, inserted.id, currentPoint()?.preferredPitch ?? null) ?? nextPoint;
              }
            }
            if (action.kind === "paste-fragment") {
              const before = previous.kind === "staff" ? previous.measures.find((measure) => measure.id === action.measureId) : undefined;
              const after = result.notation.measures.find((measure) => measure.id === action.measureId);
              const beforeIds = new Set(before?.events.map((event) => event.id) ?? []);
              const inserted = after?.events.filter((event) => !beforeIds.has(event.id));
              const lastInserted = inserted?.at(-1);
              if (lastInserted) nextPoint = eventEndPoint(result.notation, lastInserted.id,
                currentPoint()?.preferredPitch ?? null) ?? nextPoint;
            }
            const selectedId = editor.current.current.target.kind === "event" ? editor.current.current.target.eventId : null;
            const retainSelection = action.kind !== "delete-event" && action.kind !== "delete-range"
              && action.kind !== "paste-fragment";
            const selectedPoint = selectedId && retainSelection
              ? eventStartPoint(result.notation, selectedId, nextPoint.preferredPitch) : null;
            editor.send({ type: "commit", requestId: item.request.requestId,
              target: selectedId && selectedPoint ? { kind: "event", eventId: selectedId, point: selectedPoint }
                : { kind: "caret", point: nextPoint } });
          } else {
            editor.send({ type: "commit", requestId: item.request.requestId, target: { kind: "unavailable" } });
          }
          if (item.operationToken) runtime?.operations.finish(item.operationToken);
          queue.current.shift(); setPending(queue.current.length);
        } catch (error) {
          if (!mounted.current) return;
          const propertyEdit = action.kind === "set-event-properties" || action.kind === "set-title";
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
            queue.current = []; setPending(0);
            if (status === 409) {
              try { const fresh = await client.read(); if (fresh && mounted.current) { snapshot.current = fresh; onSession(fresh); } } catch { /* The original conflict remains visible. */ }
            }
            setMessage(action.kind === "append" ? `${issue.message}。后续排队输入已停止。` : issue.message);
          } else {
            blocked.current = true;
            setMessage(issue.message);
          }
          break;
        }
      }
    } finally { running.current = false; }
  }
  function enqueue(intent: ScoreEditIntent, completionFocus?: HTMLElement) {
    const point = currentPoint();
    if (!snapshot.current || snapshot.current.notation.kind !== "staff" || (intent.kind === "insert" && !point)
      || blocked.current) return;
    const context = feedbackContext(snapshot.current, point, intent);
    setMessage(""); setFeedback(null); queue.current.push({ intent, context, ...(completionFocus ? { completionFocus } : {}) }); setPending(queue.current.length); void drain();
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
    enqueue({ kind: "insert", event: { duration, content: asRest ? { kind: "rest" } : { kind: "note", pitch: writtenPitch } } });
  }
  function locate(nextPoint: ScoreEditPoint, pitch: InputPitch, writeNow: boolean) {
    if (queue.current.length) return;
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
    const composition = editor.current.current.composition;
    const result = resolveStaffKey(composition.kind === "composing" && composition.methodId === "staff.pitch"
      ? composition.draft : null, event.key, event.repeat);
    if (!result.handled) return;
    event.preventDefault();
    if (event.repeat) return;
    if (result.draft) editor.send({ type: "compose", methodId: "staff.pitch", draft: result.draft });
    else clearDraft();
    setDraftMessage(result.message ?? "");
    if (result.draft) setRest(false);
    if (result.pitch) write(result.pitch, false);
    if (result.rest) { setRest(true); enqueue({ kind: "insert", event: { duration, content: { kind: "rest" } } }); }
  }
  function navigate(nextPoint: ScoreEditPoint) {
    if (queue.current.length || blocked.current) return;
    editor.send({ type: "locate", point: nextPoint }); focus();
  }
  function withView(action: (view: Extract<ScoreSessionRead["notation"], { readonly kind: "staff" }>, current: ScoreEditPoint) => ScoreEditPoint) {
    const view = snapshot.current?.notation, current = currentPoint();
    if (view?.kind !== "staff" || !current) return;
    navigate(action(view, current));
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
    applyProperties: (action: Extract<ScoreEditAction, { kind: "set-event-properties" | "set-title" }>, completionFocus?: HTMLElement) => {
      if (queue.current.length || blocked.current) return;
      // Capture before disabling the form; modal edits must not focus the score behind it.
      const dialog = document.activeElement?.closest<HTMLElement>('[role="dialog"]');
      clearDraft();
      enqueue(action.kind === "set-title" ? { kind: "document", title: action.title }
        : { kind: "update", eventId: action.eventId, properties: action.properties }, dialog ?? completionFocus);
    },
    exit: clearDraft,
    selectEvent: (eventId: string, nextPoint: ScoreEditPoint) => {
      editor.send({ type: "select", eventId, point: nextPoint }); clearFeedback(); focus();
    },
    clearSelection: () => { if (currentPoint()) editor.send({ type: "locate", point: currentPoint()! }); focus(); },
    composePitchStep: (step: InputPitch["step"]) => {
      clearFeedback();
      editor.send({ type: "compose", methodId: "staff.pitch", draft: step });
    },
    cancelComposition: clearDraft,
    deleteEvent: (eventId: string) => { clearDraft(); enqueue({ kind: "delete", eventId }); focus(); },
    deleteRange: (range: ScoreEventRange) => { clearDraft(); enqueue({ kind: "delete-range", range }); focus(); },
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
      if (value !== "none") setAlter(value === "flat" ? -1 : value === "sharp" ? 1 : 0);
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
      if (dialog && queue.current[0]) queue.current[0].completionFocus = dialog;
      if (queue.current[0]?.operationToken) runtime?.operations.recover(queue.current[0].operationToken);
      if (queue.current[0]?.request) editor.send({ type: "retry", requestId: queue.current[0].request.requestId });
      blocked.current = false; setMessage("");
      if (dialog) dialog.focus({ preventScroll: true }); else focus();
      void drain();
    },
  };
}
