import type { InternalUiPluginModule } from "../ui/plugin-manager.ts";
import type { PluginModule } from "./plugin-module.ts";
import type { PluginManifest } from "./plugin-manifest.ts";
import type { UiComponentExtensionContribution } from "../ui/view-contribution.ts";

export interface DiscoveredComponentExtension {
  readonly pluginId: string;
  readonly contribution: UiComponentExtensionContribution;
}

/**
 * Process-local directory of compiled plugin modules.
 *
 * Registration order remains observable, while the installation plan makes
 * component owners available before plugins that extend their components.
 */
export class PluginCatalogBase<Module extends { readonly manifest: PluginManifest }> {
  readonly #plugins: Module[] = [];
  readonly #uiOf: (plugin: Module) => InternalUiPluginModule | null;

  constructor(plugins: readonly Module[], uiOf: (plugin: Module) => InternalUiPluginModule | null) {
    this.#uiOf = uiOf;
    this.registerAll(plugins);
  }

  register(plugin: Module): void {
    this.#plugins.push(plugin);
  }

  registerAll(plugins: readonly Module[]): void {
    for (const plugin of plugins) this.register(plugin);
  }

  list(): readonly Module[] {
    return [...this.#plugins];
  }

  clear(): void { this.#plugins.length = 0; }

  findComponentExtensions(extensionPoint: string): readonly DiscoveredComponentExtension[] {
    return this.#plugins.flatMap((plugin) => (this.#uiOf(plugin)?.componentExtensions ?? [])
      .filter((contribution) => contribution.extensionPoint === extensionPoint)
      .map((contribution) => ({ pluginId: plugin.manifest.id, contribution })));
  }

  installationPlan(): readonly Module[] {
    const owners = new Map<string, Module[]>();
    for (const plugin of this.#plugins) {
      for (const view of this.#uiOf(plugin)?.views ?? []) {
        for (const extensionPoint of view.definition.extensionPoints ?? []) {
          const current = owners.get(extensionPoint) ?? [];
          owners.set(extensionPoint, [...current, plugin]);
        }
      }
    }

    const dependencies = new Map<Module, ReadonlySet<Module>>();
    for (const plugin of this.#plugins) {
      const requiredOwners = new Set<Module>();
      for (const extension of this.#uiOf(plugin)?.componentExtensions ?? []) {
        const candidates = owners.get(extension.extensionPoint) ?? [];
        const owner = candidates[0];
        if (candidates.length === 1 && owner && owner !== plugin) requiredOwners.add(owner);
      }
      dependencies.set(plugin, requiredOwners);
    }

    const pending = new Set(this.#plugins);
    const installed = new Set<Module>();
    const plan: Module[] = [];
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

export class PluginCatalog extends PluginCatalogBase<PluginModule> {
  constructor(plugins: readonly PluginModule[] = []) {
    super(plugins, plugin => plugin.ui);
  }
}
