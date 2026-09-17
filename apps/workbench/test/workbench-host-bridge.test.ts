import assert from "node:assert/strict";
import test from "node:test";
import type { ScoreEditRequest } from "../src/contracts/note-input.ts";
import type { NewScoreInput } from "../src/contracts/new-score.ts";
import type { ScoreSessionRead } from "../src/contracts/score-session.ts";
import { WorkbenchClient, resolveWorkbenchWorkspaceId } from "../src/services/workbench-client.ts";
import { BrowserWorkbenchHostBridge, TauriWorkbenchHostBridge, WorkbenchRequestError } from "../src/services/workbench-host-bridge.ts";
import type { WorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import type { CloseRequestedEvent, Window as TauriWindow } from "@tauri-apps/api/window";

const session: ScoreSessionRead = {
  documentId: "score-host-bridge",
  title: "宿主边界",
  measureCount: 1,
  documentVersion: 0,
  undoDepth: 0,
  redoDepth: 0,
  notation: {
    kind: "staff",
    partId: "part-1",
    staffId: "staff-1",
    clef: "treble",
    measures: [{ id: "measure-1", voiceId: "voice-1", meter: { numerator: 4, denominator: 4 }, events: [], ruleWarnings: [] }],
  },
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

test("desktop workspace identity survives window sessions for crash recovery", () => {
  const firstSession = memoryStorage();
  const secondSession = memoryStorage();
  const persistent = memoryStorage();
  const created = "11111111-1111-4111-8111-111111111111";

  const first = resolveWorkbenchWorkspaceId(true, firstSession, persistent, () => created);
  const restored = resolveWorkbenchWorkspaceId(true, secondSession, persistent,
    () => "22222222-2222-4222-8222-222222222222");

  assert.equal(first, created);
  assert.equal(restored, created);
});

test("browser workspace identity remains isolated to its tab session", () => {
  const firstSession = memoryStorage();
  const secondSession = memoryStorage();
  const persistent = memoryStorage();

  const first = resolveWorkbenchWorkspaceId(false, firstSession, persistent,
    () => "11111111-1111-4111-8111-111111111111");
  const restored = resolveWorkbenchWorkspaceId(false, firstSession, persistent,
    () => "22222222-2222-4222-8222-222222222222");
  const anotherTab = resolveWorkbenchWorkspaceId(false, secondSession, persistent,
    () => "33333333-3333-4333-8333-333333333333");

  assert.equal(restored, first);
  assert.notEqual(anotherTab, first);
});

test("workbench client can use a non-HTTP desktop host bridge", async () => {
  const calls: string[] = [];
  const bridge: WorkbenchHostBridge = {
    async read() { calls.push("read"); return null; },
    async create(_workspaceId: string, _input: NewScoreInput) { calls.push("create"); return session; },
    async edit(_workspaceId: string, _input: ScoreEditRequest) { calls.push("edit"); return session; },
    async exportDocument() { calls.push("export"); return "{}"; },
    async importDocument() { calls.push("import"); return session; },
  };
  const client = new WorkbenchClient(bridge);

  assert.equal(await client.read(), null);
  assert.equal((await client.create({ title: "", measureCount: 1 }, crypto.randomUUID(), null)).documentId, session.documentId);
  assert.equal((await client.edit({ requestId: crypto.randomUUID(), documentId: session.documentId,
    expectedVersion: 0, action: { kind: "undo" } })).documentId, session.documentId);
  assert.equal(await client.exportDocument(), "{}");
  assert.equal((await client.importDocument({})).documentId, session.documentId);
  assert.deepEqual(calls, ["read", "create", "edit", "export", "import"]);
});

test("browser bridge preserves structured issue codes and targets", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "容量不足", issue: {
    code: "editor.measure-capacity-exceeded", message: "容量不足", severity: "error", source: "editor",
    target: { scope: "measure", measureId: "measure-1" },
  } }), { status: 422, headers: { "Content-Type": "application/json" } });
  try {
    const bridge = new BrowserWorkbenchHostBridge();
    await assert.rejects(bridge.edit(crypto.randomUUID(), { requestId: crypto.randomUUID(), documentId: "document",
      expectedVersion: 0, action: { kind: "undo" } }), (error: unknown) =>
      error instanceof WorkbenchRequestError && error.status === 422
        && error.issue?.code === "editor.measure-capacity-exceeded"
        && error.issue.target.scope === "measure" && error.issue.target.measureId === "measure-1");
  } finally { globalThis.fetch = previous; }
});

test("tauri bridge sends versioned commands without HTTP and preserves structured errors", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, ...(args ? { args } : {}) });
    if (command === "workbench_edit_v1") throw {
      message: "容量不足", status: 422, issue: {
        code: "editor.measure-capacity-exceeded", message: "容量不足", severity: "error", source: "editor",
        target: { scope: "measure", measureId: "measure-1" },
      },
    };
    return (command === "workbench_read_v1" ? session : null) as T;
  };
  const bridge = new TauriWorkbenchHostBridge(invoke);
  const workspaceId = crypto.randomUUID();
  assert.equal(await bridge.read(workspaceId), session);
  await assert.rejects(bridge.edit(workspaceId, {
    requestId: crypto.randomUUID(), documentId: session.documentId, expectedVersion: 0,
    action: { kind: "append", measureId: "measure-1", anchor: { kind: "start" },
      duration: { base: 4, dots: 0 }, content: { kind: "rest" } },
  }), (error: unknown) => error instanceof WorkbenchRequestError && error.status === 422
    && error.issue?.code === "editor.measure-capacity-exceeded");
  assert.equal(calls[0]?.command, "workbench_read_v1");
  assert.deepEqual(calls[0]?.args, { workspaceId });
  assert.equal(calls[1]?.command, "workbench_edit_v1");
  assert.deepEqual((calls[1]?.args?.request as Record<string, unknown>).workspaceId, workspaceId);
});

test("tauri native file commands return the persisted version and cancellation", async () => {
  const invoked: string[] = [];
  const invoke = async <T>(command: string): Promise<T> => {
    invoked.push(command);
    if (command === "workbench_open_file_v1") return null as T;
    if (command === "workbench_save_file_v1") {
      return { session, name: "宿主边界", savedVersion: session.documentVersion } as T;
    }
    throw new Error("unexpected command");
  };
  const client = new WorkbenchClient(new TauriWorkbenchHostBridge(invoke));
  assert.equal(client.usesNativeFiles(), true);
  assert.equal(await client.openNativeDocument(), null);
  assert.deepEqual(await client.saveNativeDocument("宿主边界", true), {
    session, name: "宿主边界", savedVersion: session.documentVersion,
  });
  assert.deepEqual(invoked, ["workbench_open_file_v1", "workbench_save_file_v1"]);
});

test("tauri close requests are prevented until Rust closes the workspace", async () => {
  const invoked: Array<{ command: string; args?: Record<string, unknown> }> = [];
  let closeHandler: ((event: CloseRequestedEvent) => void | Promise<void>) | undefined;
  let nativeCloseCount = 0;
  const window = {
    async onCloseRequested(handler: (event: CloseRequestedEvent) => void | Promise<void>) {
      closeHandler = handler;
      return () => { closeHandler = undefined; };
    },
    async close() { nativeCloseCount += 1; },
  } satisfies Pick<TauriWindow, "onCloseRequested" | "close">;
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    invoked.push({ command, ...(args ? { args } : {}) });
    return true as T;
  };
  const bridge = new TauriWorkbenchHostBridge(invoke, () => window);
  const dispose = await bridge.onNativeCloseRequested(() => false);
  let prevented = 0;
  await closeHandler?.({ preventDefault: () => { prevented += 1; } } as CloseRequestedEvent);
  assert.equal(prevented, 1);

  const workspaceId = crypto.randomUUID();
  await bridge.closeNativeWindow(workspaceId);
  assert.deepEqual(invoked, [{ command: "workbench_close_v1", args: { workspaceId } }]);
  assert.equal(nativeCloseCount, 1);

  await closeHandler?.({ preventDefault: () => { prevented += 1; } } as CloseRequestedEvent);
  assert.equal(prevented, 1, "the forced close is allowed through without a second prompt");
  dispose();
});
