import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ScoreSessionRead } from "../../../../apps/workbench/src/contracts/score-session.ts";
import type { NotationRenderer } from "../../../../apps/workbench/src/notation/notation-renderer.ts";
import { WorkbenchClient } from "../../../../apps/workbench/src/services/workbench-client.ts";
import { TauriWorkbenchHostBridge } from "../../../../apps/workbench/src/services/workbench-host-bridge.ts";
import type { NativeFileResult } from "../../../../apps/workbench/src/services/workbench-host-bridge.ts";
import { readFileCheckpoint, writeFileCheckpoint } from "../../../../apps/workbench/src/services/document-file.ts";
import { useDocumentFiles } from "../../../../apps/workbench/src/workbench/use-document-files.ts";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function session(documentId: string, documentVersion: number): ScoreSessionRead {
  return {
    documentId, documentVersion, title: "audit-fixture", measureCount: 1, undoDepth: 0, redoDepth: 0,
    notation: { kind: "unsupported", message: "Notation is outside this audit." },
    playbackSource: {
      kind: "unsupported", projectionVersion: 1, documentId, documentVersion,
      code: "audit.fixture", message: "Playback is outside this audit.",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const renderer: NotationRenderer = {
  render: async () => { throw new Error("Unexpected notation rendering"); },
};

async function mount(initial: ScoreSessionRead, invoke: (command: string) => Promise<unknown>) {
  // Only native IPC/window boundaries are synthetic. Hook, client, DTO
  // validation and bridge error translation execute their production code.
  const bridge = new TauriWorkbenchHostBridge(
    async <T>(command: string) => await invoke(command) as T,
    () => ({ onCloseRequested: async () => () => {}, close: async () => {} }),
  );
  const client = new WorkbenchClient(bridge);
  let api!: ReturnType<typeof useDocumentFiles>;
  let current = initial;
  let replace!: (value: ScoreSessionRead) => void;
  function Fixture() {
    const [value, setValue] = useState(initial);
    current = value;
    replace = setValue;
    api = useDocumentFiles(value, client, setValue, renderer, false);
    return null;
  }
  const element = document.createElement("div");
  document.querySelector("#fixture")!.append(element);
  const root = createRoot(element);
  await act(async () => { root.render(createElement(Fixture)); });
  return {
    get api() { return api; },
    get current() { return current; },
    replace: (value: ScoreSessionRead) => replace(value),
    async dispose() { await act(async () => root.unmount()); element.remove(); },
  };
}

const results: { name: string; status: "passed" | "failed"; evidence?: unknown; error?: string }[] = [];
async function test(name: string, run: () => Promise<unknown>) {
  writeFileCheckpoint(null);
  try { results.push({ name, status: "passed", evidence: await run() }); }
  catch (error) { results.push({ name, status: "failed", error: String(error) }); }
  finally { writeFileCheckpoint(null); }
}

await test("save-and-continue opens New despite a newer unsaved session", async () => {
  const original = session(crypto.randomUUID(), 1);
  const newer = session(original.documentId, 2);
  const pending = deferred<NativeFileResult>();
  const fixture = await mount(original, async (command) => {
    assert(command === "workbench_save_file_v1", `Unexpected command: ${command}`);
    return pending.promise;
  });
  try {
    await act(async () => fixture.api.requestNewScore());
    assert(fixture.api.pendingAction?.kind === "new", "Dirty guard should request confirmation");
    let saving!: Promise<void>;
    await act(async () => { saving = fixture.api.saveAndContinue(); });
    await act(async () => fixture.replace(newer));
    await act(async () => {
      pending.resolve({ session: newer, savedVersion: 1, name: "audit" });
      await saving;
    });
    assert(fixture.api.newScoreOpen, "Baseline proceeds to New");
    assert(fixture.api.state === "unsaved", "Newer content must still be unsaved");
    assert(readFileCheckpoint()?.documentVersion === 1, "Checkpoint is the older snapshot");
    return { dialogOpened: true, state: fixture.api.state, currentVersion: fixture.current.documentVersion, savedVersion: 1 };
  } finally { await fixture.dispose(); }
});

await test("late save receipt replaces a newer document in the hook", async () => {
  const original = session(crypto.randomUUID(), 1);
  const replacement = session(crypto.randomUUID(), 0);
  const pending = deferred<NativeFileResult>();
  const fixture = await mount(original, async (command) => {
    assert(command === "workbench_save_file_v1", `Unexpected command: ${command}`);
    return pending.promise;
  });
  try {
    let saving!: Promise<boolean>;
    await act(async () => { saving = fixture.api.saveDocument(); });
    await act(async () => fixture.replace(replacement));
    assert(fixture.current.documentId === replacement.documentId, "Replacement should be applied");
    await act(async () => {
      pending.resolve({ session: original, savedVersion: 1, name: "audit" });
      assert(await saving, "Baseline considers the stale receipt successful");
    });
    assert(fixture.current.documentId === original.documentId, "Old receipt overwrites the newer document");
    return { staleIdentityReapplied: true };
  } finally { await fixture.dispose(); }
});

await test("open IPC error leaves hook session unchanged after simulated host commit", async () => {
  const original = session(crypto.randomUUID(), 1);
  const imported = session(crypto.randomUUID(), 0);
  writeFileCheckpoint({ documentId: original.documentId, documentVersion: 1, name: "audit" });
  let host = original;
  const fixture = await mount(original, async (command) => {
    assert(command === "workbench_open_file_v1", `Unexpected command: ${command}`);
    host = imported;
    throw { message: "audit recovery remove failure", status: 503 };
  });
  try {
    await act(async () => fixture.api.requestOpenPicker());
    assert(host.documentId === imported.documentId, "Injected host has committed");
    assert(fixture.current.documentId === original.documentId, "Hook keeps old session");
    assert(fixture.api.fileError === "audit recovery remove failure", "Failure is reported");
    return { hostUiDiverged: true, error: fixture.api.fileError };
  } finally { await fixture.dispose(); }
});

await test("save IPC error leaves checkpoint unchanged after simulated host commit", async () => {
  const original = session(crypto.randomUUID(), 1);
  let hostCommitted = false;
  const fixture = await mount(original, async (command) => {
    assert(command === "workbench_save_file_v1", `Unexpected command: ${command}`);
    hostCommitted = true;
    throw { message: "audit recovery remove failure", status: 503 };
  });
  try {
    await act(async () => assert(!await fixture.api.saveDocument(), "Hook reports save failure"));
    assert(hostCommitted, "Injected host has committed");
    assert(readFileCheckpoint() === null, "Hook does not update checkpoint");
    assert(fixture.api.state === "error", "Hook enters error state");
    return { hostCommitted, checkpoint: readFileCheckpoint(), state: fixture.api.state };
  } finally { await fixture.dispose(); }
});

document.querySelector("#results")!.textContent = JSON.stringify({
  scope: "Production React hook + WorkbenchClient + Tauri bridge; injected native boundary, no Rust IPC/GUI",
  meaning: "Passing characterizes baseline defects, not repairs",
  userAgent: navigator.userAgent,
  passed: results.filter((result) => result.status === "passed").length,
  failed: results.filter((result) => result.status === "failed").length,
  results,
}, null, 2);
