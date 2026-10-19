import assert from "node:assert/strict";
import test from "node:test";
import { createReadonlyScoreDocumentSession } from "../src/services/readonly-score-document-session.ts";
import { WorkbenchClient } from "../src/services/workbench-client.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import type { ScoreEditRequest } from "../src/contracts/note-input.ts";
import type { WorkbenchNativeFileResult } from "../src/services/workbench-client.ts";
import { unsupportedPlaybackSource } from "./playback-fixture.ts";

const score = (version = 1, undoDepth = 1, redoDepth = 0): ScoreSessionRead => ({ documentId: "piece", documentVersion: version,
  title: "作品", measureCount: 1, undoDepth, redoDepth, playbackSource: unsupportedPlaybackSource("piece", version),
  notation: { kind: "staff", partId: "part", staffId: "staff", clef: "treble", tempoBpm: 96,
    measures: [{ id: "measure", voiceId: "voice", meter: { numerator: 4, denominator: 4 }, ruleWarnings: [], events: [] }] } });
const file = (value = score()): WorkbenchNativeFileResult => ({ session: value, name: "作品", savedVersion: value.documentVersion });
function fixture(save: () => Promise<WorkbenchNativeFileResult | null>) {
  let current = score(); const calls: ScoreEditRequest[] = [];
  const client = { read: async () => current, usesNativeFiles: () => true,
    create: async () => score(), createGuarded: async () => score(), openNativeDocumentGuarded: async () => null,
    saveNativeDocumentGuarded: save, async edit(input: ScoreEditRequest) {
      calls.push(input); current = score(current.documentVersion + 1, input.action.kind === "undo" ? 0 : 1, input.action.kind === "undo" ? 1 : 0); return current;
    } };
  return { client, calls, source: createReadonlyScoreDocumentSession({ client }) };
}

test("history and guarded save use the actual typed client/IPC and accepted versions/checkpoint", async () => {
  const calls: { command: string; args: Record<string, unknown> | undefined }[] = []; let current = score();
  const bridge = new TauriWorkbenchHostBridge(async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, args });
    if (command === "workbench_read_v1") return current as T;
    if (command === "workbench_edit_v1") {
      const request = args?.request as ScoreEditRequest; assert.equal(request.expectedVersion, current.documentVersion);
      current = score(current.documentVersion + 1, request.action.kind === "undo" ? 0 : 1, request.action.kind === "undo" ? 1 : 0); return current as T;
    }
    if (command === "workbench_save_file_guarded_v1") return file(current) as T;
    throw new Error("unexpected IPC");
  });
  const source = createReadonlyScoreDocumentSession({ client: new WorkbenchClient(bridge) });
  try {
    await source.read(); assert.equal(source.canUndo(), true); assert.equal(source.canRedo(), false);
    assert.equal((await source.undo()).ok, true); assert.equal(source.snapshot().documentVersion, 2);
    assert.equal(source.canUndo(), false); assert.equal(source.canRedo(), true);
    assert.equal((await source.redo()).ok, true); assert.equal(source.snapshot().documentVersion, 3);
    assert.equal((await source.save()).ok, true); assert.equal(source.snapshot().saved, true); assert.equal(source.snapshot().dirty, false);
    assert.equal(source.canReplace(), true); assert.equal((await source.undo()).ok, true);
    assert.equal(source.snapshot().dirty, true, "undo advances version even if content matches an older file");
    assert.deepEqual(calls[3]?.args?.expected, { kind: "document", documentId: "piece", documentVersion: 3 });
    assert.equal(calls[3]?.args?.saveAs, false);
    assert.ok(calls.every(call => !["workbench_save_file_v1", "workbench_export_v1"].includes(call.command)));
  } finally { source.dispose(); }
});

test("empty history, invalid save arguments and missing guarded host never dispatch or fall back", async () => {
  let saves = 0; const f = fixture(async () => { saves++; return file(); });
  await f.source.read(); await f.source.undo(); assert.equal((await f.source.undo()).ok, false); assert.equal(f.calls.length, 1);
  assert.equal((await Reflect.apply(f.source.save, null, ["true"])).ok, false); assert.equal(saves, 0); f.source.dispose();
  const bridge = new TauriWorkbenchHostBridge(async () => { throw new Error("unexpected invocation"); });
  const client = new WorkbenchClient(bridge);
  await assert.rejects(() => client.saveNativeDocumentGuarded("作品", false, { kind: "empty" }), /身份/);
  const { saveNativeDocumentGuarded, ...legacy } = f.client; assert.equal(typeof saveNativeDocumentGuarded, "function");
  const source = createReadonlyScoreDocumentSession({ client: legacy });
  await source.read(); assert.equal(source.canSave(), false); assert.equal((await source.save()).ok, false); source.dispose();
});

test("cancel/failure and bad save acknowledgements retain the previous accepted file checkpoint", async () => {
  let result: WorkbenchNativeFileResult | null = file(), failure = false;
  const f = fixture(async () => { if (failure) throw new Error("disk unavailable"); return result; });
  try {
    await f.source.read(); await f.source.save(); const clean = f.source.snapshot();
    result = null; assert.deepEqual(await f.source.save(true), { ok: true, changed: false, cancelled: true }); assert.deepEqual(f.source.snapshot(), clean);
    await f.source.undo(); result = file(score(2, 0, 1)); failure = true;
    assert.equal((await f.source.save()).ok, false); assert.equal(f.source.snapshot().dirty, true); assert.equal(f.source.canSave(), false);
    failure = false; await f.source.reload();
    for (const bad of [file(score(1)), { ...file(score(2)), savedVersion: 3 }, { ...file(score(2)), session: { ...score(2), documentId: "other", playbackSource: unsupportedPlaybackSource("other", 2) } }]) {
      result = bad; assert.equal((await f.source.save()).ok, false); assert.equal(f.source.snapshot().dirty, true); await f.source.reload();
    }
    result = file(score(2, 0, 1)); assert.equal((await f.source.save()).ok, true); assert.equal(f.source.snapshot().dirty, false);
  } finally { f.source.dispose(); }
});

test("saving shares the original operation mutex, prevents dispatch after observer disposal and ignores late results", async () => {
  let resolve!: (value: WorkbenchNativeFileResult) => void, saves = 0;
  const f = fixture(async () => { saves++; return new Promise<WorkbenchNativeFileResult>(yes => { resolve = yes; }); }); await f.source.read();
  const pending = f.source.save(); assert.equal(f.source.canUndo(), false); assert.equal((await f.source.undo()).ok, false);
  assert.equal((await f.source.reload()).ok, false); assert.equal((await f.source.save()).ok, false); assert.equal(saves, 1);
  f.source.dispose(); resolve(file()); assert.equal((await pending).ok, false); assert.equal(f.source.snapshot().saved, false);
  const disposed = fixture(async () => { saves++; return file(); }); await disposed.source.read();
  disposed.source.subscribeState(() => { if (disposed.source.snapshot().busy) disposed.source.dispose(); });
  assert.equal((await disposed.source.save()).ok, false); assert.equal(saves, 1);
});

test("post-commit warnings stay separate from a valid saved checkpoint and the client validates them", async () => {
  const warning = { code: "file.recent-unavailable", severity: "warning" as const, source: "file" as const,
    message: "作品已保存，最近记录未能更新", target: { scope: "component" as const, componentId: "navigation.file" }, retryable: true };
  const bridge = new TauriWorkbenchHostBridge(async <T>(command: string): Promise<T> => {
    return (command === "workbench_read_v1" ? score() : { ...file(), warnings: [warning] }) as T;
  });
  const source = createReadonlyScoreDocumentSession({ client: new WorkbenchClient(bridge) });
  await source.read(); assert.equal((await source.save(true)).ok, true); assert.equal(source.snapshot().saved, true);
  assert.deepEqual(source.snapshot().warnings, [warning]); assert.equal(source.snapshot().status, "ready"); source.dispose();
});
