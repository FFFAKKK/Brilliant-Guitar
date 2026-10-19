// Read-only qualification probes with in-memory inputs. This never reads user settings or works.
import assert from "node:assert/strict";
import { PluginPlatform } from "../../../apps/workbench/src/plugins/plugin-platform.ts";
import { definePlugin } from "../../../apps/workbench/src/plugins/plugin-sdk.ts";
import { WorkbenchFeatureRegistry } from "../../../apps/workbench/src/ui/plugin-manifest.ts";
import { createDesktopPluginPlanStore, BACKUP_STARTUP_SETTINGS_NAMESPACE } from "../src/startup/desktop-plugin-plan-store.js";
import { defaultStartupPlan } from "../src/startup/plugin-startup-plan.js";
import { BACKUP_PLUGIN_DIRECTORY } from "../src/host/backup-plugin-directory.js";

const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
platform.register(definePlugin({ id: "audit.mutable", name: "Mutable probe", version: "0.1.0",
  settings: { schemaVersion: 1, defaults: { count: 1 }, parse: value => value && Number.isSafeInteger(value.count) ? value : null } }));
const registry = platform.settings();
let notifications = 0; registry.subscribe(() => { notifications++; });
const input = { count: 2 }; registry.write("audit.mutable", input); input.count = 99;
const value = registry.read("audit.mutable"); let rejectedMutation = false;
try { value.count = "invalid"; } catch (error) { rejectedMutation = error instanceof TypeError; }
const settingBoundary = { input: "a legal parser returning the validated input object",
  isolatedInput: registry.read("audit.mutable").count === 2, rejectedMutation,
  changedThroughRead: registry.read("audit.mutable").count === "invalid", notifications,
  resetCount: registry.reset("audit.mutable").count,
  interpretation: "The formal registry now captures and freezes persistent JSON parser output. Read is no longer an implicit write path; reset retains its own defaults." };
assert.equal(settingBoundary.changedThroughRead, false); assert.equal(settingBoundary.notifications, 1);
assert.equal(settingBoundary.isolatedInput, true); assert.equal(settingBoundary.rejectedMutation, true);
assert.equal(settingBoundary.resetCount, 1); platform.dispose();

const baseline = defaultStartupPlan(BACKUP_PLUGIN_DIRECTORY);
let disk = { preserved: { schemaVersion: 7, value: { keep: true } },
  [BACKUP_STARTUP_SETTINGS_NAMESPACE]: { schemaVersion: 1, value: baseline } };
const trace = [];
const storage = { async read() {
  const captured = structuredClone(disk); trace.push({ operation: "read", revision: captured[BACKUP_STARTUP_SETTINGS_NAMESPACE].value.revision });
  return captured;
}, async write(document) {
  disk = structuredClone(document);
  trace.push({ operation: "write", revision: disk[BACKUP_STARTUP_SETTINGS_NAMESPACE].value.revision,
    info: disk[BACKUP_STARTUP_SETTINGS_NAMESPACE].value.plugins["frame.score-info"] });
} };
const first = structuredClone(baseline), second = structuredClone(baseline);
first.revision = second.revision = 1;
first.plugins["frame.score-info"].enabled = true;
second.plugins["frame.score-info"].settings.measureLimit = 2;
const results = await Promise.allSettled([
  createDesktopPluginPlanStore({ settingsStorage: storage, directory: BACKUP_PLUGIN_DIRECTORY }).write(first, { expectedRevision: 0 }),
  createDesktopPluginPlanStore({ settingsStorage: storage, directory: BACKUP_PLUGIN_DIRECTORY }).write(second, { expectedRevision: 0 }),
]);
const stored = disk[BACKUP_STARTUP_SETTINGS_NAMESPACE].value;
const storageBoundary = { environment: "two adapter instances sharing a controlled memory port, not two native desktop processes",
  statuses: results.map(result => result.status), trace, final: stored.plugins["frame.score-info"],
  lostFirstChange: stored.plugins["frame.score-info"].enabled !== first.plugins["frame.score-info"].enabled,
  preservedUnrelatedNamespace: disk.preserved,
  interpretation: "The shared module queue rejects a stale second adapter before writing. This memory probe does not verify cross-process exclusion; see the separate native lease process tests. Backend JSON write remains non-CAS." };
assert.deepEqual(storageBoundary.statuses, ["fulfilled", "rejected"]);
assert.equal(storageBoundary.lostFirstChange, false);
assert.deepEqual(disk.preserved, { schemaVersion: 7, value: { keep: true } });
console.log(JSON.stringify({ at: new Date().toISOString(), settingBoundary, storageBoundary }, null, 2));
