import { DEFAULT_DEEPSEEK_CONFIGURATION, isAgentModelId, parseAgentModelConfiguration, type AgentModelConfiguration } from "@brilliant-guitar/agent-runtime";
import { isAgentProviderCredentialSecret } from "@brilliant-guitar/agent-runtime/contracts/agent-provider-credential";

export interface ConnectionProfile {
  readonly id: string;
  readonly name: string;
  readonly configuration: AgentModelConfiguration;
  readonly recentModels: readonly string[];
  readonly credentialRemembered: boolean;
}
export interface ConnectionSettings {
  readonly schemaVersion: 1;
  readonly selectedProfileId: string;
  readonly profiles: readonly ConnectionProfile[];
}
export interface SaveConnectionRequest {
  readonly profileId: string | null;
  readonly name: string;
  readonly configuration: AgentModelConfiguration;
  readonly rememberCredential: boolean;
  readonly apiKey?: string;
}
export interface SettingsStorageStatus {
  readonly configuration: "memory" | "file";
  readonly credentialProtection: "windows-dpapi" | "unavailable";
  readonly notice: string | null;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("连接配置格式无效");
  return value as Record<string, unknown>;
}
function keys(item: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  if (!required.every((key) => Object.hasOwn(item, key)) || !Object.keys(item).every((key) => [...required, ...optional].includes(key))) throw new Error("连接配置字段无效");
}
export function isConnectionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}
function name(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 80 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) throw new Error("连接名称需为1到80个字符");
  return value.trim();
}
export function parseConnectionProfile(value: unknown): ConnectionProfile {
  const item = record(value);
  keys(item, ["id", "name", "configuration", "recentModels", "credentialRemembered"]);
  if (!isConnectionId(item.id) || typeof item.credentialRemembered !== "boolean" || !Array.isArray(item.recentModels)
    || item.recentModels.length > 5 || !item.recentModels.every(isAgentModelId) || new Set(item.recentModels).size !== item.recentModels.length) throw new Error("连接配置格式无效");
  return Object.freeze({ id: item.id, name: name(item.name), configuration: parseAgentModelConfiguration(item.configuration), recentModels: Object.freeze([...item.recentModels]), credentialRemembered: item.credentialRemembered });
}
export function parseConnectionSettings(value: unknown): ConnectionSettings {
  const item = record(value);
  keys(item, ["schemaVersion", "selectedProfileId", "profiles"]);
  if (item.schemaVersion !== 1 || !isConnectionId(item.selectedProfileId) || !Array.isArray(item.profiles) || item.profiles.length < 1 || item.profiles.length > 20) throw new Error("连接配置版本或数量无效");
  const profiles = item.profiles.map(parseConnectionProfile);
  if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length || !profiles.some((profile) => profile.id === item.selectedProfileId)) throw new Error("所选连接无效");
  return Object.freeze({ schemaVersion: 1, selectedProfileId: item.selectedProfileId, profiles: Object.freeze(profiles) });
}
export function parseSaveConnectionRequest(value: unknown): SaveConnectionRequest {
  const item = record(value);
  keys(item, ["profileId", "name", "configuration", "rememberCredential"], ["apiKey"]);
  if ((item.profileId !== null && !isConnectionId(item.profileId)) || typeof item.rememberCredential !== "boolean"
    || (Object.hasOwn(item, "apiKey") && !isAgentProviderCredentialSecret(item.apiKey))) throw new Error("连接或密钥格式无效");
  return { profileId: item.profileId, name: name(item.name), configuration: parseAgentModelConfiguration(item.configuration), rememberCredential: item.rememberCredential,
    ...(Object.hasOwn(item, "apiKey") ? { apiKey: item.apiKey as string } : {}) };
}
export function parseSettingsStorageStatus(value: unknown): SettingsStorageStatus {
  const item = record(value);
  keys(item, ["configuration", "credentialProtection", "notice"]);
  if (!(["memory", "file"] as unknown[]).includes(item.configuration) || !(["windows-dpapi", "unavailable"] as unknown[]).includes(item.credentialProtection)
    || (item.notice !== null && (typeof item.notice !== "string" || item.notice.length > 240))) throw new Error("存储状态无效");
  return item as unknown as SettingsStorageStatus;
}
export function defaultConnectionSettings(): ConnectionSettings {
  return parseConnectionSettings({ schemaVersion: 1, selectedProfileId: "default-deepseek", profiles: [{ id: "default-deepseek", name: "DeepSeek", configuration: DEFAULT_DEEPSEEK_CONFIGURATION, recentModels: [], credentialRemembered: false }] });
}
