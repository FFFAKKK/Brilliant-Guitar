import { createWorkspaceRuntime } from "./host/workspace-runtime.js";
import { createCoreScorePlugin } from "./fixtures/core-score-plugin.js";
import { STAFF_FIXTURE } from "./fixtures/staff-snapshot.js";
import { createStaffProjectionPort } from "./score/staff-read-port.js";
import { prepareBackupPlugin, createBackupFormalPlatform, configureBackupFormalPlatform } from "./host/formal-plugin-assembly.js";

// The preview keeps the shell and the notation provider separate: the shell
// owns layout, while this first-party plugin owns the shared read-only staff
// view. No static score image is used as a second rendering path.
const root = document.getElementById("app");
const previewParams = new URLSearchParams(globalThis.location?.search ?? "");
const enablePluginDiagnostics = previewParams.get("plugins") === "1";
let runtime = null;
let scoreProjection = null;

try {
  scoreProjection = createStaffProjectionPort({ snapshot: STAFF_FIXTURE });
  runtime = createWorkspaceRuntime({
    root,
    plugins: [createCoreScorePlugin({ score: scoreProjection.read })],
    requiredViewSlots: ["stage"],
    enablePluginDiagnostics,
    pluginWiring: { prepare: prepareBackupPlugin, create: createBackupFormalPlatform,
      configure: (platform, plugins) => configureBackupFormalPlatform(platform, { plugins }) },
  });
  if (enablePluginDiagnostics) {
    runtime.execute("frame.workspace.page.select", { id: "frame.plugins.diagnostics", toggle: false });
  }
  if (globalThis.location?.hostname === "127.0.0.1" || globalThis.location?.hostname === "localhost") {
    globalThis.__backupUiRuntime = runtime;
  }
} catch (error) {
  scoreProjection?.dispose();
  root?.replaceChildren();
  const failure = document.createElement("main");
  failure.setAttribute("role", "alert");
  failure.style.cssText = "position:fixed;inset:0;display:grid;place-content:center;gap:12px;padding:24px;background:#1c1d20;color:#f2f0eb;font:14px Segoe UI, sans-serif;text-align:center";
  const title = document.createElement("strong");
  title.textContent = "工作区启动失败";
  const detail = document.createElement("code");
  detail.style.cssText = "max-width:min(760px,90vw);white-space:pre-wrap;overflow-wrap:anywhere;color:#afb1b8";
  detail.textContent = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  failure.append(title, detail);
  root?.append(failure);
  globalThis.__backupUiStartupError = error;
  console.error("备份 UI 启动失败", error);
}

window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  runtime?.dispose();
  scoreProjection?.dispose();
}, { once: true });
