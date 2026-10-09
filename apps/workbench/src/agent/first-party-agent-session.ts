import type { AgentProviderSelection } from "../contracts/agent-provider-settings.ts";
import { createConfiguredAgentProviderSession, agentProviderRegistry } from "./agent-provider-catalog.ts";
import { createAgentPluginProvider, type AgentPluginDescriptor } from "./agent-plugin-contract.ts";
import { OpenAiProviderSession, OPENAI_PROVIDER_ID } from "./openai-provider.ts";
import type { AgentProviderSessionPort } from "./provider-contract.ts";
import type { AgentModelProviderHostPort, AgentProviderHostPort } from "./provider-host.ts";
import { createStaticAgentProviderSession, createUnconfiguredAgentProviderSession } from "./provider-session.ts";
import { createOpenAiPiPlugin } from "./pi/openai-plugin.ts";

export const DEFAULT_AGENT_PLUGIN: AgentPluginDescriptor = Object.freeze({
  id: "brilliant.pi",
  version: "0.1.0",
  kind: "first-party",
  label: "Brilliant Guitar Pi Agent",
  rejectionFeedback: "v1",
});

/** Explicit rollback choice; model or stream failures never trigger a second request. */
export type FirstPartyAgentDecisionEngine = "pi" | "legacy";

export function createFirstPartyAgentProviderSession(
  selection: AgentProviderSelection | null,
  host?: AgentProviderHostPort,
  engine: FirstPartyAgentDecisionEngine = "pi",
): AgentProviderSessionPort {
  if (engine === "legacy") return createConfiguredAgentProviderSession(selection, host);
  if (selection === null) return createUnconfiguredAgentProviderSession();
  const unavailable = (message: string) => createStaticAgentProviderSession({
    status: "unavailable",
    providerId: selection.providerId,
    model: selection.modelId,
    message,
  });
  if (selection.providerId !== OPENAI_PROVIDER_ID) return unavailable("Pi 当前仅支持 OpenAI 模型 Provider");
  const descriptor = agentProviderRegistry.get(selection.providerId);
  if (!descriptor?.models.some((model) => model.id === selection.modelId)) {
    return unavailable("所选模型当前不可用");
  }
  if (host?.streamAgentModel === undefined) return unavailable("当前宿主不支持 Pi 所需的模型流");
  const modelHost: AgentModelProviderHostPort = {
    readAgentProviderCredentialStatus: host.readAgentProviderCredentialStatus,
    streamAgentModel: host.streamAgentModel,
  };
  return new OpenAiProviderSession(modelHost, selection, createAgentPluginProvider(
    createOpenAiPiPlugin(modelHost, selection, DEFAULT_AGENT_PLUGIN),
  ));
}
