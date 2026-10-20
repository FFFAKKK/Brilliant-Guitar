import assert from "node:assert/strict";
import test from "node:test";
import { createReadonlyScoreDocumentSession } from "../src/services/readonly-score-document-session.ts";
import { WorkbenchClient } from "../src/services/workbench-client.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { isNativeClosePrecondition, nativeClosePrecondition } from "../src/contracts/native-close.ts";
import type { NativeClosePrecondition } from "../src/contracts/native-close.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";

const score = (id = "instance-a", version = 2): ScoreSessionRead => ({
  documentId: "piece", documentVersion: version, title: "未保存作品", measureCount: 1,
  undoDepth: 1, redoDepth: 0,
  notation: { kind: "unsupported", message: "Fixture" },
  playbackSource: { kind: "unsupported", projectionVersion: 1, documentId: "piece",
    documentVersion: version, code: "fixture", message: "Fixture" },
  persistence: { sessionId: id, savedVersion: null, dirty: true },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  let current: ScoreSessionRead | null = score();
  let listener: (() => void | Promise<void>) | undefined;
  let read = async () => current;
  let close = async (_expected: NativeClosePrecondition) => false;
  const calls: NativeClosePrecondition[] = [];
  let reads = 0, creates = 0, disposedListeners = 0;
  const client = {
    async read() { reads++; return read(); },
    async create() { creates++; return score(); },
    async createGuarded() { return score(); },
    async openNativeDocumentGuarded() { return null; },
    usesNativeFiles: () => true,
    async onNativeCloseRequestedGuarded(handler: () => void | Promise<void>) {
      listener = handler; return () => { disposedListeners++; listener = undefined; };
    },
    async closeNativeWindowGuarded(expected: NativeClosePrecondition) { calls.push(expected); return close(expected); },
  };
  const source = createReadonlyScoreDocumentSession({ client, nativeClose: true });
  return { source, client, calls, get reads() { return reads; }, get creates() { return creates; },
    get disposedListeners() { return disposedListeners; },
    setCurrent(value: ScoreSessionRead | null) { current = value; },
    setRead(value: typeof read) { read = value; },
    setClose(value: typeof close) { close = value; },
    async closeEvent() { await Promise.resolve(); assert(listener); await listener(); },
  };
}

test("welcome close reads existing only, handles cancel/retry and holds busy after native acceptance", async () => {
  const f = fixture(); f.setCurrent(null);
  await f.closeEvent();
  assert.equal(f.reads, 1); assert.equal(f.creates, 0);
  assert.deepEqual(f.calls, [{ kind: "empty" }]);
  assert.equal(f.source.snapshot().busy, false);
  f.setClose(async () => true);
  await f.closeEvent();
  assert.equal(f.source.snapshot().busy, true);
  assert.equal(f.source.canReplace(), false);
  assert.equal((await f.source.newScore()).ok, false);
  assert.equal(f.calls.length, 2);
  await f.closeEvent();
  assert.equal(f.calls.length, 2, "accepted dispatch must not permit another operation");
  f.source.dispose(); assert.equal(f.disposedListeners, 1);
});

test("dirty current document reaches the host with instance identity, without clearing accepted music", async () => {
  const f = fixture(), current = await f.source.read();
  assert(current);
  f.setClose(async expected => {
    assert.deepEqual(expected, nativeClosePrecondition(current));
    assert.equal(f.source.snapshot().busy, true);
    assert.equal(f.source.snapshot().documentId, "piece");
    return false;
  });
  await f.closeEvent();
  assert.equal(await f.source.read(), current);
  assert.equal(f.source.snapshot().dirty, true);
  assert.equal(f.source.snapshot().busy, false);
  f.source.dispose();
});

test("close failure keeps the document and next attempt rereads before confirming a replacement", async () => {
  const f = fixture(); await f.source.read();
  f.setClose(async () => { throw new Error("native dispatch failed"); });
  const failed = await f.source.closeNativeWindow();
  assert.equal(failed.ok, false);
  assert.equal(f.source.snapshot().documentId, "piece");
  assert.equal(f.source.snapshot().busy, false);
  assert.match(f.source.snapshot().message!, /dispatch/);
  f.setCurrent(score("same-id-reopened", 2));
  f.setClose(async () => false);
  await f.closeEvent();
  assert.equal(f.reads, 2);
  assert.deepEqual(f.calls[1], nativeClosePrecondition(score("same-id-reopened", 2)));
  assert.equal(f.source.snapshot().message, null);
  f.source.dispose();
});

test("read/close overlap is not replayed; disposal during read prevents unsent close", async () => {
  const f = fixture(), pending = deferred<ScoreSessionRead | null>();
  f.setRead(() => pending.promise);
  const reading = f.source.read();
  assert.equal((await f.source.closeNativeWindow()).ok, false);
  assert.equal(f.calls.length, 0);
  pending.resolve(score()); await reading;
  const p = deferred<ScoreSessionRead | null>();
  const next = fixture(); next.setRead(() => p.promise);
  const closing = next.source.closeNativeWindow();
  next.source.dispose(); p.resolve(score());
  assert.equal((await closing).ok, false);
  assert.equal(next.calls.length, 0); assert.equal(next.creates, 0);
  f.source.dispose();
});

test("synchronous owner disposal and late listener registration cannot issue close", async () => {
  const f = fixture(); await f.source.read();
  const unsubscribe = f.source.subscribeState(() => { if (f.source.snapshot().busy) f.source.dispose(); });
  assert.equal((await f.source.closeNativeWindow()).ok, false);
  assert.equal(f.calls.length, 0); unsubscribe();

  const registration = deferred<() => void>();
  let unlistens = 0, calls = 0;
  const g = fixture(); g.source.dispose();
  const source = createReadonlyScoreDocumentSession({ client: {
    ...g.client,
    onNativeCloseRequestedGuarded: async () => registration.promise,
    closeNativeWindowGuarded: async () => { calls++; return true; },
  }, nativeClose: true });
  await Promise.resolve();
  source.dispose(); registration.resolve(() => { unlistens++; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(unlistens, 1); assert.equal(calls, 0);
});

test("guarded client uses the original workspace, strict guard/receipt and no legacy fallback", async () => {
  const calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  const client = new WorkbenchClient(new TauriWorkbenchHostBridge(async <T>(command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args }); return (command === "workbench_read_v1" ? score() : false) as T;
  }));
  const expected = nativeClosePrecondition(score());
  await client.read();
  assert.equal(await client.closeNativeWindowGuarded(expected), false);
  assert.equal(typeof calls[0]?.args?.workspaceId, "string");
  assert.deepEqual(calls[1], { command: "workbench_close_window_guarded_v1",
    args: { workspaceId: calls[0]?.args?.workspaceId, expected } });
  for (const invalid of [null, {}, { kind: "empty", sessionId: "hidden" },
    { kind: "document", sessionId: "", documentId: "piece", documentVersion: 1 },
    { kind: "document", sessionId: "s", documentId: "piece", documentVersion: 1.5 }]) {
    assert.equal(isNativeClosePrecondition(invalid), false);
    await assert.rejects(() => client.closeNativeWindowGuarded(invalid as NativeClosePrecondition));
  }
  const { persistence: _persistence, ...oldScore } = score();
  assert.throws(() => nativeClosePrecondition(oldScore), /身份/);
  const f = fixture();
  const { closeNativeWindowGuarded: _guarded, ...legacyClient } = f.client;
  const legacy = new WorkbenchClient({
    ...legacyClient, nativeFiles: true,
    invokeCapability: async () => null, invokeAgentCapability: async () => null,
    edit: async () => score(), exportDocument: async () => "", importDocument: async () => score(),
    closeNativeWindow: async () => { throw new Error("legacy must not run"); },
  });
  await assert.rejects(() => legacy.closeNativeWindowGuarded(expected), /不支持/);
  f.source.dispose();
});

test("bad close receipts and failed listener registration surface errors without releasing data", async () => {
  const bad = new WorkbenchClient(new TauriWorkbenchHostBridge(async <T>() => undefined as T));
  await assert.rejects(() => bad.closeNativeWindowGuarded({ kind: "empty" }), /关闭结果/);
  const f = fixture(); f.source.dispose();
  let attempts = 0;
  const source = createReadonlyScoreDocumentSession({ client: { ...f.client,
    onNativeCloseRequestedGuarded: async () => {
      if (++attempts === 1) throw new Error("listener unavailable");
      return () => {};
    },
  }, nativeClose: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(source.snapshot().message!, /listener unavailable/);
  assert.equal(source.snapshot().busy, false);
  assert.equal((await source.reload()).ok, true);
  assert.equal(attempts, 2, "The existing graphical reload retries native registration");
  assert.equal(source.snapshot().status, "ready");
  source.dispose();
});
