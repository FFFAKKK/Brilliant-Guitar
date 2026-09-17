import { FIRST_PARTY_UI_PLUGINS } from "./first-party-plugins.ts";
import { FIRST_PARTY_UI_PROJECTIONS } from "./first-party-plugin-projections.ts";
import { UiPluginHost } from "./plugin-manager.ts";
import { isUiPluginHostError, UiPluginDiagnosticStore, UiPluginHostError, uiPluginIdentity } from "./plugin-diagnostic.ts";
import { WorkbenchCapabilityRegistry } from "./plugin-manifest.ts";
import { UiProjectionRegistry } from "./projection-registry.ts";
import { persistUiPluginDiagnostic } from "../services/plugin-diagnostic-host.ts";

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
]);

/** Static composition root. Third-party code loading remains deliberately unsupported. */
export const workbenchPluginDiagnostics = new UiPluginDiagnosticStore();
export const workbenchPlugins = new UiPluginHost(workbenchCapabilities, new UiProjectionRegistry(FIRST_PARTY_UI_PROJECTIONS),
  (diagnostic) => { workbenchPluginDiagnostics.report(diagnostic); persistUiPluginDiagnostic(diagnostic); });
for (const plugin of FIRST_PARTY_UI_PLUGINS) {
  try {
    workbenchPlugins.install(plugin);
  } catch (error) {
    const failure = isUiPluginHostError(error) ? error : new UiPluginHostError({
      code: "UI-PLG-012",
      stage: "registration",
      plugin: uiPluginIdentity(plugin.manifest),
      message: "界面插件装配失败",
      detail: error instanceof Error ? error.message : String(error),
      cause: error,
    });
    workbenchPluginDiagnostics.report(failure.diagnostic);
    persistUiPluginDiagnostic(failure.diagnostic);
    if (import.meta.env.DEV) console.error("界面插件已隔离", failure);
  }
}
