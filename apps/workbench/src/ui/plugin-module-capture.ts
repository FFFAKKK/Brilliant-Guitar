import { capturePluginBusinessContributions } from "../plugins/plugin-contributions.ts";
import type { InternalUiPluginModule } from "./plugin-manager.ts";
import type { UiComponentDefinition } from "./plugin-contract.ts";
import { isUiComponentDefinition } from "./plugin-contract.ts";
import { captureUiPluginManifest } from "./plugin-manifest.ts";
import { capturePluginMountUi, mountUiManifest } from "../plugins/plugin-mount-ui.ts";

function captureComponentDefinition(definition: UiComponentDefinition): UiComponentDefinition {
  if (!isUiComponentDefinition(definition)) throw new Error("Invalid UI component definition");
  return Object.freeze({
    id: definition.id,
    version: definition.version,
    kind: definition.kind,
    domain: definition.domain,
    slots: Object.freeze([...definition.slots]),
    presentation: Object.freeze({
      allowed: Object.freeze([...definition.presentation.allowed]),
      default: definition.presentation.default,
    }),
    capabilities: Object.freeze({ ...definition.capabilities }),
    permissions: Object.freeze({
      projections: Object.freeze([...definition.permissions.projections]),
      commands: Object.freeze([...definition.permissions.commands]),
    }),
    ...(definition.extensionPoints === undefined
      ? {}
      : { extensionPoints: Object.freeze([...definition.extensionPoints]) }),
  });
}

/** Captures the startup contract without freezing or retaining caller-owned description objects. */
export function captureInternalUiPluginModule(plugin: InternalUiPluginModule): InternalUiPluginModule {
  const manifest = captureUiPluginManifest(plugin.manifest);
  if (!manifest) throw new Error("Invalid UI plugin manifest");
  const ui = plugin.ui === undefined ? undefined : capturePluginMountUi(plugin.ui, manifest.id);
  if (ui !== undefined && manifest.apiVersion !== "4.0") throw new Error("Mount UI facet requires plugin API 4.0");
  if (JSON.stringify(ui === undefined ? undefined : mountUiManifest(ui)) !== JSON.stringify(manifest.contributes.ui)) {
    throw new Error("Mount UI contributions do not match manifest");
  }
  return Object.freeze({
    manifest,
    ...(ui === undefined ? {} : { ui }),
    projections: Object.freeze(plugin.projections.map((projection) => Object.freeze({ id: projection.id }))),
    commands: Object.freeze(plugin.commands.map((command) => Object.freeze({
      id: command.id,
      create: command.create,
    }))),
    views: Object.freeze(plugin.views.map((view) => Object.freeze({
      definition: captureComponentDefinition(view.definition),
      label: view.label,
      ...(view.icon === undefined ? {} : { icon: view.icon }),
      ...(view.inlineZone === undefined ? {} : { inlineZone: view.inlineZone }),
      render: view.render,
    }))),
    interactions: Object.freeze(plugin.interactions.map((interaction) => Object.freeze({
      id: interaction.id,
      notationKind: interaction.notationKind,
      input: Object.freeze({
        id: interaction.input.id,
        canHandle: interaction.input.canHandle,
        translate: interaction.input.translate,
      }),
      readDraft: interaction.readDraft,
      startComposition: interaction.startComposition,
      navigate: interaction.navigate,
      edit: interaction.edit,
    }))),
    componentExtensions: Object.freeze(plugin.componentExtensions.map((extension) => Object.freeze({
      id: extension.id,
      extensionPoint: extension.extensionPoint,
      ...(extension.order === undefined ? {} : { order: extension.order }),
      render: extension.render,
    }))),
    ...capturePluginBusinessContributions(plugin),
  });
}
