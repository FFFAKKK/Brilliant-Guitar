import assert from "node:assert/strict";
import test from "node:test";
import type { StaffView } from "../src/contracts/notation.ts";
import { resolveStaffEditKey } from "../src/editor/staff-edit-key-policy.ts";
import { eventEndPoint, eventStartPoint } from "../src/editor/score-navigation.ts";

const view: StaffView = { kind: "staff", partId: "part", staffId: "staff", clef: "treble", tempoBpm: 96, keySignatureChanges: [], measures: [
  { id: "m1", voiceId: "v1", meter: { numerator: 4, denominator: 4 }, ruleWarnings: [], events: [
    { id: "a", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 5, alter: 0 } } },
    { id: "b", duration: { base: 4, dots: 0 }, content: { kind: "rest" } },
  ] },
] };
const signal = (key: string, repeat = false) => ({ kind: "key-press" as const, key, modifiers: [], repeat });
const overview = { source: "selection" as const, duration: { base: 4 as const, dots: 0 as const }, alter: 0 as const,
  accidental: "none" as const, rest: false, pitch: { step: "C" as const, octave: 5, alter: 0 as const }, measureShare: "1/4" };

test("selected note keys resolve into duration, pitch composition and deletion commands", () => {
  const context = { view, point: eventStartPoint(view, "a"), selectedEvent: view.measures[0]!.events[0]!,
    selectedMeasureId: "m1", canDelete: true, activeStep: null, selectedRange: null, overview };
  assert.deepEqual(resolveStaffEditKey(signal("+"), context)?.action,
    { kind: "change", change: { kind: "duration", value: { base: 8, dots: 0 } } });
  assert.deepEqual(resolveStaffEditKey(signal("B"), context)?.action, { kind: "compose-pitch", step: "B" });
  assert.deepEqual(resolveStaffEditKey(signal("Delete"), context)?.action, { kind: "delete-event", eventId: "a" });
});

test("completed pitch replacement preserves the selected note spelling fields", () => {
  const selected = view.measures[0]!.events[0]!;
  const context = { view, point: eventStartPoint(view, "a"), selectedEvent: selected,
    selectedMeasureId: "m1", canDelete: true, activeStep: "A" as const, selectedRange: null, overview };
  assert.deepEqual(resolveStaffEditKey(signal("4"), context)?.action, { kind: "change", change: {
    kind: "pitch", value: { step: "A", octave: 4, alter: 0 },
  } });
});

test("caret deletion resolves the adjacent event and preserves the pre-delete caret", () => {
  const point = eventEndPoint(view, "b")!;
  const context = { view, point, selectedEvent: null, selectedMeasureId: null, canDelete: false,
    activeStep: null, selectedRange: null, overview: { ...overview, source: "input" as const } };
  assert.deepEqual(resolveStaffEditKey(signal("Backspace"), context)?.action,
    { kind: "delete-event", eventId: "b", locateFirst: eventStartPoint(view, "b")! });
  assert.equal(resolveStaffEditKey(signal("Delete"), context)?.action, undefined);
});

test("an incomplete pitch draft cancels before deletion and a selected range deletes as one operation", () => {
  const selected = view.measures[0]!.events[0]!;
  const base = { view, point: eventStartPoint(view, "a"), selectedEvent: selected,
    selectedMeasureId: "m1", canDelete: true, activeStep: "C" as const, selectedRange: null, overview };
  assert.deepEqual(resolveStaffEditKey(signal("Backspace"), base)?.action, { kind: "cancel-composition" });
  const range = { measureId: "m1", voiceId: "v1", startEventId: "a", endEventId: "b" };
  assert.deepEqual(resolveStaffEditKey(signal("Delete"), { ...base, activeStep: null, selectedRange: range })?.action,
    { kind: "delete-range", range });
});
