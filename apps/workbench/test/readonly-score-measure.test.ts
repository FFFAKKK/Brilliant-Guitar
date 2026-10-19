import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { ScoreSessionService } from "../host/score-session.ts";
import { createReadonlyScoreDocumentSession } from "../src/services/readonly-score-document-session.ts";
import { WorkbenchClient } from "../src/services/workbench-client.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import type { ScoreEditAction, ScoreEditRequest } from "../src/contracts/note-input.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";

function fixture(count = 3, dispatch?: (request: ScoreEditRequest, apply: () => ScoreSessionRead) => Promise<ScoreSessionRead>) {
  const host = new ScoreSessionService(), workspace = randomUUID();
  let current = host.create(workspace, randomUUID(), null, { title: "结构入口", measureCount: count });
  const writes: ScoreEditRequest[] = [];
  const source = createReadonlyScoreDocumentSession({ client: {
    read: async () => current, usesNativeFiles: () => true,
    create: async () => { throw new Error("unexpected create"); }, createGuarded: async () => { throw new Error("unexpected replacement"); },
    openNativeDocumentGuarded: async () => { throw new Error("unexpected open"); },
    edit: async input => { writes.push(structuredClone(input)); const apply = () => (current = host.edit(workspace, input));
      return dispatch ? dispatch(input, apply) : apply(); },
  } });
  const request = (action: ScoreEditAction): ScoreEditRequest => ({ requestId: randomUUID(), documentId: current.documentId,
    expectedVersion: current.documentVersion, action });
  const measures = () => { if (current.notation.kind !== "staff") throw new Error("expected staff"); return current.notation.measures; };
  return { host, workspace, source, writes, request, measures, current: () => current };
}

test("measure intents use the actual typed client and Tauri edit envelope", async () => {
  const f = fixture(), calls: Array<{ name: string; args: Record<string, unknown> | undefined }> = [];
  const bridge = new TauriWorkbenchHostBridge(async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ name, args });
    if (name === "workbench_read_v1") return f.current() as T;
    if (name === "workbench_edit_v1") return f.host.edit(f.workspace, args!.request as unknown as ScoreEditRequest) as T;
    throw new Error("unexpected IPC");
  });
  const source = createReadonlyScoreDocumentSession({ client: new WorkbenchClient(bridge) });
  try {
    await source.read(); const request = f.request({ kind: "insert-measure", measureId: f.measures()[0]!.id, position: "after" });
    const result = await source.editMeasure(request); assert.equal(result.ok, true); assert.equal(result.session?.measureCount, 4);
    assert.equal(source.snapshot().dirty, true); assert.equal(source.canReplace(), false);
    assert.deepEqual(calls.map(call => call.name), ["workbench_read_v1", "workbench_edit_v1"]);
    assert.deepEqual(calls[1]!.args!.request, { workspaceId: calls[0]!.args!.workspaceId, ...request });
  } finally { source.dispose(); f.source.dispose(); }
});

test("closed measure entry rejects stale, foreign, malformed and non-structural requests before dispatch", async () => {
  const f = fixture(1);
  try {
    await f.source.read(); const valid = f.request({ kind: "insert-measure", measureId: f.measures()[0]!.id, position: "before" });
    for (const request of [{ ...valid, requestId: "bad" }, { ...valid, expectedVersion: 100 }, { ...valid, documentId: "other" },
      f.request({ kind: "insert-measure", measureId: "missing", position: "before" }), f.request({ kind: "undo" }),
      f.request({ kind: "remove-measure", measureId: f.measures()[0]!.id }),
      f.request({ kind: "set-measure-meter", measureId: f.measures()[0]!.id, meter: { numerator: 0, denominator: 4 }, scope: "measure" })]) {
      assert.equal((await f.source.editMeasure(request)).ok, false);
    }
    assert.equal(f.writes.length, 0); assert.equal(f.source.snapshot().status, "ready");
  } finally { f.source.dispose(); }
});

test("meter no-op avoids IPC, history and dirty transitions; over-budget runs are rejected as a whole", async () => {
  const f = fixture(101);
  try {
    await f.source.read(); const before = f.source.snapshot();
    const unchanged = await f.source.editMeasure(f.request({ kind: "set-measure-meter", measureId: f.measures()[0]!.id,
      meter: { numerator: 4, denominator: 4 }, scope: "meter-run" }));
    assert.equal(unchanged.ok, true); assert.equal(unchanged.ok && unchanged.changed, false); assert.deepEqual(f.source.snapshot(), before);
    const rejected = await f.source.editMeasure(f.request({ kind: "set-measure-meter", measureId: f.measures()[0]!.id,
      meter: { numerator: 7, denominator: 8 }, scope: "meter-run" }));
    assert.equal(!rejected.ok && rejected.code, "document.measure-budget"); assert.equal(f.writes.length, 0);
    const accepted = await f.source.editMeasure(f.request({ kind: "set-measure-meter", measureId: f.measures()[1]!.id,
      meter: { numerator: 7, denominator: 8 }, scope: "meter-run" }));
    assert.equal(accepted.ok, true); assert.equal(f.writes.length, 1); assert.equal(f.current().undoDepth, 1);
    assert.equal((await f.source.undo()).ok, true); assert.equal(f.measures()[1]!.meter.numerator, 4);
  } finally { f.source.dispose(); }
});

test("measure request capture survives caller mutation and serialized overlap", async () => {
  let release!: () => void;
  const gate = new Promise<void>(yes => { release = yes; });
  const f = fixture(3, async (_input, apply) => { await gate; return apply(); });
  try {
    await f.source.read(); const request = f.request({ kind: "set-measure-meter", measureId: f.measures()[0]!.id,
      meter: { numerator: 6, denominator: 8 }, scope: "measure" });
    const result = f.source.editMeasure(request);
    if (request.action.kind === "set-measure-meter") Object.assign(request.action.meter, { numerator: 31 });
    assert.equal((await f.source.editMeasure(f.request({ kind: "remove-measure", measureId: f.measures()[1]!.id }))).ok, false);
    assert.equal((await f.source.reload()).ok, false); release(); assert.equal((await result).ok, true);
    assert.equal(f.measures()[0]!.meter.numerator, 6); assert.equal(f.writes.length, 1);
  } finally { release(); f.source.dispose(); }
});

test("a lost structural acknowledgement requires reload and never replays the deletion", async () => {
  const f = fixture(3, async (_input, apply) => { apply(); throw new Error("lost structural acknowledgement"); });
  try {
    await f.source.read(); const target = f.measures()[1]!.id;
    assert.equal((await f.source.editMeasure(f.request({ kind: "remove-measure", measureId: target }))).ok, false);
    assert.equal(f.current().measureCount, 2); assert.equal(f.source.snapshot().measureCount, 3); assert.equal(f.source.snapshot().status, "error");
    assert.equal((await f.source.editMeasure(f.request({ kind: "remove-measure", measureId: target }))).ok, false);
    assert.equal((await f.source.reload()).ok, true); assert.equal(f.source.snapshot().measureCount, 2); assert.equal(f.writes.length, 1);
  } finally { f.source.dispose(); }
});

test("observer disposal prevents structural dispatch and late results cannot republish", async () => {
  const before = fixture(); await before.source.read(); before.source.subscribeState(() => { if (before.source.snapshot().busy) before.source.dispose(); });
  assert.equal((await before.source.editMeasure(before.request({ kind: "insert-measure", measureId: before.measures()[0]!.id, position: "after" }))).ok, false);
  assert.equal(before.writes.length, 0);
  let release!: () => void; const gate = new Promise<void>(yes => { release = yes; });
  const late = fixture(3, async (_input, apply) => { await gate; return apply(); }); await late.source.read(); let updates = 0; late.source.subscribe(() => { updates++; });
  const operation = late.source.editMeasure(late.request({ kind: "insert-measure", measureId: late.measures()[0]!.id, position: "after" }));
  late.source.dispose(); release(); assert.equal((await operation).ok, false); assert.equal(late.source.snapshot().status, "disposed"); assert.equal(updates, 0);
});
