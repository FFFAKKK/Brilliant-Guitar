import assert from "node:assert/strict";
import test from "node:test";
import type { StaffView } from "../src/contracts/notation.ts";
import { resolveScorePosition } from "../src/editor/score-position.ts";

const score: StaffView = {
  kind: "staff", partId: "part", staffId: "staff", clef: "treble",
  measures: [
    { id: "measure-1", voiceId: "voice-1", meter: { numerator: 4, denominator: 4 }, events: [
      { id: "event-1", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } } },
      { id: "event-2", duration: { base: 8, dots: 0 }, content: { kind: "note", pitch: { step: "D", octave: 4, alter: 0 } } },
    ] },
    { id: "measure-2", voiceId: "voice-2", meter: { numerator: 3, denominator: 4 }, events: [
      { id: "event-3", duration: { base: 2, dots: 1 }, content: { kind: "rest" } },
    ] },
  ],
};

test("input location follows the active measure tail and keeps fractional beat positions explicit", () => {
  assert.deepEqual(resolveScorePosition(score, { partId: "part", staffId: "staff", measureId: "measure-1", voiceId: "voice-1",
    anchor: { kind: "after-event", eventId: "event-2" }, offsetUnits: 24, preferredPitch: null }), { measureNumber: 1, beat: "2.5", atMeasureEnd: false });
});

test("selection location points at the selected event start instead of the input tail", () => {
  assert.deepEqual(resolveScorePosition(score, null, "event-1"), { measureNumber: 1, beat: "1", atMeasureEnd: false });
  assert.deepEqual(resolveScorePosition(score, null, "event-2"), { measureNumber: 1, beat: "2", atMeasureEnd: false });
});

test("a full measure is described as its end and unknown input targets stay unavailable", () => {
  assert.deepEqual(resolveScorePosition(score, { partId: "part", staffId: "staff", measureId: "measure-2", voiceId: "voice-2",
    anchor: { kind: "after-event", eventId: "event-3" }, offsetUnits: 48, preferredPitch: null }), { measureNumber: 2, beat: "4", atMeasureEnd: true });
  assert.equal(resolveScorePosition(score, null), null);
});
