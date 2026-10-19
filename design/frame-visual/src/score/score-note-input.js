import { ACCIDENTAL_STATES, accidentalForEvent, alterForAccidental, equalEventProperties, inheritedAlterAtPoint,
  inheritedAlterBeforeEvent, isEventProperties, keySignatureAlterForStep, keySignatureFifthsAtMeasure,
  reconcileScoreFocus, resolveNoteOverview, scoreIntentToAction, selectedNoteAction,
  staffInteractionBinding, stepInputDuration } from "../vendor/score-interaction.js";
import { ScoreClipboard, createScoreClipboardFragment, eventEndPoint, eventStartPoint,
  isScoreClipboardFragmentV1, resolveScoreEventRange, singleEventRange, SCORE_CLIPBOARD_EVENT_LIMIT } from "../vendor/score-interaction.js";
import { notifyObservers } from "../runtime/runtime-support.js";
import { equalMeter, isMeterInput, measureMeterTargets } from "../vendor/score-interaction.js";
import { keySignatureStateAtMeasure, keySignatureChangeIsNoOp, isKeySignatureChangeInput } from "../vendor/score-interaction.js";
import { STAFF_CLEFS } from "../vendor/score-interaction.js";
import { isDocumentMetadataInput, documentMetadataKey, normalizeDocumentMetadata } from "../vendor/score-interaction.js";
import { SCORE_INPUT_KEY_BUFFER_LIMIT } from "../contracts/score-note-input.js";

const fields = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).every(key => keys.includes(key));

/** One edit lifetime. The document session remains the only accepted score owner. */
export function createScoreNoteInput({ score, selection, actions, interaction = staffInteractionBinding,
  clipboard = new ScoreClipboard(), createId = () => crypto.randomUUID() }) {
  let disposed = false, pending = null, duration = Object.freeze({ base: 4, dots: 0 }), message = null;
  let clipboardPending = null, visible = true, accidental = "none", rest = false;
  let keys = [], keyContext = null, draining = false, committing = false, drainScheduled = false;
  const listeners = new Set();
  const publish = () => notifyObservers(listeners);
  function selected(state) {
    if (state.target.kind !== "event") return null;
    const view = score.snapshot(), measure = view?.kind === "staff"
      ? view.measures.find(item => item.id === state.target.point.measureId) : null;
    const event = measure?.events.find(item => item.id === state.target.eventId);
    if (!event) return null;
    const baseline = event.content.kind === "note"
      ? keySignatureAlterForStep(keySignatureFifthsAtMeasure(view, measure.id), event.content.pitch.step) : 0;
    const overview = resolveNoteOverview({ duration, alter: 0, accidental: "none", rest: false, draft: null, pitch: null },
      event, measure.meter, accidentalForEvent(measure, event.id, baseline));
    return { event, measure, baseline, overview };
  }
  function ready(state, port, duringClipboard = false) {
    const document = actions?.snapshot?.();
    return !disposed && visible && !pending && (draining || !keys.length) && (!clipboardPending || duringClipboard) && state.available && state.transaction.kind === "idle"
      && typeof actions?.[port] === "function" && !!state.documentId && Number.isSafeInteger(state.documentVersion)
      && (!document || (!document.busy && document.status === "ready" && document.documentId === state.documentId
        && document.documentVersion === state.documentVersion));
  }
  const pickedRange = state => resolveScoreEventRange(score.snapshot(), state.rangeSelection)
    ?? singleEventRange(score.snapshot(), state.target.kind === "event" ? state.target.eventId : null);
  const rangeAction = range => ({ kind: "delete-range", range: { measureId: range.measure.id,
    voiceId: range.measure.voiceId, startEventId: range.eventIds[0], endEventId: range.eventIds.at(-1) } });
  function canClipboard(kind, state = selection.read.snapshot()) {
    if (!ready(state, kind === "cut" ? "deleteRange" : kind === "paste" ? "pasteFragment" : "append")
      || state.composition.kind !== "idle") return false;
    if (kind === "paste") return state.target.kind !== "unavailable";
    const range = pickedRange(state); return !!range && range.events.length <= SCORE_CLIPBOARD_EVENT_LIMIT;
  }
  const snapshot = () => {
    const state = selection.read.snapshot(), value = selected(state), document = actions?.snapshot?.();
    const view = score.snapshot(), measure = state.target.kind !== "unavailable" && view?.kind === "staff"
      ? view.measures.find(item => item.id === state.target.point.measureId) : null;
    const overview = state.target.kind === "caret" ? resolveNoteOverview({ duration, accidental, rest,
      alter: state.target.point.preferredPitch ? alterForAccidental(accidental,
        inheritedAlterAtPoint(view, state.target.point, state.target.point.preferredPitch)) : alterForAccidental(accidental, 0),
      draft: interaction.readDraft(state.composition), pitch: state.target.point.preferredPitch }, undefined, measure?.meter) : null;
    return Object.freeze({ pending: pending !== null || clipboardPending !== null, queuedKeys: keys.length, duration, accidental, rest, message,
      tool: overview ? Object.freeze({ sourceRevision: state.sourceRevision, selectionRevision: state.selectionRevision,
        disabled: !ready(state, "append"), overview: Object.freeze({ ...overview, duration,
          pitch: overview.pitch ? Object.freeze({ ...overview.pitch }) : null }) }) : null,
      metadata: document?.metadata && document.documentId === state.documentId && document.documentVersion === state.documentVersion
        ? Object.freeze({ ...document.metadata, documentId: state.documentId, documentVersion: state.documentVersion,
          sourceRevision: state.sourceRevision,
          disabled: !ready(state, "setDocumentMetadata") || state.composition.kind !== "idle" }) : null,
      staffClef: measure ? Object.freeze({ staffId: view.staffId, clef: view.clef,
        sourceRevision: state.sourceRevision, selectionRevision: state.selectionRevision,
        disabled: !ready(state, "setStaffClef") || state.composition.kind !== "idle" }) : null,
      keySignature: measure ? Object.freeze({ partId: view.partId, measureId: measure.id,
        sourceRevision: state.sourceRevision, selectionRevision: state.selectionRevision,
        ...keySignatureStateAtMeasure(view, measure.id),
        disabled: !ready(state, "setKeySignature") || state.composition.kind !== "idle" }) : null,
      measure: measure ? Object.freeze({ measureId: measure.id, sourceRevision: state.sourceRevision,
        selectionRevision: state.selectionRevision, meter: Object.freeze({ ...measure.meter }),
        disabled: !ready(state, "editMeasure") || state.composition.kind !== "idle",
        canRemove: view.measures.length > 1, meterRunCount: measureMeterTargets(view.measures, measure.id, "meter-run").length }) : null,
      clipboard: Object.freeze({ copy: canClipboard("copy", state), cut: canClipboard("cut", state), paste: canClipboard("paste", state) }),
      draft: interaction.readDraft(state.composition),
      selected: value ? Object.freeze({ eventId: value.event.id, sourceRevision: state.sourceRevision,
        disabled: !ready(state, "setEventProperties") || state.composition.kind !== "idle" || (state.range?.eventIds.length ?? 0) > 1,
        overview: Object.freeze({ ...value.overview, duration: Object.freeze({ ...value.overview.duration }),
          pitch: value.overview.pitch ? Object.freeze({ ...value.overview.pitch }) : null }) }) : null });
  };
  function reject(item, text) {
    if (disposed || pending !== item) return;
    clearKeys(); pending = null; message = text; selection.rejectEdit(item.request.requestId); publish();
  }
  const keyStamp = state => ({ documentId: state.documentId, documentVersion: state.documentVersion,
    sourceRevision: state.sourceRevision, selectionRevision: state.selectionRevision });
  const matchesStamp = state => keyContext && Object.entries(keyContext).every(([key, value]) => state[key] === value);
  function clearKeys() { keys = []; keyContext = null; }
  function cancelKeys() { clearKeys(); if (pending) pending.cancelKeys = true; }
  function checkKeys() {
    if (!keys.length || committing || draining) return;
    const state = selection.read.snapshot(), document = actions?.snapshot?.();
    if (!visible || !state.available || (document && document.status !== "ready"
      && !(pending?.request.action.kind === "append" && document.busy && document.status === "loading"))
      || (pending ? state.documentId !== pending.request.documentId || pending.request.action.kind !== "append"
        : !matchesStamp(state) || state.target.kind !== "caret" || state.transaction.kind !== "idle")) cancelKeys();
  }
  function scheduleKeys() {
    if (!keys.length || pending || disposed || drainScheduled) return;
    drainScheduled = true;
    queueMicrotask(() => {
      drainScheduled = false; checkKeys();
      if (!keys.length || pending || disposed) return;
      draining = true;
      try {
        while (keys.length && !pending && !disposed) {
          const state = selection.read.snapshot();
          if (!matchesStamp(state) || !ready(state, "append") || state.target.kind !== "caret") { clearKeys(); break; }
          const key = keys.shift(), result = caretKey(state, key);
          const next = selection.read.snapshot();
          if (!result.ok || next.documentId !== state.documentId || next.documentVersion !== state.documentVersion
            || next.sourceRevision !== state.sourceRevision || next.selectionRevision > state.selectionRevision + 1) {
            clearKeys(); break;
          }
          keyContext = keyStamp(next);
        }
      } finally { draining = false; if (!keys.length) keyContext = null; publish(); }
    });
  }
  function finish() {
    if (!pending || disposed) return;
    const item = pending, state = selection.read.snapshot();
    if (state.documentId !== item.request.documentId || state.transaction.requestId !== item.request.requestId) {
      clearKeys(); pending = null; message = null; publish(); return;
    }
    if (!item.after) return;
    if (!state.available) { reject(item, "编辑已接受，谱面读取暂不可用；请重新读取"); return; }
    if (state.documentVersion < item.after.documentVersion) return;
    if (state.documentVersion !== item.after.documentVersion) { reject(item, "作品已继续改变，请重新定位"); return; }
    const result = item.request.action.kind === "set-document-metadata" && !item.point
      ? { target: { kind: "unavailable" } }
      : reconcileScoreFocus(item.before, item.after, item.request.action, item.point, item.selectedEventId);
    pending = null; message = item.successMessage;
    committing = true;
    try { selection.finishEdit(item.request.requestId, result.target); } finally { committing = false; }
    const next = selection.read.snapshot();
    if (item.request.action.kind !== "append" || next.documentId !== item.request.documentId
      || next.documentVersion !== item.after.documentVersion || next.target.kind !== "caret"
      || next.selectionRevision !== state.selectionRevision + 1) clearKeys();
    else keyContext = keyStamp(next);
    publish(); scheduleKeys();
  }
  const stop = selection.read.subscribe(() => { finish(); checkKeys(); publish(); });
  const stopActions = actions?.subscribeState?.(() => { checkKeys(); publish(); });
  function submit(action, operation, port, state, point = state.target.point, successMessage = null) {
    if (!action) return { ok: false, code: "score.input.invalid-action" };
    const request = { requestId: createId(), documentId: state.documentId, expectedVersion: state.documentVersion, action };
    const item = { request, point, selectedEventId: state.target.kind === "event" ? state.target.eventId : null,
      before: { notation: score.snapshot() }, after: null, successMessage };
    // Own the request before submit notifies observers, which may synchronously dispose us.
    pending = item;
    const result = selection.beginEdit(request.requestId, operation, state.sourceRevision);
    if (!result.ok) { pending = null; return result; }
    publish();
    void Promise.resolve().then(() => {
      if (disposed || pending !== item) return null;
      if (!visible) {
        // Nothing has reached the host yet. End the local transaction without creating a failure or clearing the range.
        clearKeys(); pending = null; message = null; selection.cancelEdit(request.requestId); publish(); return null;
      }
      return actions[port](request);
    }).then(result => {
      if (disposed || pending !== item || !result) return;
      if (!result.ok || !result.session) { reject(item, result.message ?? "编辑失败，请重新读取"); return; }
      item.after = result.session; finish();
    }).catch(error => reject(item, error?.message ?? "编辑失败，请重新读取"));
    return { ok: true, handled: true, pending: true };
  }
  function changeSelected(change, state) {
    const port = change.kind === "rest" ? "deleteEvent" : "setEventProperties";
    if (!ready(state, port) || (state.range?.eventIds.length ?? 0) > 1) return { ok: false, code: "score.input.not-ready" };
    const value = selected(state);
    if (!value) return { ok: false, code: "score.input.not-ready" };
    const concrete = change.kind === "accidental" ? { kind: "alter", value: alterForAccidental(change.value,
      value.event.content.kind === "note" ? inheritedAlterBeforeEvent(value.measure, value.event.id,
        value.event.content.pitch, value.baseline) : 0) } : change;
    const action = selectedNoteAction(value.event, concrete);
    if (action?.kind === "delete-event") return submit(action, "delete-event", "deleteEvent", state);
    if (action?.kind !== "set-event-properties" || !isEventProperties(action.properties)) {
      return { ok: false, code: "score.input.invalid-change" };
    }
    message = null;
    if (equalEventProperties(value.event, action.properties)) { publish(); return { ok: true, handled: true, changed: false }; }
    return submit(scoreIntentToAction({ kind: "update-event", eventId: action.eventId, properties: action.properties },
      state.target.point), "update-event", "setEventProperties", state);
  }
  function selectedKey(state, key, repeat) {
    const value = selected(state);
    if (!value) return { ok: false, code: "score.input.not-ready" };
    const output = interaction.edit({ kind: "key-press", key, repeat, modifiers: [] }, {
      view: score.snapshot(), point: state.target.point, selectedEvent: value.event,
      selectedMeasureId: value.measure.id, canDelete: typeof actions?.deleteEvent === "function",
      activeStep: interaction.readDraft(state.composition), selectedRange: state.range
        ? rangeAction(pickedRange(state)).range : null, overview: value.overview,
    });
    if (!output?.handled) return { ok: true, handled: false };
    if (repeat || !output.action) return { ok: true, handled: true };
    if (pending || clipboardPending) return { ok: true, handled: true, code: "score.input.busy" };
    const action = output.action;
    const port = action.kind === "delete-range" ? "deleteRange" : action.kind === "delete-event" || (action.kind === "change" && action.change.kind === "rest")
      ? "deleteEvent" : "setEventProperties";
    // Cancelling a draft requires no write port.
    if (action.kind === "cancel-composition") { selection.cancelComposition(); message = null; publish(); return { ok: true, handled: true }; }
    if (!ready(state, port)) return { ok: false, code: "score.input.not-ready" };
    if (action.kind === "delete-range") return submit(action, "delete-range", "deleteRange", state,
      eventStartPoint(score.snapshot(), action.range.startEventId));
    if ((state.range?.eventIds.length ?? 0) > 1) return { ok: false, code: "score.input.not-ready" };
    message = null;
    if (action.kind === "compose-pitch") {
      const composition = interaction.startComposition(action.step);
      if (!composition) return { ok: false, code: "score.input.strategy-unavailable" };
      selection.compose(composition.methodId, composition.draft); publish(); return { ok: true, handled: true };
    }
    const edit = action.kind === "delete-event" ? scoreIntentToAction({ kind: "delete-event", eventId: action.eventId, timePolicy: "preserve" }, state.target.point)
      : action.kind === "change" && action.change.kind === "rest" ? selectedNoteAction(value.event, action.change) : null;
    if (edit?.kind === "delete-event") return submit(edit, "delete-event", "deleteEvent", state);
    if (action.kind === "change" && action.change.kind !== "rest") return changeSelected(action.change, state);
    return { ok: true, handled: true };
  }
  function clipboardCommand(kind, payload = {}) {
    if (disposed) return { ok: false, code: "score.input.disposed" };
    if (!["copy", "cut", "paste"].includes(kind) || !fields(payload, ["sourceRevision", "selectionRevision"])) {
      return { ok: false, code: "score.input.invalid-payload" };
    }
    const state = selection.read.snapshot();
    if (Object.keys(payload).length && (payload.sourceRevision !== state.sourceRevision || payload.selectionRevision !== state.selectionRevision)) {
      return { ok: false, code: "score.input.stale" };
    }
    if (!canClipboard(kind, state)) return { ok: false, code: "score.input.not-ready" };
    const range = kind === "paste" ? null : pickedRange(state);
    const point = kind === "paste" && state.target.kind === "event"
      ? eventEndPoint(score.snapshot(), state.target.eventId, state.target.point.preferredPitch) : state.target.point;
    if (!point) return { ok: false, code: "score.input.not-ready" };
    const item = { kind, state, point, range };
    clipboardPending = item; message = null; publish();
    void Promise.resolve().then(() => {
      if (disposed || !visible || clipboardPending !== item) return null;
      return kind === "paste" ? clipboard.read() : clipboard.write(createScoreClipboardFragment(range.events));
    }).then(fragment => {
      if (disposed || clipboardPending !== item) return;
      const current = selection.read.snapshot();
      const same = visible && current.documentId === state.documentId && current.documentVersion === state.documentVersion
        && current.sourceRevision === state.sourceRevision && current.selectionRevision === state.selectionRevision
        && ready(current, kind === "cut" ? "deleteRange" : kind === "paste" ? "pasteFragment" : "append", true);
      clipboardPending = null;
      if (!same) { message = "选择或作品已改变，未继续剪切或粘贴"; publish(); return; }
      if (kind === "copy") { message = clipboard.scope === "session" ? "已复制，仅当前谱面会话可粘贴" : "已复制到系统剪贴板"; publish(); return; }
      if (kind === "cut") {
        submit(rangeAction(range), "delete-range", "deleteRange", current, eventStartPoint(score.snapshot(), range.eventIds[0]),
          clipboard.scope === "session" ? "已剪切，片段仅在当前谱面会话可用" : "已剪切到系统剪贴板");
      } else if (isScoreClipboardFragmentV1(fragment)) {
        submit(scoreIntentToAction({ kind: "paste", measureId: point.measureId, voiceId: point.voiceId,
          anchor: point.anchor, offsetUnits: point.offsetUnits, fragment }, point), "paste", "pasteFragment", current, point,
          clipboard.scope === "session" ? "已从当前谱面会话粘贴" : "已从系统剪贴板粘贴");
      } else { message = "剪贴板没有可粘贴的音乐片段"; publish(); }
    }).catch(error => {
      if (!disposed && clipboardPending === item) { clipboardPending = null; message = error?.message ?? "剪贴板操作失败"; publish(); }
    });
    return { ok: true, handled: true, pending: true };
  }
  function caretKey(state, key) {
    message = null;
    if (["+", "=", "-", "_", "."].includes(key)) {
      duration = Object.freeze(key === "." ? { ...duration, dots: duration.dots ? 0 : 1 }
        : stepInputDuration(duration, ["+", "="].includes(key) ? 1 : -1));
      publish(); return { ok: true, handled: true };
    }
    const output = interaction.translate({ kind: "key-press", key, repeat: false, modifiers: [] }, {
      focusScope: "score", target: "caret", notationKind: interaction.notationKind, capabilities: ["compose", "insert"],
      composing: state.composition.kind === "composing", composition: state.composition, duration, rest,
      resolveAlter: pitch => alterForAccidental(accidental, inheritedAlterAtPoint(score.snapshot(), state.target.point, pitch)),
    });
    if (!output) return { ok: false, code: "score.input.strategy-unavailable" };
    if (output.kind === "compose") { rest = false; selection.compose(output.methodId, output.draft); message = output.message ?? null; publish(); }
    else if (output.kind === "cancel-composition") { selection.cancelComposition(); message = output.message ?? null; publish(); }
    else if (output.kind === "intent") {
      rest = output.intent.event.content.kind === "rest";
      const point = rest ? state.target.point : { ...state.target.point, preferredPitch: output.intent.event.content.pitch };
      return submit(scoreIntentToAction(output.intent, point), "insert-event", "append", state, point);
    }
    return { ok: true, handled: true };
  }
  return Object.freeze({
    read: Object.freeze({ snapshot, subscribe(listener) {
      if (disposed || typeof listener !== "function") throw new TypeError("无效的输入状态订阅");
      let active = true;
      const deliver = () => { if (active && !disposed) return listener(snapshot()); }; listeners.add(deliver);
      return () => { active = false; listeners.delete(deliver); };
    } }),
    canClipboard, clipboard: clipboardCommand,
    tool(payload) {
      if (disposed) return { ok: false, code: "score.input.disposed" };
      if (!fields(payload, ["sourceRevision", "selectionRevision", "change"]) || !fields(payload.change, ["kind", "value"])) {
        return { ok: false, code: "score.input.invalid-payload" };
      }
      const state = selection.read.snapshot(), change = payload.change;
      if (!Number.isSafeInteger(payload.sourceRevision) || payload.sourceRevision !== state.sourceRevision
        || !Number.isSafeInteger(payload.selectionRevision) || payload.selectionRevision !== state.selectionRevision) return { ok: false, code: "score.input.stale" };
      const valid = change.kind === "duration" ? fields(change.value, ["base", "dots"]) && change.value.base !== 32
        && isEventProperties({ duration: change.value, content: { kind: "rest" } })
        : change.kind === "accidental" ? ACCIDENTAL_STATES.includes(change.value)
        : change.kind === "rest" && typeof change.value === "boolean";
      if (!valid) return { ok: false, code: "score.input.invalid-payload" };
      if (state.target.kind !== "caret" || !ready(state, "append") || (rest && change.kind === "accidental")) return { ok: false, code: "score.input.not-ready" };
      if (change.kind === "duration") duration = Object.freeze({ ...change.value });
      else if (change.kind === "accidental") accidental = change.value;
      else { rest = change.value; selection.cancelComposition(); }
      message = null; publish(); return { ok: true, handled: true };
    },
    pointer(payload) {
      if (disposed) return { ok: false, code: "score.input.disposed" };
      if (!fields(payload, ["sourceRevision", "measureId", "offsetUnits", "pitch", "writeNow"])
        || !fields(payload.pitch, ["step", "octave", "alter"]) || typeof payload.writeNow !== "boolean"
        || !isEventProperties({ duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: payload.pitch } })) {
        return { ok: false, code: "score.input.invalid-payload" };
      }
      const state = selection.read.snapshot();
      if (payload.sourceRevision !== state.sourceRevision) return { ok: false, code: "score.input.stale" };
      if (!ready(state, "append")) return { ok: false, code: "score.input.not-ready" };
      // Locating notifies observers. Capture both the pointer intent and tools first.
      const { sourceRevision, measureId, offsetUnits, writeNow } = payload, pointerPitch = { ...payload.pitch };
      const tools = { duration, rest, accidental };
      const result = selection.locate({ measureId, offsetUnits, sourceRevision, preferredPitch: pointerPitch });
      if (!result.ok) return result;
      const located = selection.read.snapshot();
      if (!ready(located, "append") || located.sourceRevision !== sourceRevision || located.target.kind !== "caret"
        || located.documentId !== state.documentId || located.documentVersion !== state.documentVersion
        || located.selectionRevision !== state.selectionRevision + 1
        || located.target.point.measureId !== measureId || located.target.point.offsetUnits !== offsetUnits) {
        return { ok: false, code: "score.input.stale" };
      }
      if (!writeNow) return { ok: true, handled: true };
      const pitch = { ...pointerPitch, alter: alterForAccidental(tools.accidental,
        inheritedAlterAtPoint(score.snapshot(), located.target.point, pointerPitch)) };
      const point = tools.rest ? located.target.point : { ...located.target.point, preferredPitch: pitch };
      return submit(scoreIntentToAction({ kind: "insert-event", event: { duration: tools.duration, content: tools.rest
        ? { kind: "rest" } : { kind: "note", pitch } } }, point), "insert-event", "append", located, point);
    },
    metadata(payload) {
      if (disposed) return { ok: false, code: "score.input.disposed" };
      if (!fields(payload, ["documentId", "documentVersion", "sourceRevision", "metadata"])
        || !isDocumentMetadataInput(payload.metadata)) return { ok: false, code: "score.input.invalid-payload" };
      const state = selection.read.snapshot(), document = actions?.snapshot?.();
      if (!Number.isSafeInteger(payload.sourceRevision) || payload.sourceRevision !== state.sourceRevision
        || payload.documentId !== state.documentId || payload.documentVersion !== state.documentVersion) {
        return { ok: false, code: "score.input.stale" };
      }
      if (!ready(state, "setDocumentMetadata") || !document?.metadata || state.composition.kind !== "idle") {
        return { ok: false, code: "score.input.not-ready" };
      }
      message = null;
      if (documentMetadataKey(payload.metadata) === documentMetadataKey(document.metadata)) {
        publish(); return { ok: true, handled: true, changed: false };
      }
      const intent = { kind: "document", action: { kind: "set-document-metadata", metadata: normalizeDocumentMetadata(payload.metadata) } };
      return submit(scoreIntentToAction(intent, null), "document", "setDocumentMetadata", state,
        state.target.kind === "unavailable" ? null : state.target.point);
    },
    staffClef(payload) {
      if (disposed) return { ok: false, code: "score.input.disposed" };
      if (!fields(payload, ["staffId", "sourceRevision", "selectionRevision", "clef"])
        || typeof payload.staffId !== "string" || !payload.staffId || !STAFF_CLEFS.includes(payload.clef)) {
        return { ok: false, code: "score.input.invalid-payload" };
      }
      const state = selection.read.snapshot(), view = score.snapshot();
      if (!Number.isSafeInteger(payload.sourceRevision) || payload.sourceRevision !== state.sourceRevision
        || !Number.isSafeInteger(payload.selectionRevision) || payload.selectionRevision !== state.selectionRevision
        || state.target.kind === "unavailable" || view?.kind !== "staff" || payload.staffId !== view.staffId) {
        return { ok: false, code: "score.input.stale" };
      }
      if (!ready(state, "setStaffClef") || state.composition.kind !== "idle") return { ok: false, code: "score.input.not-ready" };
      message = null;
      if (payload.clef === view.clef) { publish(); return { ok: true, handled: true, changed: false }; }
      const intent = { kind: "set-staff-clef", staffId: payload.staffId, clef: payload.clef };
      return submit(scoreIntentToAction(intent, state.target.point), intent.kind, "setStaffClef", state);
    },
    keySignature(payload) {
      if (disposed) return { ok: false, code: "score.input.disposed" };
      if (!fields(payload, ["partId", "measureId", "sourceRevision", "selectionRevision", "change"])
        || typeof payload.partId !== "string" || !payload.partId || typeof payload.measureId !== "string" || !payload.measureId
        || !isKeySignatureChangeInput(payload.change)) return { ok: false, code: "score.input.invalid-payload" };
      const state = selection.read.snapshot(), view = score.snapshot();
      if (!Number.isSafeInteger(payload.sourceRevision) || payload.sourceRevision !== state.sourceRevision
        || !Number.isSafeInteger(payload.selectionRevision) || payload.selectionRevision !== state.selectionRevision
        || state.target.kind === "unavailable" || payload.measureId !== state.target.point.measureId
        || view?.kind !== "staff" || payload.partId !== view.partId
        || !view.measures.some(measure => measure.id === payload.measureId)) return { ok: false, code: "score.input.stale" };
      if (!ready(state, "setKeySignature") || state.composition.kind !== "idle") return { ok: false, code: "score.input.not-ready" };
      message = null;
      if (keySignatureChangeIsNoOp(view, payload.measureId, payload.change)) { publish(); return { ok: true, handled: true, changed: false }; }
      const intent = { kind: "set-key-signature", partId: payload.partId, measureId: payload.measureId, change: { ...payload.change } };
      return submit(scoreIntentToAction(intent, state.target.point), intent.kind, "setKeySignature", state);
    },
    measure(payload) {
      if (disposed) return { ok: false, code: "score.input.disposed" };
      if (!fields(payload, ["measureId", "sourceRevision", "selectionRevision", "change"])
        || typeof payload.measureId !== "string" || !fields(payload.change, ["kind", "position", "meter", "scope"])) {
        return { ok: false, code: "score.input.invalid-payload" };
      }
      const state = selection.read.snapshot(), change = payload.change;
      if (!Number.isSafeInteger(payload.sourceRevision) || payload.sourceRevision !== state.sourceRevision
        || !Number.isSafeInteger(payload.selectionRevision) || payload.selectionRevision !== state.selectionRevision
        || state.target.kind === "unavailable" || payload.measureId !== state.target.point.measureId) {
        return { ok: false, code: "score.input.stale" };
      }
      const valid = change.kind === "insert" ? fields(change, ["kind", "position"]) && ["before", "after"].includes(change.position)
        : change.kind === "remove" ? fields(change, ["kind"])
        : change.kind === "meter" && fields(change, ["kind", "meter", "scope"])
          && fields(change.meter, ["numerator", "denominator"]) && isMeterInput(change.meter) && ["measure", "meter-run"].includes(change.scope);
      if (!valid) return { ok: false, code: "score.input.invalid-payload" };
      if (!ready(state, "editMeasure") || state.composition.kind !== "idle") return { ok: false, code: "score.input.not-ready" };
      const view = score.snapshot(), measure = view.measures.find(item => item.id === payload.measureId);
      if (!measure) return { ok: false, code: "score.input.stale" };
      if (change.kind === "remove" && view.measures.length <= 1) return { ok: false, code: "score.input.measure-required" };
      if (change.kind === "meter" && equalMeter(measure.meter, change.meter)) return { ok: true, handled: true, changed: false };
      if (change.kind === "meter" && measureMeterTargets(view.measures, measure.id, change.scope).length > 100) {
        return { ok: false, code: "score.input.measure-budget" };
      }
      const intent = change.kind === "insert" ? { kind: "insert-measure", measureId: measure.id, position: change.position }
        : change.kind === "remove" ? { kind: "remove-measure", measureId: measure.id }
        : { kind: "set-measure-meter", measureId: measure.id, meter: { ...change.meter }, scope: change.scope };
      message = null;
      return submit(scoreIntentToAction(intent, state.target.point), intent.kind, "editMeasure", state);
    },
    setVisible(value) { visible = value === true; if (!visible) { clipboardPending = null; cancelKeys(); } publish(); },
    change(payload) {
      if (disposed) return { ok: false, code: "score.input.disposed" };
      if (!fields(payload, ["eventId", "sourceRevision", "change"]) || typeof payload.eventId !== "string"
        || !fields(payload.change, ["kind", "value"])) return { ok: false, code: "score.input.invalid-payload" };
      const state = selection.read.snapshot();
      if (!Number.isSafeInteger(payload.sourceRevision) || payload.sourceRevision !== state.sourceRevision
        || state.target.kind !== "event" || state.target.eventId !== payload.eventId) return { ok: false, code: "score.input.stale" };
      const change = payload.change, value = selected(state);
      const valid = change.kind === "accidental" ? ACCIDENTAL_STATES.includes(change.value)
        : change.kind === "rest" ? typeof change.value === "boolean"
        : change.kind === "duration" ? fields(change.value, ["base", "dots"]) && value
          && isEventProperties({ duration: change.value, content: value.event.content })
        : change.kind === "pitch" ? fields(change.value, ["step", "octave", "alter"])
          && isEventProperties({ duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: change.value } }) : false;
      if (!valid) return { ok: false, code: "score.input.invalid-payload" };
      return changeSelected(change, state);
    },
    key(payload) {
      if (disposed) return { ok: false, code: "score.input.disposed" };
      if (!fields(payload, ["key", "repeat", "sourceRevision"]) || typeof payload.key !== "string"
        || typeof payload.repeat !== "boolean") return { ok: false, code: "score.input.invalid-payload" };
      const state = selection.read.snapshot();
      if (!Number.isSafeInteger(payload.sourceRevision) || payload.sourceRevision !== state.sourceRevision) return { ok: false, code: "score.input.stale" };
      if (["Escape", "ArrowLeft", "ArrowRight", "Home", "End"].includes(payload.key)) {
        const cancelled = keys.length > 0; cancelKeys();
        if (cancelled) { message = "已取消尚未提交的输入"; publish(); if (payload.key === "Escape") return { ok: true, handled: true }; }
      }
      if (payload.key === "Escape" && !state.range && state.composition.kind === "composing") {
        selection.cancelComposition(); message = null; publish(); return { ok: true, handled: true };
      }
      if (state.target.kind === "event") return selectedKey(state, payload.key, payload.repeat);
      const recognized = /^[a-gr0-9]$/i.test(payload.key) || ["Backspace", "+", "=", "-", "_", "."].includes(payload.key);
      if (!recognized) return { ok: true, handled: false };
      if (payload.repeat) return { ok: true, handled: true };
      if (pending?.cancelKeys) return { ok: true, handled: true, code: "score.input.cancelled" };
      if (state.target.kind === "caret" && (keys.length || pending?.request.action.kind === "append")
        && visible && state.available && (!actions?.snapshot || actions.snapshot().status === "ready"
          || (pending?.request.action.kind === "append" && actions.snapshot().busy && actions.snapshot().status === "loading"))) {
        if (keys.length >= SCORE_INPUT_KEY_BUFFER_LIMIT) {
          cancelKeys(); message = "输入过快，未继续提交；请确认当前位置后输入"; publish();
          return { ok: true, handled: true, code: "score.input.buffer-full" };
        }
        keys.push(payload.key); keyContext ??= keyStamp(state); publish(); scheduleKeys();
        return { ok: true, handled: true, queued: true };
      }
      if (pending || clipboardPending) return { ok: true, handled: true, code: "score.input.busy" };
      if (state.target.kind !== "caret" || !ready(state, "append")) return { ok: false, code: "score.input.not-ready" };
      return caretKey(state, payload.key);
    },
    dispose() { if (disposed) return; disposed = true; stop(); stopActions?.(); clearKeys(); pending = null; clipboardPending = null; clipboard.dispose(); listeners.clear(); },
  });
}
