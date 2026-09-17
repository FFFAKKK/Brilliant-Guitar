import type { DeleteTimePolicy } from "./note-input.ts";

export interface ApplicationSettingsV1 {
  readonly schemaVersion: 1;
  readonly ui: {
    readonly animationsEnabled: boolean;
    readonly ruleWarningsVisible: boolean;
  };
  readonly editing: {
    readonly deleteTimePolicy: DeleteTimePolicy;
  };
}

export interface ApplicationSettingsSnapshotV1 {
  readonly settings: ApplicationSettingsV1;
  readonly persisted: boolean;
  readonly recoveredFromInvalid: boolean;
}

export const DEFAULT_APPLICATION_SETTINGS: ApplicationSettingsV1 = {
  schemaVersion: 1,
  ui: { animationsEnabled: true, ruleWarningsVisible: true },
  editing: { deleteTimePolicy: "preserve" },
};

interface SettingsStorageReader {
  getItem(key: string): string | null;
}

const LEGACY_ANIMATION_KEY = "brilliant.workbench.animation-enabled.v1";
const LEGACY_RULE_WARNING_KEY = "brilliant.workbench.rule-warnings-visible.v1";
const LEGACY_DELETE_TIME_POLICY_KEY = "brilliant.workbench.delete-time-policy.v1";

export function readLegacyApplicationSettings(storage: SettingsStorageReader): ApplicationSettingsV1 {
  return {
    schemaVersion: 1,
    ui: {
      animationsEnabled: storage.getItem(LEGACY_ANIMATION_KEY) !== "false",
      ruleWarningsVisible: storage.getItem(LEGACY_RULE_WARNING_KEY) !== "false",
    },
    editing: {
      deleteTimePolicy: storage.getItem(LEGACY_DELETE_TIME_POLICY_KEY) === "collapse" ? "collapse" : "preserve",
    },
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

export function isApplicationSettingsV1(value: unknown): value is ApplicationSettingsV1 {
  const root = record(value);
  const ui = record(root?.ui);
  const editing = record(root?.editing);
  return root !== null && onlyKeys(root, ["schemaVersion", "ui", "editing"])
    && root.schemaVersion === 1
    && ui !== null && onlyKeys(ui, ["animationsEnabled", "ruleWarningsVisible"])
    && typeof ui.animationsEnabled === "boolean" && typeof ui.ruleWarningsVisible === "boolean"
    && editing !== null && onlyKeys(editing, ["deleteTimePolicy"])
    && (editing.deleteTimePolicy === "preserve" || editing.deleteTimePolicy === "collapse");
}

export function isApplicationSettingsSnapshotV1(value: unknown): value is ApplicationSettingsSnapshotV1 {
  const snapshot = record(value);
  return snapshot !== null && onlyKeys(snapshot, ["settings", "persisted", "recoveredFromInvalid"])
    && isApplicationSettingsV1(snapshot.settings)
    && typeof snapshot.persisted === "boolean"
    && typeof snapshot.recoveredFromInvalid === "boolean";
}
