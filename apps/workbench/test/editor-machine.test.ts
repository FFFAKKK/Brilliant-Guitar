import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ScoreSessionService } from "../host/score-session.ts";
import { initialEditorState, transitionEditor } from "../src/editor/editor-machine.ts";
import { defaultScoreEditPoint, eventStartPoint } from "../src/editor/score-navigation.ts";
import type { ScoreEditPoint } from "../src/editor/score-navigation.ts";
import { scoreIntentToAction } from "../src/application/edit/score-edit-intent.ts";
import { staffInputAdapter } from "../src/editor/staff-input-adapter.ts";

test("one editor state preserves its selected target across rejection and retry", () => {
  const point = { partId: "part", staffId: "staff", measureId: "measure",
    voiceId: "voice", anchor: { kind: "start" as const }, offsetUnits: 0, preferredPitch: null };
  const other = { ...point, measureId: "other" };
  let state = initialEditorState<ScoreEditPoint, string>(point);
  state = transitionEditor(state, { type: "compose", methodId: "staff.pitch", draft: "B" });
  assert.equal(state.composition.kind, "composing");
  state = transitionEditor(state, { type: "select", eventId: "note-1", point });
  assert.equal(state.composition.kind, "idle");
  state = transitionEditor(state, { type: "submit", operation: "update-event", requestId: "request-1" });
  state = transitionEditor(state, { type: "reject", requestId: "request-1", retryable: true });
  assert.equal(state.target.kind, "event");
  state = transitionEditor(state, { type: "locate", point: other });
  state = transitionEditor(state, { type: "point-updated", point: other });
  state = transitionEditor(state, { type: "submit", operation: "delete-event", requestId: "request-2" });
  assert.equal(state.target.kind, "event");
  assert.equal(state.transaction.kind, "failed");
  state = transitionEditor(state, { type: "retry", requestId: "request-1" });
  state = transitionEditor(state, { type: "commit", requestId: "request-1" });
  assert.deepEqual(state.target, { kind: "event", eventId: "note-1", point });
  state = transitionEditor(state, { type: "submit", operation: "delete-event", requestId: "request-2" });
  state = transitionEditor(state, { type: "commit", requestId: "request-2", target: { kind: "caret", point } });
  assert.equal(state.target.kind, "caret");
  assert.equal(state.transaction.kind, "idle");
  let documentState = initialEditorState<ScoreEditPoint, string>(null);
  documentState = transitionEditor(documentState, { type: "submit", operation: "document", requestId: "request-3" });
  assert.equal(documentState.transaction.kind, "applying");
  documentState = transitionEditor(documentState, { type: "commit", requestId: "request-3" });
  assert.equal(documentState.target.kind, "unavailable");
  let rejected = transitionEditor(initialEditorState<ScoreEditPoint, string>(point),
    { type: "submit", operation: "insert-event", requestId: "request-4" });
  rejected = transitionEditor(rejected, { type: "reject", requestId: "request-4", retryable: false });
  rejected = transitionEditor(rejected, { type: "dismiss-failure" });
  rejected = transitionEditor(rejected, { type: "compose", methodId: "staff.pitch", draft: "C" });
  assert.equal(rejected.composition.kind, "composing");
});

test("staff input translates a completed pitch into the existing kernel edit path", () => {
  const service = new ScoreSessionService(), workspace = randomUUID();
  let read = service.create(workspace, randomUUID(), null, { title: "", measureCount: 1 });
  assert.equal(read.notation.kind, "staff");
  if (read.notation.kind !== "staff") throw new Error("Expected staff notation");
  const point = defaultScoreEditPoint(read.notation);
  assert.deepEqual(scoreIntentToAction({ kind: "history", direction: "undo" }, null), { kind: "undo" });
  assert.deepEqual(scoreIntentToAction({ kind: "document", action: { kind: "set-title", title: "Test" } }, null),
    { kind: "set-title", title: "Test" });
  const draft = staffInputAdapter.advance(null, "C");
  const completed = staffInputAdapter.advance(draft.draft, "5");
  assert.deepEqual(completed.pitch, { step: "C", octave: 5 });
  const insert = scoreIntentToAction({ kind: "insert-event", event: { duration: { base: 4, dots: 0 },
    content: { kind: "note", pitch: { ...completed.pitch!, alter: 0 } } } }, point);
  assert.ok(insert);
  read = service.edit(workspace, { requestId: randomUUID(), documentId: read.documentId,
    expectedVersion: read.documentVersion, action: insert });
  assert.equal(read.notation.kind, "staff");
  if (read.notation.kind !== "staff") throw new Error("Expected staff notation");
  const inserted = read.notation.measures[0]!.events[0]!;
  assert.equal(inserted.content.kind, "note");
  assert.ok(eventStartPoint(read.notation, inserted.id));

  const update = scoreIntentToAction({ kind: "update-event", eventId: inserted.id, properties: {
    duration: { base: 8, dots: 0 }, content: { kind: "note", pitch: { step: "B", octave: 4, alter: 0 } },
  } }, point);
  assert.ok(update);
  read = service.edit(workspace, { requestId: randomUUID(), documentId: read.documentId,
    expectedVersion: read.documentVersion, action: update });
  assert.equal(read.notation.kind, "staff");
  if (read.notation.kind !== "staff") throw new Error("Expected staff notation");
  const changed = read.notation.measures[0]!.events[0]!;
  assert.equal(changed.id, inserted.id);
  assert.deepEqual(changed.duration, { base: 8, dots: 0 });
  assert.deepEqual(changed.content, { kind: "note", pitch: { step: "B", octave: 4, alter: 0 } });

  const deletion = scoreIntentToAction({ kind: "delete-event", eventId: inserted.id }, point);
  assert.deepEqual(deletion, { kind: "delete-event", eventId: inserted.id, timePolicy: "preserve" });
  assert.deepEqual(scoreIntentToAction({ kind: "delete-event", eventId: inserted.id }, point, "collapse"),
    { kind: "delete-event", eventId: inserted.id, timePolicy: "collapse" });
  read = service.edit(workspace, { requestId: randomUUID(), documentId: read.documentId,
    expectedVersion: read.documentVersion, action: deletion });
  assert.equal(read.notation.kind, "staff");
  if (read.notation.kind !== "staff") throw new Error("Expected staff notation");
  const deleted = read.notation.measures[0]!.events.find((event) => event.id === inserted.id);
  assert.deepEqual(deleted?.content, { kind: "rest" });
});
