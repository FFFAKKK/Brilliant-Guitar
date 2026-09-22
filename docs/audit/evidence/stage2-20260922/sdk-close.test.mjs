import assert from "node:assert/strict";
import test from "node:test";
import { clearMocks, mockIPC, mockWindows } from "../../../../apps/workbench/node_modules/@tauri-apps/api/mocks.js";
import { getCurrentWindow } from "../../../../apps/workbench/node_modules/@tauri-apps/api/window.js";
import { TauriWorkbenchHostBridge } from "../../../../apps/workbench/src/services/workbench-host-bridge.ts";

// Node only: run the installed SDK and production bridge, injecting native IPC
// and event delivery. No browser, product window or actual ACL is involved.
function setup(t, nativeInvoke) {
  const originalWindow = globalThis.window;
  globalThis.window = { crypto: globalThis.crypto };
  mockWindows("audit-stage2");
  let listener;
  const calls = [];
  mockIPC(async (command, args) => {
    calls.push(command);
    if (command === "plugin:event|listen") {
      assert.equal(args.event, "tauri://close-requested");
      // The SDK's own registered callback is awaited so destroy rejection is
      // observable here; the real event transport does not await it.
      listener = window.__TAURI_INTERNALS__.callbacks.get(args.handler);
      return args.handler;
    }
    if (command === "plugin:event|unlisten") return;
    return nativeInvoke(command, args);
  });
  t.after(() => {
    clearMocks();
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });
  return {
    bridge: new TauriWorkbenchHostBridge(),
    calls,
    async closeEvent() {
      assert.equal(typeof listener, "function");
      await listener({ event: "tauri://close-requested", id: 1, payload: null });
    },
  };
}

test("SDK honors guard veto before an explicit close", async (t) => {
  const { bridge, calls, closeEvent } = setup(t, async (command) => {
    throw new Error(`Unexpected IPC: ${command}`);
  });
  let guarded = 0;
  await bridge.onNativeCloseRequested(() => { guarded++; return false; });
  await closeEvent();
  assert.equal(guarded, 1);
  assert(!calls.includes("plugin:window|destroy"));
});

test("rejected close leaves forceClosing set and bypasses the next SDK guard", async (t) => {
  const { bridge, calls, closeEvent } = setup(t, async (command) => {
    if (command === "workbench_close_v1") return true;
    if (command === "plugin:window|close") throw new Error("injected close rejection");
    if (command === "plugin:window|destroy") return;
    throw new Error(`Unexpected IPC: ${command}`);
  });
  let guarded = 0;
  await bridge.onNativeCloseRequested(() => { guarded++; return false; });
  await assert.rejects(bridge.closeNativeWindow(crypto.randomUUID()), /injected close rejection/);
  await closeEvent();
  assert.equal(guarded, 0);
  assert.deepEqual(calls.filter((value) => !value.startsWith("plugin:event|")), [
    "workbench_close_v1", "plugin:window|close", "plugin:window|destroy",
  ]);
});

test("bridge close resolves before SDK destroy and does not receive its rejection", async (t) => {
  let rejectDestroy;
  const destroy = new Promise((_, reject) => { rejectDestroy = reject; });
  const { bridge, calls, closeEvent } = setup(t, async (command) => {
    if (command === "workbench_close_v1") return true;
    if (command === "plugin:window|close") return;
    if (command === "plugin:window|destroy") return destroy;
    throw new Error(`Unexpected IPC: ${command}`);
  });
  let guarded = 0;
  await bridge.onNativeCloseRequested(() => { guarded++; return false; });
  await bridge.closeNativeWindow(crypto.randomUUID());
  assert(!calls.includes("plugin:window|destroy"));
  const event = closeEvent();
  const rejectedEvent = assert.rejects(event, /injected destroy rejection/);
  await Promise.resolve();
  assert(calls.includes("plugin:window|destroy"));
  rejectDestroy(new Error("injected destroy rejection"));
  await rejectedEvent;
  assert.equal(guarded, 0);
  assert.equal(typeof getCurrentWindow().destroy, "function");
});

test("a false backend close result still proceeds through the SDK window close", async (t) => {
  const { bridge, calls } = setup(t, async (command) => {
    if (command === "workbench_close_v1") return false;
    if (command === "plugin:window|close") return;
    throw new Error(`Unexpected IPC: ${command}`);
  });
  await bridge.closeNativeWindow(crypto.randomUUID());
  assert.deepEqual(calls, ["workbench_close_v1", "plugin:window|close"]);
});
