import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { advancePitchEntry } from "../src/editor/pitch-entry.ts";
import type { PitchDraft } from "../src/editor/pitch-entry.ts";
import { ScoreSessionService } from "../host/score-session.ts";
import { nextMeasure } from "../src/notation/input-position.ts";

test("pitch entry waits for octave and allows replacing or cancelling an unfinished letter", () => {
  assert.deepEqual(advancePitchEntry(null, "a"), { handled: true, draft: "A" });
  assert.deepEqual(advancePitchEntry("A", "G"), { handled: true, draft: "G" });
  assert.deepEqual(advancePitchEntry("G", "4"), { handled: true, draft: null, pitch: { step: "G", octave: 4 } });
  assert.deepEqual(advancePitchEntry("A", "Backspace"), { handled: true, draft: null });
  assert.deepEqual(advancePitchEntry(null, "Backspace"), { handled: true, draft: null });
});

test("invalid octave and unrelated keys cannot commit, and key repeat cannot duplicate a note or rest", () => {
  for (const key of ["0", "1", "7", "8", "9"]) {
    const result = advancePitchEntry("A", key);
    assert.equal(result.draft, "A"); assert.ok(result.message); assert.equal(result.pitch, undefined);
  }
  assert.ok(advancePitchEntry(null, "4").message);
  assert.deepEqual(advancePitchEntry("A", "Enter"), { handled: false, draft: "A" });
  assert.deepEqual(advancePitchEntry("A", "4", true), { handled: true, draft: "A" });
  assert.deepEqual(advancePitchEntry(null, "r", true), { handled: true, draft: null });
  assert.deepEqual(advancePitchEntry("A", "r"), { handled: true, draft: null, rest: true });
  for (const key of ["2", "6"]) assert.equal(advancePitchEntry("C", key).pitch?.octave, Number(key));
});

test("letter drafts never enter Native history; every complete pair produces exactly one undo step", () => {
  const service = new ScoreSessionService(), workspace = randomUUID();
  let session = service.create(workspace, randomUUID(), null, { title: "音名组号验证", measureCount: 2 });
  let draft: PitchDraft = null, measureId = "measure-1";
  for (const key of "a4b4c5d5e5") {
    const before = service.read(workspace);
    const result = advancePitchEntry(draft, key);
    draft = result.draft;
    if (!result.pitch) { assert.deepEqual(service.read(workspace), before); continue; }
    const activeMeasure = session.notation.kind === "staff" ? session.notation.measures.find((measure) => measure.id === measureId) : null;
    const last = activeMeasure?.events.at(-1);
    session = service.edit(workspace, { requestId: randomUUID(), documentId: session.documentId,
      expectedVersion: session.documentVersion, action: { kind: "append", measureId,
        anchor: last ? { kind: "after-event", eventId: last.id } : { kind: "start" },
        duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { ...result.pitch, alter: 0 } } } });
    assert.equal(session.notation.kind, "staff");
    if (session.notation.kind === "staff") measureId = nextMeasure(session.notation, measureId);
  }
  assert.equal(session.documentVersion, 5); assert.equal(session.undoDepth, 5);
  assert.equal(measureId, "measure-2");
  if (session.notation.kind !== "staff") return;
  assert.deepEqual(session.notation.measures.flatMap((measure) => measure.events.map((event) =>
    event.content.kind === "note" ? `${event.content.pitch.step}${event.content.pitch.octave}` : "R")), ["A4", "B4", "C5", "D5", "E5"]);
  const undone = service.edit(workspace, { requestId: randomUUID(), documentId: session.documentId,
    expectedVersion: session.documentVersion, action: { kind: "undo" } });
  assert.equal(undone.undoDepth, 4); assert.equal(undone.redoDepth, 1);
  assert.equal(undone.notation.kind === "staff" && undone.notation.measures[1]!.events.length, 0);
});
