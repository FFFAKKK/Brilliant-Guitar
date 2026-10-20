import type { WorkbenchCommand } from "../commands/workbench-command.ts";
import type { NotationInteractionContribution } from "../input/notation-interaction-registry.ts";
import type { InternalUiPluginModule } from "../ui/plugin-manager.ts";
import { mountUiManifest } from "./plugin-mount-ui.ts";
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
import { captureInternalUiPluginModule } from "../ui/plugin-module-capture.ts";
import { capturePluginModule } from "./plugin-module.ts";
import { capturePluginManifest } from "./plugin-manifest.ts";
import type { PluginModule } from "./plugin-module.ts";

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
  return captureInternalUiPluginModule({
    ...(plugin.ui === undefined ? {} : { ui: plugin.ui }),
    manifest: pluginPackageManifest(plugin),
    projections: plugin.projections as readonly AnyUiProjection[],
    commands: plugin.commands.map((contribution) => {
      const create = contribution.create;
      return {
        id: contribution.id,
        create: (reader): WorkbenchCommand => create(
          projectionReader(reader), runtimeHost(plugin.id, services)),
      };
    }),
    interactions: plugin.interactions as readonly NotationInteractionContribution<any, any, any, any, any, any, any>[],
    componentExtensions: plugin.componentExtensions.map((contribution) => {
      const render = contribution.render;
      return {
        id: contribution.id,
        extensionPoint: contribution.extensionPoint,
        ...(contribution.order === undefined ? {} : { order: contribution.order }),
        render: (reader) => render(projectionReader(reader), runtimeHost(plugin.id, services)),
      };
    }),
    instruments: plugin.instruments,
    playbackOutputs: plugin.playbackOutputs,
    applicationCapabilities: plugin.applicationCapabilities,
    workflows: plugin.workflows,
    views: plugin.views.map((contribution) => {
      const render = contribution.render;
      return {
        definition: contribution.definition as UiComponentDefinition,
        label: contribution.label,
        ...(contribution.icon === undefined ? {} : { icon: contribution.icon }),
        ...(contribution.inlineZone === undefined ? {} : { inlineZone: contribution.inlineZone }),
        render: (reader, host) => render(projectionReader(reader), viewHost(host, plugin.id, services)),
      };
    }),
  });
}

/** Captures business-only packages without converting them into UI modules. */
export function adaptPluginPackage(plugin: UiPluginPackage, services?: PluginSdkRuntimeServices): PluginModule {
  const hasUi = plugin.ui !== undefined || plugin.projections.length > 0 || plugin.commands.length > 0
    || plugin.views.length > 0 || plugin.interactions.length > 0 || plugin.componentExtensions.length > 0;
  return capturePluginModule({
    manifest: pluginPackageManifest(plugin),
    ui: hasUi ? adaptUiPluginPackage(plugin, services) : null,
    instruments: plugin.instruments, playbackOutputs: plugin.playbackOutputs,
    applicationCapabilities: plugin.applicationCapabilities, workflows: plugin.workflows,
  });
}

/** Data-only discovery path; no UI module or execution resources are acquired. */
export function pluginPackageManifest(plugin: UiPluginPackage) {
  const manifest = capturePluginManifest({
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    tier: plugin.tier,
    apiVersion: plugin.apiVersion,
    runtime: "internal-module",
    activation: plugin.activation,
    requires: {
      hostFeatures: plugin.hostFeatures,
      hostServices: plugin.hostServices,
      projections: plugin.projections.map((projection) => projection.id),
    },
    contributes: {
      views: plugin.views.map((view) => view.definition.id),
      commands: plugin.commands.map((command) => command.id),
      interactions: plugin.interactions.map((interaction) => interaction.id),
      componentExtensions: plugin.componentExtensions.map((extension) => extension.id),
      instruments: plugin.instruments.map((instrument) => instrument.id),
      playbackOutputs: plugin.playbackOutputs.map((output) => output.id),
      applicationCapabilities: plugin.applicationCapabilities.map((capability) => capability.id),
      workflows: plugin.workflows.map((workflow) => workflow.id),
      kernelModules: plugin.kernelModules,
      ...(plugin.ui === undefined ? {} : { ui: mountUiManifest(plugin.ui) }),
    },
  });
  if (!manifest) throw new Error("Invalid UI plugin manifest");
  return manifest;
}
