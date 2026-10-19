import { captureConfig, isRecord } from "../runtime/runtime-support.js";

// One main webview/module realm owns read/check/merge/write for application namespaces.
// Direct storage writes or independently bundled copies are outside this queue.
let desktopSettingsWrites = Promise.resolve();

export function createDesktopSettingsDocumentStore({ settingsStorage } = {}) {
  if (!settingsStorage || typeof settingsStorage.read !== "function" || typeof settingsStorage.write !== "function") {
    throw new TypeError("桌面启动配置需要既有插件设置 read/write 端口");
  }
  const document = raw => {
    if (raw === null) return Object.freeze({});
    if (!isRecord(raw)) throw new Error("桌面插件设置文档无效");
    return captureConfig(raw);
  };
  return Object.freeze({
    async read() { return document(await settingsStorage.read()); },
    update(transform, { isCurrent = () => true } = {}) {
      const current = () => { if (!isCurrent()) throw new Error("桌面设置操作已释放或过期"); };
      const task = desktopSettingsWrites.catch(() => undefined).then(async () => {
        current();
        const data = document(await settingsStorage.read()); current();
        const next = document(transform(data)); current();
        await settingsStorage.write(next); current();
      });
      desktopSettingsWrites = task; return task;
    },
  });
}
