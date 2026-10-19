import { icon } from "./fixtures/preview-icons.js";
import { createBackupUiRuntime } from "./host/backup-ui-runtime.js";
import { createDisposalScope, rollback } from "./runtime/runtime-support.js";
import { createStartupCenterSession } from "./startup/startup-center-session.js";
import { mountStartupCenterView } from "./startup/startup-center-view.js";
import { createStartupWindowPresentation } from "./startup/startup-window-presentation.js";
import { createStartupAppearanceSettings } from "./startup/startup-appearance-settings.js";

/** Explicit application assembly. Importing this module does not read or mount. */
export function mountStartupCenterApplication({ root, workspaceRoot, windowPort, store, appearanceStore, createDocumentSession, startupEntries = [] }) {
  const scope = createDisposalScope();
  try {
    const presentation = createStartupWindowPresentation({ root, workspaceRoot, windowPort });
    scope.add(presentation.dispose);
    const appearance = createStartupAppearanceSettings({ store: appearanceStore });
    scope.add(appearance.dispose);
    let application;
    application = createStartupCenterSession({ store, createDocumentSession, workspaceRoot, startupEntries,
      async showView(mode) {
        await presentation.showView(mode);
        if (mode === "welcome") root.querySelector('[data-launch-page="recent"]')?.focus();
        else workspaceRoot.querySelector(".v-app-mark")?.focus();
      },
      createWorkspace(options) {
        const runtime = createBackupUiRuntime(options), document = root.ownerDocument;
        const button = document.createElement("button");
        let live = true;
        const back = async () => {
          if (!live || button.disabled) return;
          button.disabled = true;
          try {
            const result = await application.returnToWelcome();
            if (live) {
              button.title = result.ok ? "返回启动中心" : result.message;
              button.setAttribute("aria-label", button.title); button.dataset.error = String(!result.ok);
              button.innerHTML = icon(result.ok ? "timerReset" : "info");
            }
          } catch (error) {
            if (live) { button.title = error?.message ?? String(error); button.setAttribute("aria-label", button.title); button.dataset.error = "true"; }
          } finally { if (live) button.disabled = false; }
        };
        try {
          const mark = workspaceRoot.querySelector(".v-app-mark");
          if (!mark) throw new Error("工作区缺少启动中心返回位置");
          button.className = "v-app-mark"; button.setAttribute("data-frame-ui", ""); button.type = "button";
          button.title = "返回启动中心"; button.setAttribute("aria-label", button.title); button.innerHTML = icon("timerReset");
          button.addEventListener("click", back); mark.parentNode.insertBefore(button, mark); mark.remove(); button.focus();
        } catch (error) { button.removeEventListener("click", back); runtime.dispose(); throw error; }
        return Object.freeze({ dispose() { live = false; button.removeEventListener("click", back); runtime.dispose(); } });
      },
    });
    scope.add(application.dispose);
    const view = mountStartupCenterView({ root, application, appearance });
    scope.add(view.dispose);
    return Object.freeze({ application, appearance, view, ready: application.ready, dispose: scope.dispose });
  } catch (error) { rollback(scope, error); }
}
