import { FIRST_PARTY_UI_PLUGINS } from "./first-party-plugins.ts";
import { FIRST_PARTY_UI_PROJECTIONS } from "./first-party-plugin-projections.ts";
import { UiPluginDiagnosticStore } from "./plugin-diagnostic.ts";
import { WorkbenchCapabilityRegistry } from "./plugin-manifest.ts";
import { persistUiPluginDiagnostic } from "../services/plugin-diagnostic-host.ts";
import { PluginPlatform } from "../plugins/plugin-platform.ts";
import { PluginManifestDiscovery } from "../plugins/plugin-discovery.ts";
import { adaptUiPluginPackage } from "../plugins/plugin-sdk-adapter.ts";
import type { PluginActivationPersistence } from "../plugins/plugin-activation-persistence.ts";
import { BrowserPluginActivationStorage, BrowserPluginSettingsStorage } from "../services/workbench-host-bridge.ts";
import { isTauri } from "@tauri-apps/api/core";
import { UiPluginHostError, uiPluginIdentity } from "./plugin-diagnostic.ts";

export const workbenchCapabilities = new WorkbenchCapabilityRegistry([
  "workbench.commands",
  "workbench.layout",
  "workbench.focus",
  "workbench.feedback",
  "score.document",
  "score.selection",
  "score.input",
  "score.history",
  "view.paper",
  "playback.transport",
  "playback.output",
  "agent.assistant",
]);

/** Static composition root. Third-party code loading remains deliberately unsupported. */
export const workbenchPluginDiagnostics = new UiPluginDiagnosticStore();
export const workbenchPluginDiscovery = new PluginManifestDiscovery({
  capabilities: workbenchCapabilities,
  projections: FIRST_PARTY_UI_PROJECTIONS.map((projection) => projection.id),
});
export const workbenchPluginPlatform = new PluginPlatform({
  capabilities: workbenchCapabilities,
  projections: FIRST_PARTY_UI_PROJECTIONS,
  diagnostics: workbenchPluginDiagnostics,
  onDiagnostic: (diagnostic) => { persistUiPluginDiagnostic(diagnostic); },
});
for (const plugin of FIRST_PARTY_UI_PLUGINS) {
  const manifest = adaptUiPluginPackage(plugin).manifest;
  const result = workbenchPluginDiscovery.inspect(manifest);
  if (result.accepted) workbenchPluginPlatform.register(plugin);
  else workbenchPluginDiagnostics.report(new UiPluginHostError({
    code: "UI-PLG-001",
    stage: "manifest",
    plugin: uiPluginIdentity(manifest),
    message: result.failure.message,
    detail: result.failure.detail ?? result.failure.code,
  }).diagnostic);
}
workbenchPluginPlatform.start();

let browserPreviewInitialization: Promise<void> | null = null;
let activationPersistence: PluginActivationPersistence | null = null;

function reportPreviewFailure(kind: string, error: unknown): void {
  workbenchPluginDiagnostics.report(new UiPluginHostError({
    code: "UI-PLG-012",
    stage: "registration",
    plugin: { id: "brilliant.browser.plugin-preview", name: "浏览器插件预览", version: "1.0.0" },
    message: "浏览器插件预览配置恢复失败",
    detail: `${kind}: ${error instanceof Error ? error.message : String(error)}`,
    cause: error,
  }).diagnostic);
}

/** Restores browser-only plugin state before React mounts. Desktop startup is owned by Tauri. */
export function initializeWorkbenchPluginPreview(): Promise<void> {
  if (import.meta.env.VITE_BRILLIANT_DESKTOP === "1" || isTauri()) return Promise.resolve();
  if (browserPreviewInitialization) return browserPreviewInitialization;
  browserPreviewInitialization = Promise.resolve().then(async () => {
    const settings = workbenchPluginPlatform.connectSettings(new BrowserPluginSettingsStorage());
    activationPersistence = workbenchPluginPlatform.connectActivation(new BrowserPluginActivationStorage());
    const results = await Promise.allSettled([
      settings.restore(),
      activationPersistence.restore(),
    ]);
    if (results[0]?.status === "rejected") reportPreviewFailure("settings", results[0].reason);
    if (results[1]?.status === "rejected") reportPreviewFailure("activation", results[1].reason);
  }).catch((error: unknown) => {
    reportPreviewFailure("initialization", error);
  });
  return browserPreviewInitialization;
}

/** Saves the next-launch preference. The running workbench composition never changes. */
export async function setWorkbenchUserPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  try {
    if (activationPersistence) await activationPersistence.setEnabled(pluginId, enabled);
    else if (enabled) workbenchPluginPlatform.activate(pluginId);
    else workbenchPluginPlatform.deactivate(pluginId);
  } catch (error) {
    reportPreviewFailure(`activation:${pluginId}`, error);
  }
}
