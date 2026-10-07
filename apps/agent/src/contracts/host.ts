import { isAgentSessionSnapshot, parseAgentModelConfiguration, type AgentModelConfiguration, type AgentSessionSnapshot } from "@brilliant-guitar/agent-runtime";

export interface StandaloneAgentSnapshot {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly configuration: AgentModelConfiguration;
  readonly credentialPresent: boolean;
  readonly testingConnection: boolean;
  readonly session: AgentSessionSnapshot;
}

export function isStandaloneAgentSnapshot(value: unknown): value is StandaloneAgentSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== 6 || !Object.keys(item).every((key) => ["schemaVersion", "sequence", "configuration", "credentialPresent", "testingConnection", "session"].includes(key))) return false;
  try { parseAgentModelConfiguration(item.configuration); } catch { return false; }
  return item.schemaVersion === 1 && Number.isSafeInteger(item.sequence) && Number(item.sequence) >= 0
    && typeof item.credentialPresent === "boolean" && typeof item.testingConnection === "boolean" && isAgentSessionSnapshot(item.session);
}
