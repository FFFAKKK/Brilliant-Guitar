import { isAgentSessionSnapshot, parseAgentModelConfiguration, type AgentModelConfiguration, type AgentSessionSnapshot } from "@brilliant-guitar/agent-runtime";
import { parseConnectionSettings, parseSettingsStorageStatus, type ConnectionSettings, type SettingsStorageStatus } from "./connection-settings.ts";
import { isConversationsSnapshot, type ConversationsSnapshot } from "./conversations.ts";

export interface StandaloneAgentSnapshot {
  readonly schemaVersion: 3;
  readonly sequence: number;
  readonly configuration: AgentModelConfiguration;
  readonly credentialPresent: boolean;
  readonly testingConnection: boolean;
  readonly session: AgentSessionSnapshot;
  readonly connections: ConnectionSettings;
  readonly storage: SettingsStorageStatus;
  readonly conversations: ConversationsSnapshot;
}

export function isStandaloneAgentSnapshot(value: unknown): value is StandaloneAgentSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== 9 || !Object.keys(item).every((key) => ["schemaVersion", "sequence", "configuration", "credentialPresent", "testingConnection", "session", "connections", "storage", "conversations"].includes(key))) return false;
  try {
    const config = parseAgentModelConfiguration(item.configuration);
    const settings = parseConnectionSettings(item.connections);
    parseSettingsStorageStatus(item.storage);
    const selected = settings.profiles.find((profile) => profile.id === settings.selectedProfileId)!;
    if (JSON.stringify(config) !== JSON.stringify(selected.configuration)) return false;
  } catch { return false; }
  const session = item.session;
  const conversations = item.conversations;
  return item.schemaVersion === 3 && Number.isSafeInteger(item.sequence) && Number(item.sequence) >= 0
    && typeof item.credentialPresent === "boolean" && typeof item.testingConnection === "boolean" && isAgentSessionSnapshot(session) && isConversationsSnapshot(conversations)
    && session.sessionId === conversations.selectedSessionId
    && conversations.items.find((record) => record.sessionId === session.sessionId)?.messageCount === session.messages.length;
}
