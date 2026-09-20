import assert from "node:assert/strict";
import test from "node:test";

import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import { ScoreEditClient } from "../src/services/score-edit-port.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { readyPlaybackSource } from "./playback-fixture.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const session: ScoreSessionRead = {
  documentId: "score-1",
  title: "编辑后",
  measureCount: 1,
  documentVersion: 1,
  undoDepth: 1,
  redoDepth: 0,
  notation: {
    kind: "staff", partId: "part-1", staffId: "staff-1", clef: "treble", tempoBpm: 96,
    keySignatureChanges: [],
    measures: [{ id: "measure-1", voiceId: "voice-1", meter: { numerator: 4, denominator: 4 }, events: [], ruleWarnings: [] }],
  },
  playbackSource: readyPlaybackSource("score-1", 1, ["measure-1"]),
};

test("ScoreEditPort forwards one typed edit request through workbench_edit_v1", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, ...(args === undefined ? {} : { args }) });
    return session as T;
  };
  const edits = new ScoreEditClient(new TauriWorkbenchHostBridge(invoke), workspaceId);
  const request = {
    requestId: crypto.randomUUID(),
    documentId: "score-1",
    expectedVersion: 0,
    action: { kind: "set-title", title: "编辑后" } as const,
  };

  assert.deepEqual(await edits.edit(request), session);
  assert.deepEqual(calls, [{
    command: "workbench_edit_v1",
    args: { request: { workspaceId, ...request } },
  }]);
});

test("ScoreEditPort strips extra transport fields before dispatching to its bound workspace", async () => {
  const request = {
    requestId: crypto.randomUUID(),
    documentId: "score-1",
    expectedVersion: 0,
    action: { kind: "set-title", title: "编辑后" } as const,
  };
  const otherWorkspaceId = "22222222-2222-4222-8222-222222222222";
  const input = { ...request, workspaceId: otherWorkspaceId, extra: "not-part-of-the-contract" };
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const bridge = new TauriWorkbenchHostBridge(async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, ...(args === undefined ? {} : { args }) });
    return session as T;
  });
  const edits = new ScoreEditClient({
    async edit(boundWorkspaceId, forwarded) {
      assert.equal(boundWorkspaceId, workspaceId);
      assert.deepEqual(forwarded, request);
      return bridge.edit(boundWorkspaceId, forwarded);
    },
  }, workspaceId);

  assert.deepEqual(await edits.edit(input), session);
  assert.deepEqual(calls, [{
    command: "workbench_edit_v1",
    args: { request: { workspaceId, ...request } },
  }]);
  assert.equal(input.workspaceId, otherWorkspaceId);
  assert.equal(input.extra, "not-part-of-the-contract");
});

test("ScoreEditPort rejects a malformed host session instead of leaking it to UI code", async () => {
  const edits = new ScoreEditClient({ async edit() { return { documentId: "bad" }; } }, workspaceId);
  await assert.rejects(
    edits.edit({
      requestId: crypto.randomUUID(), documentId: "score-1", expectedVersion: 0,
      action: { kind: "undo" },
    }),
    /编辑结果无效/,
  );
});

test("ScoreEditPort rejects invalid runtime input before calling the host", async () => {
  let hostCalls = 0;
  const edits = new ScoreEditClient({
    async edit() { hostCalls += 1; return session; },
  }, workspaceId);

  await assert.rejects(
    edits.edit({
      requestId: "not-a-request-id",
      documentId: "score-1",
      expectedVersion: 0,
      action: { kind: "undo" },
    }),
    /编辑请求无效/,
  );
  assert.equal(hostCalls, 0);
});
