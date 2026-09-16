import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ScoreSessionService, WorkbenchHostError } from "../host/score-session.ts";

test("项目乐谱可以保存、打开并继续编辑", () => {
  const service = new ScoreSessionService();
  const sourceWorkspace = randomUUID();
  const restoredWorkspace = randomUUID();
  const source = service.create(sourceWorkspace, randomUUID(), null, { title: "往返验证", measureCount: 1 });
  const edited = service.edit(sourceWorkspace, {
    requestId: randomUUID(), documentId: source.documentId, expectedVersion: source.documentVersion,
    action: { kind: "append", measureId: "measure-1", anchor: { kind: "start" }, duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "A", octave: 4, alter: 0 } } },
  });
  const encoded = service.exportDocument(sourceWorkspace);
  const restored = service.importDocument(restoredWorkspace, JSON.parse(encoded));

  assert.equal(restored.title, "往返验证");
  assert.equal(restored.measureCount, 1);
  assert.deepEqual(restored.notation, edited.notation);
  assert.equal(restored.undoDepth, 0, "打开文件后从干净基线开始，不复制来源历史");

  const continued = service.edit(restoredWorkspace, {
    requestId: randomUUID(), documentId: restored.documentId, expectedVersion: restored.documentVersion,
    action: { kind: "append", measureId: "measure-1", anchor: { kind: "after-event", eventId: restored.notation.kind === "staff" ? restored.notation.measures[0]!.events[0]!.id : "" }, duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "B", octave: 4, alter: 0 } } },
  });
  assert.equal(continued.notation.kind, "staff");
  assert.equal(continued.notation.measures[0]?.events.length, 2);
});

test("打开无法识别的文件不会覆盖当前工作区", () => {
  const service = new ScoreSessionService();
  const workspace = randomUUID();
  const before = service.create(workspace, randomUUID(), null, { title: "保留作品", measureCount: 1 });
  assert.throws(() => service.importDocument(workspace, { schemaVersion: "future-score-version" }), (error: unknown) =>
    error instanceof WorkbenchHostError && error.status === 422);
  assert.deepEqual(service.read(workspace), before);
});
