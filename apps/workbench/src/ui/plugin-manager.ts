import { UiComponentRegistry } from "./component-registry.ts";
import type { UiComponentDefinition } from "./plugin-contract.ts";
import { isUiComponentDefinition } from "./plugin-contract.ts";
import type { UiPluginManifest } from "./plugin-manifest.ts";
import { isUiPluginManifest, WorkbenchCapabilityRegistry } from "./plugin-manifest.ts";
import type { UiComponentViewContribution } from "./view-contribution.ts";
import { indexUiComponentViews } from "./view-contribution.ts";
import type { WorkbenchCommand } from "../commands/workbench-command.ts";

export interface InternalUiPluginModule {
  readonly manifest: UiPluginManifest;
  readonly components: readonly UiComponentDefinition[];
}

export interface UiPluginCommandContribution {
  readonly pluginId: string;
  readonly command: WorkbenchCommand;
}

/** Startup-only extension host for compiled first-party UI plugins. */
export class UiPluginManager {
  readonly components = new UiComponentRegistry();
  readonly #capabilities: WorkbenchCapabilityRegistry;
  readonly #plugins = new Map<string, InternalUiPluginModule>();
  readonly #componentOwners = new Map<string, string>();
  readonly #commandOwners = new Map<string, string>();

  constructor(capabilities: WorkbenchCapabilityRegistry) { this.#capabilities = capabilities; }

  install(plugin: InternalUiPluginModule): void {
    if (!isUiPluginManifest(plugin.manifest)) throw new Error("Invalid UI plugin manifest");
    if (this.#plugins.has(plugin.manifest.id)) throw new Error(`UI plugin already installed: ${plugin.manifest.id}`);
    const missing = this.#capabilities.missing(plugin.manifest.requires);
    if (missing.length > 0) throw new Error(`UI plugin ${plugin.manifest.id} requires unavailable capabilities: ${missing.join(", ")}`);

    const actualIds = plugin.components.map((component) => component.id);
    if (new Set(actualIds).size !== actualIds.length
      || actualIds.length !== plugin.manifest.contributes.components.length
      || actualIds.some((id, index) => id !== plugin.manifest.contributes.components[index])) {
      throw new Error(`UI plugin ${plugin.manifest.id} component binding does not match its manifest`);
    }
    for (const component of plugin.components) {
      if (!isUiComponentDefinition(component)) throw new Error(`UI plugin ${plugin.manifest.id} contains an invalid component`);
      if (this.#componentOwners.has(component.id)) throw new Error(`UI component already owned: ${component.id}`);
    }
    for (const commandId of plugin.manifest.contributes.commands) {
      if (this.#commandOwners.has(commandId)) throw new Error(`Workbench command already owned: ${commandId}`);
    }

    for (const component of plugin.components) {
      this.components.register(component);
      this.#componentOwners.set(component.id, plugin.manifest.id);
    }
    for (const commandId of plugin.manifest.contributes.commands) this.#commandOwners.set(commandId, plugin.manifest.id);
    this.#plugins.set(plugin.manifest.id, plugin);
  }

  list(): readonly UiPluginManifest[] { return [...this.#plugins.values()].map((plugin) => plugin.manifest); }

  ownerOf(componentId: string): UiPluginManifest | undefined {
    const owner = this.#componentOwners.get(componentId);
    return owner ? this.#plugins.get(owner)?.manifest : undefined;
  }

  ownerOfCommand(commandId: string): UiPluginManifest | undefined {
    const owner = this.#commandOwners.get(commandId);
    return owner ? this.#plugins.get(owner)?.manifest : undefined;
  }

  indexCommands(contributions: readonly UiPluginCommandContribution[]): readonly WorkbenchCommand[] {
    const seen = new Set<string>();
    return contributions.map((contribution) => {
      const owner = this.ownerOfCommand(contribution.command.id);
      if (owner?.id !== contribution.pluginId)
        throw new Error(`Workbench command is not declared by plugin ${contribution.pluginId}: ${contribution.command.id}`);
      if (seen.has(contribution.command.id)) throw new Error(`Duplicate plugin command contribution: ${contribution.command.id}`);
      seen.add(contribution.command.id);
      return contribution.command;
    });
  }

  indexViews(contributions: readonly UiComponentViewContribution[]): ReadonlyMap<string, UiComponentViewContribution> {
    for (const contribution of contributions) {
      const owner = this.ownerOf(contribution.componentId);
      if (!owner?.contributes.views.includes(contribution.componentId))
        throw new Error(`UI view is not declared by an installed plugin: ${contribution.componentId}`);
    }
    return indexUiComponentViews(this.components.list(), contributions);
  }
}
