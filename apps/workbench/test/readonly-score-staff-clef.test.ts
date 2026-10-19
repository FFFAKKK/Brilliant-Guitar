import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { ScoreSessionService } from "../host/score-session.ts";
import { createReadonlyScoreDocumentSession } from "../src/services/readonly-score-document-session.ts";
import { WorkbenchClient } from "../src/services/workbench-client.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { isScoreEditRequest, STAFF_CLEFS } from "../src/contracts/note-input.ts";
import type { ScoreEditAction, ScoreEditRequest, StaffClef } from "../src/contracts/note-input.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";

function fixture(dispatch?: (request: ScoreEditRequest, apply: () => ScoreSessionRead) => Promise<ScoreSessionRead>) {
  const host = new ScoreSessionService(), workspace = randomUUID(), writes: ScoreEditRequest[] = [];
  let current = host.create(workspace, randomUUID(), null, { title: "谱号入口", measureCount: 2 });
  const client = {
    read: async () => current, usesNativeFiles: () => false,
    create: async () => { throw new Error("unexpected create"); }, createGuarded: async () => { throw new Error("unexpected replacement"); },
    openNativeDocumentGuarded: async () => null,
    edit: async (request: ScoreEditRequest) => { writes.push(structuredClone(request)); const apply = () => (current = host.edit(workspace, request));
      return dispatch ? dispatch(request, apply) : apply(); },
  };
  const source = createReadonlyScoreDocumentSession({ client });
  const view = () => { if (current.notation.kind !== "staff") throw new Error("expected staff"); return current.notation; };
  const request = (action: ScoreEditAction): ScoreEditRequest => ({ requestId: randomUUID(), documentId: current.documentId,
    expectedVersion: current.documentVersion, action });
  const clef = (clef: StaffClef) => request({ kind: "set-staff-clef", staffId: view().staffId, clef });
  return { host, workspace, writes, source, view, request, clef, current: () => current };
}

test("staff-clef narrow entry uses the original typed Tauri envelope", async () => {
  const f = fixture(), calls: Array<{ name: string; args: Record<string, unknown> | undefined }> = [];
  const bridge = new TauriWorkbenchHostBridge(async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ name, args });
    if (name === "workbench_read_v1") return f.current() as T;
    if (name === "workbench_edit_v1") return f.host.edit(f.workspace, args!.request as unknown as ScoreEditRequest) as T;
    throw new Error("unexpected IPC");
  });
  const source = createReadonlyScoreDocumentSession({ client: new WorkbenchClient(bridge) });
  try {
    await source.read(); const request = f.clef("bass");
    assert.equal((await source.setStaffClef(request)).ok, true);
    assert.deepEqual(calls.map(call => call.name), ["workbench_read_v1", "workbench_edit_v1"]);
    assert.deepEqual(calls[1]!.args!.request, { workspaceId: calls[0]!.args!.workspaceId, ...request });
    assert.equal(source.snapshot().dirty, true); assert.equal(source.canReplace(), false);
  } finally { source.dispose(); f.source.dispose(); }
});

test("clef entry rejects extra fields, invalid clefs and foreign identities before dispatch", async () => {
  const f = fixture();
  try {
    await f.source.read(); const valid = f.clef("bass");
    for (const input of [{ ...valid, requestId: "bad" }, { ...valid, documentId: "other" }, { ...valid, expectedVersion: 99 },
      { ...valid, extra: true }, f.request({ kind: "undo" }), { ...valid, action: { ...valid.action, staffId: "missing" } },
      ...["percussion", "Bass", null, 1].map(clef => ({ ...valid, action: { ...valid.action, clef } })),
      { ...valid, action: { ...valid.action, staffId: "" } }, { ...valid, action: { ...valid.action, extra: true } }]) {
      assert.equal((await f.source.setStaffClef(input as ScoreEditRequest)).ok, false);
    }
    assert.equal(isScoreEditRequest({ ...valid, action: { ...valid.action, extra: true } }), false);
    assert.equal(f.writes.length, 0); assert.equal(f.source.snapshot().status, "ready");
  } finally { f.source.dispose(); }
});

test("four original clefs preserve pitch, codec, history and no-op checkpoints", async () => {
  const f = fixture();
  try {
    await f.source.read(); const clean = f.source.snapshot();
    const noop = await f.source.setStaffClef(f.clef("treble"));
    assert.equal(noop.ok && noop.changed, false); assert.deepEqual(f.source.snapshot(), clean); assert.equal(f.writes.length, 0);
    await f.source.append(f.request({ kind: "append", measureId: f.view().measures[0]!.id, anchor: { kind: "start" },
      duration: { base: 4, dots: 1 }, content: { kind: "note", pitch: { step: "F", octave: 4, alter: -1 } } }));
    const music = structuredClone(f.view().measures), beforeMetadata = f.current().metadata;
    for (const name of ["bass", "alto", "tenor", "treble"] as const) {
      const before = f.current();
      await f.source.setStaffClef(f.clef(name)); assert.equal(f.view().clef, name);
      assert.deepEqual(f.view().measures, music); assert.deepEqual(f.current().metadata, beforeMetadata);
      assert.equal(f.current().undoDepth, before.undoDepth + 1);
      const writeCount: number = f.writes.length; await f.source.setStaffClef(f.clef(name)); assert.equal(f.writes.length, writeCount);
      await f.source.undo(); assert.deepEqual(f.view(), before.notation);
      await f.source.redo(); assert.equal(f.view().clef, name);
      const reopened = f.host.importDocument(randomUUID(), JSON.parse(f.host.exportDocument(f.workspace)));
      assert.deepEqual(reopened.notation, f.view()); assert.equal(reopened.undoDepth, 0);
    }
    assert.deepEqual(STAFF_CLEFS, ["treble", "bass", "alto", "tenor"]);
  } finally { f.source.dispose(); }
});

test("clef capture is immutable and shares the original document mutex", async () => {
  let release!: () => void; const gate = new Promise<void>(yes => { release = yes; });
  const f = fixture(async (_request, apply) => { await gate; return apply(); });
  try {
    await f.source.read(); const request = f.clef("bass"), pending = f.source.setStaffClef(request);
    Object.assign(request.action, { clef: "alto" });
    assert.equal((await f.source.setStaffClef(f.clef("tenor"))).ok, false); assert.equal((await f.source.reload()).ok, false);
    release(); assert.equal((await pending).ok, true); assert.equal(f.view().clef, "bass"); assert.equal(f.writes.length, 1);
  } finally { release(); f.source.dispose(); }
});

test("failed and lost clef receipts retain accepted state until explicit reload without replay", async () => {
  for (const lost of [false, true]) {
    const f = fixture(async (_request, apply) => { if (lost) apply(); throw new Error("clef acknowledgement unavailable"); });
    try {
      await f.source.read(); assert.equal((await f.source.setStaffClef(f.clef("alto"))).ok, false);
      assert.equal(f.source.snapshot().documentVersion, 0); assert.equal(f.source.snapshot().status, "error");
      assert.equal((await f.source.setStaffClef(f.clef("alto"))).ok, false);
      await f.source.reload(); assert.equal(f.source.snapshot().documentVersion, lost ? 1 : 0); assert.equal(f.view().clef, lost ? "alto" : "treble");
      assert.equal(f.writes.length, 1);
    } finally { f.source.dispose(); }
  }
});

test("clef receipts cannot accept foreign documents or unchanged versions", async () => {
  for (const foreign of [false, true]) {
    const f = fixture(async (_request, apply) => { const next = apply(); return foreign ? { ...next, documentId: "other" } : { ...next, documentVersion: 0 }; });
    try {
      await f.source.read(); assert.equal((await f.source.setStaffClef(f.clef("tenor"))).ok, false);
      assert.equal(f.source.snapshot().documentVersion, 0); assert.equal(f.source.snapshot().status, "error");
    } finally { f.source.dispose(); }
  }
});

test("clef observer disposal prevents dispatch and late results never revive a released source", async () => {
  const before = fixture(); await before.source.read();
  before.source.subscribeState(() => { if (before.source.snapshot().busy) before.source.dispose(); });
  assert.equal((await before.source.setStaffClef(before.clef("bass"))).ok, false); assert.equal(before.writes.length, 0);
  let release!: () => void; const gate = new Promise<void>(yes => { release = yes; });
  const late = fixture(async (_request, apply) => { await gate; return apply(); }); await late.source.read();
  let updates = 0; late.source.subscribe(() => { updates++; });
  const pending = late.source.setStaffClef(late.clef("tenor")); late.source.dispose(); release();
  assert.equal((await pending).ok, false); assert.equal(late.source.snapshot().status, "disposed"); assert.equal(updates, 0);
});
