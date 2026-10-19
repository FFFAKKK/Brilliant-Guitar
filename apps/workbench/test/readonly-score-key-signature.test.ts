import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { ScoreSessionService } from "../host/score-session.ts";
import { createReadonlyScoreDocumentSession } from "../src/services/readonly-score-document-session.ts";
import { WorkbenchClient } from "../src/services/workbench-client.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import type { ScoreEditAction, ScoreEditRequest, KeySignatureChangeInput } from "../src/contracts/note-input.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import { keySignatureStateAtMeasure, keySignatureStates } from "../../../shared/notation/key-signature.ts";

function fixture(dispatch?: (request: ScoreEditRequest, apply: () => ScoreSessionRead) => Promise<ScoreSessionRead>) {
  const host = new ScoreSessionService(), workspace = randomUUID(), writes: ScoreEditRequest[] = [];
  let current = host.create(workspace, randomUUID(), null, { title: "调号入口", measureCount: 3 });
  const source = createReadonlyScoreDocumentSession({ client: {
    read: async () => current, usesNativeFiles: () => false,
    create: async () => { throw new Error("unexpected create"); }, createGuarded: async () => { throw new Error("unexpected replacement"); },
    openNativeDocumentGuarded: async () => null,
    edit: async request => { writes.push(structuredClone(request)); const apply = () => (current = host.edit(workspace, request));
      return dispatch ? dispatch(request, apply) : apply(); },
  } });
  const view = () => { if (current.notation.kind !== "staff") throw new Error("expected staff"); return current.notation; };
  const request = (action: ScoreEditAction): ScoreEditRequest => ({ requestId: randomUUID(), documentId: current.documentId,
    expectedVersion: current.documentVersion, action });
  const key = (change: KeySignatureChangeInput, index = 0) => request({ kind: "set-key-signature", partId: view().partId,
    measureId: view().measures[index]!.id, change });
  return { host, workspace, writes, source, view, request, key, current: () => current };
}

test("key-signature narrow entry uses the actual typed Tauri edit envelope", async () => {
  const f = fixture(), calls: Array<{ name: string; args: Record<string, unknown> | undefined }> = [];
  const bridge = new TauriWorkbenchHostBridge(async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ name, args });
    if (name === "workbench_read_v1") return f.current() as T;
    if (name === "workbench_edit_v1") return f.host.edit(f.workspace, args!.request as unknown as ScoreEditRequest) as T;
    throw new Error("unexpected IPC");
  });
  const source = createReadonlyScoreDocumentSession({ client: new WorkbenchClient(bridge) });
  try {
    await source.read(); const request = f.key({ kind: "set", fifths: 7 });
    assert.equal((await source.setKeySignature(request)).ok, true);
    assert.deepEqual(calls.map(call => call.name), ["workbench_read_v1", "workbench_edit_v1"]);
    assert.deepEqual(calls[1]!.args!.request, { workspaceId: calls[0]!.args!.workspaceId, ...request });
    assert.equal(source.snapshot().dirty, true); assert.equal(source.canReplace(), false);
  } finally { source.dispose(); f.source.dispose(); }
});

test("key entry rejects foreign part/measure, stale versions and extra fields before IPC", async () => {
  const f = fixture();
  try {
    await f.source.read(); const valid = f.key({ kind: "set", fifths: 1 });
    for (const request of [{ ...valid, requestId: "bad" }, { ...valid, documentId: "other" }, { ...valid, expectedVersion: 99 },
      { ...valid, extra: true }, f.request({ kind: "undo" }),
      { ...valid, action: { ...valid.action, partId: "other" } }, { ...valid, action: { ...valid.action, measureId: "missing" } },
      { ...valid, action: { ...valid.action, extra: true } },
      ...[{ kind: "set", fifths: 8 }, { kind: "set", fifths: 1.5 }, { kind: "set", fifths: 1, extra: true },
        { kind: "inherit", fifths: 1 }, { kind: "inherit", extra: true }, { kind: "reset" }]
        .map(change => ({ ...valid, action: { ...valid.action, change } }))]) {
      assert.equal((await f.source.setKeySignature(request as ScoreEditRequest)).ok, false);
    }
    assert.equal(f.writes.length, 0); assert.equal(f.source.snapshot().status, "ready");
  } finally { f.source.dispose(); }
});

test("effective/inherited keys share no-op rules, normalization, history and real codec round-trip", async () => {
  const f = fixture();
  try {
    await f.source.read(); const clean = f.source.snapshot();
    for (const change of [{ kind: "set", fifths: 0 }, { kind: "inherit" }] as const) {
      const result = await f.source.setKeySignature(f.key(change)); assert.equal(result.ok && result.changed, false);
    }
    assert.deepEqual(f.source.snapshot(), clean); assert.equal(f.writes.length, 0);
    await f.source.setKeySignature(f.key({ kind: "set", fifths: 2 }));
    await f.source.setKeySignature(f.key({ kind: "set", fifths: 2 }, 1)); assert.equal(f.writes.length, 1);
    await f.source.setKeySignature(f.key({ kind: "set", fifths: -7 }, 1));
    await f.source.setKeySignature(f.key({ kind: "set", fifths: 0 }, 2));
    f.view().measures.forEach((measure, index) => assert.deepEqual(keySignatureStateAtMeasure(f.view(), measure.id), keySignatureStates(f.view())[index]));
    assert.equal(keySignatureStateAtMeasure(f.view(), "missing"), null);
    assert.equal(keySignatureStateAtMeasure(f.view(), f.view().measures[2]!.id)!.changed, true, "natural cancellation is explicit");
    await f.source.setKeySignature(f.key({ kind: "inherit" }, 2));
    assert.equal(keySignatureStateAtMeasure(f.view(), f.view().measures[2]!.id)!.fifths, -7);
    await f.source.undo(); assert.equal(keySignatureStateAtMeasure(f.view(), f.view().measures[2]!.id)!.fifths, 0);
    await f.source.redo(); const accepted = f.current();
    const reopened = f.host.importDocument(randomUUID(), JSON.parse(f.host.exportDocument(f.workspace)));
    assert.deepEqual(reopened.notation, accepted.notation); assert.equal(reopened.undoDepth, 0);
  } finally { f.source.dispose(); }
});

test("captured key requests remain immutable while all document operations share the mutex", async () => {
  let release!: () => void; const gate = new Promise<void>(yes => { release = yes; });
  const f = fixture(async (_request, apply) => { await gate; return apply(); });
  try {
    await f.source.read(); const request = f.key({ kind: "set", fifths: -2 });
    const pending = f.source.setKeySignature(request);
    if (request.action.kind === "set-key-signature") Object.assign(request.action.change, { fifths: 7 });
    assert.equal((await f.source.setKeySignature(f.key({ kind: "inherit" }))).ok, false);
    assert.equal((await f.source.reload()).ok, false); release(); assert.equal((await pending).ok, true);
    assert.equal(f.view().keySignatureChanges![0]!.fifths, -2); assert.equal(f.writes.length, 1);
  } finally { release(); f.source.dispose(); }
});

test("failed/lost key acknowledgements retain accepted state and only reload reveals host changes", async () => {
  for (const lost of [false, true]) {
    const f = fixture(async (_request, apply) => { if (lost) apply(); throw new Error("key acknowledgement unavailable"); });
    try {
      await f.source.read(); assert.equal((await f.source.setKeySignature(f.key({ kind: "set", fifths: 3 }))).ok, false);
      assert.equal(f.source.snapshot().documentVersion, 0); assert.equal(f.source.snapshot().status, "error");
      assert.equal((await f.source.setKeySignature(f.key({ kind: "set", fifths: 3 }))).ok, false);
      await f.source.reload(); assert.equal(f.source.snapshot().documentVersion, lost ? 1 : 0); assert.equal(f.writes.length, 1);
    } finally { f.source.dispose(); }
  }
});

test("invalid changed key receipts are rejected instead of accepting another or unchanged document", async () => {
  for (const foreign of [false, true]) {
    const f = fixture(async (_request, apply) => { const next = apply(); return foreign ? { ...next, documentId: "other" } : { ...next, documentVersion: 0 }; });
    try {
      await f.source.read(); assert.equal((await f.source.setKeySignature(f.key({ kind: "set", fifths: 1 }))).ok, false);
      assert.equal(f.source.snapshot().documentVersion, 0); assert.equal(f.source.snapshot().status, "error");
    } finally { f.source.dispose(); }
  }
});

test("observer disposal prevents key dispatch and late accepted keys cannot republish a disposed source", async () => {
  const before = fixture(); await before.source.read(); before.source.subscribeState(() => { if (before.source.snapshot().busy) before.source.dispose(); });
  assert.equal((await before.source.setKeySignature(before.key({ kind: "set", fifths: 1 }))).ok, false); assert.equal(before.writes.length, 0);
  let release!: () => void; const gate = new Promise<void>(yes => { release = yes; });
  const late = fixture(async (_request, apply) => { await gate; return apply(); }); await late.source.read();
  let updates = 0; late.source.subscribe(() => { updates++; });
  const pending = late.source.setKeySignature(late.key({ kind: "set", fifths: 1 })); late.source.dispose(); release();
  assert.equal((await pending).ok, false); assert.equal(late.source.snapshot().status, "disposed"); assert.equal(updates, 0);
});
