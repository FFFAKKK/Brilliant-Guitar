import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { ScoreSessionService } from "../host/score-session.ts";
import { createReadonlyScoreDocumentSession } from "../src/services/readonly-score-document-session.ts";
import { WorkbenchClient } from "../src/services/workbench-client.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { createScoreClipboardFragment } from "../src/contracts/score-clipboard.ts";
import type { ScoreEditRequest } from "../src/contracts/note-input.ts";
const code = (result: { readonly ok: true } | { readonly ok: false; readonly code: string }) => result.ok ? null : result.code;

function fixture() {
  const host = new ScoreSessionService(), workspace = randomUUID();
  let current = host.create(workspace, randomUUID(), null, { title: "范围", measureCount: 1 });
  const calls: { name: string; request: ScoreEditRequest | undefined }[] = [];
  let gate: Promise<void> | null = null, mode = "normal";
  const bridge = new TauriWorkbenchHostBridge(async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    const request = args?.request as ScoreEditRequest | undefined; calls.push({ name, request });
    if (name === "workbench_read_v1") return current as T;
    assert.equal(name, "workbench_edit_v1"); if (gate) await gate;
    current = host.edit(workspace, request!);
    if (mode === "lost") throw new Error("lost acknowledgement");
    if (mode === "wrong") return { ...current, documentId: "other" } as T;
    return current as T;
  });
  const source = createReadonlyScoreDocumentSession({ client: new WorkbenchClient(bridge) });
  function request(): ScoreEditRequest {
    if (current.notation.kind !== "staff") throw new Error("staff");
    const m = current.notation.measures[0]!;
    return { requestId: randomUUID(), documentId: current.documentId, expectedVersion: current.documentVersion,
      action: { kind: "paste-fragment", measureId: m.id, voiceId: m.voiceId, anchor: { kind: "start" },
        fragment: createScoreClipboardFragment([{ duration: { base: 8, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } } },
          { duration: { base: 32, dots: 0 }, content: { kind: "rest" } }]) } };
  }
  return { source, request, calls, current: () => current, gate: (v: Promise<void>) => { gate = v; }, mode: (v: string) => { mode = v; } };
}

test("range/paste use original typed IPC and one history entry", async () => {
  const f = fixture(); try {
    await f.source.read(); const request = f.request(); assert.equal((await f.source.pasteFragment(request)).ok, true);
    assert.equal(f.calls[1]?.request?.action.kind, "paste-fragment");
    const before = await f.source.read(); assert.equal(before?.undoDepth, 1);
    if (before?.notation.kind !== "staff") throw new Error("staff"); const m = before.notation.measures[0]!;
    const range = { measureId: m.id, voiceId: m.voiceId, startEventId: m.events[1]!.id, endEventId: m.events[0]!.id };
    assert.equal((await f.source.deleteRange({ requestId: randomUUID(), documentId: before.documentId, expectedVersion: before.documentVersion,
      action: { kind: "delete-range", range } })).ok, true);
    const after = await f.source.read(); assert.equal(after?.undoDepth, 2);
    assert.equal(after?.notation.kind === "staff" && after.notation.measures[0]!.events.length, 0);
    assert.equal((await f.source.undo()).ok, true); assert.deepEqual((await f.source.read())?.notation, before.notation);
  } finally { f.source.dispose(); }
});

test("narrow range/paste guards reject invalid formats, limits, identities and other actions before IPC", async () => {
  const f = fixture(); try {
    await f.source.read(); const req = f.request();
    for (const entry of [{ ...req, requestId: "bad" }, { ...req, documentId: "other" }, { ...req, expectedVersion: 4 },
      { ...req, action: { kind: "undo" } } as ScoreEditRequest]) {
      assert.equal((await f.source.pasteFragment(entry)).ok, false); assert.equal((await f.source.deleteRange(entry)).ok, false);
    }
    if (req.action.kind !== "paste-fragment") throw new Error("paste");
    for (const events of [[], Array(101).fill(req.action.fragment.events[0])]) {
      assert.equal((await f.source.pasteFragment({ ...req, action: { ...req.action, fragment: { ...req.action.fragment, events } } })).ok, false);
    }
    assert.equal(f.calls.length, 1); assert.equal(f.source.snapshot().status, "ready");
  } finally { f.source.dispose(); }
});

test("paste captures nested input and serializes against history, save and reload", async () => {
  const f = fixture(); try {
    await f.source.read(); let release!: () => void; f.gate(new Promise(yes => { release = yes; }));
    const req = f.request(), result = f.source.pasteFragment(req);
    if (req.action.kind !== "paste-fragment") throw new Error("paste");
    Object.assign(req.action.fragment.events[0]!.duration, { base: 1 });
    assert.equal(f.calls[1]?.request?.action.kind === "paste-fragment" && f.calls[1].request.action.fragment.events[0]!.duration.base, 8);
    assert.equal(code(await f.source.pasteFragment(f.request())), "document.busy");
    assert.equal(code(await f.source.undo()), "document.busy"); assert.equal(code(await f.source.reload()), "document.busy");
    release(); assert.equal((await result).ok, true);
  } finally { f.source.dispose(); }
});

test("lost or mismatched paste acknowledgements retain the accepted snapshot and recover without replay", async () => {
  for (const mode of ["lost", "wrong"]) {
    const f = fixture(); try {
      await f.source.read(); f.mode(mode); assert.equal((await f.source.pasteFragment(f.request())).ok, false);
      assert.equal(f.source.snapshot().documentVersion, 0); assert.equal(f.source.snapshot().status, "error");
      assert.equal((await f.source.pasteFragment(f.request())).ok, false);
      assert.equal((await f.source.reload()).ok, true); assert.equal(f.source.snapshot().documentVersion, 1);
      assert.equal(f.calls.filter(call => call.name === "workbench_edit_v1").length, 1);
    } finally { f.source.dispose(); }
  }
});

test("paste disposal before dispatch and after issued IO cannot accept or issue follow-up edits", async () => {
  const f = fixture(); await f.source.read(); f.source.subscribeState(() => { if (f.source.snapshot().busy) f.source.dispose(); });
  assert.equal(code(await f.source.pasteFragment(f.request())), "document.disposed"); assert.equal(f.calls.length, 1);
  const late = fixture(); await late.source.read(); let release!: () => void; late.gate(new Promise(yes => { release = yes; }));
  const result = late.source.pasteFragment(late.request()); late.source.dispose(); release();
  assert.equal(code(await result), "document.disposed"); assert.equal(late.source.snapshot().documentVersion, null);
});
