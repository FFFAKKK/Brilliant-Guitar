import type { InternalUiPluginModule } from "./plugin-manager.ts";
import type { UiComponentExtensionContribution } from "./view-contribution.ts";

export interface UiDiscoveredComponentExtension {
  readonly pluginId: string;
  readonly contribution: UiComponentExtensionContribution;
}

/**
 * Process-local directory of compiled plugin modules.
 *
 * Registration order remains observable, while the installation plan makes
 * component owners available before plugins that extend their components.
 */
export class UiPluginCatalog {
  readonly #plugins: InternalUiPluginModule[] = [];

  constructor(plugins: readonly InternalUiPluginModule[] = []) {
    this.registerAll(plugins);
  }

  register(plugin: InternalUiPluginModule): void {
    this.#plugins.push(plugin);
  }

  registerAll(plugins: readonly InternalUiPluginModule[]): void {
    for (const plugin of plugins) this.register(plugin);
  }

  list(): readonly InternalUiPluginModule[] {
    return [...this.#plugins];
  }

  findComponentExtensions(extensionPoint: string): readonly UiDiscoveredComponentExtension[] {
    return this.#plugins.flatMap((plugin) => plugin.componentExtensions
      .filter((contribution) => contribution.extensionPoint === extensionPoint)
      .map((contribution) => ({ pluginId: plugin.manifest.id, contribution })));
  }

  installationPlan(): readonly InternalUiPluginModule[] {
    const owners = new Map<string, InternalUiPluginModule[]>();
    for (const plugin of this.#plugins) {
      for (const view of plugin.views) {
        for (const extensionPoint of view.definition.extensionPoints ?? []) {
          const current = owners.get(extensionPoint) ?? [];
          owners.set(extensionPoint, [...current, plugin]);
        }
      }
    }

    const dependencies = new Map<InternalUiPluginModule, ReadonlySet<InternalUiPluginModule>>();
    for (const plugin of this.#plugins) {
      const requiredOwners = new Set<InternalUiPluginModule>();
      for (const extension of plugin.componentExtensions) {
        const candidates = owners.get(extension.extensionPoint) ?? [];
        const owner = candidates[0];
        if (candidates.length === 1 && owner && owner !== plugin) requiredOwners.add(owner);
      }
      dependencies.set(plugin, requiredOwners);
    }

    const pending = new Set(this.#plugins);
    const installed = new Set<InternalUiPluginModule>();
    const plan: InternalUiPluginModule[] = [];
    while (pending.size > 0) {
      let progressed = false;
      for (const plugin of this.#plugins) {
        if (!pending.has(plugin)) continue;
        const requirements = dependencies.get(plugin) ?? new Set();
        if ([...requirements].some((owner) => !installed.has(owner))) continue;
        pending.delete(plugin);
        installed.add(plugin);
        plan.push(plugin);
        progressed = true;
      }
      if (progressed) continue;
      // Cycles and invalid/missing targets remain visible to UiPluginHost diagnostics.
      for (const plugin of this.#plugins) if (pending.delete(plugin)) plan.push(plugin);
    }
    return plan;
  }
}
