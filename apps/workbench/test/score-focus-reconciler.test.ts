import assert from "node:assert/strict";
import test from "node:test";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import type { StaffEvent, StaffMeasure } from "../src/contracts/notation.ts";
import { eventEndPoint, eventStartPoint } from "../src/editor/score-navigation.ts";
import { reconcileScoreFocus } from "../src/application/edit/score-focus-reconciler.ts";
import { unsupportedPlaybackSource } from "./playback-fixture.ts";

const note = (id: string, step: "C" | "D" | "E" | "F" = "C"): StaffEvent => ({
  id, duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step, octave: 4, alter: 0 } },
});
const measure = (id: string, events: readonly StaffEvent[]): StaffMeasure => ({
  id, voiceId: `voice-${id}`, meter: { numerator: 4, denominator: 4 }, events, ruleWarnings: [],
});
function session(version: number, measures: readonly StaffMeasure[]): ScoreSessionRead {
  return { documentId: "document", title: "", measureCount: measures.length, documentVersion: version,
    undoDepth: version, redoDepth: 0, notation: { kind: "staff", partId: "part", staffId: "staff", clef: "treble", tempoBpm: 96, keySignatureChanges: [], measures },
    playbackSource: unsupportedPlaybackSource("document", version) };
}

test("insert focus advances after the new event", () => {
  const before = session(1, [measure("m1", [note("e1")])]);
  const after = session(2, [measure("m1", [note("e1"), note("e2", "D")])]);
  if (before.notation.kind !== "staff") throw new Error("Expected staff");
  const point = eventEndPoint(before.notation, "e1")!;
  const result = reconcileScoreFocus(before, after, { kind: "append", measureId: "m1",
    anchor: { kind: "after-event", eventId: "e1" }, offsetUnits: 16,
    duration: { base: 4, dots: 0 }, content: note("draft", "D").content }, point, null);
  assert.deepEqual(result.directive, { kind: "after-insert", eventId: "e2" });
  assert.equal(result.target.kind === "caret" && result.target.point.offsetUnits, 32);
});

test("filling a tail moves focus to the generated next measure", () => {
  const beforeEvents = [note("e1"), note("e2", "D"), note("e3", "E")];
  const before = session(3, [measure("m1", beforeEvents)]);
  const after = session(4, [measure("m1", [...beforeEvents, note("e4", "F")]), measure("m2", [])]);
  if (before.notation.kind !== "staff") throw new Error("Expected staff");
  const point = eventEndPoint(before.notation, "e3")!;
  const result = reconcileScoreFocus(before, after, { kind: "append", measureId: "m1",
    anchor: { kind: "after-event", eventId: "e3" }, offsetUnits: 48,
    duration: { base: 4, dots: 0 }, content: note("draft", "F").content }, point, null);
  assert.deepEqual(result.directive, { kind: "at-measure-start", measureId: "m2" });
  assert.equal(result.target.kind === "caret" && result.target.point.measureId, "m2");
});

test("updates retain selection while deletion returns to a caret", () => {
  const before = session(1, [measure("m1", [note("e1"), note("e2", "D")])]);
  const updated = session(2, [measure("m1", [note("e1"), { ...note("e2", "E"), duration: { base: 8, dots: 0 } }])]);
  if (before.notation.kind !== "staff") throw new Error("Expected staff");
  const point = eventStartPoint(before.notation, "e2")!;
  const update = reconcileScoreFocus(before, updated, { kind: "set-event-properties", eventId: "e2",
    properties: updated.notation.kind === "staff" ? updated.notation.measures[0]!.events[1]! : note("e2") }, point, "e2");
  assert.deepEqual(update.directive, { kind: "keep-selection", eventId: "e2" });
  assert.equal(update.target.kind, "event");

  const deleted = session(2, [measure("m1", [note("e1"), {
    id: "e2", duration: { base: 4, dots: 0 }, content: { kind: "rest" },
  }])]);
  const deletion = reconcileScoreFocus(before, deleted, { kind: "delete-event", eventId: "e2", timePolicy: "preserve" }, point, "e2");
  assert.equal(deletion.target.kind, "caret");
  assert.equal(deletion.target.kind === "caret" && deletion.target.point.offsetUnits, 16);
});

