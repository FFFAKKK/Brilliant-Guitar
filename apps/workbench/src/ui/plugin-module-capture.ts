import type { InternalUiPluginModule } from "./plugin-manager.ts";
import type { UiComponentDefinition } from "./plugin-contract.ts";
import { isUiComponentDefinition } from "./plugin-contract.ts";
import { captureUiPluginManifest } from "./plugin-manifest.ts";

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
  return Object.freeze({
    manifest,
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
    instruments: Object.freeze((plugin.instruments ?? []).map((instrument) => Object.freeze({
      id: instrument.id,
      label: instrument.label,
      family: instrument.family,
      notationKinds: Object.freeze([...instrument.notationKinds]),
      ...(instrument.noteControlExtensionIds === undefined
        ? {}
        : { noteControlExtensionIds: Object.freeze([...instrument.noteControlExtensionIds]) }),
      ...(instrument.playbackProfileId === undefined ? {} : { playbackProfileId: instrument.playbackProfileId }),
    }))),
    playbackOutputs: Object.freeze((plugin.playbackOutputs ?? []).map((output) => Object.freeze({
      id: output.id,
      kind: output.kind,
      label: output.label,
      createEngine: output.createEngine,
    }))),
    applicationCapabilities: Object.freeze((plugin.applicationCapabilities ?? []).map((capability) => Object.freeze({
      id: capability.id,
      contractVersion: capability.contractVersion,
      callers: Object.freeze([...capability.callers]),
      validateInput: capability.validateInput,
      validateOutput: capability.validateOutput,
    }))),
    workflows: Object.freeze((plugin.workflows ?? []).map((workflow) => Object.freeze({
      id: workflow.id,
      contractVersion: workflow.contractVersion,
      name: workflow.name,
      description: workflow.description,
      runtime: workflow.runtime,
      operationIds: Object.freeze([...workflow.operationIds]),
      entryOperationIds: Object.freeze([...workflow.entryOperationIds]),
    }))),
  });
}
