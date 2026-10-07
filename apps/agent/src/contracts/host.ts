import { isAgentSessionSnapshot, parseAgentModelConfiguration, type AgentModelConfiguration, type AgentSessionSnapshot } from "@brilliant-guitar/agent-runtime";
import { parseConnectionSettings, parseSettingsStorageStatus, type ConnectionSettings, type SettingsStorageStatus } from "./connection-settings.ts";

export interface StandaloneAgentSnapshot {
  readonly schemaVersion: 2;
  readonly sequence: number;
  readonly configuration: AgentModelConfiguration;
  readonly credentialPresent: boolean;
  readonly testingConnection: boolean;
  readonly session: AgentSessionSnapshot;
  readonly connections: ConnectionSettings;
  readonly storage: SettingsStorageStatus;
}

export function isStandaloneAgentSnapshot(value: unknown): value is StandaloneAgentSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== 8 || !Object.keys(item).every((key) => ["schemaVersion", "sequence", "configuration", "credentialPresent", "testingConnection", "session", "connections", "storage"].includes(key))) return false;
  try {
    const config = parseAgentModelConfiguration(item.configuration);
    const settings = parseConnectionSettings(item.connections);
    parseSettingsStorageStatus(item.storage);
    const selected = settings.profiles.find((profile) => profile.id === settings.selectedProfileId)!;
    if (JSON.stringify(config) !== JSON.stringify(selected.configuration)) return false;
  } catch { return false; }
  return item.schemaVersion === 2 && Number.isSafeInteger(item.sequence) && Number(item.sequence) >= 0
    && typeof item.credentialPresent === "boolean" && typeof item.testingConnection === "boolean" && isAgentSessionSnapshot(item.session);
}
