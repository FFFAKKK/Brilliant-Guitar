import type { WorkbenchCommand } from "../commands/workbench-command.ts";
import type { NotationInteractionContribution } from "../input/notation-interaction-registry.ts";
import type { InternalUiPluginModule } from "../ui/plugin-manager.ts";
import { WORKBENCH_PLUGIN_API_VERSION } from "../ui/plugin-manifest.ts";
import type { UiComponentDefinition } from "../ui/plugin-contract.ts";
import type { AnyUiProjection, UiProjectionReader } from "../ui/projection-registry.ts";
import type { UiResolvedComponentExtension, UiViewHostContext } from "../ui/view-contribution.ts";
import type {
  PluginProjectionReader,
  PluginResolvedComponentExtension,
  PluginRuntimeHost,
  PluginSettingsHost,
  PluginViewHost,
  UiPluginPackage,
} from "./plugin-sdk.ts";

export interface PluginSdkRuntimeServices {
  settings(pluginId: string): PluginSettingsHost | null;
}

function projectionReader(reader: UiProjectionReader): PluginProjectionReader {
  return reader;
}

function resolvedExtension(extension: UiResolvedComponentExtension): PluginResolvedComponentExtension {
  return extension;
}

function runtimeHost(pluginId: string, services?: PluginSdkRuntimeServices): PluginRuntimeHost {
  return { settings: services?.settings(pluginId) ?? null };
}

function viewHost(host: UiViewHostContext, pluginId: string, services?: PluginSdkRuntimeServices): PluginViewHost {
  return {
    ...runtimeHost(pluginId, services),
    extensions: (extensionPoint) => host.extensions(extensionPoint).map(resolvedExtension),
  };
}

/** Internal boundary that translates the stable authoring SDK into the current UI host contract. */
export function adaptUiPluginPackage(plugin: UiPluginPackage, services?: PluginSdkRuntimeServices): InternalUiPluginModule {
  return {
    manifest: {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      apiVersion: WORKBENCH_PLUGIN_API_VERSION,
      runtime: "internal-module",
      activation: plugin.activation,
      requires: {
        capabilities: plugin.capabilities,
        projections: plugin.projections.map((projection) => projection.id),
      },
      contributes: {
        views: plugin.views.map((view) => view.definition.id),
        commands: plugin.commands.map((command) => command.id),
        interactions: plugin.interactions.map((interaction) => interaction.id),
        componentExtensions: plugin.componentExtensions.map((extension) => extension.id),
        instruments: plugin.instruments.map((instrument) => instrument.id),
        playbackOutputs: plugin.playbackOutputs.map((output) => output.id),
      },
    },
    projections: plugin.projections as readonly AnyUiProjection[],
    commands: plugin.commands.map((contribution) => ({
      id: contribution.id,
      create: (reader): WorkbenchCommand => contribution.create(
        projectionReader(reader), runtimeHost(plugin.id, services)),
    })),
    interactions: plugin.interactions as readonly NotationInteractionContribution<any, any, any, any, any, any, any>[],
    componentExtensions: plugin.componentExtensions.map((contribution) => ({
      id: contribution.id,
      extensionPoint: contribution.extensionPoint,
      ...(contribution.order === undefined ? {} : { order: contribution.order }),
      render: (reader) => contribution.render(projectionReader(reader), runtimeHost(plugin.id, services)),
    })),
    instruments: plugin.instruments,
    playbackOutputs: plugin.playbackOutputs,
    views: plugin.views.map((contribution) => ({
      definition: contribution.definition as UiComponentDefinition,
      label: contribution.label,
      ...(contribution.icon === undefined ? {} : { icon: contribution.icon }),
      ...(contribution.inlineZone === undefined ? {} : { inlineZone: contribution.inlineZone }),
      render: (reader, host) => contribution.render(projectionReader(reader), viewHost(host, plugin.id, services)),
    })),
  };
}
