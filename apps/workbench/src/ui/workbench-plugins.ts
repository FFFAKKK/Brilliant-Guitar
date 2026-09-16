import { FIRST_PARTY_UI_PLUGINS } from "./first-party-plugins.ts";
import { UiPluginManager } from "./plugin-manager.ts";
import { WorkbenchCapabilityRegistry } from "./plugin-manifest.ts";

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
export const workbenchPlugins = new UiPluginManager(workbenchCapabilities);
for (const plugin of FIRST_PARTY_UI_PLUGINS) workbenchPlugins.install(plugin);
