import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { ScoreSessionService } from "../host/score-session.ts";
import { createReadonlyScoreDocumentSession } from "../src/services/readonly-score-document-session.ts";
import { WorkbenchClient } from "../src/services/workbench-client.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { isScoreEditRequest } from "../src/contracts/note-input.ts";
import { isScoreSessionRead } from "../src/contracts/score-session.ts";
import type { ScoreEditRequest, DocumentMetadataInput } from "../src/contracts/note-input.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import { validateDocumentMetadataFields as validate } from "../src/contracts/document-metadata.ts";

const metadata = { title: "练习曲", authors: ["作者甲", "Doe, Jane"], tempoBpm: 132.5 };
function fixture(dispatch?: (apply: () => ScoreSessionRead) => Promise<ScoreSessionRead>, missing = false) {
  const host = new ScoreSessionService(), workspace = randomUUID(), writes: ScoreEditRequest[] = [];
  let current = host.create(workspace, randomUUID(), null, { title: "初始作品", measureCount: 2 });
  const project = (): ScoreSessionRead => { const { metadata: _metadata, ...legacy } = current; return missing ? legacy : current; };
  const client = { read: async () => project(), usesNativeFiles: () => false,
    create: async () => { throw new Error("unexpected create"); }, createGuarded: async () => { throw new Error("unexpected replacement"); },
    openNativeDocumentGuarded: async () => null,
    edit: async (request: ScoreEditRequest) => { writes.push(structuredClone(request));
      const apply = () => (current = host.edit(workspace, request)); return dispatch ? dispatch(apply) : apply(); } };
  const source = createReadonlyScoreDocumentSession({ client });
  const request = (value: DocumentMetadataInput = metadata): ScoreEditRequest => ({ requestId: randomUUID(), documentId: current.documentId,
    expectedVersion: current.documentVersion, action: { kind: "set-document-metadata", metadata: value } });
  return { host, workspace, source, writes, request, current: () => current };
}

test("metadata edit uses the original typed Tauri envelope and one atomic session read", async () => {
  const f = fixture(), calls: Array<{ name: string; args: Record<string, unknown> | undefined }> = [];
  const bridge = new TauriWorkbenchHostBridge(async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ name, args }); if (name === "workbench_read_v1") return f.current() as T;
    if (name === "workbench_edit_v1") return f.host.edit(f.workspace, args!.request as unknown as ScoreEditRequest) as T;
    throw new Error("unexpected IPC");
  });
  const source = createReadonlyScoreDocumentSession({ client: new WorkbenchClient(bridge) });
  try {
    await source.read(); const request = f.request(); assert.equal((await source.setDocumentMetadata(request)).ok, true);
    assert.deepEqual(calls.map(call => call.name), ["workbench_read_v1", "workbench_edit_v1"]);
    assert.deepEqual(calls[1]!.args!.request, { workspaceId: calls[0]!.args!.workspaceId, ...request });
    assert.deepEqual(source.snapshot().metadata, metadata); assert.equal(source.snapshot().dirty, true);
    assert.ok(Object.isFrozen(source.snapshot().metadata!.authors));
  } finally { source.dispose(); f.source.dispose(); }
});
test("shared old form rules trim, keep commas inside author names and validate UTF-16 boundaries", () => {
  assert.deepEqual(validate(" ", " 作者甲\r\n\nDoe, Jane ", "132.5").value, { ...metadata, title: "未命名乐谱" });
  assert.equal(validate("😀".repeat(60), "", "1").value?.title.length, 120);
  assert.ok(validate("😀".repeat(61), "", "1").errors.title);
  assert.ok(validate("标题", Array(17).fill("甲").join("\n"), "1").errors.authors);
  assert.ok(validate("标题", "😀".repeat(61), "1").errors.authors);
  for (const tempo of ["", " ", "0", "-1", "NaN", "Infinity"]) assert.ok(validate("", "", tempo).errors.tempo);
});
test("strict metadata guards reject malformed values, extra fields and stale identity before dispatch", async () => {
  const f = fixture();
  try {
    await f.source.read(); const valid = f.request();
    for (const input of [{ ...valid, documentId: "other" }, { ...valid, expectedVersion: 99 }, { ...valid, extra: true },
      { ...valid, action: { kind: "undo" } }, { ...valid, action: { ...valid.action, extra: true } },
      ...[{ ...metadata, extra: true }, { ...metadata, authors: [" "] }, { ...metadata, authors: Array(17).fill("甲") },
        { ...metadata, authors: ["😀".repeat(61)] }, { ...metadata, title: "😀".repeat(61) },
        { ...metadata, tempoBpm: Infinity }, { ...metadata, tempoBpm: 0 }]
        .map(metadata => ({ ...valid, action: { kind: "set-document-metadata", metadata } }))]) {
      assert.equal((await f.source.setDocumentMetadata(input as ScoreEditRequest)).ok, false);
    }
    assert.equal(isScoreEditRequest({ ...valid, action: { ...valid.action, extra: true } }), false);
    assert.equal(f.writes.length, 0);
  } finally { f.source.dispose(); }
});
test("metadata no-op, ordered authors, fractional tempo, history and codec preserve all music", async () => {
  const f = fixture();
  try {
    await f.source.read(); const original = f.current(), clean = f.source.snapshot();
    assert.equal((await f.source.setDocumentMetadata(f.request({ ...original.metadata!, title: " 初始作品 " }))).ok, true);
    assert.deepEqual(f.source.snapshot(), clean); assert.equal(f.writes.length, 0);
    await f.source.setDocumentMetadata(f.request({ ...metadata, title: " 练习曲 ", authors: [" 作者甲 ", "Doe, Jane"] }));
    const next = f.current(); assert.deepEqual(next.metadata, metadata);
    assert.equal(next.undoDepth, original.undoDepth + 1);
    assert.equal(next.notation.kind === "staff" && next.notation.tempoBpm, 132.5);
    assert.deepEqual(next.notation.kind === "staff" && next.notation.measures, original.notation.kind === "staff" && original.notation.measures);
    await f.source.undo(); assert.deepEqual(f.current().metadata, original.metadata);
    await f.source.redo(); assert.deepEqual(f.current().metadata, metadata);
    const reopened = f.host.importDocument(randomUUID(), JSON.parse(f.host.exportDocument(f.workspace)));
    assert.deepEqual(reopened.metadata, metadata); assert.deepEqual(reopened.notation, f.current().notation);
    await f.source.setDocumentMetadata(f.request({ ...metadata, authors: [] }));
    assert.deepEqual(f.current().metadata?.authors, []);
  } finally { f.source.dispose(); }
});
test("legacy metadata absence never becomes an empty author list and mixed tempo reads are rejected", async () => {
  const f = fixture(undefined, true);
  try {
    await f.source.read(); assert.equal(f.source.snapshot().metadata, null);
    const result = await f.source.setDocumentMetadata(f.request());
    assert.equal(!result.ok && result.code, "document.metadata-unavailable"); assert.equal(f.writes.length, 0);
    const original = f.current(), raw = { ...original, notation: original.notation.kind === "staff"
      ? { ...original.notation, tempoBpm: 140 } : original.notation };
    assert.equal(isScoreSessionRead(raw), false);
  } finally { f.source.dispose(); }
});
test("metadata captures mutable authors before notifications and shares the original mutex", async () => {
  let release!: () => void; const gate = new Promise<void>(yes => { release = yes; });
  const f = fixture(async apply => { await gate; return apply(); });
  try {
    await f.source.read(); const value = { ...metadata, authors: [...metadata.authors] }, pending = f.source.setDocumentMetadata(f.request(value));
    value.authors[0] = "mutated"; value.title = "mutated";
    assert.equal((await f.source.setDocumentMetadata(f.request())).ok, false); assert.equal((await f.source.reload()).ok, false);
    release(); assert.equal((await pending).ok, true); assert.deepEqual(f.current().metadata, metadata); assert.equal(f.writes.length, 1);
  } finally { release(); f.source.dispose(); }
});
test("failed, lost, foreign and missing metadata receipts retain the accepted state and never replay", async () => {
  for (const mode of ["failed", "lost", "foreign", "missing", "mismatch"]) {
    const f = fixture(async apply => {
      if (mode === "failed") throw new Error("edit unavailable");
      const next = apply(); if (mode === "lost") throw new Error("receipt lost");
      if (mode === "foreign") return { ...next, documentId: "other" };
      if (mode === "missing") { const { metadata: _metadata, ...legacy } = next; return legacy; }
      return { ...next, metadata: { ...next.metadata!, authors: ["wrong"] } };
    });
    try {
      await f.source.read(); assert.equal((await f.source.setDocumentMetadata(f.request())).ok, false);
      assert.equal(f.source.snapshot().documentVersion, 0); assert.equal(f.source.snapshot().status, "error");
      assert.equal((await f.source.setDocumentMetadata(f.request())).ok, false); assert.equal(f.writes.length, 1);
      await f.source.reload(); assert.equal(f.source.snapshot().documentVersion, mode === "failed" ? 0 : 1);
      assert.equal(f.writes.length, 1);
    } finally { f.source.dispose(); }
  }
});
test("metadata observer disposal prevents dispatch and late results cannot revive the session", async () => {
  const before = fixture(); await before.source.read();
  before.source.subscribeState(() => { if (before.source.snapshot().busy) before.source.dispose(); });
  assert.equal((await before.source.setDocumentMetadata(before.request())).ok, false); assert.equal(before.writes.length, 0);
  let release!: () => void; const gate = new Promise<void>(yes => { release = yes; });
  const late = fixture(async apply => { await gate; return apply(); }); await late.source.read();
  const pending = late.source.setDocumentMetadata(late.request()); late.source.dispose(); release();
  assert.equal((await pending).ok, false); assert.equal(late.source.snapshot().status, "disposed");
});
