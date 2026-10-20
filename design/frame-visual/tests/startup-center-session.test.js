import assert from "node:assert/strict";
import test from "node:test";
import { createStartupCenterSession } from "../src/startup/startup-center-session.js";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { createDesktopPluginPlanStore } from "../src/startup/desktop-plugin-plan-store.js";
import { BACKUP_PLUGIN_DIRECTORY as directory } from "../src/host/backup-plugin-directory.js";
import { createDesktopReadonlyScoreSession, TauriPluginSettingsStorage } from "../src/vendor/desktop-plugin-settings.js";
import { defaultStartupPlan } from "../src/startup/plugin-startup-plan.js";
import { STAFF_FIXTURE } from "../src/fixtures/staff-snapshot.js";
import { withTestDocument } from "./support/dom-test-environment.js";
import { installTauriEventMock } from "./support/tauri-event-mock.js";

const flush = () => new Promise(resolve => setImmediate(resolve));
const id = "00000000-0000-4000-8000-000000000001";
const row = (name = "A") => ({ id, name, location: "C:\\scores\\" + name + ".json", lastOpenedAt: 1 });
const catalog = name => ({ apiVersion: 1, entries: name ? [row(name)] : [] });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function score(documentId = "opened", title = "作品A") {
  return { documentId, documentVersion: 0, title, measureCount: 1, undoDepth: 0, redoDepth: 0,
    notation: { ...structuredClone(STAFF_FIXTURE), measures: structuredClone(STAFF_FIXTURE.measures.slice(0, 1)).map(measure => ({ ...measure, events: [] })) },
    playbackSource: { kind: "unsupported", projectionVersion: 1, documentId, documentVersion: 0, code: "playback.readonly-test", message: "只读测试" } };
}
function fixture({ window, document }, options = {}) {
  const root = document.createElement("main"), workspaceRoot = document.createElement("div");
  document.body.append(root, workspaceRoot); workspaceRoot.hidden = true;
  const calls = [], modes = [], runtimes = [], overrides = {};
  let current = options.current ?? null, saved = null, source, factoryCalls = 0;
  const invoke = async (command, args) => {
    calls.push({ command, args });
    if (overrides[command]) return overrides[command](args);
    if (command === "workbench_read_plugin_settings_v1") return saved;
    if (command === "workbench_write_plugin_settings_v1") { saved = structuredClone(args.document); return; }
    if (command === "workbench_read_v1") return current;
    if (command === "workbench_list_recent_documents_v1") return catalog("A");
    if (command === "workbench_remove_recent_document_v1") return catalog();
    const expected = current ? { kind: "document", documentId: current.documentId, documentVersion: current.documentVersion } : { kind: "empty" };
    if (command === "workbench_create_guarded_v1") {
      assert.deepEqual(args.request.expected, expected); current = score("new", args.request.input.title || "未命名乐谱"); return current;
    }
    if (["workbench_open_file_guarded_v1", "workbench_open_recent_document_guarded_v1"].includes(command)) {
      assert.deepEqual(args.expected, expected); current = score(); return { session: current, name: "A", savedVersion: 0 };
    }
    throw new Error("Unexpected IPC " + command);
  };
  const nativeEvents = installTauriEventMock(window, invoke);
  const store = createDesktopPluginPlanStore({ directory, settingsStorage: new TauriPluginSettingsStorage() });
  const app = createStartupCenterSession({ store, workspaceRoot,
    createDocumentSession(input) { factoryCalls++; assert.deepEqual(input, { initialization: "read-existing" }); source = createDesktopReadonlyScoreSession(input); return source; },
    async showView(mode) {
      modes.push(mode);
      if (options.showView) await options.showView(mode);
      root.hidden = mode === "workspace"; workspaceRoot.hidden = mode !== "workspace";
    },
    createWorkspace(input) {
      assert.equal(workspaceRoot.hidden, false, "viewport must only mount after visible presentation completes");
      if (options.createWorkspace) return options.createWorkspace(input);
      const runtime = createBackupUiRuntime(input); runtimes.push(runtime); return runtime;
    },
  });
  return { app, root, workspaceRoot, calls, modes, runtimes, overrides, store, nativeEvents,
    source: () => source, factoryCalls: () => factoryCalls,
    setCurrent(value) { current = value; }, setSaved(value) { saved = value; },
    count: command => calls.filter(call => call.command === command).length,
    dispose() { app.dispose(); root.remove(); workspaceRoot.remove(); nativeEvents.dispose(); },
  };
}

test("startup preparation uses the real desktop read-existing source and independent recent metadata without creating a score/platform", () => withTestDocument(async env => {
  const f = fixture(env);
  try {
    assert.equal((await f.app.ready).ok, true); await flush();
    assert.equal(f.nativeEvents.listeners.size, 1);
    assert.equal(f.factoryCalls(), 1); assert.equal(f.app.snapshot().phase, "welcome");
    assert.throws(() => createStartupCenterSession({ workspaceRoot: f.workspaceRoot, showView() {},
      createDocumentSession() { throw new Error("must not create a second source"); }, store: f.store }), /已有启动协调所有者/);
    assert.equal(f.count("workbench_read_v1"), 1); assert.equal(f.count("workbench_create_guarded_v1"), 0);
    assert.equal(f.count("workbench_create_v1"), 0); assert.equal(f.runtimes.length, 0); assert.deepEqual(f.modes, []);
    assert.equal(f.app.snapshot().document.documentId, null); assert.equal(f.app.snapshot().recent.entries[0].id, id);
    f.overrides.workbench_list_recent_documents_v1 = () => { throw new Error("recent disk unavailable"); };
    assert.equal((await f.app.refreshRecents()).ok, false);
    assert.equal(f.app.snapshot().recent.entries[0].id, id); assert.match(f.app.snapshot().recent.issue, /recent disk unavailable/);
    assert.equal((await f.app.enter({ kind: "new" })).ok, true); assert.equal(f.runtimes.length, 1);
    assert.equal(f.app.snapshot().document.documentId, "new"); assert.equal(f.count("workbench_create_v1"), 0);
  } finally { f.dispose(); }
}));

test("one new intent waits for presentation, rejects overlapping actions and mounts the original workspace exactly once", () => withTestDocument(async env => {
  const shown = deferred(), entered = deferred();
  const f = fixture(env, { showView: mode => { if (mode === "workspace") { entered.resolve(); return shown.promise; } } });
  try {
    await f.app.ready; const starting = f.app.enter({ kind: "new" }); await entered.promise;
    assert.equal(f.count("workbench_create_guarded_v1"), 1); assert.equal(f.runtimes.length, 0); assert.equal(f.workspaceRoot.hidden, true);
    for (const run of [() => f.app.enter({ kind: "open" }), f.app.retryStart, f.app.returnToWelcome, f.app.prepare]) assert.equal((await run()).code, "startup.busy");
    shown.resolve(); assert.equal((await starting).ok, true); await flush();
    assert.equal(f.runtimes.length, 1); assert.equal(f.app.snapshot().hasWorkspace, true);
    assert.equal(f.app.snapshot().phase, "workspace"); assert.equal(f.workspaceRoot.querySelectorAll(".core-score-view").length, 1);
  } finally { f.dispose(); }
}));

test("cancelled or failed opens do not show or mount a workspace and explicit preparation recovers the read model", () => withTestDocument(async env => {
  const f = fixture(env);
  try {
    await f.app.ready;
    f.overrides.workbench_open_file_guarded_v1 = () => null;
    assert.deepEqual(await f.app.enter({ kind: "open" }), { ok: true, changed: false, cancelled: true });
    assert.equal(f.app.snapshot().phase, "welcome"); assert.equal(f.runtimes.length, 0); assert.deepEqual(f.modes, []);
    f.overrides.workbench_open_file_guarded_v1 = () => { throw new Error("bad project"); };
    assert.equal((await f.app.enter({ kind: "open" })).ok, false); assert.equal(f.app.snapshot().document.status, "error");
    assert.equal((await f.app.enter({ kind: "new" })).ok, false); assert.equal(f.count("workbench_create_guarded_v1"), 0);
    delete f.overrides.workbench_open_file_guarded_v1;
    assert.equal((await f.app.prepare()).ok, true); assert.equal((await f.app.enter({ kind: "open" })).ok, true);
    assert.equal(f.count("workbench_create_v1"), 0); assert.equal(f.runtimes.length, 1);
  } finally { f.dispose(); }
}));

test("record-ID opens and return/continue keep the actual platform, DOM, document owner and fixed startup plan", () => withTestDocument(async env => {
  const f = fixture(env);
  try {
    await f.app.ready; assert.equal((await f.app.enter({ kind: "recent", recordId: id })).ok, true); await flush();
    const runtime = f.runtimes[0], view = f.workspaceRoot.querySelector(".core-score-view"), plan = f.app.snapshot().runningPlan;
    const opening = f.calls.find(call => call.command === "workbench_open_recent_document_guarded_v1");
    assert.deepEqual(opening.args, { workspaceId: f.calls.find(call => call.command === "workbench_read_v1").args.workspaceId, recordId: id, expected: { kind: "empty" } });
    assert.equal(runtime.document.snapshot().documentId, "opened");
    assert.equal((await f.app.returnToWelcome()).ok, true);
    f.app.controller.setEnabled("frame.score-info", true); assert.equal((await f.app.controller.save()).ok, true);
    const reads = f.count("workbench_read_plugin_settings_v1");
    assert.equal((await f.app.enter({ kind: "continue" })).ok, true);
    assert.equal(f.count("workbench_read_plugin_settings_v1"), reads); assert.equal(f.runtimes[0], runtime);
    assert.equal(f.runtimes.length, 1); assert.equal(f.workspaceRoot.querySelector(".core-score-view"), view);
    assert.equal(f.app.snapshot().runningPlan, plan); assert.equal(plan.plugins["frame.score-info"].enabled, false);
    await f.app.returnToWelcome(); assert.equal((await f.app.enter({ kind: "new" })).ok, true);
    assert.equal(runtime.document.snapshot().documentId, "new"); assert.equal(f.workspaceRoot.querySelector(".core-score-view"), view);
    assert.equal(f.runtimes.length, 1); assert.equal(f.factoryCalls(), 1);
  } finally { f.dispose(); }
}));

test("post-acceptance window failure retries the remaining steps without repeating new/open or applying later drafts", () => withTestDocument(async env => {
  let fail = true;
  const f = fixture(env, { showView(mode) { if (mode === "workspace" && fail) throw new Error("window size refused"); } });
  try {
    await f.app.ready; assert.equal((await f.app.enter({ kind: "new" })).ok, false);
    assert.equal(f.app.snapshot().document.documentId, "new"); assert.equal(f.runtimes.length, 0);
    f.app.controller.setEnabled("frame.score-info", true); assert.equal((await f.app.controller.save()).ok, true);
    assert.equal((await f.app.enter({ kind: "open" })).ok, false); assert.equal(f.count("workbench_open_file_guarded_v1"), 0);
    fail = false; assert.equal((await f.app.retryStart()).ok, true);
    assert.equal(f.count("workbench_create_guarded_v1"), 1); assert.equal(f.app.snapshot().runningPlan.plugins["frame.score-info"].enabled, false);
    assert.deepEqual(f.modes, ["workspace", "welcome", "workspace"]);
  } finally { f.dispose(); }
}));

test("original workspace mount rollback can retry the accepted document while uncertain cleanup blocks a second instance", () => withTestDocument(async env => {
  for (const uncertain of [false, true]) {
    let attempts = 0;
    const f = fixture(env, { createWorkspace(input) {
      attempts++;
      if (attempts === 1) {
        if (uncertain) throw new AggregateError([new Error("cleanup incomplete")], "rollback failed");
        return createBackupUiRuntime({ ...input, animationProvider: {} });
      }
      return createBackupUiRuntime(input);
    } });
    try {
      await f.app.ready; assert.equal((await f.app.enter({ kind: "open" })).ok, false);
      assert.equal(f.app.snapshot().document.documentId, "opened");
      assert.equal(f.workspaceRoot.querySelector(".core-score-view"), null);
      const retried = await f.app.retryStart();
      assert.equal(retried.ok, !uncertain); assert.equal(attempts, uncertain ? 1 : 2);
      if (uncertain) assert.equal(retried.code, "startup.restart-required");
      assert.equal(f.count("workbench_open_file_guarded_v1"), 1);
    } finally { f.dispose(); }
  }
}));

test("unsaved recovery can continue but cannot be overwritten, and invalid or changed plans stop before document selection", () => withTestDocument(async env => {
  const f = fixture(env, { current: score("recovered", "恢复作品") });
  try {
    await f.app.ready; assert.equal(f.app.snapshot().document.dirty, true);
    f.app.controller.setEnabled("frame.score-info", true);
    assert.equal((await f.app.enter({ kind: "open" })).ok, false); assert.equal(f.count("workbench_open_file_guarded_v1"), 0);
    f.app.controller.discard();
    assert.equal((await f.app.enter({ kind: "open" })).code, "document.unsaved");
    const changed = structuredClone(defaultStartupPlan(directory)); changed.revision = 3;
    f.setSaved({ "brilliant.ui.backup-startup": { schemaVersion: 1, value: changed } });
    assert.equal((await f.app.enter({ kind: "continue" })).ok, false); assert.equal(f.runtimes.length, 0);
    await f.app.controller.reload(); assert.equal((await f.app.enter({ kind: "continue" })).ok, true);
    assert.equal(f.app.snapshot().document.documentId, "recovered"); assert.equal(f.count("workbench_create_guarded_v1"), 0);
  } finally { f.dispose(); }
}));

test("recent directory requests reject inverse order and removal failure without changing the accepted document", () => withTestDocument(async env => {
  const f = fixture(env), first = deferred(), second = deferred();
  try {
    await f.app.ready; await flush(); let reads = 0;
    f.overrides.workbench_list_recent_documents_v1 = () => reads++ ? second.promise : first.promise;
    const older = f.app.refreshRecents(), newer = f.app.refreshRecents();
    second.resolve(catalog("newer")); assert.equal((await newer).ok, true);
    first.resolve(catalog("older")); assert.equal((await older).ok, false);
    assert.equal(f.app.snapshot().recent.entries[0].name, "newer");
    f.overrides.workbench_remove_recent_document_v1 = () => { throw new Error("remove unavailable"); };
    assert.equal((await f.app.removeRecent(id)).ok, false); assert.equal(f.app.snapshot().recent.entries[0].name, "newer");
    delete f.overrides.workbench_remove_recent_document_v1;
    assert.equal((await f.app.removeRecent(id)).ok, true); assert.deepEqual(f.app.snapshot().recent.entries, []);
    assert.equal(f.app.snapshot().document.documentId, null); assert.equal(f.app.snapshot().document.status, "empty");
  } finally { f.dispose(); }
}));

test("disposal at pending plan/read/open/presentation boundaries prevents all later host calls, mounts and notifications", () => withTestDocument(async env => {
  for (const boundary of ["plan", "read", "open", "presentation"]) {
    const wait = deferred(), arrived = deferred();
    const f = fixture(env, boundary === "presentation" ? { showView(mode) { if (mode === "workspace") { arrived.resolve(); return wait.promise; } } } : {});
    let result;
    if (boundary === "read") {
      f.overrides.workbench_read_v1 = () => { arrived.resolve(); return wait.promise; }; result = f.app.ready;
    } else {
      await f.app.ready; await flush();
      const command = boundary === "plan" ? "workbench_read_plugin_settings_v1" : "workbench_open_file_guarded_v1";
      if (boundary !== "presentation") f.overrides[command] = () => { arrived.resolve(); return wait.promise; };
      result = f.app.enter({ kind: "open" });
    }
    await arrived.promise; let notices = 0; f.app.subscribe(() => notices++);
    f.app.dispose(); const callCount = f.calls.length;
    wait.resolve(boundary === "open" ? { session: score(), name: "A", savedVersion: 0 } : undefined);
    assert.equal((await result).ok, false); await flush();
    assert.equal(f.calls.length, callCount); assert.equal(f.runtimes.length, 0); assert.equal(notices, 0);
    assert.equal(f.app.snapshot().phase, "disposed"); assert.equal((await f.app.enter({ kind: "new" })).code, "startup.disposed");
    f.dispose();
  }
}));

test("observer disposal immediately before a source mutation must prevent a not-yet-issued native create", () => withTestDocument(async env => {
  const f = fixture(env);
  try {
    await f.app.ready;
    f.app.subscribe(() => { if (f.app.snapshot().document.busy) f.app.dispose(); });
    assert.equal((await f.app.enter({ kind: "new" })).ok, false);
    assert.equal(f.count("workbench_create_guarded_v1"), 0);
    assert.equal(f.runtimes.length, 0);
  } finally { f.dispose(); }
}));

test("invalid intents and asynchronous workspace factories fail explicitly without a retry creating another instance", () => withTestDocument(async env => {
  let attempts = 0;
  const f = fixture(env, { createWorkspace() { attempts++; return Promise.reject(new Error("async mount refused")); } });
  try {
    await f.app.ready; const before = f.calls.length;
    for (const intent of [null, { kind: "other" }, { kind: "continue", path: "x" }, { kind: "recent" }, { kind: "open", unexpected: true }]) {
      assert.equal((await f.app.enter(intent)).code, "startup.invalid-intent");
    }
    assert.equal(f.calls.length, before);
    assert.equal((await f.app.enter({ kind: "new" })).code, "startup.restart-required");
    assert.equal((await f.app.retryStart()).code, "startup.restart-required"); assert.equal(attempts, 1);
    await flush();
  } finally { f.dispose(); }
}));

test("a failed return preserves the running instance, and a bad replacement from welcome can reload before resuming it", () => withTestDocument(async env => {
  let failReturn = false;
  const f = fixture(env, { showView(mode) { if (mode === "welcome" && failReturn) throw new Error("welcome resize failed"); } });
  try {
    await f.app.ready; await f.app.enter({ kind: "open" });
    const runtime = f.runtimes[0]; failReturn = true;
    assert.equal((await f.app.returnToWelcome()).ok, false); assert.equal(f.app.snapshot().phase, "workspace");
    assert.equal(f.workspaceRoot.hidden, false); assert.equal(f.runtimes.length, 1);
    failReturn = false; assert.equal((await f.app.returnToWelcome()).ok, true);
    f.overrides.workbench_open_file_guarded_v1 = () => { throw new Error("bad second project"); };
    assert.equal((await f.app.enter({ kind: "open" })).ok, false); assert.equal(f.app.snapshot().document.documentId, "opened");
    assert.equal((await f.app.prepare()).ok, true); assert.equal((await f.app.enter({ kind: "continue" })).ok, true);
    assert.equal(f.runtimes[0], runtime); assert.equal(f.runtimes.length, 1);
  } finally { f.dispose(); }
}));

test("intent data and the accepted plan are captured before later caller or configuration edits", () => withTestDocument(async env => {
  const waiting = deferred(), requested = deferred(), f = fixture(env);
  try {
    await f.app.ready;
    f.overrides.workbench_read_plugin_settings_v1 = () => { requested.resolve(); return waiting.promise; };
    const intent = { kind: "new", input: { title: "", measureCount: 1 } }, entering = f.app.enter(intent);
    await requested.promise; intent.kind = "open"; intent.input.title = "changed externally"; waiting.resolve(null);
    assert.equal((await entering).ok, true);
    assert.equal(f.count("workbench_open_file_guarded_v1"), 0);
    assert.deepEqual(f.calls.find(call => call.command === "workbench_create_guarded_v1").args.request.input, { title: "", measureCount: 1 });
  } finally { f.dispose(); }
}));
