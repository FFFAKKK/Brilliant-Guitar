import { open, readFile, rename, stat, unlink, mkdir, type FileHandle } from "node:fs/promises";
import { resolve } from "node:path";
import { parseConnectionSettings, type ConnectionSettings, type ConnectionProfile } from "../contracts/connection-settings.ts";

export interface StoredConnectionProfile extends Omit<ConnectionProfile, "credentialRemembered"> { readonly sealedCredential: string | null }
export interface StoredConnectionSettings { readonly schemaVersion: 1; readonly selectedProfileId: string; readonly profiles: readonly StoredConnectionProfile[] }
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
  if (Object.keys(item).length !== 3 || !["schemaVersion", "selectedProfileId", "profiles"].every((key) => Object.hasOwn(item, key)) || !Array.isArray(item.profiles)) throw new Error("存储格式无效");
  const profiles = item.profiles.map((value: unknown) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("存储连接无效");
    const profile = value as Record<string, unknown>;
    if (Object.keys(profile).length !== 5 || !["id", "name", "configuration", "recentModels", "sealedCredential"].every((key) => Object.hasOwn(profile, key))
      || (profile.sealedCredential !== null && (typeof profile.sealedCredential !== "string" || profile.sealedCredential.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(profile.sealedCredential)))) throw new Error("存储密文无效");
    return profile;
  });
  const parsed = parseConnectionSettings({ ...item, profiles: profiles.map(({ sealedCredential, ...profile }) => ({ ...profile, credentialRemembered: sealedCredential !== null })) });
  return Object.freeze({ schemaVersion: 1, selectedProfileId: parsed.selectedProfileId, profiles: Object.freeze(parsed.profiles.map(({ credentialRemembered: _remembered, ...profile }, index) => Object.freeze({ ...profile, sealedCredential: profiles[index]!.sealedCredential as string | null }))) });
}

/** Only this application's settings file is read; invalid data is never overwritten. */
export class FileConnectionSettingsStore implements ConnectionSettingsStorePort {
  readonly kind = "file";
  readonly directory: string;
  readonly path: string;
  readonly #lockPath: string;
  #lock: FileHandle | null = null;
  constructor(directory: string) {
    this.directory = resolve(directory); this.path = resolve(this.directory, "connections.json"); this.#lockPath = resolve(this.directory, "connections.lock");
  }
  async load(): Promise<StoredConnectionSettings | null> {
    await this.#acquire();
    try {
      if ((await stat(this.path)).size > 262144) throw new Error("settings oversized");
      const content = await readFile(this.path, "utf8");
      if (Buffer.byteLength(content) > 262144) throw new Error("settings oversized");
      return parseStoredConnectionSettings(JSON.parse(content));
    } catch (error) {
      if (code(error) === "ENOENT") return null;
      throw new SettingsStoreError("settings-invalid", "连接配置文件无法读取或版本不受支持，已保留原文件。请检查数据目录。");
    }
  }
  async save(value: StoredConnectionSettings): Promise<void> {
    const settings = parseStoredConnectionSettings(value);
    await this.#acquire();
    const temporary = resolve(this.directory, `connections.${crypto.randomUUID()}.tmp`);
    let handle: FileHandle | null = null;
    try {
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(JSON.stringify(settings) + "\n", "utf8"); await handle.sync(); await handle.close(); handle = null;
      await rename(temporary, this.path);
    } catch {
      throw new SettingsStoreError("settings-unavailable", "连接配置保存失败，原配置仍保留。请检查数据目录是否可写。");
    } finally { await handle?.close().catch(() => undefined); await unlink(temporary).catch(() => undefined); }
  }
  async dispose(): Promise<void> {
    const lock = this.#lock; this.#lock = null;
    if (lock) { await lock.close(); await unlink(this.#lockPath).catch(() => undefined); }
  }
  async #acquire(): Promise<void> {
    if (this.#lock) return;
    try {
      await mkdir(this.directory, { recursive: true });
      for (let attempt = 0; attempt < 2; ++attempt) {
        try {
          this.#lock = await open(this.#lockPath, "wx", 0o600);
          await this.#lock.writeFile(JSON.stringify({ pid: process.pid }), "utf8"); return;
        } catch (error) {
          if (code(error) !== "EEXIST" || attempt !== 0) throw error;
          const owner: unknown = JSON.parse(await readFile(this.#lockPath, "utf8"));
          if (typeof owner !== "object" || owner === null || !("pid" in owner) || !Number.isSafeInteger(owner.pid) || Number(owner.pid) < 1) throw error;
          try { process.kill(Number(owner.pid), 0); throw error; }
          catch (check) { if (code(check) !== "ESRCH") throw error; }
          await unlink(this.#lockPath);
        }
      }
    } catch {
      await this.dispose();
      throw new SettingsStoreError("settings-unavailable", "无法使用连接数据目录。可能已有Agent使用该目录，请关闭它或用--data-dir选择其他目录。");
    }
  }
}
function code(value: unknown): string | null {
  return typeof value === "object" && value !== null && "code" in value && typeof value.code === "string" ? value.code : null;
}
