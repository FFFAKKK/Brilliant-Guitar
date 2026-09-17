import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_APPLICATION_SETTINGS, isApplicationSettingsSnapshotV1, isApplicationSettingsV1,
  readLegacyApplicationSettings } from "../src/contracts/application-settings.ts";

function storage(values: Readonly<Record<string, string>>) {
  return { getItem: (key: string) => values[key] ?? null };
}

test("legacy preferences migrate into the versioned application configuration", () => {
  assert.deepEqual(readLegacyApplicationSettings(storage({})), DEFAULT_APPLICATION_SETTINGS);
});

test("legacy preferences preserve explicit animation, warning, and delete choices", () => {
  assert.deepEqual(readLegacyApplicationSettings(storage({
    "brilliant.workbench.animation-enabled.v1": "false",
    "brilliant.workbench.rule-warnings-visible.v1": "false",
    "brilliant.workbench.delete-time-policy.v1": "collapse",
  })), {
    schemaVersion: 1,
    ui: { animationsEnabled: false, ruleWarningsVisible: false },
    editing: { deleteTimePolicy: "collapse" },
  });
});

test("application configuration rejects unknown fields and incompatible versions", () => {
  assert.equal(isApplicationSettingsV1(DEFAULT_APPLICATION_SETTINGS), true);
  assert.equal(isApplicationSettingsV1({ ...DEFAULT_APPLICATION_SETTINGS, surprise: true }), false);
  assert.equal(isApplicationSettingsV1({ ...DEFAULT_APPLICATION_SETTINGS, schemaVersion: 2 }), false);
  assert.equal(isApplicationSettingsSnapshotV1({ settings: DEFAULT_APPLICATION_SETTINGS,
    persisted: true, recoveredFromInvalid: false }), true);
});
