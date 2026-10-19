// Generated from established pure score interaction sources; run notation:build. Do not edit.

// shared/notation/interaction/editor-machine.ts
function initialEditorState(point2) {
  return {
    target: point2 ? { kind: "caret", point: point2 } : { kind: "unavailable" },
    composition: { kind: "idle" },
    transaction: { kind: "idle" }
  };
}
function transitionEditor(state, event) {
  switch (event.type) {
    case "reset":
      return initialEditorState(event.point);
    case "locate":
      return state.transaction.kind === "applying" || state.transaction.kind === "failed" && state.transaction.retryable ? state : {
        ...state,
        target: { kind: "caret", point: event.point },
        composition: { kind: "idle" },
        transaction: state.transaction.kind === "failed" && !state.transaction.retryable ? { kind: "idle" } : state.transaction
      };
    case "select":
      return state.transaction.kind === "applying" || state.transaction.kind === "failed" && state.transaction.retryable ? state : {
        ...state,
        target: { kind: "event", eventId: event.eventId, point: event.point },
        composition: { kind: "idle" },
        transaction: state.transaction.kind === "failed" && !state.transaction.retryable ? { kind: "idle" } : state.transaction
      };
    case "point-updated":
      return state.target.kind === "unavailable" || state.transaction.kind === "applying" || state.transaction.kind === "failed" && state.transaction.retryable ? state : { ...state, target: { ...state.target, point: event.point } };
    case "compose":
      return state.target.kind === "unavailable" || state.transaction.kind !== "idle" ? state : { ...state, composition: { kind: "composing", methodId: event.methodId, draft: event.draft } };
    case "cancel-composition":
      return { ...state, composition: { kind: "idle" } };
    case "submit":
      return state.target.kind === "unavailable" && event.operation !== "history" && event.operation !== "document" || state.transaction.kind === "applying" || state.transaction.kind === "failed" && state.transaction.retryable ? state : {
        ...state,
        composition: { kind: "idle" },
        transaction: { kind: "applying", operation: event.operation, requestId: event.requestId }
      };
    case "commit":
      return state.transaction.kind === "applying" && state.transaction.requestId === event.requestId ? { ...state, target: event.target ?? state.target, transaction: { kind: "idle" } } : state;
    case "reject":
      return state.transaction.kind === "applying" && state.transaction.requestId === event.requestId ? { ...state, transaction: {
        kind: "failed",
        operation: state.transaction.operation,
        requestId: event.requestId,
        retryable: event.retryable
      } } : state;
    case "retry":
      return state.transaction.kind === "failed" && state.transaction.retryable && state.transaction.requestId === event.requestId ? { ...state, transaction: {
        kind: "applying",
        operation: state.transaction.operation,
        requestId: event.requestId
      } } : state;
    case "dismiss-failure":
      return state.transaction.kind === "failed" && !state.transaction.retryable ? { ...state, transaction: { kind: "idle" } } : state;
  }
}

// shared/notation/note-properties.ts
var record = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var NOTE_BASES = [1, 2, 4, 8, 16];
var PITCH_STEPS = ["C", "D", "E", "F", "G", "A", "B"];
function equalEventProperties(a, b) {
  return a.duration.base === b.duration.base && a.duration.dots === b.duration.dots && (a.content.kind === "rest" ? b.content.kind === "rest" : b.content.kind === "note" && a.content.pitch.step === b.content.pitch.step && a.content.pitch.octave === b.content.pitch.octave && a.content.pitch.alter === b.content.pitch.alter);
}
var METER_DENOMINATORS = [1, 2, 4, 8, 16, 32, 64];
var STAFF_CLEFS = ["treble", "bass", "alto", "tenor"];
function isInputDuration(v) {
  return record(v) && NOTE_BASES.includes(v.base) && (v.dots === 0 || v.dots === 1);
}
function isEventProperties(v) {
  return record(v) && isInputContent(v.content) && (isInputDuration(v.duration) || v.content.kind === "rest" && record(v.duration) && v.duration.base === 32 && v.duration.dots === 0);
}
function isInputContent(v) {
  if (!record(v)) return false;
  if (v.kind === "rest") return true;
  const p = v.pitch;
  return v.kind === "note" && record(p) && PITCH_STEPS.includes(p.step) && typeof p.octave === "number" && Number.isInteger(p.octave) && p.octave >= 2 && p.octave <= 6 && [-1, 0, 1].includes(p.alter);
}
function isMeterInput(value) {
  return record(value) && typeof value.numerator === "number" && Number.isSafeInteger(value.numerator) && value.numerator >= 1 && value.numerator <= 32 && typeof value.denominator === "number" && METER_DENOMINATORS.includes(value.denominator);
}
var durationUnits = (duration) => 64 / duration.base * (duration.dots ? 1.5 : 1);
var capacityUnits = (measure) => 64 * measure.meter.numerator / measure.meter.denominator;

// shared/notation/clef-pitch-range.ts
function clefPitchRange(clef) {
  if (clef === "bass") return { bottom: 18, top: 26 };
  if (clef === "alto") return { bottom: 24, top: 32 };
  if (clef === "tenor") return { bottom: 22, top: 30 };
  return { bottom: 30, top: 38 };
}

// shared/notation/interaction/staff-position.ts
var usedUnits = (measure) => measure.events.reduce((total, event) => total + durationUnits(event.duration), 0);
function nextMeasure(view, measureId) {
  const index = view.measures.findIndex((measure2) => measure2.id === measureId);
  const measure = view.measures[index];
  return measure && usedUnits(measure) >= capacityUnits(measure) ? view.measures[index + 1]?.id ?? measureId : measureId;
}
function pitchAtY(y, staffBottom, spacing, clef = "treble") {
  const diatonic = Math.max(14, Math.min(
    48,
    clefPitchRange(clef).bottom + Math.round((staffBottom - y) / (spacing / 2))
  ));
  return { step: PITCH_STEPS[diatonic % 7], octave: Math.floor(diatonic / 7), alter: 0 };
}
function yForPitch(pitch, staffBottom, spacing, clef = "treble") {
  const diatonic = pitch.octave * 7 + PITCH_STEPS.indexOf(pitch.step);
  return staffBottom - (diatonic - clefPitchRange(clef).bottom) * spacing / 2;
}

// shared/notation/interaction/score-navigation.ts
function point(view, measure, anchor, offsetUnits, preferredPitch2 = null) {
  return { partId: view.partId, staffId: view.staffId, measureId: measure.id, voiceId: measure.voiceId, anchor, offsetUnits, preferredPitch: preferredPitch2 };
}
function sameScoreEditPoint(a, b) {
  if (!a || !b) return a === b;
  return a.partId === b.partId && a.staffId === b.staffId && a.measureId === b.measureId && a.voiceId === b.voiceId && a.offsetUnits === b.offsetUnits;
}
function measureStartPoint(view, measure, preferredPitch2 = null) {
  return point(view, measure, { kind: "start" }, 0, preferredPitch2);
}
function measureTailPoint(view, measure, preferredPitch2 = null) {
  const last = measure.events.at(-1);
  return point(view, measure, last ? { kind: "after-event", eventId: last.id } : { kind: "start" }, usedUnits(measure), preferredPitch2);
}
function defaultScoreEditPoint(view) {
  const measure = view.measures.find((item) => usedUnits(item) < capacityUnits(item)) ?? view.measures[0];
  return measureTailPoint(view, measure);
}
function normalizeScoreEditPoint(view, current) {
  if (!current || current.partId !== view.partId || current.staffId !== view.staffId) return defaultScoreEditPoint(view);
  const measure = view.measures.find((item) => item.id === current.measureId);
  if (!measure || measure.voiceId !== current.voiceId) return defaultScoreEditPoint(view);
  const exact = measureEditPoints(view, measure).find((candidate) => candidate.offsetUnits === current.offsetUnits);
  return exact ? { ...exact, preferredPitch: current.preferredPitch } : measureTailPoint(view, measure, current.preferredPitch);
}
function eventStartPoint(view, eventId, preferredPitch2 = null) {
  for (const measure of view.measures) {
    const index = measure.events.findIndex((event) => event.id === eventId);
    if (index < 0) continue;
    const previous = measure.events[index - 1];
    const offset = measure.events.slice(0, index).reduce((sum, event) => sum + durationUnits(event.duration), 0);
    return point(view, measure, previous ? { kind: "after-event", eventId: previous.id } : { kind: "start" }, offset, preferredPitch2);
  }
  return null;
}
function eventEndPoint(view, eventId, preferredPitch2 = null) {
  for (const measure of view.measures) {
    const index = measure.events.findIndex((event) => event.id === eventId);
    if (index >= 0) {
      const offset = measure.events.slice(0, index + 1).reduce((sum, event) => sum + durationUnits(event.duration), 0);
      return point(view, measure, { kind: "after-event", eventId }, offset, preferredPitch2);
    }
  }
  return null;
}
function measureEditPoints(view, measure) {
  const points = [measureStartPoint(view, measure)];
  let offset = 0;
  for (const event of measure.events) {
    offset += durationUnits(event.duration);
    points.push(point(view, measure, { kind: "after-event", eventId: event.id }, offset));
  }
  const capacity = capacityUnits(measure), beat = 64 / measure.meter.denominator;
  const tailAnchor = measure.events.at(-1) ? { kind: "after-event", eventId: measure.events.at(-1).id } : { kind: "start" };
  for (let beatOffset = (Math.floor(offset / beat) + 1) * beat; beatOffset < capacity; beatOffset += beat) {
    points.push(point(view, measure, tailAnchor, beatOffset));
  }
  return points;
}
function scoreEditPoints(view) {
  return view.measures.flatMap((measure) => measureEditPoints(view, measure));
}
function adjacentEventAtPoint(view, current, direction) {
  const normalized = normalizeScoreEditPoint(view, current);
  if (direction > 0) {
    const measureIndex = view.measures.findIndex((measure) => measure.id === normalized.measureId);
    for (let index2 = Math.max(0, measureIndex); index2 < view.measures.length; index2 += 1) {
      const measure = view.measures[index2];
      let offset = 0;
      for (const event of measure.events) {
        if (index2 > measureIndex || offset >= normalized.offsetUnits) return event.id;
        offset += durationUnits(event.duration);
      }
    }
    return null;
  }
  const points = scoreEditPoints(view);
  const index = pointIndex(view, normalized);
  if (normalized.anchor.kind === "after-event") return normalized.anchor.eventId;
  for (let offset = index + direction; offset >= 0 && offset < points.length; offset += direction) {
    const candidate = points[offset];
    if (candidate.anchor.kind === "after-event") return candidate.anchor.eventId;
  }
  return null;
}
function pointIndex(view, current) {
  return scoreEditPoints(view).findIndex((candidate) => sameScoreEditPoint(candidate, current));
}
function moveScoreEditPoint(view, current, direction) {
  const normalized = normalizeScoreEditPoint(view, current), points = scoreEditPoints(view);
  const index = pointIndex(view, normalized);
  const next = points[Math.max(0, Math.min(points.length - 1, index + direction))] ?? normalized;
  return { ...next, preferredPitch: current.preferredPitch };
}
function edgeScoreEditPoint(view, current, edge) {
  const normalized = normalizeScoreEditPoint(view, current);
  const currentMeasure = view.measures.find((measure2) => measure2.id === normalized.measureId) ?? view.measures[0];
  const measure = edge === "score-start" ? view.measures[0] : edge === "score-end" ? view.measures.at(-1) : currentMeasure;
  if (edge === "measure-start" || edge === "score-start") return measureStartPoint(view, measure, current.preferredPitch);
  const last = measureEditPoints(view, measure).at(-1) ?? measureTailPoint(view, measure);
  return { ...last, preferredPitch: current.preferredPitch };
}
function previousEventAtPoint(view, current) {
  const normalized = normalizeScoreEditPoint(view, current);
  const measure = view.measures.find((item) => item.id === normalized.measureId);
  let offset = 0;
  let previous;
  for (const event of measure.events) {
    offset += durationUnits(event.duration);
    if (offset > normalized.offsetUnits) break;
    previous = event;
  }
  if (previous) return { id: previous.id, start: eventStartPoint(view, previous.id, current.preferredPitch) };
  const previousMeasure = view.measures[view.measures.indexOf(measure) - 1];
  const previousMeasureEvent = previousMeasure?.events.at(-1);
  return previousMeasureEvent ? { id: previousMeasureEvent.id, start: eventStartPoint(view, previousMeasureEvent.id, current.preferredPitch) } : null;
}

// shared/notation/interaction/range-selection.ts
function eventLocation(view, eventId) {
  for (const measure of view.measures) {
    const index = measure.events.findIndex((event) => event.id === eventId);
    if (index >= 0) return { measure, index };
  }
  return null;
}
function resolveScoreEventRange(view, selection) {
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
function selectScoreEventRange(view, current, selectedEventId, focusEventId) {
  const focus = eventLocation(view, focusEventId);
  if (!focus) return null;
  const currentResolved = resolveScoreEventRange(view, current);
  const anchorId = currentResolved?.selection.anchorEventId ?? selectedEventId ?? focusEventId;
  const anchor = eventLocation(view, anchorId);
  if (!anchor || anchor.measure.id !== focus.measure.id || anchor.measure.voiceId !== focus.measure.voiceId) return null;
  return {
    measureId: focus.measure.id,
    voiceId: focus.measure.voiceId,
    anchorEventId: anchorId,
    focusEventId
  };
}
function stepScoreEventRange(view, current, selectedEventId, direction) {
  const resolved = resolveScoreEventRange(view, current);
  const focusId = resolved?.selection.focusEventId ?? selectedEventId;
  if (!focusId) return null;
  const focus = eventLocation(view, focusId);
  if (!focus) return null;
  const next = focus.measure.events[Math.max(0, Math.min(focus.measure.events.length - 1, focus.index + direction))];
  return next ? selectScoreEventRange(view, current, selectedEventId, next.id) : null;
}
function singleEventRange(view, eventId) {
  if (!eventId) return null;
  const location = eventLocation(view, eventId);
  return location ? resolveScoreEventRange(view, {
    measureId: location.measure.id,
    voiceId: location.measure.voiceId,
    anchorEventId: eventId,
    focusEventId: eventId
  }) : null;
}

// shared/notation/interaction/staff-navigation-policy.ts
function has(signal, modifier) {
  return signal.modifiers.includes(modifier);
}
function selectedLocation(view, eventId) {
  if (!eventId) return null;
  for (const measure of view.measures) {
    const index = measure.events.findIndex((event) => event.id === eventId);
    if (index >= 0) return { measure, index };
  }
  return null;
}
function resolveStaffNavigation(signal, context) {
  const { view, point: point2, selectedEventId, rangeSelection } = context;
  const command = has(signal, "ctrl") || has(signal, "meta");
  if (signal.key === "Escape") {
    if (rangeSelection) return { cancelComposition: false, action: { kind: "clear-range" } };
    if (!selectedEventId) return null;
    if (context.composingPitch) return { cancelComposition: false, action: { kind: "cancel-composition" } };
    const destination = eventStartPoint(view, selectedEventId, point2?.preferredPitch ?? null);
    return destination ? { cancelComposition: false, action: { kind: "locate", point: destination } } : null;
  }
  if ((signal.key === "Home" || signal.key === "End") && !has(signal, "alt")) {
    const selected2 = selectedLocation(view, selectedEventId);
    const currentId = selected2?.measure.id ?? point2?.measureId;
    const current = view.measures.find((measure2) => measure2.id === currentId) ?? view.measures[0];
    const measure = command ? signal.key === "Home" ? view.measures[0] : view.measures.at(-1) : current;
    const target = signal.key === "Home" ? measure.events[0] : measure.events.at(-1);
    const fallback = measureStartPoint(view, measure, point2?.preferredPitch ?? null);
    return { cancelComposition: true, action: target ? { kind: "select-event", eventId: target.id } : { kind: "locate", point: signal.key === "End" ? edgeScoreEditPoint(view, fallback, command ? "score-end" : "measure-end") : fallback } };
  }
  if (signal.key !== "ArrowLeft" && signal.key !== "ArrowRight" || has(signal, "alt")) return null;
  const direction = signal.key === "ArrowLeft" ? -1 : 1;
  if (has(signal, "shift") && !command) {
    const selection = stepScoreEventRange(view, rangeSelection, selectedEventId, direction);
    if (selection) return { cancelComposition: true, action: { kind: "select-range", selection } };
    if (!point2) return { cancelComposition: true };
    const adjacent2 = adjacentEventAtPoint(view, point2, direction);
    return { cancelComposition: true, action: adjacent2 ? { kind: "select-event", eventId: adjacent2 } : { kind: "locate", point: moveScoreEditPoint(view, point2, direction) } };
  }
  const selected = selectedLocation(view, selectedEventId);
  if (command) {
    const currentId = selected?.measure.id ?? point2?.measureId;
    const index = view.measures.findIndex((measure) => measure.id === currentId);
    const target = view.measures[Math.max(0, Math.min(view.measures.length - 1, index + direction))];
    const first = target?.events[0];
    if (first) return { cancelComposition: true, action: { kind: "select-event", eventId: first.id } };
    if (target) return {
      cancelComposition: true,
      action: { kind: "locate", point: measureStartPoint(view, target, point2?.preferredPitch ?? null) }
    };
    return { cancelComposition: true };
  }
  if (selected) {
    const events = view.measures.flatMap((measure) => measure.events);
    const index = events.findIndex((event) => event.id === selectedEventId);
    const next = events[index + direction];
    const atMeasureEdge = (direction > 0 ? selected.measure.events.at(-1)?.id : selected.measure.events[0]?.id) === selectedEventId;
    if (direction > 0 && atMeasureEdge) {
      const destination = eventEndPoint(view, selectedEventId, point2?.preferredPitch ?? null);
      return { cancelComposition: true, ...destination ? { action: { kind: "locate", point: destination } } : {} };
    }
    if (next) return { cancelComposition: true, action: { kind: "select-event", eventId: next.id } };
    if (direction > 0) {
      const following = view.measures[view.measures.indexOf(selected.measure) + 1];
      if (following) return {
        cancelComposition: true,
        action: { kind: "locate", point: measureStartPoint(view, following, point2?.preferredPitch ?? null) }
      };
    }
    return { cancelComposition: true };
  }
  if (!point2) return { cancelComposition: true };
  const adjacent = adjacentEventAtPoint(view, point2, direction);
  return { cancelComposition: true, action: adjacent ? { kind: "select-event", eventId: adjacent } : { kind: "locate", point: moveScoreEditPoint(view, point2, direction) } };
}

// apps/workbench/src/contracts/score-clipboard.ts
var SCORE_CLIPBOARD_FORMAT = "brilliant-guitar.score-events";
var SCORE_CLIPBOARD_VERSION = 1;
var SCORE_CLIPBOARD_EVENT_LIMIT = 100;
function createScoreClipboardFragment(events) {
  return {
    format: SCORE_CLIPBOARD_FORMAT,
    version: SCORE_CLIPBOARD_VERSION,
    events: events.map((event) => ({
      duration: event.duration.base === 32 ? { base: 32, dots: 0 } : { base: event.duration.base, dots: event.duration.dots },
      content: event.content.kind === "rest" ? { kind: "rest" } : { kind: "note", pitch: {
        step: event.content.pitch.step,
        octave: event.content.pitch.octave,
        alter: event.content.pitch.alter
      } }
    }))
  };
}
function isScoreClipboardFragmentV1(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const fragment = value;
  return fragment.format === SCORE_CLIPBOARD_FORMAT && fragment.version === SCORE_CLIPBOARD_VERSION && Array.isArray(fragment.events) && fragment.events.length > 0 && fragment.events.length <= SCORE_CLIPBOARD_EVENT_LIMIT && fragment.events.every(isEventProperties);
}
function encodeScoreClipboardFragment(fragment) {
  return JSON.stringify(fragment);
}
function decodeScoreClipboardFragment(text) {
  try {
    const value = JSON.parse(text);
    return isScoreClipboardFragmentV1(value) ? createScoreClipboardFragment(value.events) : null;
  } catch {
    return null;
  }
}

// apps/workbench/src/editor/score-clipboard.ts
function browserClipboard() {
  return typeof navigator !== "undefined" && navigator.clipboard ? navigator.clipboard : null;
}
var ScoreClipboard = class {
  #port;
  #memory = null;
  #disposed = false;
  #scope = "session";
  #operation = 0;
  constructor(port = browserClipboard()) {
    this.#port = port;
  }
  async write(fragment) {
    if (this.#disposed) throw new Error("Score clipboard disposed");
    if (!isScoreClipboardFragmentV1(fragment)) throw new TypeError("Invalid score clipboard fragment");
    const operation = ++this.#operation;
    const captured = createScoreClipboardFragment(fragment.events);
    this.#memory = captured;
    this.#scope = "session";
    if (!this.#port) return;
    try {
      await this.#port.writeText(encodeScoreClipboardFragment(captured));
      if (!this.#disposed && operation === this.#operation) this.#scope = "system";
    } catch {
    }
  }
  async read() {
    if (this.#disposed) throw new Error("Score clipboard disposed");
    const operation = ++this.#operation;
    if (this.#port) {
      try {
        const fragment = decodeScoreClipboardFragment(await this.#port.readText());
        if (this.#disposed || operation !== this.#operation) return null;
        if (fragment) {
          this.#memory = fragment;
          this.#scope = "system";
          return structuredClone(fragment);
        }
      } catch {
      }
    }
    if (this.#disposed || operation !== this.#operation) return null;
    this.#scope = "session";
    return this.#memory ? structuredClone(this.#memory) : null;
  }
  get scope() {
    return this.#scope;
  }
  dispose() {
    this.#disposed = true;
    this.#operation++;
    this.#memory = null;
  }
};

// shared/notation/interaction/input-duration.ts
function stepInputDuration(duration, offset) {
  const index = NOTE_BASES.indexOf(duration.base);
  const base = NOTE_BASES[Math.max(0, Math.min(NOTE_BASES.length - 1, index + offset))];
  return { base, dots: duration.dots };
}

// shared/notation/interaction/note-overview.ts
function getMeasureShare(duration, meter) {
  if (!meter) return null;
  const units = durationUnits(duration), capacity = capacityUnits({ meter });
  if (!Number.isSafeInteger(capacity) || capacity <= 0) return null;
  let a = units, b = capacity;
  while (b) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return `${units / a}/${capacity / a}`;
}
function resolveNoteOverview(input, selected, meter, selectedAccidental = "none") {
  if (selected) {
    const pitch2 = selected.content.kind === "note" ? selected.content.pitch : null;
    return {
      source: "selection",
      duration: selected.duration,
      alter: pitch2?.alter ?? 0,
      accidental: selectedAccidental,
      rest: selected.content.kind === "rest",
      pitch: pitch2,
      measureShare: getMeasureShare(selected.duration, meter)
    };
  }
  const pitch = input.rest ? null : input.draft ? { step: input.draft, octave: null, alter: input.alter } : input.pitch ? { ...input.pitch, alter: input.alter } : null;
  return {
    source: "input",
    duration: input.duration,
    alter: input.alter,
    accidental: input.accidental,
    rest: input.rest,
    pitch,
    measureShare: getMeasureShare(input.duration, meter)
  };
}
function stepNoteDuration(duration, offset, rest) {
  if (duration.base === 32) return offset === 1 ? duration : { base: 16, dots: 0 };
  if (rest && !duration.dots && duration.base === 16 && offset === 1) return { base: 32, dots: 0 };
  return stepInputDuration(duration, offset);
}
function toggleNoteDot(duration) {
  return duration.base === 32 ? duration : { ...duration, dots: duration.dots ? 0 : 1 };
}
function selectedNoteAction(event, change) {
  if (change.kind === "rest") return event.content.kind === "note" && change.value ? { kind: "delete-event", eventId: event.id, timePolicy: "preserve" } : null;
  if ((change.kind === "alter" || change.kind === "pitch") && event.content.kind === "rest") return null;
  const content = change.kind === "alter" && event.content.kind === "note" ? { kind: "note", pitch: { ...event.content.pitch, alter: change.value } } : change.kind === "pitch" && event.content.kind === "note" ? { kind: "note", pitch: change.value } : event.content;
  const duration = change.kind === "duration" ? change.value : event.duration;
  if (duration.base === 32 && content.kind !== "rest") return null;
  return { kind: "set-event-properties", eventId: event.id, properties: { content, duration } };
}

// shared/notation/interaction/staff-edit-key-policy.ts
function resolveStaffEditKey(signal, context) {
  if (signal.modifiers.includes("ctrl") || signal.modifiers.includes("meta") || signal.modifiers.includes("alt")) return null;
  if (context.activeStep && signal.key === "Backspace") {
    return { handled: true, ...signal.repeat ? {} : { action: { kind: "cancel-composition" } } };
  }
  if (context.selectedRange && (signal.key === "Delete" || signal.key === "Backspace")) {
    return { handled: true, ...signal.repeat ? {} : { action: { kind: "delete-range", range: context.selectedRange } } };
  }
  const selected = context.selectedEvent;
  if (selected) {
    if (signal.key === "Delete" || signal.key === "Backspace") {
      if (signal.repeat) return { handled: true };
      if (context.canDelete) return { handled: true, action: { kind: "delete-event", eventId: selected.id } };
      return context.selectedMeasureId ? {
        handled: true,
        action: { kind: "reject-delete", eventId: selected.id, measureId: context.selectedMeasureId }
      } : { handled: true };
    }
    if (["+", "=", "-", "_", "."].includes(signal.key)) {
      if (signal.repeat) return { handled: true };
      const duration = signal.key === "." ? toggleNoteDot(context.overview.duration) : stepNoteDuration(
        context.overview.duration,
        signal.key === "+" || signal.key === "=" ? 1 : -1,
        context.overview.rest
      );
      return { handled: true, action: { kind: "change", change: { kind: "duration", value: duration } } };
    }
    if (/^[2-6]$/.test(signal.key) && context.activeStep && selected.content.kind === "note") {
      if (signal.repeat) return { handled: true };
      return { handled: true, action: { kind: "change", change: { kind: "pitch", value: {
        ...selected.content.pitch,
        step: context.activeStep,
        octave: Number(signal.key)
      } } } };
    }
    if (/^[a-g]$/i.test(signal.key) && selected.content.kind === "note") {
      if (signal.repeat) return { handled: true };
      return { handled: true, action: { kind: "compose-pitch", step: signal.key.toUpperCase() } };
    }
    if (/^r$/i.test(signal.key)) {
      if (signal.repeat) return { handled: true };
      return { handled: true, action: { kind: "change", change: { kind: "rest", value: true } } };
    }
    return null;
  }
  if (!context.point || signal.key !== "Backspace" && signal.key !== "Delete") return null;
  if (signal.repeat) return { handled: true };
  if (signal.key === "Backspace") {
    const previous = previousEventAtPoint(context.view, context.point);
    return { handled: true, ...previous ? { action: {
      kind: "delete-event",
      eventId: previous.id,
      locateFirst: previous.start
    } } : {} };
  }
  const next = adjacentEventAtPoint(context.view, context.point, 1);
  return { handled: true, ...next ? { action: { kind: "delete-event", eventId: next } } : {} };
}

// shared/notation/interaction/staff-pointer-target.ts
function pointFromAnchor(view, geometry, pitch) {
  const measure = view.measures.find((item) => item.id === geometry.measureId);
  return measure ? {
    partId: view.partId,
    staffId: view.staffId,
    measureId: measure.id,
    voiceId: measure.voiceId,
    anchor: geometry.anchor,
    offsetUnits: geometry.offsetUnits,
    preferredPitch: pitch
  } : null;
}
function resolveStaffPointerTarget(input) {
  const { view, interaction, measureId, eventId, x, y, writeNow } = input;
  if (eventId) {
    const exists = interaction.events.some((item) => item.measureId === measureId && item.eventId === eventId);
    return exists && !writeNow ? { kind: "event", eventId } : null;
  }
  const measureGeometry = interaction.measures.find((item) => item.measureId === measureId);
  const measure = view.measures.find((item) => item.id === measureId);
  if (!measureGeometry || !measure) return null;
  const pitch = pitchAtY(y, measureGeometry.staffBottom, measureGeometry.lineSpacing, view.clef);
  const eventTargets = interaction.events.filter((item) => item.measureId === measureId).map((item) => ({
    kind: "event",
    eventId: item.eventId,
    distance: Math.abs(item.x + item.width / 2 - x)
  }));
  const hasFreeTail = measure.events.length === 0 || usedUnits(measure) < capacityUnits(measure);
  const targets = [...eventTargets];
  interaction.anchors.filter((item) => item.measureId === measureId && (measure.events.length === 0 || item.anchor.kind !== "start") && (item.offsetUnits <= usedUnits(measure) || hasFreeTail)).forEach((anchor) => targets.push({ kind: "empty", anchor, distance: Math.abs(anchor.x - x) }));
  const nearest = targets.reduce((best, item) => !best || item.distance < best.distance ? item : best, null);
  if (nearest?.kind === "event") return writeNow ? null : { kind: "event", eventId: nearest.eventId };
  if (!nearest) return null;
  const point2 = pointFromAnchor(view, nearest.anchor, pitch);
  return point2 ? { kind: "caret", point: point2, pitch } : null;
}

// shared/notation/notation-renderer.ts
function rhythmCaretCenterY(anchor) {
  return (anchor.y1 + anchor.y2) / 2;
}

// shared/notation/interaction/pitch-entry.ts
function advancePitchEntry(draft, key, repeat = false) {
  const name = key.toUpperCase();
  const letter = PITCH_STEPS.includes(name);
  const digit = /^[0-9]$/.test(key);
  const handled = letter || digit || name === "R" || key === "Backspace";
  if (!handled || repeat) return { handled, draft };
  if (letter) return { handled, draft: name };
  if (key === "Backspace") return { handled, draft: null };
  if (name === "R") return { handled, draft: null, rest: true };
  if (draft === null) return { handled, draft, message: "\u5148\u8F93\u5165\u97F3\u540D A\u2013G\uFF0C\u518D\u8F93\u5165\u7EC4\u53F7 2\u20136" };
  const octave = Number(key);
  if (octave < 2 || octave > 6) return { handled, draft, message: "\u5F53\u524D\u652F\u6301\u7EC4\u53F7 2\u20136\uFF0C\u8BF7\u91CD\u65B0\u8F93\u5165\u7EC4\u53F7" };
  return { handled, draft: null, pitch: { step: draft, octave } };
}

// shared/notation/interaction/staff-input-adapter.ts
var STAFF_PITCH_COMPOSITION = "notation.staff.pitch";
var staffInputAdapter = {
  id: "notation.staff",
  compositionMethodId: STAFF_PITCH_COMPOSITION,
  canHandle(signal, context) {
    return context.notationKind === "staff" && signal.kind === "key-press";
  },
  translate(signal, context) {
    if (!this.canHandle(signal, context) || signal.kind !== "key-press") return null;
    const result = advancePitchEntry(staffInputAdapter.draft(context.composition), signal.key, signal.repeat);
    if (!result.handled) return { kind: "ignored" };
    if (signal.repeat) return { kind: "ignored", handled: true };
    if (result.draft) {
      return {
        kind: "compose",
        methodId: STAFF_PITCH_COMPOSITION,
        draft: result.draft,
        ...result.message ? { message: result.message } : {}
      };
    }
    if (result.pitch) {
      const pitch = { ...result.pitch, alter: context.resolveAlter(result.pitch) };
      return { kind: "intent", intent: {
        kind: "insert-event",
        event: { duration: context.duration, content: { kind: "note", pitch } }
      } };
    }
    if (result.rest) {
      return { kind: "intent", intent: {
        kind: "insert-event",
        event: { duration: context.duration, content: { kind: "rest" } }
      } };
    }
    return { kind: "cancel-composition", ...result.message ? { message: result.message } : {} };
  },
  draft(composition) {
    return composition.kind === "composing" && composition.methodId === STAFF_PITCH_COMPOSITION ? composition.draft : null;
  },
  advance(draft, key, repeat = false) {
    return advancePitchEntry(draft, key, repeat);
  }
};

// shared/notation/interaction/staff-interaction-contribution.ts
var staffInteractionContribution = {
  id: "notation.staff.interaction",
  notationKind: "staff",
  input: staffInputAdapter,
  readDraft: (composition) => staffInputAdapter.draft(composition),
  startComposition: (draft) => ({ methodId: staffInputAdapter.compositionMethodId, draft }),
  navigate: resolveStaffNavigation,
  edit: resolveStaffEditKey
};

// shared/notation/tablature-model.ts
var record2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function isFrettedDimensions(value) {
  return record2(value) && typeof value.stringCount === "number" && Number.isSafeInteger(value.stringCount) && value.stringCount >= 1 && value.stringCount <= 32 && (value.fretCount === null || typeof value.fretCount === "number" && Number.isSafeInteger(value.fretCount) && value.fretCount >= 1) && typeof value.capoFret === "number" && Number.isSafeInteger(value.capoFret) && value.capoFret >= 0;
}
function isFrettedPosition(value, dimensions) {
  return isFrettedDimensions(dimensions) && record2(value) && typeof value.stringNumber === "number" && Number.isSafeInteger(value.stringNumber) && value.stringNumber >= 1 && value.stringNumber <= dimensions.stringCount && typeof value.fret === "number" && Number.isSafeInteger(value.fret) && value.fret >= 0 && value.fret <= Number.MAX_SAFE_INTEGER - dimensions.capoFret;
}

// shared/notation/interaction/tablature-interaction-contribution.ts
var TABLATURE_FRET_COMPOSITION = "notation.tablature.fret";
function readFretDraft(composition) {
  if (typeof composition !== "object" || composition === null) return null;
  const source = composition;
  if (source.kind !== "composing" || source.methodId !== TABLATURE_FRET_COMPOSITION || typeof source.draft !== "object" || source.draft === null) return null;
  const draft = source.draft;
  return typeof draft.eventId === "string" && !!draft.eventId && typeof draft.stringNumber === "number" && Number.isSafeInteger(draft.stringNumber) && draft.stringNumber >= 1 && draft.stringNumber <= 32 && typeof draft.maxFret === "number" && Number.isSafeInteger(draft.maxFret) && draft.maxFret >= 0 && typeof draft.digits === "string" && draft.digits.length <= 16 && /^(0|[1-9][0-9]*)$/.test(draft.digits) && Number.isSafeInteger(Number(draft.digits)) && Number(draft.digits) <= draft.maxFret ? { eventId: draft.eventId, stringNumber: draft.stringNumber, maxFret: draft.maxFret, digits: draft.digits } : null;
}
function available(context) {
  return context.notationKind === "tablature" && context.focusScope === "score" && context.target === "event" && typeof context.eventId === "string" && !!context.eventId && isFrettedPosition({ stringNumber: context.stringNumber, fret: 0 }, context);
}
function positionIntent(eventId, position) {
  return { kind: "update-event", eventId, properties: { kind: "fretted-position", position } };
}
var tablatureInteractionContribution = {
  id: "notation.tablature.interaction",
  notationKind: "tablature",
  input: {
    id: "notation.tablature",
    canHandle: (signal, context) => signal.kind === "key-press" && !signal.modifiers.length && available(context) && context.capabilities.includes("update") && context.capabilities.includes("compose"),
    translate(signal, context) {
      if (signal.kind !== "key-press" || signal.modifiers.length || !available(context) || !context.capabilities.includes("update") || !context.capabilities.includes("compose")) return null;
      const digit = /^[0-9]$/.test(signal.key);
      const recognized = digit || ["Enter", "Escape", "Backspace"].includes(signal.key);
      if (!recognized) return { kind: "ignored" };
      if (signal.repeat) return { kind: "ignored", handled: true };
      const draft = readFretDraft(context.composition), maxFret = Number.MAX_SAFE_INTEGER - context.capoFret;
      if (context.composition.kind === "composing" && (!draft || draft.eventId !== context.eventId || draft.stringNumber !== context.stringNumber || draft.maxFret !== maxFret)) {
        return { kind: "cancel-composition", message: "\u5F26\u54C1\u8F93\u5165\u76EE\u6807\u5DF2\u6539\u53D8" };
      }
      if (signal.key === "Escape") return draft ? { kind: "cancel-composition" } : { kind: "ignored" };
      if (signal.key === "Enter") return draft ? { kind: "intent", intent: positionIntent(context.eventId, { stringNumber: draft.stringNumber, fret: Number(draft.digits) }) } : { kind: "ignored" };
      if (signal.key === "Backspace" && !draft) return { kind: "ignored" };
      const digits = signal.key === "Backspace" ? draft.digits.slice(0, -1) : draft?.digits === "0" ? signal.key : (draft?.digits ?? "") + signal.key;
      if (!digits) return { kind: "cancel-composition" };
      if (digits.length > 16 || !Number.isSafeInteger(Number(digits)) || Number(digits) > maxFret) {
        return { kind: "cancel-composition", message: "\u54C1\u4F4D\u8D85\u51FA\u5F53\u524D\u8303\u56F4" };
      }
      return {
        kind: "compose",
        methodId: TABLATURE_FRET_COMPOSITION,
        draft: { eventId: context.eventId, stringNumber: context.stringNumber, maxFret, digits }
      };
    }
  },
  readDraft: readFretDraft,
  startComposition(draft) {
    const checked = readFretDraft({ kind: "composing", methodId: TABLATURE_FRET_COMPOSITION, draft });
    if (!checked) throw new Error("Invalid tablature fret draft");
    return { methodId: TABLATURE_FRET_COMPOSITION, draft: checked };
  },
  navigate(signal, context) {
    if (signal.modifiers.length || !available(context) || !context.capabilities.includes("navigate") || !isFrettedDimensions(context)) return null;
    const delta = signal.key === "ArrowUp" ? -1 : signal.key === "ArrowDown" ? 1 : 0;
    const stringNumber = context.stringNumber + delta;
    return delta && stringNumber >= 1 && stringNumber <= context.stringCount ? { stringNumber, cancelComposition: true } : null;
  },
  edit(signal, context) {
    const modifiersAllowed = !signal.modifiers.length || signal.key === "+" && signal.modifiers.every((modifier) => modifier === "shift");
    if (signal.repeat || !modifiersAllowed || !available(context) || !context.capabilities.includes("update") || context.composition.kind !== "idle" || !isFrettedPosition(context.currentPosition, context)) return null;
    const delta = signal.key === "+" ? 1 : signal.key === "-" ? -1 : 0;
    const position = { ...context.currentPosition, fret: context.currentPosition.fret + delta };
    return delta && isFrettedPosition(position, context) ? positionIntent(context.eventId, position) : null;
  }
};

// shared/notation/interaction/interaction-binding.ts
function bindNotationInteraction(directory, kind) {
  if (!directory.hasKind(kind)) throw new Error(`Notation interaction unavailable: ${kind}`);
  return Object.freeze({
    notationKind: kind,
    translate(signal, context) {
      return context.notationKind === kind ? directory.translate(kind, signal, context) : null;
    },
    readDraft(composition) {
      return directory.readDraft(kind, composition);
    },
    startComposition(draft) {
      return directory.startComposition(kind, draft);
    },
    navigate(signal, context) {
      return directory.navigate(kind, signal, context);
    },
    edit(signal, context) {
      return directory.edit(kind, signal, context);
    }
  });
}
function scopeNotationInteractions(directory, declarations) {
  const allowed = new Map(declarations.map(({ id, notationKind }) => [notationKind, id]));
  const ids = new Set(allowed.values());
  const hasKind = (kind) => {
    const id = allowed.get(kind);
    return id !== void 0 && directory.hasId(id) && directory.hasKind(kind);
  };
  return Object.freeze({
    hasId: (id) => ids.has(id) && directory.hasId(id),
    hasKind,
    list: () => directory.list().filter((id) => ids.has(id)),
    translate(kind, signal, context) {
      return hasKind(kind) && context.notationKind === kind ? directory.translate(kind, signal, context) : null;
    },
    readDraft(kind, composition) {
      return hasKind(kind) ? directory.readDraft(kind, composition) : null;
    },
    startComposition(kind, draft) {
      return hasKind(kind) ? directory.startComposition(kind, draft) : null;
    },
    navigate(kind, signal, context) {
      return hasKind(kind) ? directory.navigate(kind, signal, context) : null;
    },
    edit(kind, signal, context) {
      return hasKind(kind) ? directory.edit(kind, signal, context) : null;
    }
  });
}
var staffInteractionBinding = Object.freeze({
  notationKind: staffInteractionContribution.notationKind,
  translate: staffInteractionContribution.input.translate.bind(staffInteractionContribution.input),
  readDraft: staffInteractionContribution.readDraft,
  startComposition: staffInteractionContribution.startComposition,
  navigate: staffInteractionContribution.navigate,
  edit: staffInteractionContribution.edit
});

// shared/notation/key-signature.ts
var SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
var FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
function keySignatureAlterForStep(fifths, step) {
  if (!Number.isSafeInteger(fifths) || fifths === 0 || fifths < -7 || fifths > 7) return 0;
  const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER;
  return order.slice(0, Math.abs(fifths)).includes(step) ? fifths > 0 ? 1 : -1 : 0;
}
function keySignatureStateAtMeasure(view, measureId) {
  const target = view.measures.findIndex((measure) => measure.id === measureId);
  if (target < 0) return null;
  const changes = view.keySignatureChanges ?? [];
  let low = 0, high = changes.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const change2 = changes[middle];
    if (change2.measureIndex <= target) {
      low = middle + 1;
    } else high = middle - 1;
  }
  const change = changes[high], changed = change?.measureIndex === target;
  return {
    fifths: change?.fifths ?? 0,
    changed,
    previousFifths: changed ? changes[high - 1]?.fifths ?? 0 : change?.fifths ?? 0
  };
}
function keySignatureFifthsAtMeasure(view, measureId) {
  return keySignatureStateAtMeasure(view, measureId)?.fifths ?? 0;
}
function keySignatureChangeIsNoOp(view, measureId, change) {
  const state = keySignatureStateAtMeasure(view, measureId);
  return !!state && (change.kind === "set" ? state.fifths === change.fifths : !state.changed);
}

// shared/notation/interaction/accidental-state.ts
var ACCIDENTAL_STATES = ["none", "flat", "natural", "sharp"];
var pitchKey = (pitch) => `${pitch.step}/${pitch.octave}`;
function alterForAccidental(state, inherited) {
  return state === "none" ? inherited : state === "flat" ? -1 : state === "sharp" ? 1 : 0;
}
function accidentalForTransition(previous, current) {
  return previous === current ? "none" : current === -1 ? "flat" : current === 1 ? "sharp" : "natural";
}
function inheritedAlterBeforeEvent(measure, eventId, pitch, baseline = 0) {
  let inherited = baseline;
  const key = pitchKey(pitch);
  for (const event of measure.events) {
    if (event.id === eventId) break;
    if (event.content.kind === "note" && pitchKey(event.content.pitch) === key) inherited = event.content.pitch.alter;
  }
  return inherited;
}
function accidentalForEvent(measure, eventId, baseline = 0) {
  const event = measure.events.find((item) => item.id === eventId);
  if (!event || event.content.kind !== "note") return "none";
  return accidentalForTransition(inheritedAlterBeforeEvent(measure, eventId, event.content.pitch, baseline), event.content.pitch.alter);
}
function inheritedAlterAtPoint(view, point2, pitch) {
  const measure = view.measures.find((item) => item.id === point2.measureId);
  const baseline = keySignatureAlterForStep(keySignatureFifthsAtMeasure(view, point2.measureId), pitch.step);
  if (!measure || point2.anchor.kind === "start") return baseline;
  let inherited = baseline;
  const key = pitchKey(pitch);
  for (const event of measure.events) {
    if (event.content.kind === "note" && pitchKey(event.content.pitch) === key) inherited = event.content.pitch.alter;
    if (event.id === point2.anchor.eventId) break;
  }
  return inherited;
}

// apps/workbench/src/contracts/document-metadata.ts
var normalizeDocumentMetadata = (value) => ({
  title: value.title.trim() || "\u672A\u547D\u540D\u4E50\u8C31",
  authors: value.authors.map((author) => author.trim()).filter(Boolean),
  tempoBpm: value.tempoBpm
});
var documentMetadataKey = (value) => JSON.stringify(normalizeDocumentMetadata(value));
function validateDocumentMetadataFields(title, authorText, tempoText) {
  const cleanTitle = title.trim() || "\u672A\u547D\u540D\u4E50\u8C31";
  const authors = authorText.split(/\r?\n/).map((author) => author.trim()).filter(Boolean);
  const tempoBpm = Number(tempoText);
  const errors = {
    ...cleanTitle.length > 120 ? { title: "\u6807\u9898\u4E0D\u80FD\u8D85\u8FC7 120 \u4E2A\u5B57\u7B26" } : {},
    ...authors.length > 16 ? { authors: "\u4F5C\u8005\u6700\u591A\u586B\u5199 16 \u4F4D" } : authors.some((author) => author.length > 120) ? { authors: "\u6BCF\u4F4D\u4F5C\u8005\u4E0D\u80FD\u8D85\u8FC7 120 \u4E2A\u5B57\u7B26" } : {},
    ...!tempoText.trim() || !Number.isFinite(tempoBpm) || tempoBpm <= 0 ? { tempo: "\u8BF7\u8F93\u5165\u5927\u4E8E 0 \u7684\u901F\u5EA6" } : {}
  };
  return Object.keys(errors).length ? { errors } : { errors, value: { title: cleanTitle, authors, tempoBpm } };
}
function isDocumentMetadataInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value;
  return Object.keys(r).every((key) => ["title", "authors", "tempoBpm"].includes(key)) && typeof r.title === "string" && r.title.trim().length <= 120 && Array.isArray(r.authors) && r.authors.length <= 16 && r.authors.every((author) => typeof author === "string" && !!author.trim() && author.trim().length <= 120) && typeof r.tempoBpm === "number" && Number.isFinite(r.tempoBpm) && r.tempoBpm > 0;
}

// apps/workbench/src/contracts/note-input.ts
var KEY_SIGNATURE_FIFTHS = [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7];
var record3 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function isKeySignatureChangeInput(value) {
  if (!record3(value)) return false;
  return value.kind === "inherit" ? Object.keys(value).every((key) => key === "kind") : value.kind === "set" && Object.keys(value).every((key) => key === "kind" || key === "fifths") && KEY_SIGNATURE_FIFTHS.includes(value.fifths);
}

// shared/notation/measure-edit.ts
function equalMeter(left, right) {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}
function measureMeterTargets(measures, measureId, scope) {
  const start = measures.findIndex((item) => item.id === measureId);
  if (start < 0) return [];
  const target = measures[start];
  const targets = [target];
  if (scope === "meter-run") {
    for (const measure of measures.slice(start + 1)) {
      if (!equalMeter(measure.meter, target.meter)) break;
      targets.push(measure);
    }
  }
  return targets;
}

// apps/workbench/src/notation/music-symbols.ts
var NOTES = { 1: "\uE1D2", 2: "\uE1D3", 4: "\uE1D5", 8: "\uE1D7", 16: "\uE1D9" };
var RESTS = { 1: "\uE4E3", 2: "\uE4E4", 4: "\uE4E5", 8: "\uE4E6", 16: "\uE4E7", 32: "\uE4E8" };
var MUSIC_SYMBOLS = { dot: "\uE1E7", flat: "\uE260", natural: "\uE261", sharp: "\uE262" };
var DURATION_NAMES = { 1: "\u5168", 2: "\u4E8C\u5206", 4: "\u56DB\u5206", 8: "\u516B\u5206", 16: "\u5341\u516D\u5206", 32: "\u4E09\u5341\u4E8C\u5206" };
var durationSymbol = (duration, rest = false) => duration.base === 32 ? RESTS[32] : (rest ? RESTS : NOTES)[duration.base];
function noteheadSymbol(duration) {
  if (duration.base === 1) return "\uE0A2";
  if (duration.base === 2) return "\uE0A3";
  return "\uE0A4";
}

// apps/workbench/src/notation/music-glyph-layout.ts
function musicGlyphLayout(metrics, fit = "box") {
  const left = metrics.actualBoundingBoxLeft, right = metrics.actualBoundingBoxRight;
  const ascent = metrics.actualBoundingBoxAscent, descent = metrics.actualBoundingBoxDescent;
  if (![left, right, ascent, descent].every(Number.isFinite)) throw new Error("Font measurement unavailable");
  return fit === "ink" ? { x: left + 1, y: ascent + 1, width: Math.max(1, left + right) + 2, height: Math.max(1, ascent + descent) + 2 } : { x: (48 - left - right) / 2 + left, y: (48 - ascent - descent) / 2 + ascent, width: 48, height: 48 };
}

// apps/workbench/src/application/edit/score-edit-intent.ts
function scoreIntentToAction(intent, point2, deleteTimePolicy = "preserve") {
  if (intent.kind === "history") return { kind: intent.direction };
  if (intent.kind === "document") return intent.action;
  if (intent.kind === "delete-range") return { kind: "delete-range", range: intent.range };
  if (intent.kind === "paste") return {
    kind: "paste-fragment",
    measureId: intent.measureId,
    voiceId: intent.voiceId,
    anchor: intent.anchor,
    ...intent.offsetUnits === void 0 ? {} : { offsetUnits: intent.offsetUnits },
    fragment: intent.fragment
  };
  if (intent.kind === "insert-measure") return { kind: "insert-measure", measureId: intent.measureId, position: intent.position };
  if (intent.kind === "remove-measure") return { kind: "remove-measure", measureId: intent.measureId };
  if (intent.kind === "set-measure-meter") return {
    kind: "set-measure-meter",
    measureId: intent.measureId,
    meter: intent.meter,
    scope: intent.scope
  };
  if (intent.kind === "set-key-signature") return {
    kind: "set-key-signature",
    partId: intent.partId,
    measureId: intent.measureId,
    change: intent.change
  };
  if (intent.kind === "set-staff-clef") return { kind: "set-staff-clef", staffId: intent.staffId, clef: intent.clef };
  if (intent.kind === "insert-event") return point2 ? {
    kind: "append",
    measureId: point2.measureId,
    anchor: point2.anchor,
    offsetUnits: point2.offsetUnits,
    duration: intent.event.duration,
    content: intent.event.content
  } : null;
  if (intent.kind === "update-event") return { kind: "set-event-properties", eventId: intent.eventId, properties: intent.properties };
  return { kind: "delete-event", eventId: intent.eventId, timePolicy: intent.timePolicy ?? deleteTimePolicy };
}

// apps/workbench/src/application/edit/score-focus-reconciler.ts
function preferredPitch(point2) {
  return point2?.preferredPitch ?? null;
}
function pointAtOffset(view, measureId, offsetUnits, pitch) {
  const exact = scoreEditPoints(view).find((point2) => point2.measureId === measureId && point2.offsetUnits === offsetUnits);
  if (exact) return { ...exact, preferredPitch: pitch };
  const measure = view.measures.find((item) => item.id === measureId);
  return measure ? measureTailPoint(view, measure, pitch) : defaultScoreEditPoint(view);
}
function applyDirective(view, directive, pitch) {
  if (directive.kind === "clear") return { kind: "unavailable" };
  if (directive.kind === "keep-selection") {
    const point2 = eventStartPoint(view, directive.eventId, pitch);
    return point2 ? { kind: "event", eventId: directive.eventId, point: point2 } : { kind: "caret", point: defaultScoreEditPoint(view) };
  }
  if (directive.kind === "after-insert") {
    const point2 = eventEndPoint(view, directive.eventId, pitch);
    return point2 ? { kind: "caret", point: point2 } : { kind: "caret", point: defaultScoreEditPoint(view) };
  }
  const measure = view.measures.find((item) => item.id === directive.measureId);
  if (!measure) return { kind: "caret", point: defaultScoreEditPoint(view) };
  if (directive.kind === "at-measure-start") return { kind: "caret", point: measureStartPoint(view, measure, pitch) };
  if (directive.kind === "at-measure-end") return { kind: "caret", point: measureTailPoint(view, measure, pitch) };
  return { kind: "caret", point: pointAtOffset(view, directive.measureId, directive.offsetUnits, pitch) };
}
function reconcileScoreFocus(before, after, action, currentPoint, selectedEventId) {
  if (after.notation.kind !== "staff") return { directive: { kind: "clear" }, target: { kind: "unavailable" } };
  const view = after.notation, pitch = preferredPitch(currentPoint);
  let normalized = normalizeScoreEditPoint(view, currentPoint);
  let directive = { kind: "at-offset", measureId: normalized.measureId, offsetUnits: normalized.offsetUnits };
  if (action.kind === "append") {
    const previousMeasure = before.notation.kind === "staff" ? before.notation.measures.find((measure) => measure.id === action.measureId) : void 0;
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
    const previousMeasure = before.notation.kind === "staff" ? before.notation.measures.find((measure) => measure.id === action.measureId) : void 0;
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
    const previousIndex = before.notation.kind === "staff" ? before.notation.measures.findIndex((measure) => measure.id === action.measureId) : 0;
    const destination = view.measures[Math.max(0, Math.min(view.measures.length - 1, previousIndex))] ?? view.measures.at(-1);
    if (destination) directive = { kind: "at-measure-start", measureId: destination.id };
  }
  const clearsSelection = action.kind === "delete-event" || action.kind === "delete-range" || action.kind === "paste-fragment" || action.kind === "insert-measure" || action.kind === "remove-measure";
  if (selectedEventId && !clearsSelection && eventStartPoint(view, selectedEventId, pitch)) {
    directive = { kind: "keep-selection", eventId: selectedEventId };
  }
  const target = applyDirective(view, directive, pitch);
  if (target.kind !== "unavailable") normalized = target.point;
  return { directive, target: target.kind === "caret" ? { kind: "caret", point: normalized } : target };
}
export {
  ACCIDENTAL_STATES,
  DURATION_NAMES,
  KEY_SIGNATURE_FIFTHS,
  METER_DENOMINATORS,
  MUSIC_SYMBOLS,
  PITCH_STEPS,
  SCORE_CLIPBOARD_EVENT_LIMIT,
  STAFF_CLEFS,
  ScoreClipboard,
  TABLATURE_FRET_COMPOSITION,
  accidentalForEvent,
  alterForAccidental,
  bindNotationInteraction,
  createScoreClipboardFragment,
  documentMetadataKey,
  durationSymbol,
  equalEventProperties,
  equalMeter,
  eventEndPoint,
  eventStartPoint,
  inheritedAlterAtPoint,
  inheritedAlterBeforeEvent,
  initialEditorState,
  isDocumentMetadataInput,
  isEventProperties,
  isKeySignatureChangeInput,
  isMeterInput,
  isScoreClipboardFragmentV1,
  keySignatureAlterForStep,
  keySignatureChangeIsNoOp,
  keySignatureFifthsAtMeasure,
  keySignatureStateAtMeasure,
  measureMeterTargets,
  musicGlyphLayout,
  normalizeDocumentMetadata,
  normalizeScoreEditPoint,
  noteheadSymbol,
  reconcileScoreFocus,
  resolveNoteOverview,
  resolveScoreEventRange,
  resolveStaffEditKey,
  resolveStaffNavigation,
  resolveStaffPointerTarget,
  rhythmCaretCenterY,
  scopeNotationInteractions,
  scoreEditPoints,
  scoreIntentToAction,
  selectScoreEventRange,
  selectedNoteAction,
  singleEventRange,
  staffInputAdapter,
  staffInteractionBinding,
  staffInteractionContribution,
  stepInputDuration,
  stepNoteDuration,
  tablatureInteractionContribution,
  toggleNoteDot,
  transitionEditor,
  validateDocumentMetadataFields,
  yForPitch
};
