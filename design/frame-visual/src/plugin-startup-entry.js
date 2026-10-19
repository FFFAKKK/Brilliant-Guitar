import { BACKUP_PLUGIN_DIRECTORY } from "./host/backup-plugin-directory.js";
import { mountBackupPluginStartupPreview } from "./plugin-startup-preview.js";
import { createDesktopPluginPlanStore } from "./startup/desktop-plugin-plan-store.js";
import { TauriPluginSettingsStorage, isTauri, createDesktopReadonlyScoreSession } from "./vendor/desktop-plugin-settings.js";

// Application bootstrap only. Importing the reusable manager must not start a second application.
const root = globalThis.document?.getElementById("startup-root"), workspaceRoot = globalThis.document?.getElementById("app");
if (root && workspaceRoot) {
  try {
    const desktop = isTauri();
    const storeOptions = desktop ? { storageMode: "async", sessionMode: "process", createDocumentSession: createDesktopReadonlyScoreSession, store: createDesktopPluginPlanStore({
      directory: BACKUP_PLUGIN_DIRECTORY, settingsStorage: new TauriPluginSettingsStorage(),
    }) } : {};
    const badge = root.querySelector(".startup-preview-badge");
    if (desktop && badge) { badge.textContent = "桌面"; badge.title = "保存到桌面宿主插件设置文件；启停和参数在下次启动生效"; }
    const preview = mountBackupPluginStartupPreview({ root, workspaceRoot, ...storeOptions });
    const pagehide = event => {
      if (!event.persisted) { preview.dispose(); window.removeEventListener("pagehide", pagehide); }
    };
    window.addEventListener("pagehide", pagehide);
  } catch (error) {
    const feedback = root.querySelector("#startup-feedback");
    feedback.textContent = `插件配置加载失败：${error?.message ?? error}`; feedback.dataset.error = "true";
  }
}
