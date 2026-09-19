import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { ScoreSessionService, WorkbenchHostError } from "../host/score-session.ts";
import { isScoreEditRequest } from "../src/contracts/note-input.ts";
import type { ScoreEditAction } from "../src/contracts/note-input.ts";
import { isNotationView } from "../src/contracts/notation.ts";
import type { StaffView } from "../src/contracts/notation.ts";
import { accidentalForEvent, inheritedAlterAtPoint } from "../src/editor/accidental-state.ts";
import { layoutScorePages } from "../src/notation/score-page-layout.ts";

function fixture(measureCount = 4) {
  const service = new ScoreSessionService(), workspace = randomUUID();
  let session = service.create(workspace, randomUUID(), null, { title: "调号流程", measureCount });
  const edit = (action: ScoreEditAction) => {
    session = service.edit(workspace, { requestId: randomUUID(), documentId: session.documentId,
      expectedVersion: session.documentVersion, action });
    return session;
  };
  const view = () => {
    assert.equal(session.notation.kind, "staff");
    if (session.notation.kind !== "staff") throw new Error("Expected staff notation");
    return session.notation;
  };
  return { service, workspace, edit, view, read: () => session,
    replace(next: typeof session) { session = next; } };
}

test("the workbench exposes sparse key-signature changes and round-trips them through save and reopen", () => {
  const f = fixture();
  const view = f.view(), measures = view.measures;
  const beforePlayback = f.read().playbackSource;
  const before = JSON.parse(f.service.exportDocument(f.workspace)) as { parts: unknown; extensions: unknown[] };

  f.edit({ kind: "set-key-signature", partId: view.partId, measureId: measures[0]!.id,
    change: { kind: "set", fifths: 1 } });
  f.edit({ kind: "set-key-signature", partId: view.partId, measureId: measures[2]!.id,
    change: { kind: "set", fifths: -2 } });
  assert.deepEqual(f.view().keySignatureChanges, [
    { measureId: measures[0]!.id, measureIndex: 0, fifths: 1 },
    { measureId: measures[2]!.id, measureIndex: 2, fifths: -2 },
  ]);
  const afterPlayback = f.read().playbackSource;
  assert.equal(beforePlayback.kind, "ready");
  assert.equal(afterPlayback.kind, "ready");
  if (beforePlayback.kind === "ready" && afterPlayback.kind === "ready") {
    assert.deepEqual({ bpm: afterPlayback.bpm, writtenToSounding: afterPlayback.writtenToSounding,
      measures: afterPlayback.measures }, { bpm: beforePlayback.bpm,
      writtenToSounding: beforePlayback.writtenToSounding, measures: beforePlayback.measures });
  }

  const saved = f.service.exportDocument(f.workspace);
  const persisted = JSON.parse(saved) as {
    parts: unknown;
    extensions: Array<{ namespace: string; payload: { changes: unknown[] } }>;
  };
  assert.deepEqual(persisted.parts, before.parts);
  assert.equal(persisted.extensions.length, 1);
  assert.equal(persisted.extensions[0]?.namespace, "brilliant.notation.key-signature");
  assert.equal(persisted.extensions[0]?.payload.changes.length, 2);

  f.replace(f.service.importDocument(f.workspace, persisted));
  assert.deepEqual(f.view().keySignatureChanges, [
    { measureId: measures[0]!.id, measureIndex: 0, fifths: 1 },
    { measureId: measures[2]!.id, measureIndex: 2, fifths: -2 },
  ]);
});

test("key signatures establish the accidental baseline while bar-local overrides still reset", () => {
  const f = fixture(2), initial = f.view(), first = initial.measures[0]!;
  f.edit({ kind: "set-key-signature", partId: initial.partId, measureId: first.id,
    change: { kind: "set", fifths: 1 } });
  f.edit({ kind: "append", measureId: first.id, anchor: { kind: "start" }, duration: { base: 4, dots: 0 },
    content: { kind: "note", pitch: { step: "F", octave: 4, alter: 1 } } });
  const sharp = f.view().measures[0]!.events[0]!;
  f.edit({ kind: "append", measureId: first.id, anchor: { kind: "after-event", eventId: sharp.id },
    duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "F", octave: 4, alter: 0 } } });
  const view = f.view(), measure = view.measures[0]!, natural = measure.events[1]!;
  assert.equal(accidentalForEvent(measure, sharp.id, 1), "none");
  assert.equal(accidentalForEvent(measure, natural.id, 1), "natural");
  const next = view.measures[1]!;
  assert.equal(inheritedAlterAtPoint(view, { partId: view.partId, staffId: view.staffId, measureId: next.id,
    voiceId: next.voiceId, anchor: { kind: "start" }, offsetUnits: 0, preferredPitch: null },
  { step: "F", octave: 4 }), 1);
});

test("layout repeats effective signatures at system starts and marks an in-system change with cancellation context", () => {
  const f = fixture(8), view = f.view();
  f.edit({ kind: "set-key-signature", partId: view.partId, measureId: view.measures[0]!.id,
    change: { kind: "set", fifths: 3 } });
  f.edit({ kind: "set-key-signature", partId: view.partId, measureId: view.measures[2]!.id,
    change: { kind: "set", fifths: 0 } });
  const pages = layoutScorePages(f.view());
  const measures = pages.flatMap(page => page.measures);
  const changed = measures.find(item => item.measure.id === view.measures[2]!.id)!;
  assert.equal(changed.showKeySignature, true);
  assert.equal(changed.previousKeySignatureFifths, 3);
  assert.equal(changed.keySignatureFifths, 0);
  for (const item of measures.filter(item => item.beginsSystem)) assert.equal(item.showKeySignature, true);
});

test("removing a change-bearing measure cleans the module state in the same undoable transaction", () => {
  const f = fixture(3), before = f.view(), target = before.measures[1]!;
  f.edit({ kind: "set-key-signature", partId: before.partId, measureId: target.id,
    change: { kind: "set", fifths: 4 } });
  const changed = f.read();
  const removed = f.edit({ kind: "remove-measure", measureId: target.id });
  assert.equal(removed.measureCount, 2);
  assert.deepEqual(f.view().keySignatureChanges, []);
  const restored = f.edit({ kind: "undo" });
  assert.equal(restored.measureCount, 3);
  assert.deepEqual(restored.notation, changed.notation);
});

test("projection transport validation rejects malformed sparse key-signature coordinates", () => {
  const f = fixture(2), view: StaffView = f.view();
  assert.equal(view.keySignatureChanges?.length, 0);
  const malformed: StaffView = { ...view, keySignatureChanges: [
    { measureId: view.measures[1]!.id, measureIndex: 0, fifths: 1 },
  ] };
  assert.equal(isNotationView(malformed), false);
});

test("key-signature edit transport is closed and stale targets return actionable errors", () => {
  const f = fixture(2), view = f.view(), measureId = view.measures[0]!.id;
  const envelope = { requestId: randomUUID(), documentId: f.read().documentId,
    expectedVersion: f.read().documentVersion };
  assert.equal(isScoreEditRequest({ ...envelope, action: { kind: "set-key-signature", partId: view.partId,
    measureId, change: { kind: "set", fifths: 7 } } }), true);
  assert.equal(isScoreEditRequest({ ...envelope, action: { kind: "set-key-signature", partId: view.partId,
    measureId, change: { kind: "set", fifths: 8 } } }), false);
  assert.equal(isScoreEditRequest({ ...envelope, action: { kind: "set-key-signature", partId: view.partId,
    measureId, change: { kind: "inherit" } } }), true);
  assert.throws(() => f.edit({ kind: "set-key-signature", partId: "missing-part", measureId,
    change: { kind: "set", fifths: 1 } }), (error: unknown) => error instanceof WorkbenchHostError
      && error.status === 409 && error.issue?.code === "editor.part-stale");
  assert.throws(() => f.edit({ kind: "set-key-signature", partId: view.partId, measureId: "missing-measure",
    change: { kind: "set", fifths: 1 } }), (error: unknown) => error instanceof WorkbenchHostError
      && error.status === 409 && error.issue?.code === "editor.measure-stale");
});
