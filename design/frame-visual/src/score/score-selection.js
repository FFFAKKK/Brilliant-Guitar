import { eventStartPoint, initialEditorState, normalizeScoreEditPoint, staffInteractionBinding,
  resolveScoreEventRange, selectScoreEventRange, scoreEditPoints, transitionEditor, isEventProperties } from "../vendor/score-interaction.js";
import { SCORE_NAVIGATION_KEYS } from "../contracts/score-selection.js";
import { notifyObservers } from "../runtime/runtime-support.js";

const fail = reason => ({ ok: false, code: `score.selection.${reason}` });
const payloadFor = (payload, fields) => payload !== null && typeof payload === "object" && !Array.isArray(payload)
  && Object.keys(payload).every(key => fields.includes(key));
const freezeTarget = target => Object.freeze(target.kind === "unavailable" ? { kind: target.kind } : {
  ...target, point: Object.freeze({ ...target.point, anchor: Object.freeze({ ...target.point.anchor }),
    preferredPitch: target.point.preferredPitch ? Object.freeze({ ...target.point.preferredPitch }) : null }),
});

/** Owns interaction focus only. Score truth and version acceptance remain with the source. */
export function createScoreSelection({ score, interaction = staffInteractionBinding } = {}) {
  if (typeof score?.snapshot !== "function" || typeof score?.subscribe !== "function") throw new TypeError("谱面选择需要只读源");
  let disposed = false, source = null, identity = null, revision = 0, editor = initialEditorState(null), state;
  let range = null, selectionRevision = 0, lastEditor = null, lastRange = null, lastSource = null;
  const listeners = new Set();
  const publish = () => {
    if (editor !== lastEditor || range !== lastRange || source !== lastSource) selectionRevision++;
    lastEditor = editor; lastRange = range; lastSource = source;
    const resolved = source?.kind === "staff" ? resolveScoreEventRange(source, range) : null;
    state = Object.freeze({ sourceRevision: revision, selectionRevision, documentId: identity,
      documentVersion: score.status?.().documentVersion ?? null,
      available: !disposed && !!source && (score.status?.().status ?? "ready") === "ready",
      target: freezeTarget(editor.target), composition: Object.freeze({ ...editor.composition }),
      rangeSelection: resolved ? Object.freeze({ ...range }) : null,
      range: resolved ? Object.freeze({ measureId: resolved.measure.id, voiceId: resolved.measure.voiceId,
        startEventId: resolved.eventIds[0], endEventId: resolved.eventIds.at(-1),
        eventIds: Object.freeze([...resolved.eventIds]) }) : null,
      transaction: Object.freeze({ ...editor.transaction }) });
    notifyObservers(listeners);
  };
  function refresh() {
    if (disposed) return;
    const next = score.snapshot(), nextIdentity = score.status?.().documentId ?? null;
    if (next !== source || nextIdentity !== identity) {
      revision++;
      range = null;
      if (!next || nextIdentity !== identity) editor = initialEditorState(null);
      else if (editor.transaction.kind === "applying") { /* Keep the captured point until the matching accepted result. */ }
      else if (editor.target.kind === "event") {
        const point = eventStartPoint(next, editor.target.eventId);
        editor = point ? transitionEditor(editor, { type: "select", eventId: editor.target.eventId, point })
          : initialEditorState(normalizeScoreEditPoint(next, editor.target.point));
      } else if (editor.target.kind === "caret") editor = initialEditorState(normalizeScoreEditPoint(next, editor.target.point));
      else if (editor.target.kind === "unavailable") {
        // Document edits can fail before any note is located. A fresh accepted read
        // dismisses their non-retryable failure without inventing a caret.
        editor = transitionEditor(editor, { type: "dismiss-failure" });
      }
      source = next; identity = nextIdentity;
    }
    publish();
  }
  function accept(sourceRevision, action) {
    if (disposed) return fail("disposed");
    if (!state.available) return fail("not-ready");
    if (!Number.isSafeInteger(sourceRevision) || sourceRevision !== revision) return fail("stale");
    const previous = editor, previousRange = range;
    const result = action();
    if (result?.ok === false) return result;
    if (editor !== previous || range !== previousRange) publish();
    return { ok: true, changed: editor !== previous || range !== previousRange };
  }
  function select(eventId, extend = false) {
    if (typeof eventId !== "string") return fail("invalid-payload");
    const point = eventStartPoint(source, eventId);
    if (!point) return fail("missing-event");
    if (editor.transaction.kind === "applying") return fail("not-ready");
    const next = extend ? selectScoreEventRange(source, range,
      editor.target.kind === "event" ? editor.target.eventId : null, eventId) : null;
    if (extend && !next) return fail("range-boundary");
    editor = transitionEditor(editor, { type: "select", eventId, point });
    range = next;
  }
  refresh();
  const stop = score.subscribe(refresh);
  if (typeof stop !== "function") throw new TypeError("谱面选择订阅需要释放函数");
  const beginEdit = (requestId, operation, sourceRevision) => accept(sourceRevision, () => {
    if (!["insert-event", "delete-event", "update-event", "delete-range", "paste", "insert-measure", "remove-measure", "set-measure-meter", "set-key-signature", "set-staff-clef", "document"].includes(operation)) return fail("invalid-operation");
    if ((operation === "insert-event" && editor.target.kind !== "caret")
      || (["delete-event", "update-event"].includes(operation) && editor.target.kind !== "event")
      || (operation === "delete-range" && editor.target.kind !== "event")
      || (operation === "paste" && editor.target.kind === "unavailable")
      || (["insert-measure", "remove-measure", "set-measure-meter", "set-key-signature", "set-staff-clef"].includes(operation) && editor.target.kind === "unavailable")
      || editor.transaction.kind !== "idle") return fail("not-ready");
    editor = transitionEditor(editor, { type: "submit", operation, requestId });
  });
  const finishEdit = (requestId, target) => {
    if (disposed) return;
    const next = transitionEditor(editor, { type: "commit", requestId, target });
    if (next !== editor) range = null;
    editor = next; publish();
  };
  const rejectEdit = requestId => {
    if (disposed) return;
    editor = transitionEditor(editor, { type: "reject", requestId, retryable: false }); publish();
  };
  const cancelEdit = requestId => {
    if (disposed || editor.transaction.kind !== "applying" || editor.transaction.requestId !== requestId) return;
    editor = transitionEditor(transitionEditor(editor, { type: "reject", requestId, retryable: false }), { type: "dismiss-failure" });
    publish();
  };
  return Object.freeze({
    read: Object.freeze({ snapshot: () => state, subscribe(listener) {
      if (disposed || typeof listener !== "function") throw new TypeError("无效的谱面选择订阅");
      let active = true;
      const deliver = () => { if (active && !disposed) return listener(state); };
      listeners.add(deliver);
      return () => { active = false; listeners.delete(deliver); };
    } }),
    select: (payload = {}) => !payloadFor(payload, ["eventId", "sourceRevision", "extend"])
      || (payload.extend !== undefined && typeof payload.extend !== "boolean") ? fail("invalid-payload")
      : accept(payload.sourceRevision, () => select(payload.eventId, payload.extend)),
    locate: (payload = {}) => !payloadFor(payload, ["measureId", "offsetUnits", "sourceRevision", "preferredPitch"]) ? fail("invalid-payload")
      : accept(payload.sourceRevision, () => {
      const { measureId, offsetUnits } = payload;
      if (typeof measureId !== "string" || !Number.isFinite(offsetUnits) || offsetUnits < 0) return fail("invalid-payload");
      if (payload.preferredPitch !== undefined && (!payloadFor(payload.preferredPitch, ["step", "octave", "alter"])
        || !isEventProperties({ duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: payload.preferredPitch } }))) return fail("invalid-payload");
      const point = scoreEditPoints(source).find(item => item.measureId === measureId && item.offsetUnits === offsetUnits);
      if (!point) return fail("missing-position");
      const next = transitionEditor(editor, { type: "locate", point: payload.preferredPitch
        ? { ...point, preferredPitch: { ...payload.preferredPitch } } : point });
      if (next !== editor) range = null;
      editor = next;
    }),
    navigate: (payload = {}) => !payloadFor(payload, ["key", "sourceRevision", "extend"])
      || (payload.extend !== undefined && typeof payload.extend !== "boolean") ? fail("invalid-payload")
      : accept(payload.sourceRevision, () => {
      const { key } = payload;
      if (!SCORE_NAVIGATION_KEYS.includes(key)) return fail("invalid-payload");
      if (payload.extend && !["ArrowLeft", "ArrowRight"].includes(key)) return fail("invalid-payload");
      if (editor.transaction.kind === "applying") return;
      const target = editor.target;
      const result = interaction.navigate({ kind: "key-press", key, modifiers: payload.extend ? ["shift"] : [], repeat: false }, {
        view: source, point: target.kind === "unavailable" ? null : target.point,
        selectedEventId: target.kind === "event" ? target.eventId : null, rangeSelection: range,
        composingPitch: editor.composition.kind === "composing",
      });
      if (result?.cancelComposition) editor = transitionEditor(editor, { type: "cancel-composition" });
      if (result?.action?.kind === "clear-range") { range = null; return; }
      if (result?.action?.kind === "cancel-composition") { editor = transitionEditor(editor, { type: "cancel-composition" }); return; }
      if (result?.action?.kind === "select-range") {
        const next = result.action.selection;
        select(next.focusEventId); range = next; return;
      }
      if (result?.action?.kind === "select-event") return select(result.action.eventId);
      if (result?.action?.kind === "locate") { range = null; editor = transitionEditor(editor, { type: "locate", point: result.action.point }); }
    }),
    // Trusted internal input coordinator only; these are not public UI commands.
    compose(methodId, draft) { if (!disposed) { editor = transitionEditor(editor, { type: "compose", methodId, draft }); publish(); } },
    cancelComposition() { if (!disposed) { editor = transitionEditor(editor, { type: "cancel-composition" }); publish(); } },
    beginEdit, finishEdit, rejectEdit, cancelEdit,
    // Compatibility aliases keep the original input controller boundary stable.
    beginInput: (requestId, sourceRevision) => beginEdit(requestId, "insert-event", sourceRevision),
    finishInput: (requestId, target) => finishEdit(requestId, target),
    rejectInput: requestId => rejectEdit(requestId),
    dispose() {
      if (disposed) return;
      disposed = true;
      try { stop(); } finally { listeners.clear(); source = null; editor = initialEditorState(null); publish(); }
    },
  });
}
