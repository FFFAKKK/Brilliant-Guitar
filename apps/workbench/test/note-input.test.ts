import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ScoreSessionService, WorkbenchHostError } from "../host/score-session.ts";
import { isScoreEditRequest } from "../src/contracts/note-input.ts";
import type { ScoreEditAction, ScoreEditRequest } from "../src/contracts/note-input.ts";
import { nextMeasure, pitchAtY, yForPitch } from "../src/notation/input-position.ts";

function fixture(count = 2) {
  const service = new ScoreSessionService(), workspace = randomUUID();
  const initial = service.create(workspace, randomUUID(), null, { title: "输入测试", measureCount: count });
  const request = (action: ScoreEditAction): ScoreEditRequest => ({ requestId: randomUUID(), documentId: initial.documentId,
    expectedVersion: service.read(workspace)!.documentVersion, action });
  const edit = (action: ScoreEditAction) => service.edit(workspace, request(action));
  return { service, workspace, initial, request, edit };
}
const quarter: ScoreEditAction = { kind: "append", measureId: "measure-1", anchor: { kind: "start" }, duration: { base: 4, dots: 0 },
  content: { kind: "note", pitch: { step: "C", octave: 4, alter: 1 } } };

test("Native append, capacity boundary, undo and redo preserve real content and history", () => {
  const f = fixture();
  const first = f.edit(quarter);
  assert.equal(first.documentVersion, 1); assert.equal(first.undoDepth, 1); assert.equal(first.redoDepth, 0);
  assert.equal(first.notation.kind, "staff");
  if (first.notation.kind !== "staff") return;
  assert.deepEqual(first.notation.measures[0]!.events[0]!.content, quarter.content);
  assert.equal(nextMeasure(first.notation, "measure-1"), "measure-1");
  f.edit(quarter); f.edit(quarter);
  const full = f.edit(quarter);
  assert.equal(full.notation.kind, "staff");
  if (full.notation.kind !== "staff") return;
  assert.equal(nextMeasure(full.notation, "measure-1"), "measure-2");
  assert.throws(() => f.edit(quarter), (error: unknown) => error instanceof WorkbenchHostError && error.status === 422);
  assert.deepEqual(f.service.read(f.workspace), full);
  const undone = f.edit({ kind: "undo" });
  assert.equal(undone.undoDepth, 3); assert.equal(undone.redoDepth, 1);
  assert.equal(undone.notation.kind === "staff" && undone.notation.measures[0]!.events.length, 3);
  const redone = f.edit({ kind: "redo" });
  assert.deepEqual(redone.notation, full.notation);
  assert.equal(redone.documentVersion, 6); assert.equal(redone.redoDepth, 0);
});

test("dotted rests use exact capacity and new input after undo clears redo", () => {
  const f = fixture(1);
  f.edit({ ...quarter, duration: { base: 2, dots: 1 }, content: { kind: "rest" } });
  const current = f.service.read(f.workspace)!;
  const firstId = current.notation.kind === "staff" ? current.notation.measures[0]!.events[0]!.id : "";
  const result = f.edit({ ...quarter, anchor: { kind: "after-event", eventId: firstId } });
  assert.equal(result.notation.kind, "staff");
  if (result.notation.kind !== "staff") return;
  assert.deepEqual(result.notation.measures[0]!.events[0]!.duration, { base: 2, dots: 1 });
  assert.equal(result.notation.measures[0]!.events[0]!.content.kind, "rest");
  assert.throws(() => f.edit(quarter), WorkbenchHostError);
  f.edit({ kind: "undo" });
  const branched = f.edit({ ...quarter, duration: { base: 8, dots: 1 } });
  assert.equal(branched.redoDepth, 0);
  assert.throws(() => f.edit(quarter), WorkbenchHostError);
});

test("filling the final measure appends one blank measure in the same undo step", () => {
  const f = fixture(1);
  f.edit(quarter); f.edit(quarter); f.edit(quarter);
  const filled = f.edit(quarter);
  assert.equal(filled.measureCount, 2);
  assert.equal(filled.notation.kind === "staff" && filled.notation.measures[1]?.events.length, 0);
  const undone = f.edit({ kind: "undo" });
  assert.equal(undone.measureCount, 1);
  assert.equal(undone.notation.kind === "staff" && undone.notation.measures[0]?.events.length, 3);
  const redone = f.edit({ kind: "redo" });
  assert.equal(redone.measureCount, 2);
  if (redone.notation.kind !== "staff") return;
  const continued = f.edit({ ...quarter, measureId: redone.notation.measures[1]!.id });
  assert.equal(continued.notation.kind === "staff" && continued.notation.measures[1]?.events.length, 1);
});

test("an explicit sequence anchor inserts at the caret instead of silently appending at the measure tail", () => {
  const f = fixture(1);
  const first = f.edit({ ...quarter, content: { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } } });
  if (first.notation.kind !== "staff") throw new Error("Expected staff");
  const c = first.notation.measures[0]!.events[0]!;
  const second = f.edit({ ...quarter, anchor: { kind: "after-event", eventId: c.id },
    content: { kind: "note", pitch: { step: "E", octave: 4, alter: 0 } } });
  if (second.notation.kind !== "staff") throw new Error("Expected staff");
  const e = second.notation.measures[0]!.events[1]!;
  const inserted = f.edit({ ...quarter, anchor: { kind: "after-event", eventId: c.id },
    content: { kind: "note", pitch: { step: "D", octave: 4, alter: 0 } } });
  if (inserted.notation.kind !== "staff") throw new Error("Expected staff");
  assert.deepEqual(inserted.notation.measures[0]!.events.map((event) => event.content.kind === "note" ? event.content.pitch.step : "R"), ["C", "D", "E"]);
  assert.equal(inserted.notation.measures[0]!.events[2]!.id, e.id);
});

test("input at a later empty beat materializes the silent gap and remains one undo step", () => {
  const f = fixture(1);
  const placed = f.edit({ ...quarter, offsetUnits: 32, content: { kind: "note", pitch: { step: "G", octave: 4, alter: 0 } } });
  if (placed.notation.kind !== "staff") throw new Error("Expected staff");
  const events = placed.notation.measures[0]!.events;
  assert.equal(placed.undoDepth, 1);
  assert.deepEqual(events.map((event) => [event.content.kind, event.duration]), [
    ["rest", { base: 2, dots: 0 }], ["note", { base: 4, dots: 0 }],
  ]);
  const undone = f.edit({ kind: "undo" });
  assert.equal(undone.notation.kind === "staff" && undone.notation.measures[0]!.events.length, 0);
});

test("retry is idempotent and stale or malformed edits never mutate the session", () => {
  const f = fixture(), request = f.request(quarter);
  const first = f.service.edit(f.workspace, request);
  assert.deepEqual(f.service.edit(f.workspace, request), first);
  assert.throws(() => f.service.edit(f.workspace, { ...request, action: { kind: "undo" } }), WorkbenchHostError);
  assert.throws(() => f.service.edit(f.workspace, { ...request, requestId: randomUUID() }), WorkbenchHostError);
  assert.deepEqual(f.service.read(f.workspace), first);
  f.edit(quarter);
  assert.throws(() => f.service.edit(f.workspace, request), WorkbenchHostError);
  assert.ok(isScoreEditRequest(f.request(quarter)));
  for (const content of [{ kind: "note", pitch: { step: "X", octave: 4, alter: 0 } },
    { kind: "note", pitch: { step: "C", octave: 9, alter: 0 } }, { kind: "notes", notes: [] }]) {
    assert.equal(isScoreEditRequest({ ...f.request(quarter), action: { ...quarter, content } }), false);
  }
  assert.equal(isScoreEditRequest({ ...f.request(quarter), action: { ...quarter, duration: { base: 3, dots: 0 } } }), false);
});

test("staff pointer pitch maps lines and ledger positions within the input range", () => {
  assert.deepEqual(pitchAtY(100, 100, 10), { step: "E", octave: 4, alter: 0 });
  assert.deepEqual(pitchAtY(110, 100, 10), { step: "C", octave: 4, alter: 0 });
  assert.deepEqual(pitchAtY(60, 100, 10), { step: "F", octave: 5, alter: 0 });
  assert.deepEqual(pitchAtY(-900, 100, 10), { step: "B", octave: 6, alter: 0 });
  for (const pitch of [{ step: "C" as const, octave: 4, alter: 0 as const },
    { step: "B" as const, octave: 4, alter: 1 as const }, { step: "F" as const, octave: 5, alter: -1 as const }]) {
    assert.deepEqual(pitchAtY(yForPitch(pitch, 100, 10), 100, 10), { ...pitch, alter: 0 });
  }
});
