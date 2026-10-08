import { rename } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

/** Retry a temporarily locked Windows replacement without deleting the existing destination. */
export async function replaceJsonFile(source: string, target: string, options: {
  readonly platform?: NodeJS.Platform;
  readonly replace?: (source: string, target: string) => Promise<void>;
  readonly pause?: (milliseconds: number) => Promise<void>;
} = {}): Promise<void> {
  const replace = options.replace ?? rename;
  for (let attempt = 0; ; ++attempt) {
    try { await replace(source, target); return; }
    catch (error) {
      if ((options.platform ?? process.platform) !== "win32" || attempt >= 3
        || typeof error !== "object" || error === null || !("code" in error) || error.code !== "EPERM") throw error;
      await (options.pause ?? delay)(20 * 2 ** attempt);
    }
  }
}
