import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ScoreSessionService, WorkbenchHostError } from "../host/score-session.ts";
import { durationUnits, isScoreEditRequest } from "../src/contracts/note-input.ts";
import type { ScoreEditAction } from "../src/contracts/note-input.ts";

function fixture() {
  const service = new ScoreSessionService(), workspace = randomUUID();
  let session = service.create(workspace, randomUUID(), null, { title: "删除验证", measureCount: 2 });
  function edit(action: ScoreEditAction) {
    session = service.edit(workspace, { requestId: randomUUID(), documentId: session.documentId,
      expectedVersion: session.documentVersion, action });
    return session;
  }
  for (const step of ["C", "D", "E"] as const) {
    const measure = session.notation.kind === "staff" ? session.notation.measures[0]! : null;
    const last = measure?.events.at(-1);
    edit({ kind: "append", measureId: "measure-1", anchor: last ? { kind: "after-event", eventId: last.id } : { kind: "start" },
      duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step, octave: 4, alter: 0 } } });
  }
  return { service, workspace, edit, read: () => session };
}

test("deleting first, middle or last notes preserves rhythmic positions in one atomic undo step", () => {
  for (const index of [0, 1, 2]) {
    const f = fixture(), before = f.read();
    if (before.notation.kind !== "staff") throw new Error("Expected staff");
    const original = before.notation.measures[0]!.events, target = original[index]!;
    const result = f.edit({ kind: "delete-event", eventId: target.id });
    assert.equal(result.documentVersion, before.documentVersion + 1);
    assert.equal(result.undoDepth, before.undoDepth + 1);
    if (result.notation.kind !== "staff") throw new Error("Expected staff");
    const events = result.notation.measures[0]!.events;
    assert.deepEqual(events, original.map((event, i) => i === index ? { ...event, content: { kind: "rest" } } : event));
    assert.deepEqual(events.map((_, i) => events.slice(0, i).reduce((sum, event) => sum + durationUnits(event.duration), 0)), [0, 16, 32]);
    assert.deepEqual(f.edit({ kind: "undo" }).notation, before.notation);
    assert.deepEqual(f.edit({ kind: "redo" }).notation, result.notation);
  }
});

test("an existing rest can be removed from the middle and the collapsed time is undoable", () => {
  const f = fixture(), before = f.read();
  if (before.notation.kind !== "staff") throw new Error("Expected staff");
  const events = before.notation.measures[0]!.events;
  const middleRest = f.edit({ kind: "delete-event", eventId: events[1]!.id });
  const removed = f.edit({ kind: "delete-event", eventId: events[1]!.id });
  assert.equal(removed.notation.kind === "staff" && removed.notation.measures[0]!.events.length, 2);
  assert.deepEqual(removed.notation.kind === "staff" && removed.notation.measures[0]!.events.map((event) => event.id),
    [events[0]!.id, events[2]!.id]);
  assert.throws(() => f.edit({ kind: "delete-event", eventId: events[1]!.id }),
    (error: unknown) => error instanceof WorkbenchHostError && error.status === 409);
  assert.deepEqual(f.edit({ kind: "undo" }).notation, middleRest.notation);
});

test("collapse deletion removes a note and shifts later events in one undo step", () => {
  const f = fixture(), before = f.read();
  if (before.notation.kind !== "staff") throw new Error("Expected staff");
  const events = before.notation.measures[0]!.events;
  const collapsed = f.edit({ kind: "delete-event", eventId: events[1]!.id, timePolicy: "collapse" });
  assert.equal(collapsed.documentVersion, before.documentVersion + 1);
  assert.equal(collapsed.undoDepth, before.undoDepth + 1);
  assert.deepEqual(collapsed.notation.kind === "staff" && collapsed.notation.measures[0]!.events.map((event) => event.id),
    [events[0]!.id, events[2]!.id]);
  assert.deepEqual(f.edit({ kind: "undo" }).notation, before.notation);
});

test("delete request retries are idempotent and malformed targets fail validation", () => {
  const f = fixture(), before = f.read();
  if (before.notation.kind !== "staff") throw new Error("Expected staff");
  const request = { requestId: randomUUID(), documentId: before.documentId, expectedVersion: before.documentVersion,
    action: { kind: "delete-event" as const, eventId: before.notation.measures[0]!.events[0]!.id } };
  const result = f.service.edit(f.workspace, request);
  assert.deepEqual(f.service.edit(f.workspace, request), result);
  assert.ok(isScoreEditRequest(request));
  assert.ok(isScoreEditRequest({ ...request, action: { ...request.action, timePolicy: "collapse" } }));
  assert.ok(!isScoreEditRequest({ ...request, action: { ...request.action, timePolicy: "stretch" } }));
  assert.ok(!isScoreEditRequest({ ...request, action: { kind: "delete-event", eventId: "" } }));
});
