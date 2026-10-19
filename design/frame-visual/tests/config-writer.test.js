import assert from "node:assert/strict";
import test from "node:test";
import { BACKUP_PLUGIN_DIRECTORY as directory } from "../src/host/backup-plugin-directory.js";
import { defaultStartupPlan } from "../src/startup/plugin-startup-plan.js";
import { createDesktopPluginPlanStore, BACKUP_STARTUP_SETTINGS_NAMESPACE as namespace } from "../src/startup/desktop-plugin-plan-store.js";

const clone = value => structuredClone(value);
function disk() {
  let data = { other: { schemaVersion: 8, value: { keep: true } } }, writes = 0;
  return { get data() { return clone(data); }, get writes() { return writes; },
    port() { return { async read() { return clone(data); }, async write(next) { data = clone(next); writes++; } }; },
  };
}
function next(enabled) {
  const plan = clone(defaultStartupPlan(directory)); plan.revision = 1;
  plan.plugins["frame.score-info"].enabled = enabled;
  return plan;
}

test("independent desktop adapters reject the second stale revision before overwriting", async () => {
  const file = disk(), first = createDesktopPluginPlanStore({ directory, settingsStorage: file.port() });
  const second = createDesktopPluginPlanStore({ directory, settingsStorage: file.port() });
  const results = await Promise.allSettled([
    first.write(next(true), { expectedRevision: 0 }), second.write(next(false), { expectedRevision: 0 }),
  ]);
  assert.deepEqual(results.map(result => result.status), ["fulfilled", "rejected"]);
  assert.match(results[1].reason.message, /已改变/);
  assert.equal(file.writes, 1);
  assert.equal(file.data[namespace].value.plugins["frame.score-info"].enabled, true);
  assert.deepEqual(file.data.other, { schemaVersion: 8, value: { keep: true } });
});

test("a failed adapter write releases the shared queue for another adapter and a retry", async () => {
  const file = disk(), port = file.port(); let fail = true;
  const first = createDesktopPluginPlanStore({ directory, settingsStorage: {
    read: port.read, async write(value) { if (fail) throw new Error("disk failed"); return port.write(value); },
  } });
  const second = createDesktopPluginPlanStore({ directory, settingsStorage: file.port() });
  await assert.rejects(first.write(next(true), { expectedRevision: 0 }), /disk failed/);
  await second.write(next(false), { expectedRevision: 0 });
  fail = false;
  const revision2 = next(true); revision2.revision = 2;
  await first.write(revision2, { expectedRevision: 1 });
  assert.equal(file.writes, 2);
  assert.equal(file.data[namespace].value.revision, 2);
  assert.deepEqual(file.data.other, { schemaVersion: 8, value: { keep: true } });
});
