import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { createDesktopReadonlyScoreSession } from "../src/services/desktop-readonly-score-session.ts";

function setup(t: TestContext, initial: unknown = null) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const mockedWindow = { crypto: globalThis.crypto } as unknown as Window & {
    __TAURI_INTERNALS__: { callbacks: Map<number, (event: unknown) => Promise<void>> };
  };
  Object.defineProperty(globalThis, "window", { value: mockedWindow, configurable: true, writable: true });
  mockWindows("main");
  let listener: ((event: unknown) => Promise<void>) | undefined;
  let rejectClose = false;
  const calls: string[] = [];
  mockIPC((command, args) => {
    calls.push(command);
    if (command === "plugin:event|listen") {
      const payload = args as { event: string; handler: number };
      assert.equal(payload.event, "tauri://close-requested");
      listener = mockedWindow.__TAURI_INTERNALS__.callbacks.get(payload.handler);
      return payload.handler;
    }
    if (command === "plugin:event|unlisten") return;
    if (command === "workbench_read_v1") return initial;
    if (command === "workbench_close_window_guarded_v1") {
      if (rejectClose) throw new Error("Synthetic native dispatch failure");
      return true;
    }
    throw new Error(`Unexpected SDK IPC: ${command}`);
  });
  t.after(() => {
    clearMocks();
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  });
  return {
    bridge: new TauriWorkbenchHostBridge(),
    calls,
    rejectClose(value: boolean) { rejectClose = value; },
    async closeEvent() {
      assert(listener);
      await listener({ event: "tauri://close-requested", id: 1, payload: null });
    },
  };
}

test("installed Tauri SDK never default-destroys after bridge close acceptance or failure", async (t) => {
  const fixture = setup(t);
  let confirmations = 0;
  const dispose = await fixture.bridge.onNativeCloseRequestedGuarded(() => { confirmations += 1; });
  await fixture.closeEvent();
  fixture.rejectClose(true);
  await assert.rejects(fixture.bridge.closeNativeWindowGuarded("workspace", { kind: "empty" }));
  await fixture.closeEvent();
  fixture.rejectClose(false);
  await fixture.bridge.closeNativeWindowGuarded("workspace", { kind: "empty" });
  await fixture.closeEvent();
  assert.equal(confirmations, 3);
  assert.deepEqual(fixture.calls.filter((command) => !command.startsWith("plugin:event|")),
    ["workbench_close_window_guarded_v1", "workbench_close_window_guarded_v1"]);
  dispose();
});

test("installed SDK keeps default destruction disabled after an asynchronous guard error", async (t) => {
  const fixture = setup(t);
  const dispose = await fixture.bridge.onNativeCloseRequestedGuarded(async () => { throw new Error("guard failed"); });
  await assert.rejects(fixture.closeEvent(), /guard failed/);
  assert(!fixture.calls.some((command) => command.startsWith("plugin:window|")));
  dispose();
});

for (const initial of [null, {
  documentId: "piece", documentVersion: 2, title: "Native fixture", measureCount: 1,
  undoDepth: 1, redoDepth: 0, notation: { kind: "unsupported", message: "Fixture" },
  playbackSource: { kind: "unsupported", projectionVersion: 1, documentId: "piece", documentVersion: 2,
    code: "fixture", message: "Fixture" },
  persistence: { sessionId: "actual-instance", savedVersion: null, dirty: true },
}]) {
  test(`actual desktop factory owns native close on ${initial ? "a dirty workspace" : "an unread welcome page"}`, async t => {
    const fixture = setup(t, initial);
    // Use the real trusted factory used by startup-center and legacy preview,
    // not a second test-only lifecycle binder.
    const documents = createDesktopReadonlyScoreSession({ initialization: "read-existing" });
    await new Promise(resolve => setImmediate(resolve));
    if (initial) await documents.read();
    await fixture.closeEvent();
    assert.equal(documents.snapshot().busy, true);
    assert.equal(documents.snapshot().documentId, initial?.documentId ?? null);
    assert.equal(fixture.calls.filter(command => command === "workbench_read_v1").length, 1);
    assert.equal(fixture.calls.filter(command => command === "workbench_close_window_guarded_v1").length, 1);
    assert(!fixture.calls.some(command => command.startsWith("plugin:window|") || command.includes("create")));
    documents.dispose();
  });
}
