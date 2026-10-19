import assert from "node:assert/strict";
import test from "node:test";
import { createStartupAppearanceSettings, DEFAULT_STARTUP_APPEARANCE as defaults, validateStartupAppearance } from "../src/startup/startup-appearance-settings.js";
import { createDesktopStartupAppearanceStore, STARTUP_APPEARANCE_NAMESPACE as appearanceId } from "../src/startup/desktop-startup-appearance-store.js";
import { createDesktopPluginPlanStore, BACKUP_STARTUP_SETTINGS_NAMESPACE as planId } from "../src/startup/desktop-plugin-plan-store.js";
import { createPluginStartupController } from "../src/startup/plugin-startup-controller.js";
import { defaultStartupPlan } from "../src/startup/plugin-startup-plan.js";
import { BACKUP_PLUGIN_DIRECTORY as directory } from "../src/host/backup-plugin-directory.js";

const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function disk(initial = {}) {
  let data = structuredClone(initial), writes = 0;
  return { get data() { return structuredClone(data); }, get writes() { return writes; },
    replace(value) { data = structuredClone(value); },
    port() { return { async read() { return structuredClone(data); }, async write(value) { data = structuredClone(value); writes++; } }; } };
}
const appearance = (file, port = file.port()) => createDesktopStartupAppearanceStore({ settingsStorage: port });
const nextPlan = () => ({ ...structuredClone(defaultStartupPlan(directory)), revision: 1 });

test("missing appearance reads defaults without writing, and fresh owners recover the persisted namespace", async () => {
  const file = disk({ future: { schemaVersion: 9, value: [1, "keep"] } });
  const owner = createStartupAppearanceSettings({ store: appearance(file) });
  try {
    assert.equal((await owner.ready).ok, true); assert.deepEqual(owner.snapshot().value, defaults);
    assert.equal(file.writes, 0); assert.equal(owner.snapshot().persisted, false);
    assert.equal((await owner.set({ density: "comfortable", fontSize: 14 })).ok, true);
    assert.equal(owner.snapshot().persisted, true); assert.equal(file.writes, 1);
    const restored = createStartupAppearanceSettings({ store: appearance(file) });
    try { await restored.ready; assert.deepEqual(restored.snapshot().value, { ...defaults, revision: 1, density: "comfortable", fontSize: 14 }); }
    finally { restored.dispose(); }
    assert.deepEqual(file.data.future, { schemaVersion: 9, value: [1, "keep"] });
  } finally { owner.dispose(); }
});

test("plan and appearance writes from different adapters serialize the entire read-merge-write and preserve both namespaces", async () => {
  for (const order of ["plan-first", "appearance-first"]) {
    const file = disk({ future: { schemaVersion: 5, value: true } });
    const gate = deferred(), reached = deferred(), port = file.port(); let first = true;
    const blocked = { read: port.read, async write(value) { if (first) { first = false; reached.resolve(); await gate.promise; } return port.write(value); } };
    const plans = createDesktopPluginPlanStore({ directory, settingsStorage: order === "plan-first" ? blocked : file.port() });
    const appearances = appearance(file, order === "appearance-first" ? blocked : file.port());
    const planWrite = () => plans.write(nextPlan(), { expectedRevision: 0 });
    const appearanceWrite = () => appearances.write({ ...defaults, revision: 1, fontSize: 12 }, { expectedRevision: 0 });
    const firstTask = order === "plan-first" ? planWrite() : appearanceWrite(); await reached.promise;
    const secondTask = order === "plan-first" ? appearanceWrite() : planWrite(); await flush(); assert.equal(file.writes, 0);
    gate.resolve(); await Promise.all([firstTask, secondTask]);
    assert.equal(file.data[planId].value.revision, 1); assert.equal(file.data[appearanceId].value.fontSize, 12);
    assert.deepEqual(file.data.future, { schemaVersion: 5, value: true }); assert.equal(file.writes, 2);
  }
});

test("invalid/future appearance data rejects reads and writes without overwriting original document", async () => {
  for (const envelope of [null, { schemaVersion: 2, value: defaults }, { schemaVersion: 1, value: { ...defaults, fontSize: 100 } },
    { schemaVersion: 1, value: { ...defaults, format: 2 } }, { schemaVersion: 1, value: { ...defaults, unknown: true } }]) {
    const file = disk({ [appearanceId]: envelope }), before = file.data, store = appearance(file);
    await assert.rejects(store.read());
    await assert.rejects(store.write({ ...defaults, revision: 1 }, { expectedRevision: 0 }));
    assert.deepEqual(file.data, before); assert.equal(file.writes, 0);
  }
  for (const value of [{ ...defaults, revision: -1 }, { ...defaults, fontSize: "13" }, { ...defaults, density: "other" }]) assert.throws(() => validateStartupAppearance(value));
});

test("write failure retains applied unsaved appearance, explicit retry succeeds and the shared queue recovers", async () => {
  const file = disk(), port = file.port(); let fail = true;
  const owner = createStartupAppearanceSettings({ store: appearance(file, { read: port.read, async write(value) {
    if (fail) throw new Error("disk denied"); return port.write(value);
  } }) });
  try {
    await owner.ready; assert.equal((await owner.set({ fontSize: 14 })).ok, false);
    assert.equal(owner.snapshot().dirty, true); assert.equal(owner.snapshot().value.fontSize, 14); assert.match(owner.snapshot().issue, /disk denied/);
    const plans = createDesktopPluginPlanStore({ directory, settingsStorage: file.port() }); await plans.write(nextPlan(), { expectedRevision: 0 });
    fail = false; assert.equal((await owner.retry()).ok, true);
    assert.equal(owner.snapshot().dirty, false); assert.equal(file.data[planId].value.revision, 1); assert.equal(file.data[appearanceId].value.fontSize, 14);
    assert.equal(file.writes, 2);
  } finally { owner.dispose(); }
});

test("stale appearance revision keeps the draft until an explicit reload, never force-overwrites", async () => {
  const file = disk(), first = createStartupAppearanceSettings({ store: appearance(file) }), second = createStartupAppearanceSettings({ store: appearance(file) });
  try {
    await Promise.all([first.ready, second.ready]); await first.set({ fontSize: 14 });
    assert.equal((await second.set({ density: "comfortable" })).code, "appearance.conflict");
    assert.equal(second.snapshot().value.density, "comfortable"); assert.equal(second.snapshot().retryKind, "reload"); assert.equal(file.writes, 1);
    assert.equal((await second.retry()).ok, true); assert.equal(second.snapshot().dirty, false);
    assert.equal(second.snapshot().value.fontSize, 14); assert.equal(second.snapshot().value.density, "compact"); assert.equal(file.writes, 1);
  } finally { first.dispose(); second.dispose(); }
});

test("reverting controls to an old saved baseline cannot clear a known disk conflict or claim persistence", async () => {
  const file = disk({ [appearanceId]: { schemaVersion: 1, value: { ...defaults, revision: 3 } } });
  const owner = createStartupAppearanceSettings({ store: appearance(file) });
  try {
    await owner.ready;
    file.replace({ [appearanceId]: { schemaVersion: 1, value: { ...defaults, revision: 4, fontSize: 14 } } });
    assert.equal((await owner.set({ density: "comfortable" })).code, "appearance.conflict");
    await owner.set({ density: "compact" });
    assert.equal(owner.snapshot().dirty, false);
    assert.equal(owner.snapshot().canRetry, true, "a locally matching old baseline is not proof of current disk state");
    assert.equal(owner.snapshot().persisted, false); assert.equal(owner.snapshot().retryKind, "reload");
    assert.equal((await owner.set({ fontSize: 13 })).code, "appearance.conflict");
    await owner.retry(); assert.equal(owner.snapshot().value.fontSize, 14); assert.equal(owner.snapshot().persisted, true);
    assert.equal(file.writes, 0);
  } finally { owner.dispose(); }
});

test("failed initial read locks appearance only, then explicit retry can load valid data", async () => {
  const file = disk({ [appearanceId]: { schemaVersion: 2, value: defaults } });
  const owner = createStartupAppearanceSettings({ store: appearance(file) });
  try {
    assert.equal((await owner.ready).ok, false); assert.equal(owner.snapshot().canEdit, false);
    assert.equal((await owner.set({ fontSize: 14 })).code, "appearance.not-loaded"); assert.equal(file.writes, 0);
    file.replace({}); assert.equal((await owner.retry()).ok, true); assert.equal(owner.snapshot().canEdit, true); assert.equal(file.writes, 0);
    for (const patch of [{ fontSize: 20 }, { density: "bad" }, { revision: 4 }, {}]) assert.equal((await owner.set(patch)).code, "appearance.invalid");
    assert.deepEqual(owner.snapshot().value, defaults);
  } finally { owner.dispose(); }
});

test("disposal while queued or after storage read prevents an unissued appearance write and notifications", async () => {
  for (const boundary of ["queue", "read", "notification"]) {
    const file = disk(), port = file.port(), gate = deferred(), reached = deferred(); let blockRead = false, blocker;
    if (boundary === "queue") {
      blocker = createDesktopPluginPlanStore({ directory, settingsStorage: { read: port.read, async write(value) { reached.resolve(); await gate.promise; return port.write(value); } } })
        .write(nextPlan(), { expectedRevision: 0 }); await reached.promise;
    }
    const owner = createStartupAppearanceSettings({ store: appearance(file, { ...port, async read() {
      if (blockRead) { reached.resolve(); await gate.promise; } return port.read();
    } }) });
    await owner.ready;
    if (boundary === "notification") owner.subscribe(() => { if (owner.snapshot().phase === "saving") owner.dispose(); });
    if (boundary === "read") blockRead = true;
    const saving = owner.set({ fontSize: 14 });
    if (boundary === "read") await reached.promise;
    let notices = 0; if (boundary !== "notification") owner.subscribe(() => notices++);
    owner.dispose(); gate.resolve(); assert.equal((await saving).ok, false); if (blocker) await blocker;
    assert.equal(file.data[appearanceId], undefined); assert.equal(notices, 0); assert.equal(owner.snapshot().phase, "disposed");
  }
});

test("an already-issued appearance write may finish after disposal but cannot notify or dispatch another operation", async () => {
  const file = disk(), port = file.port(), gate = deferred(), reached = deferred();
  const owner = createStartupAppearanceSettings({ store: appearance(file, { read: port.read, async write(value) { reached.resolve(); await gate.promise; return port.write(value); } }) });
  await owner.ready; const saving = owner.set({ fontSize: 12 }); await reached.promise;
  let notices = 0; owner.subscribe(() => notices++); owner.dispose(); gate.resolve();
  assert.equal((await saving).code, "appearance.disposed"); assert.equal(file.writes, 1); assert.equal(notices, 0);
  assert.equal((await owner.set({ fontSize: 14 })).code, "appearance.disposed"); assert.equal(file.writes, 1);
});

test("disposed plugin plan owner cannot issue a write after waiting in the shared queue or its transaction read", async () => {
  for (const boundary of ["queue", "read"]) {
    const file = disk(), port = file.port(), gate = deferred(), reached = deferred(); let blocking, reads = 0;
    if (boundary === "queue") {
      blocking = appearance(file, { read: port.read, async write(value) { reached.resolve(); await gate.promise; return port.write(value); } })
        .write({ ...defaults, revision: 1, fontSize: 14 }, { expectedRevision: 0 });
      await reached.promise;
    }
    const store = createDesktopPluginPlanStore({ directory, settingsStorage: { ...port, async read() {
      // Initial and controller pre-save reads precede the queued transaction read.
      if (boundary === "read" && ++reads === 3) { reached.resolve(); await gate.promise; } return port.read();
    } } });
    const owner = createPluginStartupController({ directory, storageMode: "async", store });
    await owner.ready; owner.setEnabled("frame.score-info", true); const saving = owner.save();
    if (boundary === "queue") await flush(); else await reached.promise;
    owner.dispose(); gate.resolve(); if (blocking) await blocking;
    assert.equal((await saving).code, "startup.disposed");
    assert.equal(file.data[planId], undefined, "no plan write is allowed after its owner ended before dispatch");
  }
});
