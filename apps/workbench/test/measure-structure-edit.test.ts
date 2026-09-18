import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ScoreSessionService, WorkbenchHostError } from "../host/score-session.ts";
import type { ScoreEditAction } from "../src/contracts/note-input.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";

function fixture(measureCount = 3) {
  const service = new ScoreSessionService(), workspace = randomUUID();
  let session = service.create(workspace, randomUUID(), null, { title: "小节结构编辑", measureCount });
  const edit = (action: ScoreEditAction) => {
    session = service.edit(workspace, { requestId: randomUUID(), documentId: session.documentId,
      expectedVersion: session.documentVersion, action });
    return session;
  };
  return { service, workspace, edit, read: () => session,
    replace(next: typeof session) { session = next; } };
}

function staffMeasures(session: ScoreSessionRead) {
  if (session.notation.kind !== "staff") throw new Error("Expected staff notation");
  return session.notation.measures;
}

test("inserting before and after a measure preserves order, inherits meter, and creates fresh identities", () => {
  const f = fixture();
  const exported = JSON.parse(f.service.exportDocument(f.workspace)) as {
    measureDefinitions: Array<{ id: string; meter: { numerator: number; denominator: number } }>;
  };
  exported.measureDefinitions[1]!.meter = { numerator: 3, denominator: 4 };
  f.replace(f.service.importDocument(f.workspace, exported));
  const before = f.read(), measures = staffMeasures(before), target = measures[1]!;

  const insertedBefore = f.edit({ kind: "insert-measure", measureId: target.id, position: "before" });
  const beforeMeasures = staffMeasures(insertedBefore);
  assert.deepEqual(beforeMeasures.map((measure) => measure.id),
    [measures[0]!.id, beforeMeasures[1]!.id, target.id, measures[2]!.id]);
  assert.deepEqual(beforeMeasures[1]!.meter, target.meter);
  assert.notEqual(beforeMeasures[1]!.id, target.id);
  assert.notEqual(beforeMeasures[1]!.voiceId, target.voiceId);
  assert.equal(beforeMeasures[1]!.events.length, 0);
  assert.equal(insertedBefore.undoDepth, before.undoDepth + 1);

  const insertedAfter = f.edit({ kind: "insert-measure", measureId: target.id, position: "after" });
  const afterMeasures = staffMeasures(insertedAfter);
  const targetIndex = afterMeasures.findIndex((measure) => measure.id === target.id);
  assert.equal(targetIndex, 2);
  assert.deepEqual(afterMeasures[targetIndex + 1]!.meter, target.meter);
  assert.equal(afterMeasures[targetIndex + 1]!.events.length, 0);
  assert.notEqual(afterMeasures[targetIndex + 1]!.id, beforeMeasures[1]!.id);
  assert.notEqual(afterMeasures[targetIndex + 1]!.voiceId, beforeMeasures[1]!.voiceId);
});

test("each measure insertion is one undoable transaction", () => {
  const f = fixture(2), before = f.read(), target = staffMeasures(before)[0]!;
  const inserted = f.edit({ kind: "insert-measure", measureId: target.id, position: "after" });
  assert.equal(inserted.measureCount, before.measureCount + 1);
  assert.equal(inserted.undoDepth, before.undoDepth + 1);
  const undone = f.edit({ kind: "undo" });
  assert.deepEqual(undone.notation, before.notation);
  assert.equal(undone.measureCount, before.measureCount);
  const redone = f.edit({ kind: "redo" });
  assert.deepEqual(redone.notation, inserted.notation);
});

test("removing a measure deletes its contents atomically and undo restores the complete measure", () => {
  const f = fixture(), initial = f.read(), target = staffMeasures(initial)[1]!;
  const withNote = f.edit({ kind: "append", measureId: target.id, anchor: { kind: "start" },
    duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "F", octave: 4, alter: 1 } } });
  const populated = staffMeasures(withNote).find((measure) => measure.id === target.id)!;
  assert.equal(populated.events.length, 1);

  const removed = f.edit({ kind: "remove-measure", measureId: target.id });
  assert.equal(removed.measureCount, withNote.measureCount - 1);
  assert.equal(staffMeasures(removed).some((measure) => measure.id === target.id), false);
  assert.equal(removed.undoDepth, withNote.undoDepth + 1);

  const restored = f.edit({ kind: "undo" });
  assert.deepEqual(staffMeasures(restored).find((measure) => measure.id === target.id), populated);
  assert.deepEqual(staffMeasures(restored).map((measure) => measure.id),
    staffMeasures(withNote).map((measure) => measure.id));
});

test("the host rejects removing the final measure or targeting a stale measure without changing the document", () => {
  const final = fixture(1), beforeFinal = final.read(), measureId = staffMeasures(beforeFinal)[0]!.id;
  assert.throws(() => final.edit({ kind: "remove-measure", measureId }), (error: unknown) =>
    error instanceof WorkbenchHostError && error.status === 422 && error.issue?.code === "editor.measure-required");
  assert.deepEqual(final.service.read(final.workspace), beforeFinal);

  const stale = fixture(2), beforeStale = stale.read();
  assert.throws(() => stale.edit({ kind: "insert-measure", measureId: "missing-measure", position: "after" }),
    (error: unknown) => error instanceof WorkbenchHostError && error.status === 409
      && error.issue?.code === "editor.measure-stale");
  assert.throws(() => stale.edit({ kind: "remove-measure", measureId: "missing-measure" }),
    (error: unknown) => error instanceof WorkbenchHostError && error.status === 409
      && error.issue?.code === "editor.measure-stale");
  assert.deepEqual(stale.service.read(stale.workspace), beforeStale);
});
