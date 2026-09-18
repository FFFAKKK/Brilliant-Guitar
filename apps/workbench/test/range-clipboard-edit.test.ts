import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ScoreSessionService } from "../host/score-session.ts";
import { createScoreClipboardFragment } from "../src/contracts/score-clipboard.ts";
import type { ScoreEditAction } from "../src/contracts/note-input.ts";

function fixture() {
  const service = new ScoreSessionService(), workspace = randomUUID();
  let session = service.create(workspace, randomUUID(), null, { title: "范围编辑", measureCount: 1 });
  const edit = (action: ScoreEditAction) => {
    session = service.edit(workspace, { requestId: randomUUID(), documentId: session.documentId,
      expectedVersion: session.documentVersion, action });
    return session;
  };
  for (const step of ["C", "D", "E"] as const) {
    if (session.notation.kind !== "staff") throw new Error("Expected staff");
    const measure = session.notation.measures[0]!, last = measure.events.at(-1);
    edit({ kind: "append", measureId: measure.id, anchor: last ? { kind: "after-event", eventId: last.id } : { kind: "start" },
      duration: { base: 8, dots: 0 }, content: { kind: "note", pitch: { step, octave: 4, alter: 0 } } });
  }
  return { edit, read: () => session };
}

test("range deletion is one atomic, undoable Core edit", () => {
  const f = fixture(), before = f.read();
  if (before.notation.kind !== "staff") throw new Error("Expected staff");
  const measure = before.notation.measures[0]!, [first, second] = measure.events;
  const deleted = f.edit({ kind: "delete-range", range: { measureId: measure.id, voiceId: measure.voiceId,
    startEventId: first!.id, endEventId: second!.id } });
  assert.deepEqual(deleted.notation.kind === "staff" && deleted.notation.measures[0]!.events.map((event) => event.content),
    [{ kind: "note", pitch: { step: "E", octave: 4, alter: 0 } }]);
  assert.equal(deleted.undoDepth, before.undoDepth + 1);
  assert.deepEqual(f.edit({ kind: "undo" }).notation, before.notation);
});

test("paste inserts copied events after the target with fresh IDs and one undo step", () => {
  const f = fixture(), before = f.read();
  if (before.notation.kind !== "staff") throw new Error("Expected staff");
  const measure = before.notation.measures[0]!, [first, second] = measure.events;
  const fragment = createScoreClipboardFragment([first!, second!]);
  const pasted = f.edit({ kind: "paste-fragment", measureId: measure.id, voiceId: measure.voiceId,
    anchor: { kind: "after-event", eventId: second!.id }, fragment });
  if (pasted.notation.kind !== "staff") throw new Error("Expected staff");
  const events = pasted.notation.measures[0]!.events;
  assert.deepEqual(events.map((event) => event.content.kind === "note" ? event.content.pitch.step : "R"), ["C", "D", "C", "D", "E"]);
  assert.notEqual(events[2]!.id, first!.id);
  assert.notEqual(events[3]!.id, second!.id);
  assert.equal(pasted.undoDepth, before.undoDepth + 1);
  assert.deepEqual(f.edit({ kind: "undo" }).notation, before.notation);
});

test("paste at a later empty beat materializes the silent gap before the fragment", () => {
  const service = new ScoreSessionService(), workspace = randomUUID();
  let session = service.create(workspace, randomUUID(), null, { title: "空拍粘贴", measureCount: 1 });
  const edit = (action: ScoreEditAction) => {
    session = service.edit(workspace, { requestId: randomUUID(), documentId: session.documentId,
      expectedVersion: session.documentVersion, action });
    return session;
  };
  if (session.notation.kind !== "staff") throw new Error("Expected staff");
  const measure = session.notation.measures[0]!;
  const pasted = edit({ kind: "paste-fragment", measureId: measure.id, voiceId: measure.voiceId,
    anchor: { kind: "start" }, offsetUnits: 32,
    fragment: createScoreClipboardFragment([{ duration: { base: 4, dots: 0 }, content: { kind: "note",
      pitch: { step: "G", octave: 4, alter: 0 } } }]) });
  if (pasted.notation.kind !== "staff") throw new Error("Expected staff");
  assert.deepEqual(pasted.notation.measures[0]!.events.map((event) => event.content.kind), ["rest", "note"]);
  assert.deepEqual(pasted.notation.measures[0]!.events.map((event) => event.duration),
    [{ base: 2, dots: 0 }, { base: 4, dots: 0 }]);
});
