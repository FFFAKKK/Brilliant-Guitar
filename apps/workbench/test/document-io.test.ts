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

test("超拍谱面保存和重开后保留内容，并从内核重新推导规则提示", () => {
  const service = new ScoreSessionService();
  const sourceWorkspace = randomUUID(), restoredWorkspace = randomUUID();
  let current = service.create(sourceWorkspace, randomUUID(), null, { title: "超拍往返", measureCount: 1 });
  for (let index = 0; index < 5; index++) {
    const measure = current.notation.kind === "staff" ? current.notation.measures[0]! : null;
    const last = measure?.events.at(-1);
    current = service.edit(sourceWorkspace, { requestId: randomUUID(), documentId: current.documentId,
      expectedVersion: current.documentVersion, action: { kind: "append", measureId: "measure-1",
        anchor: last ? { kind: "after-event", eventId: last.id } : { kind: "start" },
        duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } } } });
  }
  assert.equal(current.notation.kind === "staff" && current.notation.measures[0]!.ruleWarnings.length, 1);
  const restored = service.importDocument(restoredWorkspace, JSON.parse(service.exportDocument(sourceWorkspace)));
  assert.equal(restored.notation.kind, "staff");
  if (restored.notation.kind !== "staff" || current.notation.kind !== "staff") return;
  assert.deepEqual(restored.notation.measures[0]!.events, current.notation.measures[0]!.events);
  assert.deepEqual(restored.notation.measures[0]!.ruleWarnings, current.notation.measures[0]!.ruleWarnings);
  assert.equal(restored.undoDepth, 0);
});

test("打开无法识别的文件不会覆盖当前工作区", () => {
  const service = new ScoreSessionService();
  const workspace = randomUUID();
  const before = service.create(workspace, randomUUID(), null, { title: "保留作品", measureCount: 1 });
  assert.throws(() => service.importDocument(workspace, { schemaVersion: "future-score-version" }), (error: unknown) =>
    error instanceof WorkbenchHostError && error.status === 422);
  assert.deepEqual(service.read(workspace), before);
});
