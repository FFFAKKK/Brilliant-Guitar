import { LockedJsonFile, JsonFileLockError } from "./json-file.ts";
import { parseConnectionSettings, type ConnectionSettings, type ConnectionProfile } from "../contracts/connection-settings.ts";
import { DEFAULT_MODEL_INPUT_POLICY } from "@brilliant-guitar/agent-runtime";

export interface StoredConnectionProfile extends Omit<ConnectionProfile, "credentialRemembered"> { readonly sealedCredential: string | null }
export interface StoredConnectionSettings { readonly schemaVersion: 2; readonly selectedProfileId: string; readonly profiles: readonly StoredConnectionProfile[] }
export interface ConnectionSettingsStorePort {
  readonly kind: "memory" | "file";
  load(): Promise<StoredConnectionSettings | null>;
  save(settings: StoredConnectionSettings): Promise<void>;
  dispose?(): Promise<void>;
}
export class SettingsStoreError extends Error {
  readonly code: "settings-unavailable" | "settings-invalid" | "credential-unavailable";
  constructor(code: SettingsStoreError["code"], message: string) { super(message); this.code = code; }
}
export function publicConnectionSettings(value: StoredConnectionSettings): ConnectionSettings {
  return parseConnectionSettings({ ...value, profiles: value.profiles.map(({ sealedCredential, ...profile }) => ({ ...profile, credentialRemembered: sealedCredential !== null })) });
}
export function parseStoredConnectionSettings(value: unknown): StoredConnectionSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("存储格式无效");
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== 3 || !["schemaVersion", "selectedProfileId", "profiles"].every((key) => Object.hasOwn(item, key)) || !Array.isArray(item.profiles)
    || (item.schemaVersion !== 1 && item.schemaVersion !== 2)) throw new Error("存储格式或版本无效");
  const required = ["id", "name", "configuration", "recentModels", "sealedCredential", ...(item.schemaVersion === 2 ? ["inputPolicy"] : [])];
  const profiles = item.profiles.map((value: unknown) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("存储连接无效");
    const profile = value as Record<string, unknown>;
    if (Object.keys(profile).length !== required.length || !required.every((key) => Object.hasOwn(profile, key))
      || (profile.sealedCredential !== null && (typeof profile.sealedCredential !== "string" || profile.sealedCredential.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(profile.sealedCredential)))) throw new Error("存储密文无效");
    // Validate exact old fields before injecting defaults; loading never writes the migration.
    return item.schemaVersion === 1 ? { ...profile, inputPolicy: DEFAULT_MODEL_INPUT_POLICY } : profile;
  });
  const parsed = parseConnectionSettings({ ...item, schemaVersion: 2, profiles: profiles.map(({ sealedCredential, ...profile }) => ({ ...profile, credentialRemembered: sealedCredential !== null })) });
  return Object.freeze({ schemaVersion: 2, selectedProfileId: parsed.selectedProfileId, profiles: Object.freeze(parsed.profiles.map(({ credentialRemembered: _remembered, ...profile }, index) => Object.freeze({ ...profile, sealedCredential: profiles[index]!.sealedCredential as string | null }))) });
}

/** Only this application's settings file is read; invalid data is never overwritten. */
export class FileConnectionSettingsStore implements ConnectionSettingsStorePort {
  readonly kind = "file";
  readonly directory: string;
  readonly path: string;
  readonly #file: LockedJsonFile;
  constructor(directory: string) {
    this.#file = new LockedJsonFile(directory, "connections"); this.directory = this.#file.directory; this.path = this.#file.path;
  }
  async load(): Promise<StoredConnectionSettings | null> {
    try {
      const value = await this.#file.read(262144);
      return value === undefined ? null : parseStoredConnectionSettings(value);
    } catch (error) {
      if (error instanceof JsonFileLockError) throw new SettingsStoreError("settings-unavailable", "无法使用连接数据目录。可能已有Agent使用该目录，请关闭它或用--data-dir选择其他目录。");
      throw new SettingsStoreError("settings-invalid", "连接配置文件无法读取或版本不受支持，已保留原文件。请检查数据目录。");
    }
  }
  async save(value: StoredConnectionSettings): Promise<void> {
    const settings = parseStoredConnectionSettings(value);
    try {
      await this.#file.write(settings, 262144);
    } catch {
      throw new SettingsStoreError("settings-unavailable", "连接配置保存失败，原配置仍保留。请检查数据目录是否可写。");
    }
  }
  async dispose(): Promise<void> {
    await this.#file.dispose();
  }
}
