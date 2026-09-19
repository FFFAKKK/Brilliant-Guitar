export type PluginStartupRecoveryState = "stable" | "launching" | "recovery";

export interface PluginStartupRecoveryDocumentV1 {
  readonly schemaVersion: 1;
  readonly state: PluginStartupRecoveryState;
  readonly attemptedPluginIds: readonly string[];
  readonly lastKnownGoodPluginIds: readonly string[];
}

export interface PluginStartupRecoveryStoragePort {
  read(): Promise<unknown>;
  write(document: PluginStartupRecoveryDocumentV1): Promise<void>;
}

const pluginIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

function pluginIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const ids = value.filter((item): item is string => typeof item === "string" && pluginIdPattern.test(item));
  return Object.freeze([...new Set(ids)].sort());
}

export function normalizePluginStartupRecoveryDocument(value: unknown): PluginStartupRecoveryDocumentV1 {
  const source = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const state = source?.schemaVersion === 1
    && (source.state === "stable" || source.state === "launching" || source.state === "recovery")
    ? source.state
    : "stable";
  return Object.freeze({
    schemaVersion: 1,
    state,
    attemptedPluginIds: state === "launching" ? pluginIds(source?.attemptedPluginIds) : Object.freeze([]),
    lastKnownGoodPluginIds: pluginIds(source?.lastKnownGoodPluginIds),
  });
}
