import { MAX_SESSION_LIBRARY_BYTES, parseSessionLibrary, type AgentSessionLibrary, type SessionStorePort } from "@brilliant-guitar/agent-runtime";
import { LockedJsonFile } from "./json-file.ts";

export class SessionStoreError extends Error {
  readonly code: "sessions-invalid" | "sessions-unavailable";
  constructor(code: SessionStoreError["code"], message: string) { super(message); this.code = code; }
}
export class FileSessionStore implements SessionStorePort {
  readonly kind = "file";
  readonly #file: LockedJsonFile;
  constructor(directory: string) { this.#file = new LockedJsonFile(directory, "sessions"); }
  get path(): string { return this.#file.path; }
  async load(): Promise<AgentSessionLibrary | null> {
    try { const value = await this.#file.read(MAX_SESSION_LIBRARY_BYTES); return value === undefined ? null : parseSessionLibrary(value); }
    catch { throw new SessionStoreError("sessions-invalid", "会话文件无法读取、版本不受支持或数据目录已被使用，已保留原文件。请检查数据目录。"); }
  }
  async save(value: AgentSessionLibrary): Promise<void> {
    try { await this.#file.write(parseSessionLibrary(value), MAX_SESSION_LIBRARY_BYTES); }
    catch { throw new SessionStoreError("sessions-unavailable", "聊天记录尚未保存到磁盘。请检查数据目录是否可写或已达到容量上限；当前内容仍保留在页面中。"); }
  }
  async dispose(): Promise<void> { await this.#file.dispose(); }
}
