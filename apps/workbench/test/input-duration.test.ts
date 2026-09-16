import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { stepInputDuration } from "../src/editor/input-duration.ts";
import { advancePitchEntry } from "../src/editor/pitch-entry.ts";
import { ScoreSessionService } from "../host/score-session.ts";
import type { InputDuration } from "../src/contracts/note-input.ts";

test("plus halves duration, minus doubles it, and the range is bounded without losing dots", () => {
  let duration: InputDuration = { base: 4, dots: 1 };
  duration = stepInputDuration(duration, 1);
  assert.deepEqual(duration, { base: 8, dots: 1 });
  duration = stepInputDuration(duration, 1);
  assert.deepEqual(duration, { base: 16, dots: 1 });
  assert.deepEqual(stepInputDuration(duration, 1), duration);
  duration = stepInputDuration(stepInputDuration(duration, -1), -1);
  assert.deepEqual(duration, { base: 4, dots: 1 });
  assert.deepEqual(stepInputDuration({ base: 1, dots: 0 }, -1), { base: 1, dots: 0 });
});

test("a draft and duration changes do not edit Core; the octave commits with the latest settings", () => {
  const service = new ScoreSessionService(), workspace = randomUUID();
  const initial = service.create(workspace, randomUUID(), null, { title: "", measureCount: 1 });
  const draft = advancePitchEntry(null, "A");
  const duration = stepInputDuration({ base: 4, dots: 0 }, 1);
  assert.deepEqual(service.read(workspace), initial);
  const completed = advancePitchEntry(draft.draft, "4");
  assert.ok(completed.pitch);
  const written = service.edit(workspace, { requestId: randomUUID(), documentId: initial.documentId,
    expectedVersion: initial.documentVersion, action: { kind: "append", measureId: "measure-1", anchor: { kind: "start" }, duration,
      content: { kind: "note", pitch: { ...completed.pitch, alter: 1 } } } });
  assert.equal(written.undoDepth, 1);
  assert.equal(written.notation.kind, "staff");
  if (written.notation.kind !== "staff") return;
  assert.deepEqual(written.notation.measures[0]!.events[0]!.duration, { base: 8, dots: 0 });
  assert.deepEqual(written.notation.measures[0]!.events[0]!.content, { kind: "note", pitch: { step: "A", octave: 4, alter: 1 } });
  service.edit(workspace, { requestId: randomUUID(), documentId: written.documentId,
    expectedVersion: written.documentVersion, action: { kind: "undo" } });
  assert.deepEqual(service.read(workspace)!.notation, initial.notation);
});
