import { open, readFile, stat, unlink, mkdir, type FileHandle } from "node:fs/promises";
import { resolve } from "node:path";
import { replaceJsonFile } from "./replace-json-file.ts";

export class JsonFileLockError extends Error {}

/** Host-owned JSON files share atomic replacement and exclusive process locks. */
export class LockedJsonFile {
  readonly directory: string;
  readonly path: string;
  readonly #lockPath: string;
  #lock: FileHandle | null = null;
  constructor(directory: string, name: string) {
    this.directory = resolve(directory);
    this.path = resolve(this.directory, `${name}.json`);
    this.#lockPath = resolve(this.directory, `${name}.lock`);
  }
  async read(maxBytes: number): Promise<unknown> {
    await this.#acquire();
    try {
      if ((await stat(this.path)).size > maxBytes) throw new Error("File is too large");
      const text = await readFile(this.path, "utf8");
      if (Buffer.byteLength(text) > maxBytes) throw new Error("File is too large");
      return JSON.parse(text) as unknown;
    } catch (error) { if (code(error) === "ENOENT") return undefined; throw error; }
  }
  async write(value: unknown, maxBytes: number): Promise<void> {
    const text = JSON.stringify(value) + "\n";
    if (Buffer.byteLength(text) > maxBytes) throw new Error("File is too large");
    await this.#acquire();
    const temporary = resolve(this.directory, `${crypto.randomUUID()}.tmp`);
    let handle: FileHandle | null = null;
    try {
      handle = await open(temporary, "wx", 0o600);
      await handle.writeFile(text, "utf8"); await handle.sync(); await handle.close(); handle = null;
      await replaceJsonFile(temporary, this.path);
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
    } catch { await this.dispose(); throw new JsonFileLockError("Data directory is unavailable or already in use"); }
  }
}
function code(value: unknown): string | null {
  return typeof value === "object" && value !== null && "code" in value && typeof value.code === "string" ? value.code : null;
}
