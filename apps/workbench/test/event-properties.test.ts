import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ScoreSessionService, WorkbenchHostError } from "../host/score-session.ts";
import { durationUnits, isEventProperties, isScoreEditRequest } from "../src/contracts/note-input.ts";
import type { EventProperties, ScoreEditAction, InputDuration, InputPitch } from "../src/contracts/note-input.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import type { StaffEvent } from "../src/contracts/notation.ts";

function events(read: ScoreSessionRead): readonly StaffEvent[] {
  assert.equal(read.notation.kind, "staff");
  if (read.notation.kind !== "staff") throw new Error("Expected supported projection");
  return read.notation.measures[0]!.events;
}
function fixture() {
  const service = new ScoreSessionService(), workspace = randomUUID();
  let read = service.create(workspace, randomUUID(), null, { title: "属性验证", measureCount: 2 });
  const request = (action: ScoreEditAction) => ({ requestId: randomUUID(), documentId: read.documentId, expectedVersion: read.documentVersion, action });
  const edit = (action: ScoreEditAction) => { read = service.edit(workspace, request(action)); return read; };
  const append = (step: InputPitch["step"], duration: InputDuration = { base: 4, dots: 0 }) => {
    const last = read.notation.kind === "staff" ? read.notation.measures[0]!.events.at(-1) : null;
    return edit({ kind: "append", measureId: "measure-1",
      anchor: last ? { kind: "after-event", eventId: last.id } : { kind: "start" }, duration,
      content: { kind: "note", pitch: { step, octave: 4, alter: 0 } } });
  };
  const set = (event: StaffEvent, patch: Partial<EventProperties>) => edit({
    kind: "set-event-properties", eventId: event.id, properties: { duration: event.duration, content: event.content, ...patch },
  });
  return { service, workspace, request, edit, append, set, read: () => read };
}

test("pitch edits retain event identity and timing, apply atomically, and identical values are no-op", () => {
  const f = fixture();
  f.append("C"); f.append("D"); f.append("E");
  const before = f.read(), target = events(before)[1]!;
  const changed = f.set(target, { content: { kind: "note", pitch: { step: "A", octave: 5, alter: -1 } } });
  assert.equal(changed.documentVersion, before.documentVersion + 1);
  assert.equal(changed.undoDepth, before.undoDepth + 1);
  assert.deepEqual(events(changed)[0], events(before)[0]); assert.deepEqual(events(changed)[2], events(before)[2]);
  assert.equal(events(changed)[1]!.id, target.id);
  assert.deepEqual(f.set(events(changed)[1]!, {}), changed);
  assert.deepEqual(f.edit({ kind: "undo" }).notation, before.notation);
  assert.deepEqual(f.edit({ kind: "redo" }).notation, changed.notation);
});

test("shortening fills the exact gap and extending consumes only adjacent rests without moving the next note", () => {
  const f = fixture();
  f.append("C"); f.append("D"); f.append("E");
  const before = f.read(), target = events(before)[1]!, last = events(before)[2]!;
  const shorter = f.set(target, { duration: { base: 8, dots: 0 } });
  assert.equal(events(shorter).length, 4);
  assert.deepEqual(events(shorter)[2]!.content, { kind: "rest" });
  assert.equal(events(shorter)[3]!.id, last.id);
  assert.equal(events(shorter).slice(0, 3).reduce((sum, e) => sum + durationUnits(e.duration), 0), 32);
  const longer = f.set(events(shorter)[1]!, { duration: { base: 4, dots: 0 } });
  assert.deepEqual(longer.notation, before.notation);
  assert.deepEqual(f.edit({ kind: "undo" }).notation, shorter.notation);
  const conflictBefore = f.read();
  assert.throws(() => f.set(events(conflictBefore)[1]!, { duration: { base: 2, dots: 0 },
    content: { kind: "note", pitch: { step: "F", octave: 6, alter: 1 } } }), (e: unknown) => e instanceof WorkbenchHostError && e.status === 422);
  assert.deepEqual(f.service.read(f.workspace), conflictBefore);
});

test("a dotted sixteenth can be shortened without losing its thirty-second rest gap", () => {
  const f = fixture();
  f.append("C", { base: 16, dots: 1 }); f.append("D");
  const before = f.read(), target = events(before)[0]!;
  const shortened = f.set(target, { duration: { base: 16, dots: 0 } });
  assert.deepEqual(events(shortened)[1]!.duration, { base: 32, dots: 0 });
  assert.deepEqual(events(shortened)[1]!.content, { kind: "rest" });
  assert.deepEqual(f.set(events(shortened)[0]!, { duration: { base: 16, dots: 1 } }).notation, before.notation);
});

test("rest properties preserve later notes; tail values use available capacity; unsupported type changes are rejected", () => {
  const f = fixture();
  f.append("C"); f.append("D"); f.append("E");
  f.edit({ kind: "delete-event", eventId: events(f.read())[1]!.id });
  const original = f.read(), rest = events(original)[1]!;
  const split = f.set(rest, { duration: { base: 8, dots: 0 } });
  assert.equal(events(split)[1]!.content.kind, "rest"); assert.equal(events(split)[2]!.content.kind, "rest");
  assert.deepEqual(events(split)[3], events(original)[2]);
  assert.throws(() => f.set(events(split)[1]!, { content: { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } } }), WorkbenchHostError);
  const last = events(split)[3]!;
  const tail = f.set(last, { duration: { base: 2, dots: 0 } });
  assert.equal(events(tail).reduce((sum, event) => sum + durationUnits(event.duration), 0), 64);
  assert.throws(() => f.set(events(tail)[3]!, { duration: { base: 2, dots: 1 } }), WorkbenchHostError);
  const released = f.set(events(tail)[3]!, { duration: { base: 8, dots: 0 } });
  assert.equal(events(released).length, 4);
});

test("extending a rest never silently consumes the following rest", () => {
  const f = fixture();
  for (let index = 0; index < 4; index++) {
    const previous = events(f.read()).at(-1);
    f.edit({ kind: "append", measureId: "measure-1", anchor: previous ? { kind: "after-event", eventId: previous.id } : { kind: "start" },
      duration: { base: 4, dots: 0 }, content: { kind: "rest" } });
  }
  const before = f.read(), third = events(before)[2]!;
  assert.throws(() => f.set(third, { duration: { base: 2, dots: 0 } }), (error: unknown) =>
    error instanceof WorkbenchHostError && error.status === 422 && error.issue?.code === "editor.rest-would-overwrite-next"
      && error.issue.target.scope === "event" && error.issue.target.measureId === "measure-1");
  assert.deepEqual(f.service.read(f.workspace), before);
});

test("property retry, stale versions, rename history and transport validation use the existing session guarantees", () => {
  const f = fixture(); f.append("C");
  const target = events(f.read())[0]!;
  const action: ScoreEditAction = { kind: "set-event-properties", eventId: target.id,
    properties: { duration: target.duration, content: { kind: "note", pitch: { step: "G", octave: 5, alter: 0 } } } };
  const request = f.request(action), changed = f.service.edit(f.workspace, request);
  assert.deepEqual(f.service.edit(f.workspace, request), changed);
  assert.throws(() => f.service.edit(f.workspace, { ...request, requestId: randomUUID() }), WorkbenchHostError);
  const renamed = f.service.edit(f.workspace, { ...request, expectedVersion: changed.documentVersion, requestId: randomUUID(), action: { kind: "set-title", title: " 新标题 " } });
  assert.equal(renamed.title, "新标题"); assert.deepEqual(renamed.notation, changed.notation);
  const undone = f.service.edit(f.workspace, { ...request, expectedVersion: renamed.documentVersion, requestId: randomUUID(), action: { kind: "undo" } });
  assert.equal(undone.title, "属性验证");
  assert.ok(isScoreEditRequest(request));
  assert.ok(!isScoreEditRequest({ ...request, action: { kind: "set-title", title: "x".repeat(121) } }));
  assert.ok(!isEventProperties({ duration: { base: 32, dots: 1 }, content: { kind: "rest" } }));
  assert.ok(!isEventProperties({ duration: { base: 32, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } } }));
});
