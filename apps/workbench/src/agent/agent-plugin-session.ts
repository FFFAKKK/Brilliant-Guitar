import type { AgentProviderSelection } from "../contracts/agent-provider-settings.ts";
import type { WorkflowDirectory } from "../contracts/workflow.ts";
import type { ScoreChangeSetPort } from "../services/score-change-set-port.ts";
import type { ScoreReadPort } from "../services/score-read-port.ts";
import { createAgentConversation } from "./agent-conversation.ts";
import { createAgentAssistantSession } from "./agent-assistant-session.ts";
import type {
  AgentAssistantSession,
  AgentAssistantSessionSnapshot,
  AgentDocumentChange,
} from "./agent-assistant-session.ts";
import type { AgentRunStorePort } from "./agent-store.ts";
import { AgentPluginRuntime } from "./agent-plugin-runtime.ts";
import type { AgentPluginRuntimeSnapshot } from "./agent-plugin-runtime.ts";
import { createAgentRecoverySession } from "./agent-recovery-session.ts";
import type { AgentCapabilityPort } from "./capability-port.ts";
import { UNCONFIGURED_AGENT_PROVIDER } from "./provider-contract.ts";
import type { AgentProviderHostPort } from "./provider-host.ts";
import type { AgentInvocationReceiptPort } from "./recovery-coordinator.ts";

export interface AgentPluginHostBindingsV1 {
  readonly bindingVersion: 1;
  readonly plugin: Readonly<{
    readonly id: "brilliant.agent.assistant";
    readonly version: string;
  }>;
  readonly hostAvailable: boolean;
  readonly provider: AgentProviderHostPort;
  /** Transitional durable commit boundary. It must not be used for new reads or prepare operations. */
  readonly commit: AgentCapabilityPort;
  readonly scoreRead: ScoreReadPort;
  readonly scoreChangeSets: ScoreChangeSetPort;
  readonly runStore: AgentRunStorePort;
  readonly receipts: AgentInvocationReceiptPort | null;
  readonly workflows: WorkflowDirectory;
}

export interface AgentPluginSession {
  readonly runtime: AgentPluginRuntime;
  readonly assistant: AgentAssistantSession;
  configure(selection: AgentProviderSelection | null): Promise<void>;
  dispose(): void;
}

export const INACTIVE_AGENT_PLUGIN_RUNTIME_SNAPSHOT: AgentPluginRuntimeSnapshot = Object.freeze({
  status: "unavailable",
  provider: UNCONFIGURED_AGENT_PROVIDER,
  recovery: Object.freeze({
    status: "unavailable",
    items: Object.freeze([]),
    message: "Agent 插件不属于当前会话",
  }),
  canStartRun: false,
  message: "Agent 插件不属于当前会话",
});

export const INACTIVE_AGENT_ASSISTANT_SESSION_SNAPSHOT: AgentAssistantSessionSnapshot = Object.freeze({
  status: "idle",
  runId: null,
  goal: "",
  response: null,
  message: "Agent 插件不属于当前会话",
  requiredInput: null,
  conversation: createAgentConversation("inactive-agent-plugin-session"),
});

export function createAgentPluginSession(
  bindings: AgentPluginHostBindingsV1,
  onDocumentChanged?: (change: AgentDocumentChange) => void | Promise<void>,
): AgentPluginSession {
  const runtime = new AgentPluginRuntime({
    hostAvailable: bindings.hostAvailable,
    providerHost: bindings.provider,
    createRecoverySession: () => createAgentRecoverySession(bindings.runStore, bindings.receipts),
  });
  const assistant = createAgentAssistantSession({
    runtime,
    commitCapabilities: bindings.commit,
    scoreRead: bindings.scoreRead,
    scoreChangeSets: bindings.scoreChangeSets,
    store: bindings.runStore,
    receipts: bindings.receipts,
    workflows: bindings.workflows,
    ...(onDocumentChanged === undefined ? {} : { onDocumentChanged }),
  });
  return Object.freeze({
    runtime,
    assistant,
    async configure(selection: AgentProviderSelection | null): Promise<void> {
      await runtime.setProviderSelection(selection);
      await runtime.start();
    },
    dispose(): void {
      assistant.dispose();
      runtime.dispose();
    },
  });
}
