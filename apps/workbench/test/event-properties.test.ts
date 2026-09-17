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
function ruleWarningCount(read: ScoreSessionRead): number {
  return read.notation.kind === "staff" ? read.notation.measures[0]!.ruleWarnings.length : 0;
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

test("shortening fills the gap; extension consumes adjacent rests before moving later notes", () => {
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
  const shortAgain = f.read();
  const extended = f.set(events(shortAgain)[1]!, { duration: { base: 2, dots: 0 },
    content: { kind: "note", pitch: { step: "F", octave: 6, alter: 1 } } });
  assert.deepEqual(events(extended).map((event) => event.id), [events(shortAgain)[0]!.id, target.id, last.id]);
  assert.equal(events(extended).reduce((sum, event) => sum + durationUnits(event.duration), 0), 64);
  assert.deepEqual(f.edit({ kind: "undo" }).notation, shortAgain.notation);
  const overfull = f.set(events(shortAgain)[1]!, { duration: { base: 1, dots: 0 } });
  assert.equal(events(overfull).reduce((sum, event) => sum + durationUnits(event.duration), 0), 96);
  assert.equal(ruleWarningCount(overfull), 1);
  assert.deepEqual(f.edit({ kind: "undo" }).notation, shortAgain.notation);
});

test("extending a middle note moves later notes when the bar has enough unused time", () => {
  const f = fixture();
  f.append("C", { base: 8, dots: 0 });
  f.append("B", { base: 8, dots: 0 });
  f.append("A", { base: 2, dots: 0 });
  const before = f.read(), [first, middle, last] = events(before);
  assert.equal(events(before).reduce((sum, event) => sum + durationUnits(event.duration), 0), 48);
  const changed = f.set(middle!, { duration: { base: 4, dots: 0 } });
  assert.deepEqual(events(changed).map((event) => event.id), [first!.id, middle!.id, last!.id]);
  assert.deepEqual(events(changed).map((event) => durationUnits(event.duration)), [8, 16, 32]);
  assert.equal(changed.undoDepth, before.undoDepth + 1);
  assert.deepEqual(f.edit({ kind: "undo" }).notation, before.notation);
  assert.deepEqual(f.edit({ kind: "redo" }).notation, changed.notation);
});

test("first, middle and last note edits respect total bar capacity across common durations", () => {
  const durations: InputDuration[] = [
    { base: 16, dots: 0 }, { base: 8, dots: 0 }, { base: 8, dots: 1 },
    { base: 4, dots: 0 }, { base: 4, dots: 1 }, { base: 2, dots: 0 },
  ];
  const sequences: InputDuration[][] = [
    [durations[1]!, durations[1]!, durations[5]!],
    [durations[3]!, durations[1]!, durations[3]!],
    [durations[1]!, durations[3]!, durations[1]!],
    [durations[3]!, durations[3]!, durations[5]!],
    [durations[2]!, durations[2]!, durations[3]!],
  ];
  for (const sequence of sequences) for (const position of [0, 1, 2]) for (const next of durations) {
    const f = fixture();
    for (const [index, duration] of sequence.entries()) f.append((["C", "B", "A"] as const)[index]!, duration);
    const before = f.read(), original = events(before), target = original[position]!;
    const occupiedBefore = original.reduce((sum, event) => sum + durationUnits(event.duration), 0);
    const expected = occupiedBefore
      - durationUnits(target.duration) + durationUnits(next);
    const occupiedAfter = durationUnits(next) < durationUnits(target.duration) && position < original.length - 1
      ? occupiedBefore : expected;
    const label = `${sequence.map((item) => durationUnits(item)).join("+")} at ${position} → ${durationUnits(next)}`;
    const changed = f.set(target, { duration: next });
    assert.deepEqual(events(changed).filter((event) => event.content.kind === "note").map((event) => event.id),
      original.map((event) => event.id), label);
    assert.equal(events(changed).reduce((sum, event) => sum + durationUnits(event.duration), 0), occupiedAfter, label);
    assert.equal(ruleWarningCount(changed), occupiedAfter > 64 ? 1 : 0, label);
    if (durationUnits(next) !== durationUnits(target.duration))
      assert.deepEqual(f.edit({ kind: "undo" }).notation, before.notation, label);
  }
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
  const overfull = f.set(events(tail)[3]!, { duration: { base: 2, dots: 1 } });
  assert.equal(ruleWarningCount(overfull), 1);
  const released = f.set(events(overfull)[3]!, { duration: { base: 8, dots: 0 } });
  assert.equal(events(released).length, 4);
  assert.equal(ruleWarningCount(released), 0);
});

test("extending a rest consumes adjacent silence atomically and can move later notes into free space", () => {
  const f = fixture();
  for (let index = 0; index < 4; index++) {
    const previous = events(f.read()).at(-1);
    f.edit({ kind: "append", measureId: "measure-1", anchor: previous ? { kind: "after-event", eventId: previous.id } : { kind: "start" },
      duration: { base: 4, dots: 0 }, content: { kind: "rest" } });
  }
  const before = f.read(), third = events(before)[2]!;
  const merged = f.set(third, { duration: { base: 2, dots: 0 } });
  assert.deepEqual(events(merged).map((event) => event.id), events(before).slice(0, 3).map((event) => event.id));
  assert.equal(events(merged)[2]!.content.kind, "rest");
  assert.deepEqual(f.edit({ kind: "undo" }).notation, before.notation);

  const g = fixture();
  g.edit({ kind: "append", measureId: "measure-1", anchor: { kind: "start" },
    duration: { base: 8, dots: 0 }, content: { kind: "rest" } });
  g.append("C", { base: 8, dots: 0 });
  g.append("A", { base: 2, dots: 0 });
  const beforeShift = g.read(), [rest, firstNote, secondNote] = events(beforeShift);
  const shifted = g.set(rest!, { duration: { base: 4, dots: 0 } });
  assert.deepEqual(events(shifted).map((event) => event.id), [rest!.id, firstNote!.id, secondNote!.id]);
  assert.equal(events(shifted).reduce((sum, event) => sum + durationUnits(event.duration), 0), 56);
  assert.deepEqual(g.edit({ kind: "undo" }).notation, beforeShift.notation);
});

test("a rest at the beginning, middle or end can change duration without losing note order", () => {
  for (const restAt of [0, 1, 2]) {
    const f = fixture();
    for (let index = 0; index < 3; index++) {
      if (index !== restAt) { f.append(index === 0 ? "C" : "A", { base: 8, dots: 0 }); continue; }
      const previous = events(f.read()).at(-1);
      f.edit({ kind: "append", measureId: "measure-1",
        anchor: previous ? { kind: "after-event", eventId: previous.id } : { kind: "start" },
        duration: { base: 8, dots: 0 }, content: { kind: "rest" } });
    }
    const before = f.read(), original = events(before);
    const changed = f.set(original[restAt]!, { duration: { base: 4, dots: 0 } });
    assert.deepEqual(events(changed).map((event) => event.id), original.map((event) => event.id), `rest at ${restAt}`);
    assert.equal(events(changed).reduce((sum, event) => sum + durationUnits(event.duration), 0), 32);
    assert.deepEqual(f.edit({ kind: "undo" }).notation, before.notation);
  }
});

test("an overfull edit stays in its measure, reports a warning and does not spill into the next measure", () => {
  const f = fixture();
  f.append("C", { base: 2, dots: 0 });
  f.append("A", { base: 2, dots: 0 });
  const before = f.read();
  const changed = f.set(events(before)[0]!, { duration: { base: 1, dots: 0 } });
  assert.equal(ruleWarningCount(changed), 1);
  assert.equal(events(changed).reduce((sum, event) => sum + durationUnits(event.duration), 0), 96);
  assert.equal(changed.notation.kind === "staff" && changed.notation.measures[1]!.events.length, 0);
  assert.deepEqual(f.edit({ kind: "undo" }).notation, before.notation);
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
