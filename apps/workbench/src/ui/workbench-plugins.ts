import { FIRST_PARTY_UI_PLUGINS } from "./first-party-plugins.ts";
import { FIRST_PARTY_UI_PROJECTIONS } from "./first-party-plugin-projections.ts";
import { UiPluginDiagnosticStore } from "./plugin-diagnostic.ts";
import { WorkbenchFeatureRegistry } from "./plugin-manifest.ts";
import { persistUiPluginDiagnostic } from "../services/plugin-diagnostic-host.ts";
import { PluginPlatform } from "../plugins/plugin-platform.ts";
import { PluginManifestDiscovery } from "../plugins/plugin-discovery.ts";
import { adaptUiPluginPackage } from "../plugins/plugin-sdk-adapter.ts";
import { bootstrapPersistedPluginPlatform } from "../plugins/plugin-platform-bootstrap.ts";
import type { PluginStartupController } from "../plugins/plugin-startup-controller.ts";
import {
  TrustedPluginHostBindingsResolver,
} from "../plugins/plugin-host-bindings.ts";
import type {
  PluginHostBindingsContractV1,
  PluginHostBindingValues,
  ResolvedPluginHostBindingsV1,
} from "../plugins/plugin-host-bindings.ts";
import { PluginHostServiceRegistry } from "../plugins/plugin-security.ts";
import { AGENT_ASSISTANT_HOST_SERVICES } from "../plugins/agent-plugin-host-contract.ts";
import { BrowserPluginActivationStorage, BrowserPluginSettingsStorage } from "../services/workbench-host-bridge.ts";
import { isTauri } from "@tauri-apps/api/core";
import { UiPluginHostError, uiPluginIdentity } from "./plugin-diagnostic.ts";

export const workbenchFeatures = new WorkbenchFeatureRegistry([
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
const workbenchPluginHostServices = new PluginHostServiceRegistry(AGENT_ASSISTANT_HOST_SERVICES);
export const workbenchPluginDiscovery = new PluginManifestDiscovery({
  hostFeatures: workbenchFeatures,
  hostServices: workbenchPluginHostServices,
  projections: FIRST_PARTY_UI_PROJECTIONS.map((projection) => projection.id),
});
export const workbenchPluginPlatform = new PluginPlatform({
  hostFeatures: workbenchFeatures,
  hostServices: workbenchPluginHostServices,
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

let browserPreviewInitialization: Promise<void> | null = null;
let pluginStartup: PluginStartupController | null = null;
let hostBindingsResolver: TrustedPluginHostBindingsResolver | null = null;

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

function captureFrozenSession(): void {
  hostBindingsResolver ??= new TrustedPluginHostBindingsResolver(workbenchPluginPlatform.sessionPlan());
}

/** Restores browser-only plugin state before React mounts. Desktop startup is owned by Tauri. */
export function initializeWorkbenchPluginPreview(): Promise<void> {
  if (import.meta.env.VITE_BRILLIANT_DESKTOP === "1" || isTauri()) {
    workbenchPluginPlatform.start();
    captureFrozenSession();
    return Promise.resolve();
  }
  if (browserPreviewInitialization) return browserPreviewInitialization;
  browserPreviewInitialization = Promise.resolve().then(async () => {
    const result = await bootstrapPersistedPluginPlatform(
      workbenchPluginPlatform,
      new BrowserPluginActivationStorage(),
      new BrowserPluginSettingsStorage(),
      reportPreviewFailure,
    );
    pluginStartup = result.startup;
    captureFrozenSession();
  }).catch((error: unknown) => {
    reportPreviewFailure("initialization", error);
  });
  return browserPreviewInitialization;
}

/** Saves the next-launch preference. The running workbench composition never changes. */
export async function setWorkbenchUserPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  try {
    if (!pluginStartup) throw new Error("Plugin activation storage is not connected");
    await pluginStartup.setEnabled(pluginId, enabled);
  } catch (error) {
    reportPreviewFailure(`activation:${pluginId}`, error);
  }
}

/** Resolves one exact typed binding object against the current frozen session grant. */
export function resolveWorkbenchPluginHostBindings<
  const Contract extends PluginHostBindingsContractV1,
  const Values extends PluginHostBindingValues<Contract>,
>(
  contract: Contract,
  values: Values,
): ResolvedPluginHostBindingsV1<Contract, Values> {
  if (!hostBindingsResolver) throw new Error("Workbench plugin session has not started");
  return hostBindingsResolver.resolve(contract, values);
}
