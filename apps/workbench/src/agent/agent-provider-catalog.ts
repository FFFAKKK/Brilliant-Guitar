import type { AgentProviderSelection } from "../contracts/agent-provider-settings.ts";
import type { AgentProviderDescriptor, AgentProviderSessionPort } from "./provider-contract.ts";
import type { AgentProviderHostPort } from "./provider-host.ts";
import { AgentProviderRegistry } from "./provider-registry.ts";
import { createStaticAgentProviderSession, createUnconfiguredAgentProviderSession } from "./provider-session.ts";
import { OPENAI_PROVIDER_REGISTRATION } from "./openai-provider.ts";

/** Production catalog. A Provider appears in settings only after its real adapter is registered here. */
export const agentProviderRegistry = new AgentProviderRegistry();
agentProviderRegistry.register(OPENAI_PROVIDER_REGISTRATION);

export const AGENT_PROVIDER_DESCRIPTORS: readonly AgentProviderDescriptor[] = Object.freeze(
  agentProviderRegistry.list(),
);

export function createConfiguredAgentProviderSession(
  selection: AgentProviderSelection | null,
  host?: AgentProviderHostPort,
): AgentProviderSessionPort {
  if (selection === null) return createUnconfiguredAgentProviderSession();
  const descriptor = agentProviderRegistry.get(selection.providerId);
  if (!descriptor) return createStaticAgentProviderSession({
    status: "unavailable",
    providerId: selection.providerId,
    model: selection.modelId,
    message: "已选择的模型 Provider 当前未安装或不可用",
  });
  if (!descriptor.models.some((model) => model.id === selection.modelId)) {
    return createStaticAgentProviderSession({
      status: "unavailable",
      providerId: selection.providerId,
      model: selection.modelId,
      message: "已选择的模型已不再由当前 Provider 提供",
    });
  }
  if (host === undefined) return createStaticAgentProviderSession({
    status: "error",
    providerId: selection.providerId,
    model: selection.modelId,
    message: "当前宿主没有提供模型调用边界",
  });
  try {
    return agentProviderRegistry.createSession(selection, host);
  } catch (error) {
    return createStaticAgentProviderSession({
      status: "error",
      providerId: selection.providerId,
      model: selection.modelId,
      message: error instanceof Error && error.message ? error.message : "无法初始化模型 Provider",
    });
  }
}
