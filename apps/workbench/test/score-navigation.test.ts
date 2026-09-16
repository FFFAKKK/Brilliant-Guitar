import assert from "node:assert/strict";
import test from "node:test";
import type { StaffView } from "../src/contracts/notation.ts";
import { adjacentEventAtPoint, defaultScoreEditPoint, edgeScoreEditPoint, editPointOffsetUnits, eventEndPoint, eventStartPoint,
  jumpScoreEditPoint, moveScoreEditPoint, normalizeScoreEditPoint, previousEventAtPoint, scoreEditPoints } from "../src/editor/score-navigation.ts";

const score: StaffView = {
  kind: "staff", partId: "part", staffId: "staff", clef: "treble",
  measures: [
    { id: "measure-1", voiceId: "voice-1", meter: { numerator: 4, denominator: 4 }, events: [
      { id: "event-1", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } } },
      { id: "event-2", duration: { base: 8, dots: 0 }, content: { kind: "note", pitch: { step: "D", octave: 4, alter: 0 } } },
    ] },
    { id: "measure-2", voiceId: "voice-2", meter: { numerator: 3, denominator: 4 }, events: [
      { id: "event-3", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "E", octave: 4, alter: 0 } } },
    ] },
  ],
};

test("navigation exposes real boundaries and remaining beat slots in musical order", () => {
  const points = scoreEditPoints(score);
  assert.deepEqual(points.map((point) => [point.measureId, point.offsetUnits]), [
    ["measure-1", 0], ["measure-1", 16], ["measure-1", 24], ["measure-1", 32], ["measure-1", 48],
    ["measure-2", 0], ["measure-2", 16], ["measure-2", 32],
  ]);
  const pitch = { step: "A" as const, octave: 5, alter: -1 as const };
  const atTail = { ...points[2]!, preferredPitch: pitch };
  assert.deepEqual(moveScoreEditPoint(score, atTail, 1), { ...points[3]!, preferredPitch: pitch });
  assert.deepEqual(moveScoreEditPoint(score, { ...points[4]!, preferredPitch: pitch }, 1), { ...points[5]!, preferredPitch: pitch });
  assert.deepEqual(moveScoreEditPoint(score, points[0]!, -1), points[0]);
  assert.equal(adjacentEventAtPoint(score, atTail, -1), "event-2");
  assert.equal(adjacentEventAtPoint(score, points[0]!, 1), "event-1");
  assert.equal(adjacentEventAtPoint(score, points[1]!, 1), "event-2");
});

test("event, measure and score navigation share one semantic edit point", () => {
  const start = eventStartPoint(score, "event-2")!;
  const end = eventEndPoint(score, "event-2")!;
  assert.equal(start.anchor.kind === "after-event" && start.anchor.eventId, "event-1");
  assert.equal(end.anchor.kind === "after-event" && end.anchor.eventId, "event-2");
  assert.equal(editPointOffsetUnits(score, start), 16);
  assert.equal(editPointOffsetUnits(score, end), 24);
  assert.equal(jumpScoreEditPoint(score, start, 1).measureId, "measure-2");
  assert.equal(edgeScoreEditPoint(score, end, "score-start").anchor.kind, "start");
  assert.equal(edgeScoreEditPoint(score, start, "score-end").measureId, "measure-2");
});

test("backspace lookup crosses measure boundaries and normalization repairs stale anchors", () => {
  const secondStart = scoreEditPoints(score).find((point) => point.measureId === "measure-2" && point.offsetUnits === 0)!;
  assert.equal(previousEventAtPoint(score, secondStart)?.id, "event-2");
  const stale = { ...eventEndPoint(score, "event-2")!, anchor: { kind: "after-event" as const, eventId: "deleted" } };
  const normalized = normalizeScoreEditPoint(score, stale);
  assert.equal(normalized.anchor.kind === "after-event" && normalized.anchor.eventId, "event-2");
  assert.equal(defaultScoreEditPoint(score).measureId, "measure-1");
});

test("an empty 4/4 measure offers four editable beat positions without document events", () => {
  const empty: StaffView = { kind: "staff", partId: "part", staffId: "staff", clef: "treble",
    measures: [{ id: "empty", voiceId: "voice", meter: { numerator: 4, denominator: 4 }, events: [] }] };
  const points = scoreEditPoints(empty);
  assert.deepEqual(points.map((point) => point.offsetUnits), [0, 16, 32, 48]);
  assert.ok(points.every((point) => point.anchor.kind === "start"));
  assert.deepEqual(empty.measures[0]!.events, []);
});
