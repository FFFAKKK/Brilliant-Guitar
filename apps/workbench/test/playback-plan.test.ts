import assert from "node:assert/strict";
import test from "node:test";
import type { PlaybackSourceProjection } from "../src/contracts/playback.ts";
import { addFractions, compareFractions, fraction } from "../src/playback/exact-fraction.ts";
import { locatePlaybackPosition, playbackStartSeconds, projectPlaybackPlan } from "../src/playback/playback-plan.ts";

const source = (events: Extract<PlaybackSourceProjection, { kind: "ready" }>["measures"][number]["events"],
  transposition = 0): PlaybackSourceProjection => ({
  kind: "ready", projectionVersion: 1, documentId: "score", documentVersion: 4, bpm: 120,
  writtenToSounding: { diatonicSteps: 0, chromaticSemitones: transposition },
  measures: [{ id: "m1", meter: { numerator: 4, denominator: 4 }, voiceStart: { numerator: 0, denominator: 1 }, events }],
});

test("exact playback fractions normalize, add and compare without float drift", () => {
  assert.deepEqual(fraction(2, 8), { numerator: 1, denominator: 4 });
  assert.deepEqual(addFractions(fraction(1, 8), fraction(3, 8)), { numerator: 1, denominator: 2 });
  assert.equal(compareFractions(fraction(1, 3), fraction(2, 6)), 0);
  assert.throws(() => fraction(1, 0), RangeError);
});

test("the plan keeps rests as time, applies sounding transposition and pads an underfull bar", () => {
  const result = projectPlaybackPlan(source([
    { id: "note", duration: { numerator: 1, denominator: 8 }, content: { kind: "note",
      writtenPitch: { step: "C", alter: 0, octave: 4 } } },
    { id: "rest", duration: { numerator: 3, denominator: 8 }, content: { kind: "rest" } },
  ], 12));
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.plan.items[0]?.midi, 72);
  assert.equal(result.plan.items[1]?.midi, null);
  assert.equal(result.plan.items[1]?.startSeconds, 0.25);
  assert.equal(result.plan.durationSeconds, 2, "the silent remainder of 4/4 remains playable time");
  assert.equal(playbackStartSeconds(result.plan, { measureId: "m1", eventId: "rest" }), 0.25);
  assert.equal(playbackStartSeconds(result.plan, { measureId: "m1", offsetUnits: 32 }), 1);
  const location = locatePlaybackPosition(result.plan, 0.3);
  assert.equal(location?.measureId, "m1");
  assert.equal(location?.eventId, "rest");
  assert.ok(Math.abs((location?.eventProgress ?? 0) - 1 / 15) < Number.EPSILON);
  assert.equal(location?.measureProgress, 0.15);
});

test("an overfull bar extends the timeline instead of truncating valid editable content", () => {
  const events = Array.from({ length: 5 }, (_, index) => ({ id: `q${index + 1}`,
    duration: { numerator: 1, denominator: 4 }, content: { kind: "rest" as const } }));
  const result = projectPlaybackPlan(source(events));
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") assert.equal(result.plan.durationSeconds, 2.5);
});

test("unsupported source and pitches outside the MIDI domain return structured diagnostics", () => {
  assert.deepEqual(projectPlaybackPlan({ kind: "unsupported", projectionVersion: 1, documentId: "score",
    documentVersion: 1, code: "playback.chord-unsupported", message: "暂不支持和弦" }),
  { kind: "unsupported", code: "playback.chord-unsupported", message: "暂不支持和弦" });
  const result = projectPlaybackPlan(source([{ id: "high", duration: { numerator: 1, denominator: 4 }, content: {
    kind: "note", writtenPitch: { step: "B", alter: 2, octave: 8 },
  } }], 12));
  assert.equal(result.kind, "unsupported");
  if (result.kind === "unsupported") assert.equal(result.code, "playback.plan-invalid");
});
