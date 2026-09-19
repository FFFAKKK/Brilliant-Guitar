import { isInputDuration } from "./note-input.ts";
import type { DeleteTimePolicy, InputDuration } from "./note-input.ts";
import type { AgentProviderSelection } from "./agent-provider-settings.ts";
import { isAgentProviderSelection } from "./agent-provider-settings.ts";
import { DEFAULT_SHORTCUT_SETTINGS, normalizeShortcutSettings } from "./shortcut-settings.ts";
import type { ShortcutSettingsV1 } from "./shortcut-settings.ts";

export type NoteInputRetention = "rhythm" | "all" | "reset";

export interface NoteInputPreferencesV1 {
  readonly retention: NoteInputRetention;
  readonly defaultDuration: InputDuration;
}

export interface ApplicationSettingsV1 {
  readonly schemaVersion: 1;
  readonly ui: {
    readonly animationsEnabled: boolean;
    readonly ruleWarningsVisible: boolean;
  };
  readonly editing: {
    readonly deleteTimePolicy: DeleteTimePolicy;
    readonly noteInput: NoteInputPreferencesV1;
  };
  readonly agent: {
    readonly enabled: boolean;
    readonly providerSelection: AgentProviderSelection | null;
  };
  readonly shortcuts: ShortcutSettingsV1;
}

export interface ApplicationSettingsSnapshotV1 {
  readonly settings: ApplicationSettingsV1;
  readonly persisted: boolean;
  readonly recoveredFromInvalid: boolean;
}

export const DEFAULT_NOTE_INPUT_PREFERENCES: NoteInputPreferencesV1 = {
  retention: "rhythm",
  defaultDuration: { base: 4, dots: 0 },
};

export const DEFAULT_APPLICATION_SETTINGS: ApplicationSettingsV1 = {
  schemaVersion: 1,
  ui: { animationsEnabled: true, ruleWarningsVisible: true },
  editing: { deleteTimePolicy: "preserve", noteInput: DEFAULT_NOTE_INPUT_PREFERENCES },
  agent: { enabled: false, providerSelection: null },
  shortcuts: DEFAULT_SHORTCUT_SETTINGS,
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
      noteInput: DEFAULT_NOTE_INPUT_PREFERENCES,
    },
    agent: { enabled: false, providerSelection: null },
    shortcuts: DEFAULT_SHORTCUT_SETTINGS,
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
  const agent = record(root?.agent);
  return root !== null && onlyKeys(root, ["schemaVersion", "ui", "editing", "agent", "shortcuts"])
    && root.schemaVersion === 1
    && ui !== null && onlyKeys(ui, ["animationsEnabled", "ruleWarningsVisible"])
    && typeof ui.animationsEnabled === "boolean" && typeof ui.ruleWarningsVisible === "boolean"
    && editing !== null && onlyKeys(editing, ["deleteTimePolicy", "noteInput"])
    && (editing.deleteTimePolicy === "preserve" || editing.deleteTimePolicy === "collapse")
    && normalizeNoteInputPreferences(editing.noteInput) !== null
    && agent !== null && onlyKeys(agent, ["enabled", "providerSelection"])
    && typeof agent.enabled === "boolean"
    && (agent.providerSelection === null || isAgentProviderSelection(agent.providerSelection))
    && normalizeShortcutSettings(root.shortcuts) !== null;
}

function normalizedBase(root: Record<string, unknown>): Omit<ApplicationSettingsV1, "agent" | "shortcuts"> | null {
  const ui = record(root.ui);
  const editing = record(root.editing);
  const noteInput = editing?.noteInput === undefined
    ? DEFAULT_NOTE_INPUT_PREFERENCES : normalizeNoteInputPreferences(editing.noteInput);
  if (root.schemaVersion !== 1
    || ui === null || !onlyKeys(ui, ["animationsEnabled", "ruleWarningsVisible"])
    || typeof ui.animationsEnabled !== "boolean" || typeof ui.ruleWarningsVisible !== "boolean"
    || editing === null || !onlyKeys(editing, editing.noteInput === undefined
      ? ["deleteTimePolicy"] : ["deleteTimePolicy", "noteInput"])
    || noteInput === null
    || (editing.deleteTimePolicy !== "preserve" && editing.deleteTimePolicy !== "collapse")) return null;
  return {
    schemaVersion: 1,
    ui: { animationsEnabled: ui.animationsEnabled, ruleWarningsVisible: ui.ruleWarningsVisible },
    editing: { deleteTimePolicy: editing.deleteTimePolicy, noteInput },
  };
}

export function normalizeNoteInputPreferences(value: unknown): NoteInputPreferencesV1 | null {
  const preferences = record(value);
  if (preferences === null || !onlyKeys(preferences, ["retention", "defaultDuration"])
    || (preferences.retention !== "rhythm" && preferences.retention !== "all" && preferences.retention !== "reset")
    || !isInputDuration(preferences.defaultDuration)) return null;
  return { retention: preferences.retention, defaultDuration: preferences.defaultDuration };
}

/** Migrates older v1 Agent shapes without accepting unknown configuration fields. */
export function normalizeApplicationSettings(value: unknown): ApplicationSettingsV1 | null {
  if (isApplicationSettingsV1(value)) return value;
  const root = record(value);
  if (root === null) return null;
  const base = normalizedBase(root);
  if (base === null) return null;
  if (!Object.keys(root).every((key) => ["schemaVersion", "ui", "editing", "agent", "shortcuts"].includes(key))) return null;
  const agent = record(root.agent);
  let normalizedAgent: ApplicationSettingsV1["agent"];
  if (root.agent === undefined) normalizedAgent = { enabled: false, providerSelection: null };
  else if (agent !== null && onlyKeys(agent, ["enabled"]) && typeof agent.enabled === "boolean") {
    normalizedAgent = { enabled: agent.enabled, providerSelection: null };
  } else if (agent !== null && onlyKeys(agent, ["enabled", "providerSelection"])
    && typeof agent.enabled === "boolean"
    && (agent.providerSelection === null || isAgentProviderSelection(agent.providerSelection))) {
    normalizedAgent = { enabled: agent.enabled, providerSelection: agent.providerSelection as AgentProviderSelection | null };
  } else return null;
  const shortcuts = root.shortcuts === undefined ? DEFAULT_SHORTCUT_SETTINGS : normalizeShortcutSettings(root.shortcuts);
  if (shortcuts === null) return null;
  return { ...base, agent: normalizedAgent, shortcuts };
}

export function normalizeApplicationSettingsSnapshot(value: unknown): ApplicationSettingsSnapshotV1 | null {
  const snapshot = record(value);
  const settings = normalizeApplicationSettings(snapshot?.settings);
  if (snapshot === null || settings === null
    || !onlyKeys(snapshot, ["settings", "persisted", "recoveredFromInvalid"])
    || typeof snapshot.persisted !== "boolean" || typeof snapshot.recoveredFromInvalid !== "boolean") return null;
  return { settings, persisted: snapshot.persisted, recoveredFromInvalid: snapshot.recoveredFromInvalid };
}

export function isApplicationSettingsSnapshotV1(value: unknown): value is ApplicationSettingsSnapshotV1 {
  const snapshot = record(value);
  return snapshot !== null
    && onlyKeys(snapshot, ["settings", "persisted", "recoveredFromInvalid"])
    && isApplicationSettingsV1(snapshot.settings)
    && typeof snapshot.persisted === "boolean"
    && typeof snapshot.recoveredFromInvalid === "boolean";
}
