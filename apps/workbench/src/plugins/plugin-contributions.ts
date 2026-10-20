import type { ApplicationCapabilityContribution } from "../contracts/application-capability.ts";
import type { WorkflowContribution } from "../contracts/workflow.ts";
import type { PluginInstrumentContribution, PluginPlaybackOutputContribution } from "./plugin-sdk.ts";

export interface PluginBusinessContributions {
  readonly instruments?: readonly PluginInstrumentContribution[];
  readonly playbackOutputs?: readonly PluginPlaybackOutputContribution[];
  readonly applicationCapabilities?: readonly ApplicationCapabilityContribution[];
  readonly workflows?: readonly WorkflowContribution[];
}

/** Own immutable description copies, without freezing the author's values or execution functions. */
export function capturePluginBusinessContributions(plugin: PluginBusinessContributions) {
  return Object.freeze({
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
