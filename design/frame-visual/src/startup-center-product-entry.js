import { BACKUP_PLUGIN_DIRECTORY } from "./host/backup-plugin-directory.js";
import { mountStartupCenterApplication } from "./startup-center-application.js";
import { createDesktopPluginPlanStore } from "./startup/desktop-plugin-plan-store.js";
import { createDesktopStartupAppearanceStore } from "./startup/desktop-startup-appearance-store.js";
import { TauriPluginSettingsStorage, isTauri, createDesktopReadonlyScoreSession, createDesktopStartupWindow } from "./vendor/desktop-plugin-settings.js";

const root = globalThis.document?.getElementById("launch-root"), workspaceRoot = globalThis.document?.getElementById("app");
if (root && workspaceRoot) {
  try {
    if (!isTauri()) throw new Error("请从桌面应用打开；外观预览使用 startup-center-static-preview.html");
    const settingsStorage = new TauriPluginSettingsStorage();
    const app = mountStartupCenterApplication({ root, workspaceRoot, windowPort: createDesktopStartupWindow(),
      createDocumentSession: createDesktopReadonlyScoreSession,
      appearanceStore: createDesktopStartupAppearanceStore({ settingsStorage }),
      store: createDesktopPluginPlanStore({ directory: BACKUP_PLUGIN_DIRECTORY, settingsStorage }) });
    const pagehide = event => {
      if (!event.persisted) { try { app.dispose(); } finally { window.removeEventListener("pagehide", pagehide); } }
    };
    window.addEventListener("pagehide", pagehide);
  } catch (error) {
    const status = root.querySelector("#launch-status");
    if (status) { status.textContent = error?.message ?? String(error); status.dataset.error = "true"; }
  }
}
