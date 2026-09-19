import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_APPLICATION_SETTINGS, isApplicationSettingsSnapshotV1, isApplicationSettingsV1,
  normalizeApplicationSettings, readLegacyApplicationSettings } from "../src/contracts/application-settings.ts";

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
    editing: { deleteTimePolicy: "collapse", noteInput: { retention: "rhythm", defaultDuration: { base: 4, dots: 0 } } },
    agent: { enabled: false, providerSelection: null },
    shortcuts: { profileName: "官方默认", bindings: {} },
  });
});

test("application configuration rejects unknown fields and incompatible versions", () => {
  assert.equal(isApplicationSettingsV1(DEFAULT_APPLICATION_SETTINGS), true);
  assert.equal(isApplicationSettingsV1({ ...DEFAULT_APPLICATION_SETTINGS, surprise: true }), false);
  assert.equal(isApplicationSettingsV1({ ...DEFAULT_APPLICATION_SETTINGS, schemaVersion: 2 }), false);
  assert.equal(isApplicationSettingsSnapshotV1({ settings: DEFAULT_APPLICATION_SETTINGS,
    persisted: true, recoveredFromInvalid: false }), true);
});

test("older v1 application settings gain a disabled Agent plugin without weakening strict guards", () => {
  const oldV1 = {
    schemaVersion: 1,
    ui: { animationsEnabled: false, ruleWarningsVisible: true },
    editing: { deleteTimePolicy: "preserve" },
  };
  assert.equal(isApplicationSettingsV1(oldV1), false);
  assert.deepEqual(normalizeApplicationSettings(oldV1), {
    ...oldV1,
    editing: { ...oldV1.editing, noteInput: { retention: "rhythm", defaultDuration: { base: 4, dots: 0 } } },
    agent: { enabled: false, providerSelection: null }, shortcuts: { profileName: "官方默认", bindings: {} },
  });
  assert.equal(isApplicationSettingsSnapshotV1({ settings: oldV1,
    persisted: true, recoveredFromInvalid: false }), false);
});

test("pre-Provider Agent settings preserve activation and gain an empty selection", () => {
  const settings = {
    schemaVersion: 1,
    ui: { animationsEnabled: true, ruleWarningsVisible: true },
    editing: { deleteTimePolicy: "preserve" },
    agent: { enabled: true },
  };
  assert.equal(isApplicationSettingsV1(settings), false);
  assert.deepEqual(normalizeApplicationSettings(settings), {
    ...settings,
    editing: { ...settings.editing, noteInput: { retention: "rhythm", defaultDuration: { base: 4, dots: 0 } } },
    agent: { enabled: true, providerSelection: null }, shortcuts: { profileName: "官方默认", bindings: {} },
  });
});

test("note input preferences are strict while older v1 editing settings gain compatible defaults", () => {
  const customized = {
    ...DEFAULT_APPLICATION_SETTINGS,
    editing: { deleteTimePolicy: "collapse" as const,
      noteInput: { retention: "all" as const, defaultDuration: { base: 8 as const, dots: 1 as const } } },
  };
  assert.equal(isApplicationSettingsV1(customized), true);
  assert.deepEqual(normalizeApplicationSettings(customized), customized);
  assert.equal(normalizeApplicationSettings({
    ...customized,
    editing: { ...customized.editing, noteInput: { ...customized.editing.noteInput, surprise: true } },
  }), null);
  assert.equal(normalizeApplicationSettings({
    ...customized,
    editing: { ...customized.editing, noteInput: { retention: "unknown", defaultDuration: { base: 4, dots: 0 } } },
  }), null);
});

test("shortcut settings accept versioned user overrides and reject duplicate bindings", () => {
  const customized = {
    ...DEFAULT_APPLICATION_SETTINGS,
    shortcuts: { profileName: "我的键位", bindings: { "file.save": "Mod+Shift+S", "playback.toggle": null } },
  };
  assert.equal(isApplicationSettingsV1(customized), true);
  assert.equal(isApplicationSettingsV1({
    ...customized,
    shortcuts: { profileName: "冲突", bindings: { "file.save": "Mod+S", "file.open": "Mod+S" } },
  }), false);
});

test("Provider selection is strict non-secret application configuration", () => {
  const selected = {
    ...DEFAULT_APPLICATION_SETTINGS,
    agent: { enabled: true, providerSelection: { providerId: "provider.example", modelId: "model-1" } },
  };
  assert.equal(isApplicationSettingsV1(selected), true);
  assert.equal(isApplicationSettingsV1({
    ...selected,
    agent: { ...selected.agent, apiKey: "must-not-be-accepted" },
  }), false);
});
