import { isTauri } from "@tauri-apps/api/core";

import type { WorkflowDirectory } from "../contracts/workflow.ts";
import type { AgentPluginHostBindingsV1 } from "../agent/agent-plugin-session.ts";
import { InMemoryAgentRunStore } from "../agent/agent-store.ts";
import { WorkbenchAgentCapabilityPort } from "../agent/capability-port.ts";
import type { AgentProviderHostPort } from "../agent/provider-host.ts";
import { TauriAgentRunStore } from "../agent/tauri-agent-run-store.ts";
import { TauriAgentInvocationReceiptPort } from "../agent/tauri-invocation-receipt.ts";
import { AGENT_ASSISTANT_HOST_BINDINGS_CONTRACT } from "../plugins/agent-plugin-host-contract.ts";
import { TrustedPluginHostBindingsResolver } from "../plugins/plugin-host-bindings.ts";
import type { PluginSessionPlanV1 } from "../plugins/plugin-platform.ts";
import type { WorkbenchClient } from "./workbench-client.ts";

/** Trusted-shell adapter. Agent code only receives the scoped facades returned here. */
export function createWorkbenchAgentPluginBindings(
  client: WorkbenchClient,
  workflows: WorkflowDirectory,
  pluginVersion: string,
  sessionPlan: PluginSessionPlanV1,
): AgentPluginHostBindingsV1 {
  const desktop = isTauri();
  const provider: AgentProviderHostPort = Object.freeze({
    readAgentProviderCredentialStatus: (
      providerId: Parameters<AgentProviderHostPort["readAgentProviderCredentialStatus"]>[0],
    ) => client.readAgentProviderCredentialStatus(providerId),
    decideAgentProvider: (
      request: Parameters<AgentProviderHostPort["decideAgentProvider"]>[0],
      signal?: Parameters<AgentProviderHostPort["decideAgentProvider"]>[1],
      observer?: Parameters<AgentProviderHostPort["decideAgentProvider"]>[2],
    ) => client.decideAgentProvider(request, signal, observer),
  });
  const runStore = desktop ? new TauriAgentRunStore() : new InMemoryAgentRunStore();
  const scopedRunStore = Object.freeze({
    load: (runId: string) => runStore.load(runId),
    commit: (input: Parameters<typeof runStore.commit>[0]) => runStore.commit(input),
    listRecoverable: () => runStore.listRecoverable(),
    quarantine: (runId: string) => runStore.quarantine(runId),
  });
  const receipts = desktop ? new TauriAgentInvocationReceiptPort() : null;
  const scopedReceipts = receipts === null ? null : Object.freeze({
    lookup: (input: Parameters<TauriAgentInvocationReceiptPort["lookup"]>[0]) => receipts.lookup(input),
  });
  const scoreRead = client.scoreReadPort();
  const scopedScoreRead = Object.freeze({
    readSummary: (expectedDocument: Parameters<typeof scoreRead.readSummary>[0]) =>
      scoreRead.readSummary(expectedDocument),
    readMetadata: (expectedDocument: Parameters<typeof scoreRead.readMetadata>[0]) =>
      scoreRead.readMetadata(expectedDocument),
    readStructure: (expectedDocument: Parameters<typeof scoreRead.readStructure>[0]) =>
      scoreRead.readStructure(expectedDocument),
    readMeasureIndex: (
      input: Parameters<typeof scoreRead.readMeasureIndex>[0],
      expectedDocument: Parameters<typeof scoreRead.readMeasureIndex>[1],
    ) => scoreRead.readMeasureIndex(input, expectedDocument),
    readMeasureRange: (
      input: Parameters<typeof scoreRead.readMeasureRange>[0],
      expectedDocument: Parameters<typeof scoreRead.readMeasureRange>[1],
    ) => scoreRead.readMeasureRange(input, expectedDocument),
  });
  const scoreChangeSets = client.scoreChangeSetPort();
  const scopedScoreChangeSets = Object.freeze({
    prepareTempoChange: (
      input: Parameters<typeof scoreChangeSets.prepareTempoChange>[0],
      context: Parameters<typeof scoreChangeSets.prepareTempoChange>[1],
    ) => scoreChangeSets.prepareTempoChange(input, context),
    prepareMetadataTransaction: (
      input: Parameters<typeof scoreChangeSets.prepareMetadataTransaction>[0],
      context: Parameters<typeof scoreChangeSets.prepareMetadataTransaction>[1],
    ) => scoreChangeSets.prepareMetadataTransaction(input, context),
  });
  const scopedWorkflows: WorkflowDirectory = Object.freeze({
    get: (id: string) => workflows.get(id),
    list: () => workflows.list(),
    listByPlugin: (ownerPluginId: string) => workflows.listByPlugin(ownerPluginId),
  });
  const resolved = new TrustedPluginHostBindingsResolver(sessionPlan).resolve(
    AGENT_ASSISTANT_HOST_BINDINGS_CONTRACT,
    {
      provider,
      scoreRead: scopedScoreRead,
      scoreChangeSets: scopedScoreChangeSets,
      commit: new WorkbenchAgentCapabilityPort(client.agentCapabilities()),
      runStore: scopedRunStore,
      receipts: scopedReceipts,
      workflows: scopedWorkflows,
    },
  );
  if (pluginVersion !== resolved.plugin.version) {
    throw new Error(`Agent plugin version does not match the frozen grant: ${resolved.plugin.id}`);
  }
  return Object.freeze({
    ...resolved,
    hostAvailable: desktop,
  });
}
