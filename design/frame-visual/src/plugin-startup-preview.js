import { createBackupUiRuntime } from "./host/backup-ui-runtime.js";
import { prepareBackupStartupEntries } from "./host/backup-plugin-assembly.js";
import { createBrowserPluginPlanStore } from "./startup/plugin-plan-store.js";
import { readStartupPlan, readStartupPlanAsync } from "./startup/plugin-startup-plan.js";
import { createPluginStartupController } from "./startup/plugin-startup-controller.js";
import { mountPluginStartupView } from "./startup/plugin-startup-view.js";
import { icon } from "./fixtures/preview-icons.js";

/** One document owns the selected storage adapter and each complete workspace session. */
export function mountBackupPluginStartupPreview({ root, workspaceRoot, store = createBrowserPluginPlanStore(), storageMode = "sync", sessionMode = "preview", createDocumentSession = null, startupEntries = [] }) {
  if (!["preview", "process"].includes(sessionMode)) throw new TypeError("sessionMode 必须是 preview 或 process");
  const startup = prepareBackupStartupEntries(startupEntries);
  const controller = createPluginStartupController({ directory: startup.directory, store, storageMode });
  const document = root.ownerDocument;
  let disposed = false;
  let runtime = null, returnButton = null, documentSession = null;
  const showManager = () => {
    if (sessionMode === "preview") returnButton?.removeEventListener("click", showManager);
    try { if (sessionMode === "preview") runtime?.dispose(); } finally {
      if (sessionMode === "preview") { documentSession?.dispose(); documentSession = null; runtime = null; returnButton = null; }
      workspaceRoot.hidden = true; root.hidden = false;
      document.body.classList.remove("startup-workspace-active");
      const pending = controller.reload(); view.refresh();
      if (pending && typeof pending.then === "function") pending.then(() => { if (!disposed) view.refresh(); });
      root.querySelector("#startup-open")?.focus();
      if (sessionMode === "process" && runtime) {
        const start = root.querySelector("#startup-open");
        start?.setAttribute("aria-label", "返回当前工作区；已保存配置在下次应用启动生效");
        if (start) start.title = "返回当前工作区；已保存配置在下次应用启动生效";
      }
    }
  };
  function mountWorkspace(plan) {
    if (disposed) return;
    try {
      // Viewport initialization must run in visible, correctly sized DOM.
      root.hidden = true; workspaceRoot.hidden = false; document.body.classList.add("startup-workspace-active");
      if (sessionMode === "process" && runtime) { returnButton?.focus(); window.dispatchEvent(new Event("resize")); return; }
      documentSession = createDocumentSession?.() ?? null;
      runtime = createBackupUiRuntime({ root: workspaceRoot, startupPlan: plan, startupEntries: startup.entries, documentSession, documentActions: documentSession });
      const mark = workspaceRoot.querySelector(".v-app-mark");
      returnButton = document.createElement("button");
      returnButton.className = "v-app-mark"; returnButton.setAttribute("data-frame-ui", "");
      returnButton.setAttribute("type", "button"); returnButton.setAttribute("aria-label", "返回插件配置");
      returnButton.title = "返回插件配置"; returnButton.innerHTML = icon("library");
      returnButton.addEventListener("click", showManager);
      mark.parentNode.insertBefore(returnButton, mark); mark.remove();
      returnButton.focus();
    } catch (error) {
      if (runtime === null) { documentSession?.dispose(); documentSession = null; }
      showManager(); throw error;
    }
  }
  const view = mountPluginStartupView({ root, controller, selectedId: "frame.score-info", canResume() {
    const state = controller.snapshot();
    return !disposed && sessionMode === "process" && runtime !== null && state.dirtyIds.length === 0 && Object.keys(state.invalid).length === 0;
  }, onStart() {
    if (sessionMode === "process" && runtime) return mountWorkspace();
    if (storageMode === "async") return readStartupPlanAsync(startup.directory, store).then(mountWorkspace);
    return mountWorkspace(readStartupPlan(startup.directory, store));
  } });
  return Object.freeze({ controller,
    dispose() {
      if (disposed) return; disposed = true;
      returnButton?.removeEventListener("click", showManager);
      controller.dispose();
      try { runtime?.dispose(); } finally { documentSession?.dispose(); view.dispose(); document.body.classList.remove("startup-workspace-active"); }
    } });
}
