import assert from "node:assert/strict";
import test from "node:test";
import type { StaffView } from "../src/contracts/notation.ts";
import { eventEndPoint, eventStartPoint, measureStartPoint } from "../src/editor/score-navigation.ts";
import { resolveStaffNavigation } from "../src/editor/staff-navigation-policy.ts";

const view: StaffView = { kind: "staff", partId: "part", staffId: "staff", clef: "treble", tempoBpm: 96, keySignatureChanges: [], measures: [
  { id: "m1", voiceId: "v1", meter: { numerator: 4, denominator: 4 }, ruleWarnings: [], events: [
    { id: "a", duration: { base: 4, dots: 0 }, content: { kind: "rest" } },
    { id: "b", duration: { base: 4, dots: 0 }, content: { kind: "rest" } },
  ] },
  { id: "m2", voiceId: "v2", meter: { numerator: 4, denominator: 4 }, ruleWarnings: [], events: [
    { id: "c", duration: { base: 4, dots: 0 }, content: { kind: "rest" } },
  ] },
] };

const signal = (key: string, modifiers: Array<"shift" | "ctrl" | "meta" | "alt"> = []) =>
  ({ kind: "key-press" as const, key, modifiers, repeat: false });

test("event arrows select neighbours while right at a measure edge enters its explicit tail", () => {
  const point = eventStartPoint(view, "b")!;
  const left = resolveStaffNavigation(signal("ArrowLeft"), { view, point, selectedEventId: "b",
    rangeSelection: null, composingPitch: false });
  assert.deepEqual(left?.action, { kind: "select-event", eventId: "a" });
  const right = resolveStaffNavigation(signal("ArrowRight"), { view, point, selectedEventId: "b",
    rangeSelection: null, composingPitch: false });
  assert.deepEqual(right?.action, { kind: "locate", point: eventEndPoint(view, "b")! });
});

test("shift arrows extend a stable range and command arrows jump by measure", () => {
  const point = eventStartPoint(view, "a")!;
  const range = resolveStaffNavigation(signal("ArrowRight", ["shift"]), { view, point, selectedEventId: "a",
    rangeSelection: null, composingPitch: false });
  assert.deepEqual(range?.action, { kind: "select-range",
    selection: { measureId: "m1", voiceId: "v1", anchorEventId: "a", focusEventId: "b" } });
  const jump = resolveStaffNavigation(signal("ArrowRight", ["ctrl"]), { view, point, selectedEventId: "a",
    rangeSelection: null, composingPitch: false });
  assert.deepEqual(jump?.action, { kind: "select-event", eventId: "c" });
});

test("home, end and escape produce explicit local focus actions", () => {
  const point = measureStartPoint(view, view.measures[1]!);
  assert.deepEqual(resolveStaffNavigation(signal("Home", ["ctrl"]), { view, point, selectedEventId: null,
    rangeSelection: null, composingPitch: false })?.action, { kind: "select-event", eventId: "a" });
  assert.deepEqual(resolveStaffNavigation(signal("End"), { view, point, selectedEventId: null,
    rangeSelection: null, composingPitch: false })?.action, { kind: "select-event", eventId: "c" });
  assert.deepEqual(resolveStaffNavigation(signal("Escape"), { view, point, selectedEventId: "c",
    rangeSelection: null, composingPitch: true })?.action, { kind: "cancel-composition" });
});

test("shift arrows from a caret select the adjacent event and End reaches an empty measure tail", () => {
  const caret = eventEndPoint(view, "a")!;
  assert.deepEqual(resolveStaffNavigation(signal("ArrowRight", ["shift"]), { view, point: caret,
    selectedEventId: null, rangeSelection: null, composingPitch: false })?.action,
  { kind: "select-event", eventId: "b" });
  const emptyView: StaffView = { ...view, measures: [{ ...view.measures[0]!, id: "empty", voiceId: "empty-voice", events: [] }] };
  const start = measureStartPoint(emptyView, emptyView.measures[0]!);
  assert.equal(resolveStaffNavigation(signal("End"), { view: emptyView, point: start, selectedEventId: null,
    rangeSelection: null, composingPitch: false })?.action?.kind, "locate");
  assert.equal((resolveStaffNavigation(signal("End"), { view: emptyView, point: start, selectedEventId: null,
    rangeSelection: null, composingPitch: false })?.action as { point: { offsetUnits: number } }).point.offsetUnits, 48);
});
