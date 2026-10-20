import { FIRST_PARTY_UI_PLUGINS } from "./first-party-plugins.ts";
import { FIRST_PARTY_UI_PROJECTIONS } from "./first-party-plugin-projections.ts";
import { UiPluginDiagnosticStore } from "./plugin-diagnostic.ts";
import { WorkbenchFeatureRegistry } from "./plugin-manifest.ts";
import { persistUiPluginDiagnostic } from "../services/plugin-diagnostic-host.ts";
import { PluginPlatform } from "../plugins/plugin-platform.ts";
import { PluginManifestDiscovery } from "../plugins/plugin-discovery.ts";
import { pluginPackageManifest } from "../plugins/plugin-sdk-adapter.ts";
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
import {
  BrowserPluginActivationStorage,
  BrowserPluginSettingsStorage,
  BrowserPluginStartupRecoveryStorage,
  TauriPluginActivationStorage,
  TauriPluginSettingsStorage,
  TauriPluginStartupRecoveryStorage,
} from "../services/workbench-host-bridge.ts";
import { isTauri } from "@tauri-apps/api/core";
import { UiPluginHostError, uiPluginIdentity } from "./plugin-diagnostic.ts";
import { UiPluginHost } from "./plugin-manager.ts";

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
  createContributionHost: ({ features, projections, reportDiagnostic }) =>
    new UiPluginHost(features, projections, reportDiagnostic),
  diagnostics: workbenchPluginDiagnostics,
  onDiagnostic: (diagnostic) => { persistUiPluginDiagnostic(diagnostic); },
});
for (const plugin of FIRST_PARTY_UI_PLUGINS) {
  const manifest = pluginPackageManifest(plugin);
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

let pluginInitialization: Promise<void> | null = null;
let pluginStartup: PluginStartupController | null = null;
let hostBindingsResolver: TrustedPluginHostBindingsResolver | null = null;

function reportPluginInitializationFailure(kind: string, error: unknown): void {
  workbenchPluginDiagnostics.report(new UiPluginHostError({
    code: "UI-PLG-012",
    stage: "registration",
    plugin: { id: "brilliant.workbench.plugin-startup", name: "工作台插件启动", version: "1.0.0" },
    message: "工作台插件配置恢复失败",
    detail: `${kind}: ${error instanceof Error ? error.message : String(error)}`,
    cause: error,
  }).diagnostic);
}

function captureFrozenSession(): void {
  hostBindingsResolver ??= new TrustedPluginHostBindingsResolver(workbenchPluginPlatform.sessionPlan());
}

/** Restores persisted plugin state before React mounts in either host. */
export function initializeWorkbenchPluginPreview(): Promise<void> {
  if (pluginInitialization) return pluginInitialization;
  const desktop = import.meta.env.VITE_BRILLIANT_DESKTOP === "1" || isTauri();
  pluginInitialization = Promise.resolve().then(async () => {
    const result = await bootstrapPersistedPluginPlatform(
      workbenchPluginPlatform,
      desktop ? new TauriPluginActivationStorage() : new BrowserPluginActivationStorage(),
      desktop ? new TauriPluginSettingsStorage() : new BrowserPluginSettingsStorage(),
      reportPluginInitializationFailure,
      {
        recoveryStorage: desktop
          ? new TauriPluginStartupRecoveryStorage()
          : new BrowserPluginStartupRecoveryStorage(),
      },
    );
    pluginStartup = result.startup;
    captureFrozenSession();
  }).catch((error: unknown) => {
    reportPluginInitializationFailure("initialization", error);
  });
  return pluginInitialization;
}

/** Marks the plugin session stable after the first workbench frame is committed. */
export async function markWorkbenchPluginStartupStable(): Promise<void> {
  if (!pluginStartup) return;
  try {
    await pluginStartup.markStable();
  } catch (error) {
    reportPluginInitializationFailure("stability", error);
  }
}

/** Saves the next-launch preference. The running workbench composition never changes. */
export async function setWorkbenchUserPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  try {
    if (!pluginStartup) throw new Error("Plugin activation storage is not connected");
    await pluginStartup.setEnabled(pluginId, enabled);
  } catch (error) {
    reportPluginInitializationFailure(`activation:${pluginId}`, error);
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
