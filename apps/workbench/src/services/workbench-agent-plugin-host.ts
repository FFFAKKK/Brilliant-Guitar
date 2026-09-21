import { isTauri } from "@tauri-apps/api/core";

import type { WorkflowDirectory } from "../contracts/workflow.ts";
import type { AgentPluginHostBindingsV1 } from "../agent/agent-plugin-session.ts";
import { InMemoryAgentRunStore } from "../agent/agent-store.ts";
import { WorkbenchAgentCapabilityPort } from "../agent/capability-port.ts";
import type { AgentProviderHostPort } from "../agent/provider-host.ts";
import { TauriAgentRunStore } from "../agent/tauri-agent-run-store.ts";
import { TauriAgentInvocationReceiptPort } from "../agent/tauri-invocation-receipt.ts";
import type { WorkbenchClient } from "./workbench-client.ts";

/** Trusted-shell adapter. Agent code only receives the scoped facades returned here. */
export function createWorkbenchAgentPluginBindings(
  client: WorkbenchClient,
  workflows: WorkflowDirectory,
  pluginVersion: string,
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
  return Object.freeze({
    bindingVersion: 1 as const,
    plugin: Object.freeze({
      id: "brilliant.agent.assistant" as const,
      version: pluginVersion,
    }),
    hostAvailable: desktop,
    provider,
    commit: new WorkbenchAgentCapabilityPort(client.agentCapabilities()),
    scoreRead: client.scoreReadPort(),
    scoreChangeSets: client.scoreChangeSetPort(),
    runStore,
    receipts: desktop ? new TauriAgentInvocationReceiptPort() : null,
    workflows,
  });
}
