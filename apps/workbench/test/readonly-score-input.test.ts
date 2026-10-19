import assert from "node:assert/strict";
import test from "node:test";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import type { ScoreEditRequest } from "../src/contracts/note-input.ts";
import { createReadonlyScoreDocumentSession } from "../src/services/readonly-score-document-session.ts";
import { WorkbenchClient } from "../src/services/workbench-client.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { unsupportedPlaybackSource } from "./playback-fixture.ts";
import { randomUUID } from "node:crypto";
import { ScoreSessionService } from "../host/score-session.ts";

const id = "00000000-0000-4000-8000-000000000001";
const score = (version = 0, documentId = "piece"): ScoreSessionRead => ({ documentId, documentVersion: version,
  title: "", measureCount: 1, undoDepth: version, redoDepth: 0,
  notation: { kind: "staff", partId: "part", staffId: "staff", clef: "treble", tempoBpm: 96,
    measures: [{ id: "measure", voiceId: "voice", meter: { numerator: 4, denominator: 4 }, ruleWarnings: [], events: version
      ? [{ id: "note", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } } }] : [] }] },
  playbackSource: unsupportedPlaybackSource(documentId, version) });
const request = (): ScoreEditRequest => ({ requestId: id, documentId: "piece", expectedVersion: 0,
  action: { kind: "append", measureId: "measure", anchor: { kind: "start" }, offsetUnits: 0,
    duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } } } });
const deleteRequest = (): ScoreEditRequest => ({ requestId: id, documentId: "piece", expectedVersion: 0,
  action: { kind: "delete-event", eventId: "note", timePolicy: "preserve" } });
function fixture(edit: (input: ScoreEditRequest) => Promise<ScoreSessionRead>, initial = score()) {
  let current = initial;
  const client = { read: async () => current, edit,
    create: async () => { throw new Error("unexpected create"); }, createGuarded: async () => { throw new Error("unexpected replace"); },
    openNativeDocumentGuarded: async () => { throw new Error("unexpected open"); }, usesNativeFiles: () => true };
  return { source: createReadonlyScoreDocumentSession({ client }), set: (next: ScoreSessionRead) => { current = next; } };
}

test("append uses the actual typed client and Tauri edit envelope, then publishes only the accepted version", async () => {
  const calls: { name: string; args: Record<string, unknown> | undefined }[] = [];
  const bridge = new TauriWorkbenchHostBridge(async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ name, args });
    if (name === "workbench_read_v1") return score() as T;
    if (name === "workbench_edit_v1") return score(1) as T;
    throw new Error("unexpected IPC");
  });
  const source = createReadonlyScoreDocumentSession({ client: new WorkbenchClient(bridge) });
  try {
    await source.read(); let updates = 0; source.subscribe(() => { updates++; });
    const before = await source.read(), result = await source.append(request());
    assert.equal(result.ok, true); assert.equal(result.session?.documentVersion, 1);
    assert.equal(before?.documentVersion, 0); assert.equal((await source.read())?.documentVersion, 1);
    assert.equal(source.snapshot().dirty, true); assert.equal(source.canReplace(), false); assert.equal(updates, 1);
    assert.deepEqual(calls.map(call => call.name), ["workbench_read_v1", "workbench_edit_v1"]);
    assert.deepEqual(calls[1]?.args?.request, { workspaceId: calls[0]?.args?.workspaceId, ...request() });
  } finally { source.dispose(); }
});

test("invalid, stale and unsupported actions do not dispatch edit IPC", async () => {
  let writes = 0; const f = fixture(async () => { writes++; return score(1); });
  try {
    await f.source.read();
    assert.equal((await f.source.append({ ...request(), action: { kind: "undo" } })).ok, false);
    assert.equal((await f.source.append({ ...request(), expectedVersion: 8 })).ok, false);
    assert.equal((await f.source.append({ ...request(), documentId: "other" })).ok, false);
    assert.equal((await f.source.append({ ...request(), requestId: "bad" })).ok, false);
    assert.equal(writes, 0); assert.equal(f.source.snapshot().status, "ready");
  } finally { f.source.dispose(); }
});

test("a pending append rejects overlap and captures input before caller mutation", async () => {
  let resolve!: (value: ScoreSessionRead) => void, received: ScoreEditRequest | undefined;
  const f = fixture(async input => { received = input; return new Promise<ScoreSessionRead>(yes => { resolve = yes; }); });
  try {
    await f.source.read(); const input = request(), result = f.source.append(input);
    // The caller's mutable JavaScript object must no longer change the pending transport.
    Object.assign(input.action, { measureId: "changed" });
    assert.equal(received?.action.kind === "append" && received.action.measureId, "measure");
    assert.equal((await f.source.append(request())).ok, false); assert.equal((await f.source.reload()).ok, false);
    assert.equal((await f.source.open()).ok, false); resolve(score(1)); assert.equal((await result).ok, true);
  } finally { f.source.dispose(); }
});

test("a lost acknowledgement never auto-replays the edit; reload accepts the actual host result", async () => {
  let writes = 0; const f = fixture(async () => { writes++; f.set(score(1)); throw new Error("lost acknowledgement"); });
  try {
    await f.source.read(); assert.equal((await f.source.append(request())).ok, false);
    assert.equal(f.source.snapshot().documentVersion, 0); assert.equal(f.source.snapshot().status, "error");
    assert.equal((await f.source.append(request())).ok, false); assert.equal(writes, 1);
    assert.equal((await f.source.reload()).ok, true); assert.equal(f.source.snapshot().documentVersion, 1); assert.equal(writes, 1);
  } finally { f.source.dispose(); }
});

test("dispose from the busy observer prevents dispatch, and late edit results cannot be accepted", async () => {
  let writes = 0; const f = fixture(async () => { writes++; return score(1); }); await f.source.read();
  f.source.subscribeState(() => { if (f.source.snapshot().busy) f.source.dispose(); });
  assert.equal((await f.source.append(request())).ok, false); assert.equal(writes, 0);
  let resolve!: (value: ScoreSessionRead) => void;
  const late = fixture(() => new Promise<ScoreSessionRead>(yes => { resolve = yes; })); await late.source.read();
  const result = late.source.append(request()); late.source.dispose(); resolve(score(1));
  assert.equal((await result).ok, false); assert.equal(late.source.snapshot().status, "disposed");
  assert.equal(late.source.snapshot().documentVersion, null);
});

test("wrong-document and nonadvancing acknowledgements preserve the accepted score", async () => {
  for (const next of [score(), score(1, "other")]) {
    const f = fixture(async () => next); await f.source.read();
    assert.equal((await f.source.append(request())).ok, false); assert.equal(f.source.snapshot().documentId, "piece");
    assert.equal(f.source.snapshot().documentVersion, 0); f.source.dispose();
  }
});

test("delete-event uses the same typed client and guarded version envelope", async () => {
  const calls: { name: string; args: Record<string, unknown> | undefined }[] = [];
  const bridge = new TauriWorkbenchHostBridge(async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ name, args });
    if (name === "workbench_read_v1") return score(1) as T;
    if (name === "workbench_edit_v1") return score(2) as T;
    throw new Error("unexpected IPC");
  });
  const source = createReadonlyScoreDocumentSession({ client: new WorkbenchClient(bridge) });
  try {
    await source.read(); const input = { ...deleteRequest(), expectedVersion: 1 };
    const result = await source.deleteEvent(input);
    assert.equal(result.ok, true); assert.equal(result.session?.documentVersion, 2);
    assert.deepEqual(calls.map(call => call.name), ["workbench_read_v1", "workbench_edit_v1"]);
    assert.deepEqual(calls[1]?.args?.request, { workspaceId: calls[0]?.args?.workspaceId, ...input });
  } finally { source.dispose(); }
});

test("delete-event rejects invalid and stale targets before dispatch", async () => {
  let writes = 0; const f = fixture(async () => { writes++; return score(1); });
  try {
    await f.source.read();
    assert.equal((await f.source.deleteEvent({ ...deleteRequest(), action: { kind: "undo" } })).ok, false);
    assert.equal((await f.source.deleteEvent({ ...deleteRequest(), expectedVersion: 8 })).ok, false);
    assert.equal((await f.source.deleteEvent({ ...deleteRequest(), documentId: "other" })).ok, false);
    assert.equal(writes, 0); assert.equal(f.source.snapshot().status, "ready");
  } finally { f.source.dispose(); }
});

test("a lost delete acknowledgement is recovered by reload without replay", async () => {
  let writes = 0; const f = fixture(async () => { writes++; f.set(score(2)); throw new Error("lost acknowledgement"); });
  try {
    await f.source.read(); const input = deleteRequest();
    assert.equal((await f.source.deleteEvent(input)).ok, false);
    assert.equal(f.source.snapshot().documentVersion, 0); assert.equal(f.source.snapshot().status, "error");
    assert.equal((await f.source.deleteEvent(input)).ok, false); assert.equal(writes, 1);
    assert.equal((await f.source.reload()).ok, true); assert.equal(f.source.snapshot().documentVersion, 2); assert.equal(writes, 1);
  } finally { f.source.dispose(); }
});

const propertiesRequest = (): ScoreEditRequest => ({ requestId: randomUUID(), documentId: "piece", expectedVersion: 1,
  action: { kind: "set-event-properties", eventId: "note", properties: { duration: { base: 8, dots: 1 },
    content: { kind: "note", pitch: { step: "D", octave: 5, alter: -1 } } } } });

test("properties use the actual typed client and Tauri edit envelope without a new protocol", async () => {
  const calls: { name: string; args: Record<string, unknown> | undefined }[] = [];
  const bridge = new TauriWorkbenchHostBridge(async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ name, args });
    if (name === "workbench_read_v1") return score(1) as T;
    if (name === "workbench_edit_v1") return score(2) as T;
    throw new Error("unexpected IPC");
  });
  const source = createReadonlyScoreDocumentSession({ client: new WorkbenchClient(bridge) });
  try {
    await source.read(); const input = propertiesRequest();
    const result = await source.setEventProperties(input); assert.equal(result.ok, true);
    assert.equal(source.snapshot().documentVersion, 2); assert.equal(source.snapshot().dirty, true);
    assert.deepEqual(calls.map(call => call.name), ["workbench_read_v1", "workbench_edit_v1"]);
    assert.deepEqual(calls[1]?.args?.request, { workspaceId: calls[0]?.args?.workspaceId, ...input });
  } finally { source.dispose(); }
});

test("properties guard stale/invalid/kind changes and identical values without IO or history", async () => {
  let writes = 0; const f = fixture(async () => { writes++; return score(2); }, score(1));
  try {
    await f.source.read(); const input = propertiesRequest();
    for (const bad of [{ ...input, expectedVersion: 0 }, { ...input, documentId: "other" },
      { ...input, requestId: "bad" }, { ...input, action: { kind: "undo" as const } },
      { ...input, action: { kind: "set-event-properties" as const, eventId: "missing", properties: { duration: { base: 4 as const, dots: 0 as const }, content: { kind: "rest" as const } } } },
      { ...input, action: { kind: "set-event-properties" as const, eventId: "note", properties: { duration: { base: 4 as const, dots: 0 as const }, content: { kind: "rest" as const } } } }]) {
      assert.equal((await f.source.setEventProperties(bad)).ok, false);
    }
    assert.deepEqual(await f.source.setEventProperties({ ...input, action: { kind: "set-event-properties", eventId: "note",
      properties: { duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } } } } }),
    { ok: true, changed: false, session: score(1) });
    assert.equal(writes, 0); assert.equal(f.source.snapshot().status, "ready"); assert.equal(f.source.snapshot().undoDepth, 1);
  } finally { f.source.dispose(); }
});

test("pending properties capture nested caller data and reject overlapping history/save/read", async () => {
  let resolve!: (value: ScoreSessionRead) => void, received: ScoreEditRequest | undefined;
  const f = fixture(async input => { received = input; return new Promise(yes => { resolve = yes; }); }, score(1));
  try {
    await f.source.read(); const input = propertiesRequest(), result = f.source.setEventProperties(input);
    assert.equal(input.action.kind, "set-event-properties");
    if (input.action.kind === "set-event-properties") Object.assign(input.action.properties.content, { pitch: { step: "G", octave: 6, alter: 1 } });
    assert.deepEqual(received, { ...propertiesRequest(), requestId: input.requestId });
    assert.equal((await f.source.undo()).ok, false); assert.equal((await f.source.save()).ok, false);
    assert.equal((await f.source.reload()).ok, false); resolve(score(2)); assert.equal((await result).ok, true);
  } finally { f.source.dispose(); }
});

test("uncertain properties recover without replay; disposal prevents dispatch and late acceptance", async () => {
  let writes = 0; const f = fixture(async () => { writes++; f.set(score(2)); throw new Error("lost properties acknowledgement"); }, score(1));
  await f.source.read(); assert.equal((await f.source.setEventProperties(propertiesRequest())).ok, false);
  assert.equal(f.source.snapshot().documentVersion, 1); assert.equal((await f.source.setEventProperties(propertiesRequest())).ok, false);
  assert.equal(writes, 1); assert.equal((await f.source.reload()).ok, true); assert.equal(f.source.snapshot().documentVersion, 2); f.source.dispose();
  const ended = fixture(async () => { writes++; return score(2); }, score(1)); await ended.source.read();
  ended.source.subscribeState(() => { if (ended.source.snapshot().busy) ended.source.dispose(); });
  assert.equal((await ended.source.setEventProperties(propertiesRequest())).ok, false); assert.equal(writes, 1);
  let resolve!: (value: ScoreSessionRead) => void;
  const late = fixture(() => new Promise(yes => { resolve = yes; }), score(1)); await late.source.read();
  const result = late.source.setEventProperties(propertiesRequest()); late.source.dispose(); resolve(score(2));
  assert.equal((await result).ok, false); assert.equal(late.source.snapshot().documentVersion, null);
});

test("changed properties reject wrong-document and nonadvancing acknowledgements", async () => {
  for (const next of [score(1), score(2, "other")]) {
    const f = fixture(async () => next, score(1));
    try {
      await f.source.read(); assert.equal((await f.source.setEventProperties(propertiesRequest())).ok, false);
      assert.equal(f.source.snapshot().documentId, "piece"); assert.equal(f.source.snapshot().documentVersion, 1);
      assert.equal(f.source.snapshot().status, "error");
    } finally { f.source.dispose(); }
  }
});

test("original host property rules, undo/redo and actual document codec round-trip survive the new session entry", async () => {
  const host = new ScoreSessionService(), workspace = randomUUID();
  host.create(workspace, randomUUID(), null, { title: "属性往返", measureCount: 1 });
  const source = createReadonlyScoreDocumentSession({ client: {
    read: async () => host.read(workspace), edit: async request => host.edit(workspace, request), usesNativeFiles: () => false,
    create: async () => { throw new Error("unexpected create"); }, createGuarded: async () => { throw new Error("unexpected replace"); },
    openNativeDocumentGuarded: async () => null,
  } });
  try {
    const initial = (await source.read())!;
    await source.append({ ...request(), requestId: randomUUID(), documentId: initial.documentId, action: {
      ...request().action, kind: "append", measureId: "measure-1", anchor: { kind: "start" }, duration: { base: 4, dots: 0 },
      content: { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } },
    } });
    const before = (await source.read())!; assert.equal(before.notation.kind, "staff");
    if (before.notation.kind !== "staff") throw new Error("Expected staff");
    const target = before.notation.measures[0]!.events[0]!;
    const action = propertiesRequest().action; assert.equal(action.kind, "set-event-properties");
    if (action.kind !== "set-event-properties") throw new Error("Expected properties");
    const result = await source.setEventProperties({ requestId: randomUUID(), documentId: before.documentId,
      expectedVersion: before.documentVersion, action: { ...action, eventId: target.id } });
    assert.equal(result.ok, true); const changed = (await source.read())!;
    if (changed.notation.kind !== "staff") throw new Error("Expected staff");
    assert.deepEqual(changed.notation.measures[0]!.events[0], { id: target.id, ...action.properties });
    assert.equal((await source.undo()).ok, true); assert.deepEqual((await source.read())!.notation, before.notation);
    assert.equal((await source.redo()).ok, true); assert.deepEqual((await source.read())!.notation, changed.notation);
    const reopened = host.importDocument(randomUUID(), JSON.parse(host.exportDocument(workspace)));
    assert.deepEqual(reopened.notation, changed.notation); assert.equal(reopened.documentId, changed.documentId);
    assert.equal(reopened.undoDepth, 0, "history is deliberately not serialized");
  } finally { source.dispose(); }
});
