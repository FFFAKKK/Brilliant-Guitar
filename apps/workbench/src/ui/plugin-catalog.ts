import type { InternalUiPluginModule } from "./plugin-manager.ts";
import { PluginCatalogBase } from "../plugins/plugin-catalog.ts";
export type { DiscoveredComponentExtension as UiDiscoveredComponentExtension } from "../plugins/plugin-catalog.ts";

/** Legacy entry point: same objects, registration order and installation-plan algorithm. */
export class UiPluginCatalog extends PluginCatalogBase<InternalUiPluginModule> {
  constructor(plugins: readonly InternalUiPluginModule[] = []) {
    super(plugins, plugin => plugin);
  }
}
