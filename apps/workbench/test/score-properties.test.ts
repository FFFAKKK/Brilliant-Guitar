import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ScoreSessionService } from "../host/score-session.ts";
import { isScoreEditRequest } from "../src/contracts/note-input.ts";
import type { ScoreEditAction, ScoreEditRequest } from "../src/contracts/note-input.ts";
import { isScoreSessionRead } from "../src/contracts/score-session.ts";

test("score properties update title, authors and tempo in one undoable Core transaction", () => {
  const service = new ScoreSessionService(), workspace = randomUUID();
  let session = service.create(workspace, randomUUID(), null, { title: "旧标题", measureCount: 3 });
  const initial = session;
  const edit = (action: ScoreEditAction) => {
    session = service.edit(workspace, { requestId: randomUUID(), documentId: session.documentId,
      expectedVersion: session.documentVersion, action });
    return session;
  };

  const changed = edit({ kind: "set-document-metadata", metadata: {
    title: " 新标题 ", authors: [" 作者甲 ", "作者乙"], tempoBpm: 132,
  } });
  assert.deepEqual(changed.metadata, { title: "新标题", authors: ["作者甲", "作者乙"], tempoBpm: 132 });
  assert.equal(changed.title, "新标题");
  assert.equal(changed.undoDepth, initial.undoDepth + 1);
  assert.equal(changed.playbackSource.kind, "ready");
  if (changed.playbackSource.kind === "ready") assert.equal(changed.playbackSource.bpm, changed.metadata?.tempoBpm);
  assert.ok(isScoreSessionRead(changed));

  const undone = edit({ kind: "undo" });
  assert.deepEqual(undone.metadata, initial.metadata);
  const redone = edit({ kind: "redo" });
  assert.deepEqual(redone.metadata, changed.metadata);
  assert.equal(redone.playbackSource.kind === "ready" ? redone.playbackSource.bpm : null, 132);
});

test("initial staff clef uses the existing Core staff definition and remains undoable", () => {
  const service = new ScoreSessionService(), workspace = randomUUID();
  let session = service.create(workspace, randomUUID(), null, { title: "谱号", measureCount: 2 });
  assert.equal(session.notation.kind === "staff" ? session.notation.clef : null, "treble");
  const staffId = session.notation.kind === "staff" ? session.notation.staffId : "";

  session = service.edit(workspace, { requestId: randomUUID(), documentId: session.documentId,
    expectedVersion: session.documentVersion, action: { kind: "set-staff-clef", staffId, clef: "bass" } });
  assert.equal(session.notation.kind === "staff" ? session.notation.clef : null, "bass");
  assert.equal(session.undoDepth, 1);

  session = service.edit(workspace, { requestId: randomUUID(), documentId: session.documentId,
    expectedVersion: session.documentVersion, action: { kind: "undo" } });
  assert.equal(session.notation.kind === "staff" ? session.notation.clef : null, "treble");

  session = service.edit(workspace, { requestId: randomUUID(), documentId: session.documentId,
    expectedVersion: session.documentVersion, action: { kind: "redo" } });
  assert.equal(session.notation.kind === "staff" ? session.notation.clef : null, "bass");
});

test("score properties transport rejects malformed metadata before it reaches the host", () => {
  const base: Omit<ScoreEditRequest, "action"> = {
    requestId: randomUUID(), documentId: randomUUID(), expectedVersion: 0,
  };
  assert.ok(isScoreEditRequest({ ...base, action: { kind: "set-document-metadata", metadata: {
    title: "作品", authors: ["作者"], tempoBpm: 96,
  } } }));
  assert.equal(isScoreEditRequest({ ...base, action: { kind: "set-document-metadata", metadata: {
    title: "作品", authors: [], tempoBpm: 0,
  } } }), false);
  assert.equal(isScoreEditRequest({ ...base, action: { kind: "set-document-metadata", metadata: {
    title: "作品", authors: [""], tempoBpm: 96,
  } } }), false);
  assert.equal(isScoreEditRequest({ ...base, action: { kind: "set-document-metadata", metadata: {
    title: "x".repeat(121), authors: [], tempoBpm: 96,
  } } }), false);
  assert.ok(isScoreEditRequest({ ...base, action: { kind: "set-measure-meter", measureId: "measure-1",
    meter: { numerator: 6, denominator: 8 }, scope: "meter-run" } }));
  assert.equal(isScoreEditRequest({ ...base, action: { kind: "set-measure-meter", measureId: "measure-1",
    meter: { numerator: 0, denominator: 8 }, scope: "meter-run" } }), false);
  assert.equal(isScoreEditRequest({ ...base, action: { kind: "set-measure-meter", measureId: "measure-1",
    meter: { numerator: 4, denominator: 3 }, scope: "measure" } }), false);
  assert.equal(isScoreEditRequest({ ...base, action: { kind: "set-measure-meter", measureId: "measure-1",
    meter: { numerator: 4, denominator: 4 }, scope: "score" } }), false);
  assert.ok(isScoreEditRequest({ ...base, action: { kind: "set-staff-clef", staffId: "staff-1", clef: "alto" } }));
  assert.equal(isScoreEditRequest({ ...base, action: { kind: "set-staff-clef", staffId: "staff-1", clef: "percussion" } }), false);
});
