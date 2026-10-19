import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { ScoreSessionService } from "../host/score-session.ts";
import { WorkbenchClient } from "../src/services/workbench-client.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { createReadonlyScoreDocumentSession } from "../src/services/readonly-score-document-session.ts";
import { isScoreEditRequest } from "../src/contracts/note-input.ts";
import type { ScoreEditAction, ScoreEditRequest } from "../src/contracts/note-input.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import type { ScoreDocument } from "../.kernel/src/core-kernel/index.js";

function document(): ScoreDocument {
  return JSON.parse(readFileSync(new URL("../../desktop/src-tauri/src/application/official_domains/guitar-document.json",
    import.meta.url), "utf8")) as ScoreDocument;
}
function fixture(dispatch?: (request: ScoreEditRequest, apply: () => ScoreSessionRead) => Promise<ScoreSessionRead>,
  project: (value: ScoreSessionRead) => ScoreSessionRead = value => value, raw = document()) {
  const host = new ScoreSessionService(), workspace = randomUUID(), writes: ScoreEditRequest[] = [];
  let current = host.importDocument(workspace, raw);
  const client = {
    read: async () => project(current), usesNativeFiles: () => false,
    create: async () => { throw new Error("unexpected create"); },
    createGuarded: async () => { throw new Error("unexpected replacement"); },
    openNativeDocumentGuarded: async () => null,
    edit: async (request: ScoreEditRequest) => {
      writes.push(structuredClone(request));
      const apply = () => (current = host.edit(workspace, request));
      return dispatch ? dispatch(request, apply) : apply();
    },
  };
  const source = createReadonlyScoreDocumentSession({ client, initialization: "read-existing" });
  const request = (action: ScoreEditAction): ScoreEditRequest => ({ requestId: randomUUID(),
    documentId: current.documentId, expectedVersion: current.documentVersion, action });
  const fret = (value: number, stringNumber = 6, eventId = "event-a") =>
    request({ kind: "set-fretted-position", partId: "part-1", eventId, position: { stringNumber, fret: value } });
  return { host, workspace, writes, source, request, fret, current: () => current };
}
function position(value: ScoreSessionRead) {
  assert.ok(value.tablature?.kind === "tablature");
  const event = value.tablature.measures[0]!.events[0]!;
  assert.ok(event.content.kind === "note"); assert.equal(event.content.noteId, "note-a");
  return event.content.position;
}

test("public fret entry uses one original typed Tauri write and no UI pitch or command ID", async () => {
  const f = fixture(), calls: Array<{ name: string; args: Record<string, unknown> | undefined }> = [];
  const bridge = new TauriWorkbenchHostBridge(async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ name, args });
    if (name === "workbench_read_v1") return f.current() as T;
    if (name === "workbench_edit_v1") return f.host.edit(f.workspace, args!.request as unknown as ScoreEditRequest) as T;
    throw new Error("unexpected IPC");
  });
  const source = createReadonlyScoreDocumentSession({ client: new WorkbenchClient(bridge), initialization: "read-existing" });
  try {
    await source.read(); const request = f.fret(12);
    assert.equal((await source.setFrettedPosition(request)).ok, true);
    assert.deepEqual(calls.map(call => call.name), ["workbench_read_v1", "workbench_edit_v1"]);
    assert.deepEqual(calls[1]!.args!.request, { workspaceId: calls[0]!.args!.workspaceId, ...request });
    assert.deepEqual(position((await source.read())!), { stringNumber: 6, fret: 12 });
    assert.equal(source.snapshot().dirty, true);
  } finally { source.dispose(); f.source.dispose(); }
});

test("fret source rejects illegal wire, actual dimensions and stale targets before dispatch", async () => {
  const f = fixture();
  try {
    await f.source.read(); const valid = f.fret(12), action = valid.action;
    for (const position of [null, {}, { stringNumber: 1.5, fret: 0 }, { stringNumber: 6, fret: 0.5 },
      { stringNumber: 0, fret: 0 }, { stringNumber: 33, fret: 0 }, { stringNumber: 6, fret: -1 },
      { stringNumber: 6, fret: Number.MAX_SAFE_INTEGER + 1 }, { stringNumber: 6, fret: 0, extra: true }]) {
      const input = { ...valid, action: { ...action, position } };
      assert.equal(isScoreEditRequest(input), false);
      assert.equal((await f.source.setFrettedPosition(input as ScoreEditRequest)).ok, false);
    }
    for (const input of [
      { ...valid, requestId: "bad" }, { ...valid, documentId: "other" }, { ...valid, expectedVersion: 99 },
      { ...valid, extra: true }, f.request({ kind: "undo" }), f.fret(12, 7), f.fret(-1),
      { ...valid, action: { ...action, partId: "missing" } }, f.fret(12, 6, "missing"),
      f.fret(12, 6, "event-rest"), { ...valid, action: { ...action, partId: "" } },
      { ...valid, action: { ...action, eventId: "" } }, { ...valid, action: { ...action, commandId: "untrusted" } },
    ]) assert.equal((await f.source.setFrettedPosition(input as ScoreEditRequest)).ok, false);
    assert.equal(f.writes.length, 0); assert.equal(f.source.snapshot().status, "ready");
  } finally { f.source.dispose(); }
});

test("real Node host enforces version replay dimensions and capo without partial mutation", () => {
  const f = fixture();
  try {
    const original = f.current(), req = f.fret(12), before = f.host.exportDocument(f.workspace);
    for (const request of [f.fret(12, 7), f.fret(68), f.fret(12, 6, "event-rest"),
      f.fret(12, 6, "missing"), { ...req, documentId: "other" }]) {
      assert.throws(() => f.host.edit(f.workspace, request));
      assert.equal(f.host.exportDocument(f.workspace), before);
    }
    const changed = f.host.edit(f.workspace, req);
    assert.equal(changed.undoDepth, 1);
    assert.deepEqual(f.host.edit(f.workspace, req), changed);
    assert.throws(() => f.host.edit(f.workspace, { ...req, action: { ...req.action, position: { stringNumber: 6, fret: 13 } } } as ScoreEditRequest));
    assert.throws(() => f.host.edit(f.workspace, { ...req, requestId: randomUUID() }));
    assert.deepEqual(f.host.read(f.workspace), changed);
    assert.deepEqual(f.host.edit(f.workspace, { ...req, requestId: randomUUID(), expectedVersion: changed.documentVersion }), changed);
    const raw = document();
    Object.assign(raw.extensions[0]!.payload, { capoFret: 2 });
    const events = raw.parts[0]!.measureContents[0]!.voices[0]!.sequence.events;
    events.slice(0, 2).forEach((event, index) => {
      assert.ok(event.content.kind === "notes");
      Object.assign(event.content.notes[0]!.writtenPitch, { step: "F", alter: 1, octave: 3 + index });
    });
    const capo = f.host.importDocument(f.workspace, raw);
    const capoRequest = (fret: number): ScoreEditRequest => ({ ...req, requestId: randomUUID(), expectedVersion: capo.documentVersion,
      action: { kind: "set-fretted-position", partId: "part-1", eventId: "event-a", position: { stringNumber: 6, fret } } });
    assert.throws(() => f.host.edit(f.workspace, capoRequest(66)));
    assert.equal(position(f.host.edit(f.workspace, capoRequest(65))).fret, 65);
    assert.equal(original.documentVersion, 0);
  } finally { f.source.dispose(); }
});

test("fret edits keep one history and codec, including Tab edits beyond the staff view range", async () => {
  const f = fixture();
  try {
    const original = await f.source.read(), clean = f.source.snapshot();
    const noop = await f.source.setFrettedPosition(f.fret(0));
    assert.ok(noop.ok && !noop.changed); assert.deepEqual(f.source.snapshot(), clean); assert.equal(f.writes.length, 0);
    assert.equal((await f.source.setFrettedPosition(f.fret(12))).ok, true);
    assert.equal(f.current().undoDepth, 1);
    const staff = f.current().notation; assert.ok(staff.kind === "staff");
    assert.deepEqual(staff.measures[0]!.events[0]!.content, { kind: "note", pitch: { step: "E", alter: 0, octave: 4 } });
    await f.source.undo(); assert.deepEqual(f.current().tablature, original!.tablature);
    await f.source.redo(); assert.equal(position(f.current()).fret, 12);
    assert.equal((await f.source.setFrettedPosition(f.fret(24, 1))).ok, true);
    const high = f.current(); assert.equal(high.notation.kind, "unsupported");
    assert.deepEqual(position(high), { stringNumber: 1, fret: 24 }); assert.equal(f.source.canUndo(), true);
    const reopened = f.host.importDocument(randomUUID(), JSON.parse(f.host.exportDocument(f.workspace)));
    assert.deepEqual(reopened.tablature, high.tablature); assert.equal(reopened.undoDepth, 0);
    assert.equal((await f.source.undo()).ok, true); assert.equal(position(f.current()).fret, 12);
    assert.equal(f.source.canRedo(), true); assert.equal((await f.source.redo()).ok, true);
    assert.deepEqual(f.current().tablature, high.tablature);
    assert.equal((await f.source.setFrettedPosition(f.fret(0))).ok, true);
    assert.deepEqual(f.current().notation, original!.notation);
  } finally { f.source.dispose(); }
});

test("old or unsupported hosts expose no fret editing and preserve future or technique facts", async () => {
  const legacy = fixture(undefined, value => { const { tablature: _tab, ...old } = value; return old; });
  const unsupported = fixture(undefined, value => ({ ...value, tablature: { kind: "unsupported", message: "missing positions" } }));
  for (const f of [legacy, unsupported]) {
    try {
      await f.source.read(); const result = await f.source.setFrettedPosition(f.fret(12));
      assert.ok(!result.ok && result.code === "document.tablature-unavailable"); assert.equal(f.writes.length, 0);
    } finally { f.source.dispose(); }
  }
  for (const kind of ["missing", "future", "technique", "opaque", "chord"]) {
    const raw = document(), block = raw.extensions[0]!;
    if (kind === "missing") Object.assign(raw, { extensions: [] });
    if (kind === "future") Object.assign(block, { schemaVersion: 3, payload: { keep: [1, 2] } });
    if (kind === "technique") Object.assign(block.payload, { techniques: [{ id: "vibrato-a", kind: "vibrato", noteId: "note-a" }] });
    if (kind === "opaque") Object.assign(raw, { extensions: [...raw.extensions,
      { namespace: "opaque.example", schemaVersion: 1, owner: { kind: "score" }, payload: { keep: [2, 1] } }] });
    if (kind === "chord") {
      const event = raw.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!;
      assert.ok(event.content.kind === "notes");
      Object.assign(event.content, { notes: [...event.content.notes,
        { id: "note-extra", writtenPitch: { step: "G", alter: 0, octave: 3 } }] });
    }
    const f = fixture(undefined, value => value, raw);
    try {
      await f.source.read(); const before = f.host.exportDocument(f.workspace);
      assert.equal((await f.source.setFrettedPosition(f.fret(12))).ok, false);
      assert.equal(f.writes.length, 0); assert.throws(() => f.host.edit(f.workspace, f.fret(12)));
      assert.equal(f.host.exportDocument(f.workspace), before);
    } finally { f.source.dispose(); }
  }
});

test("fret requests capture nested values before observers and share the document mutex", async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const f = fixture(async (_request, apply) => { await gate; return apply(); });
  try {
    await f.source.read(); const request = f.fret(12);
    f.source.subscribeState(() => { if (f.source.snapshot().busy) Object.assign(request.action, { position: { stringNumber: 1, fret: 24 } }); });
    const pending = f.source.setFrettedPosition(request);
    assert.equal((await f.source.setFrettedPosition(f.fret(13))).ok, false);
    assert.equal((await f.source.reload()).ok, false); assert.equal((await f.source.undo()).ok, false);
    release(); assert.equal((await pending).ok, true);
    assert.deepEqual(position(f.current()), { stringNumber: 6, fret: 12 }); assert.equal(f.writes.length, 1);
  } finally { release(); f.source.dispose(); }
});

test("failed lost and bad fret receipts retain accepted state and explicit reload never replays", async () => {
  for (const kind of ["failed", "lost", "foreign", "version", "missing", "unsupported", "position", "note-id"]) {
    const f = fixture(async (_request, apply) => {
      if (kind === "failed") throw new Error("rejected");
      const next = structuredClone(apply());
      if (kind === "lost") throw new Error("receipt lost");
      if (kind === "foreign") return { ...next, documentId: "other" };
      if (kind === "version") return { ...next, documentVersion: 0 };
      if (kind === "missing") { const { tablature: _tab, ...old } = next; return old; }
      if (kind === "unsupported") return { ...next, tablature: { kind: "unsupported", message: "unavailable" } };
      assert.ok(next.tablature?.kind === "tablature");
      const event = next.tablature.measures[0]!.events[0]!;
      assert.ok(event.content.kind === "note");
      if (kind === "position") Object.assign(event.content.position, { fret: 11 });
      if (kind === "note-id") Object.assign(event.content, { noteId: "different-note" });
      return next;
    });
    try {
      const accepted = await f.source.read();
      assert.equal((await f.source.setFrettedPosition(f.fret(12))).ok, false, kind);
      assert.equal(f.source.snapshot().documentVersion, 0); assert.equal(f.source.snapshot().status, "error");
      assert.equal((await f.source.setFrettedPosition(f.fret(12))).ok, false);
      await assert.rejects(f.source.read());
      assert.equal((await f.source.reload()).ok, true);
      assert.equal(f.source.snapshot().documentVersion, kind === "failed" ? 0 : 1);
      assert.equal(position((await f.source.read())!).fret, kind === "failed" ? position(accepted!).fret : 12);
      assert.equal(f.writes.length, 1);
    } finally { f.source.dispose(); }
  }
});

test("observer disposal prevents fret dispatch and late completion cannot revive a source", async () => {
  const before = fixture(); await before.source.read();
  before.source.subscribeState(() => { if (before.source.snapshot().busy) before.source.dispose(); });
  const rejected = await before.source.setFrettedPosition(before.fret(12));
  assert.ok(!rejected.ok && rejected.code === "document.disposed"); assert.equal(before.writes.length, 0);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const late = fixture(async (_request, apply) => { await gate; return apply(); });
  await late.source.read(); let updates = 0; late.source.subscribe(() => { updates++; });
  const pending = late.source.setFrettedPosition(late.fret(12)); late.source.dispose(); release();
  const result = await pending;
  assert.ok(!result.ok && result.code === "document.disposed");
  assert.equal(late.source.snapshot().status, "disposed"); assert.equal(updates, 0);
  assert.equal(position(late.current()).fret, 12, "already-issued edits can complete only in the host");
});
