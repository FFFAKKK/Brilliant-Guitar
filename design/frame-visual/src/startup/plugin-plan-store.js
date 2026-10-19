export const BACKUP_STARTUP_STORAGE_KEY = "brilliant-guitar.backup-ui.startup.v1";

/** Synchronous browser adapter. Storage failures propagate; no pretend memory fallback. */
export function createBrowserPluginPlanStore({ storage = () => globalThis.localStorage, key = BACKUP_STARTUP_STORAGE_KEY } = {}) {
  const access = () => {
    const port = typeof storage === "function" ? storage() : storage;
    if (!port || typeof port.getItem !== "function" || typeof port.setItem !== "function") throw new Error("浏览器启动配置存储不可用");
    return port;
  };
  return Object.freeze({
    read() {
      const text = access().getItem(key);
      if (text === null) return null;
      try { return JSON.parse(text); } catch { throw new Error("启动配置已损坏，请保留原数据并修复后重新读取"); }
    },
    write(plan) { access().setItem(key, JSON.stringify(plan)); },
  });
}
