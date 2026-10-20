import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ScoreSessionRead } from "../../src/contracts/score-session.ts";
import type { NotationRenderer } from "../../src/notation/notation-renderer.ts";
import { WorkbenchClient } from "../../src/services/workbench-client.ts";
import { TauriWorkbenchHostBridge } from "../../src/services/workbench-host-bridge.ts";
import type { NativeFileResult } from "../../src/services/workbench-host-bridge.ts";
import { readFileCheckpoint, writeFileCheckpoint } from "../../src/services/document-file.ts";
import { useDocumentFiles } from "../../src/workbench/use-document-files.ts";
import type { CloseRequestedEvent } from "@tauri-apps/api/window";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const startedAt = new Date().toISOString();
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function session(version = 1, instance = "original", savedVersion: number | null = null,
  dirty = true, documentId = "score-a"): ScoreSessionRead {
  return { documentId, documentVersion: version, title: "Save regression", measureCount: 1,
    undoDepth: 0, redoDepth: 0, notation: { kind: "unsupported", message: "Test fixture" },
    playbackSource: { kind: "unsupported", projectionVersion: 1, documentId, documentVersion: version,
      code: "test.fixture", message: "Test fixture" },
    persistence: { sessionId: instance, savedVersion, dirty } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function mount() {
  const pending = deferred<NativeFileResult | null>();
  const closePending = deferred<boolean>();
  let closeReply = () => closePending.promise;
  let calls = 0, closeCalls = 0, nativeDestructions = 0, listenerCount = 0;
  let closeExpected: unknown;
  let listener: ((event: CloseRequestedEvent) => void | Promise<void>) | undefined;
  const bridge = new TauriWorkbenchHostBridge(async <T,>(command: string, args?: Record<string, unknown>) => {
    if (command === "workbench_save_file_v1") { calls++; return await pending.promise as T; }
    assert(command === "workbench_close_window_guarded_v1", `Unexpected command: ${command}`);
    closeCalls++; closeExpected = args?.expected; return await closeReply() as T;
  }, () => ({
    async onCloseRequested(handler) { listenerCount++; listener = handler; return () => { listener = undefined; }; },
    async close() { nativeDestructions++; },
  }));
  const client = new WorkbenchClient(bridge);
  const renderer: NotationRenderer = { render: async () => { throw new Error("Unexpected rendering"); } };
  let api!: ReturnType<typeof useDocumentFiles>, replace!: (value: ScoreSessionRead) => void;
  let current = session();
  function Fixture() {
    const [value, setValue] = useState(session);
    current = value; replace = setValue;
    api = useDocumentFiles(value, client, setValue, renderer, false);
    return null;
  }
  const element = document.createElement("div");
  document.querySelector("#fixture")!.append(element);
  const root = createRoot(element);
  await act(async () => root.render(createElement(Fixture)));
  return { pending, closePending, get api() { return api; }, get current() { return current; }, get calls() { return calls; },
    get closeCalls() { return closeCalls; }, get closeExpected() { return closeExpected; },
    get listenerCount() { return listenerCount; }, get nativeDestructions() { return nativeDestructions; },
    setCloseReply(reply: () => Promise<boolean>) { closeReply = reply; },
    closeEvent() {
      assert(listener, "Native listener must be installed");
      let prevented = false;
      const result = listener({ preventDefault() { prevented = true; } } as CloseRequestedEvent);
      assert(prevented, "Cancel the SDK default synchronously");
      return Promise.resolve(result);
    },
    replace: (value: ScoreSessionRead) => replace(value),
    async dispose() { await act(async () => root.unmount()); element.remove(); } };
}
const results: { name: string; passed: boolean; error?: string }[] = [];
async function test(name: string, run: (fixture: Awaited<ReturnType<typeof mount>>) => Promise<void>) {
  writeFileCheckpoint(null);
  const fixture = await mount();
  try { await run(fixture); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
  finally { await fixture.dispose(); writeFileCheckpoint(null); }
}

await test("new edits prevent Save and Continue after a late clean receipt", async f => {
  await act(async () => f.api.requestNewScore());
  let saving!: Promise<void>;
  await act(async () => { saving = f.api.saveAndContinue(); });
  const edited = session(2, "original", 1);
  await act(async () => f.replace(edited));
  await act(async () => {
    f.pending.resolve({ session: session(1, "original", 1, false), savedVersion: 1, name: "saved" });
    await saving;
  });
  assert(!f.api.newScoreOpen && f.api.pendingAction?.kind === "new", "Keep confirmation");
  assert(f.current === edited && f.api.state === "unsaved", "Preserve the newer edit");
  assert(readFileCheckpoint()?.documentVersion === 1, "Keep only the actual saved checkpoint");
});
for (const [name, replacement] of [
  ["different document", session(0, "replacement", null, false, "score-b")],
  ["same-ID same-version reopen", session(1, "reopened")],
] as const) {
  await test(`late save preserves a ${name}`, async f => {
    let saving!: Promise<boolean>;
    await act(async () => { saving = f.api.saveDocument(); });
    await act(async () => f.replace(replacement));
    await act(async () => {
      f.pending.resolve({ session: session(1, "original", 1, false), savedVersion: 1, name: "old" });
      assert(!await saving, "A replaced session cannot authorize continuing");
    });
    assert(f.current === replacement && readFileCheckpoint() === null, "Do not replace session/checkpoint");
    assert(f.api.state !== "error", "Do not report a committed file as a failed save");
  });
}
await test("successful current save continues to New", async f => {
  await act(async () => f.api.requestNewScore());
  let saving!: Promise<void>;
  await act(async () => { saving = f.api.saveAndContinue(); });
  await act(async () => {
    f.pending.resolve({ session: session(1, "original", 1, false), savedVersion: 1, name: "saved" });
    await saving;
  });
  assert(f.api.newScoreOpen && f.api.pendingAction === null && f.api.state === "saved", "Continue after accepted save");
});
await test("undo back to saved history remains clean at a newer version", async f => {
  await act(async () => f.api.requestNewScore());
  let saving!: Promise<void>;
  await act(async () => { saving = f.api.saveAndContinue(); });
  const undone = session(3, "original", 1, false);
  await act(async () => f.replace(undone));
  await act(async () => {
    f.pending.resolve({ session: session(1, "original", 1, false), savedVersion: 1, name: "saved" });
    await saving;
  });
  assert(f.current === undone && f.api.newScoreOpen && f.api.state === "saved", "Honor native history identity");
});
await test("cancel does not update checkpoint or continue", async f => {
  await act(async () => f.api.requestNewScore());
  let saving!: Promise<void>;
  await act(async () => { saving = f.api.saveAndContinue(); });
  await act(async () => { f.pending.resolve(null); await saving; });
  assert(!f.api.newScoreOpen && f.api.pendingAction?.kind === "new", "Keep confirmation");
  assert(readFileCheckpoint() === null && f.api.fileError === "", "Cancellation is not a save failure");
});
await test("inconsistent native checkpoint is rejected before state update", async f => {
  let saving!: Promise<boolean>;
  await act(async () => { saving = f.api.saveDocument(); });
  await act(async () => {
    f.pending.resolve({ session: session(1, "original", 0, false), savedVersion: 1, name: "invalid" });
    assert(!await saving, "Reject mismatched savedVersion");
  });
  assert(f.api.state === "error" && readFileCheckpoint() === null, "Preserve the original checkpoint");
});
await test("reentrant Save and Save As dispatch only once before React renders busy", async f => {
  let first!: Promise<boolean>, second!: Promise<boolean>;
  await act(async () => { first = f.api.saveDocument(); second = f.api.saveDocument(undefined, true); });
  assert(!await second && f.calls === 1, "Single synchronous owner of native dialog");
  await act(async () => {
    f.pending.resolve({ session: session(1, "original", 1, false), savedVersion: 1, name: "saved" });
    assert(await first, "The first save still completes");
  });
});
await test("native write failure retains the unsaved document and confirmation", async f => {
  await act(async () => f.api.requestNewScore());
  let saving!: Promise<void>;
  await act(async () => { saving = f.api.saveAndContinue(); });
  await act(async () => { f.pending.reject(new Error("synthetic disk failure")); await saving; });
  assert(!f.api.newScoreOpen && f.api.pendingAction?.kind === "new" && f.api.state === "error", "Keep unsaved work");
  assert(readFileCheckpoint() === null, "No checkpoint after failure");
});
await test("post-commit cleanup warning preserves the successful save and continuation", async f => {
  await act(async () => f.api.requestNewScore());
  let saving!: Promise<void>;
  await act(async () => { saving = f.api.saveAndContinue(); });
  await act(async () => {
    f.pending.resolve({ session: session(1, "original", 1, false), savedVersion: 1, name: "saved",
      warnings: [{ code: "file.recovery-unavailable", message: "Synthetic cleanup warning", severity: "warning",
        source: "file", target: { scope: "component", componentId: "navigation.file" }, retryable: false }] });
    await saving;
  });
  assert(f.api.newScoreOpen && f.api.state === "saved", "A cleanup warning does not roll back a committed save");
});
await test("native close uses the host confirmation, captures identity and never asks beforeunload", async f => {
  const beforeUnload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(beforeUnload);
  assert(!beforeUnload.defaultPrevented, "Desktop must not have a second browser confirmation");
  let closing!: Promise<void>;
  await act(async () => { closing = f.closeEvent(); });
  assert(f.api.pendingAction === null && f.api.working === "close", "Use the host confirmation and block local actions");
  assert(JSON.stringify(f.closeExpected) === JSON.stringify({ kind: "document", sessionId: "original",
    documentId: "score-a", documentVersion: 1 }), "Bind the exact accepted instance");
  await act(async () => { f.closePending.resolve(false); await closing; });
  assert(f.api.working === null && f.current.persistence?.dirty && f.nativeDestructions === 0, "Cancel retains the document");
});
await test("native close owns the synchronous gate before React rerenders", async f => {
  let first!: Promise<void>, second!: Promise<void>;
  await act(async () => { first = f.closeEvent(); second = f.closeEvent(); assert(!await f.api.saveDocument(), "Do not overlap save"); });
  assert(f.closeCalls === 1 && f.calls === 0, "Only one close dialog");
  await act(async () => { f.closePending.resolve(true); await first; await second; });
  assert(f.api.working === "close" && !f.api.available && f.current.documentId === "score-a", "Dispatch is not destruction");
  assert(f.nativeDestructions === 0, "Only Rust destroys the native window");
});
await test("pending save prevents close and its accepted receipt is used by the next close", async f => {
  let saving!: Promise<boolean>;
  await act(async () => { saving = f.api.saveDocument(); await f.closeEvent(); });
  assert(f.closeCalls === 0, "Do not close while a save owns the file lifetime");
  await act(async () => {
    f.pending.resolve({ session: session(1, "original", 1, false), savedVersion: 1, name: "saved" }); await saving;
  });
  let closing!: Promise<void>;
  await act(async () => { closing = f.closeEvent(); });
  assert(Number(f.closeCalls) === 1, "Close can be retried after saving");
  await act(async () => { f.closePending.resolve(false); await closing; });
  assert(f.api.state === "saved", "Cancel must preserve the saved checkpoint");
});
await test("native listener remains stable and captures the latest replacement instance", async f => {
  await act(async () => f.replace(session(1, "reopened")));
  assert(f.listenerCount === 1, "Do not unregister on dirty/session changes");
  let closing!: Promise<void>;
  await act(async () => { closing = f.closeEvent(); });
  assert((f.closeExpected as { sessionId: string }).sessionId === "reopened", "Do not close using a stale render");
  await act(async () => { f.closePending.resolve(false); await closing; });
});
await test("native dispatch failure keeps the document and allows an explicit retry", async f => {
  let closing!: Promise<void>;
  await act(async () => { closing = f.closeEvent(); });
  await act(async () => { f.closePending.reject(new Error("synthetic native dispatch failure")); await closing; });
  assert(f.api.working === null && f.current.persistence?.dirty && f.api.fileError !== "", "Keep data and show failure");
  f.setCloseReply(async () => false);
  await act(async () => f.closeEvent());
  assert(f.closeCalls === 2 && f.api.fileError === "" && f.nativeDestructions === 0, "Retry through the same guarded protocol");
});
const report = { startedAt, completedAt: new Date().toISOString(),
  scope: "Real React hook/client/bridge save and guarded-close regressions with injected native IPC; native dialogs not exercised",
  passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
document.querySelector("#results")!.textContent = JSON.stringify(report, null, 2);
document.title = `Save regression: ${report.passed} passed, ${report.failed} failed`;
