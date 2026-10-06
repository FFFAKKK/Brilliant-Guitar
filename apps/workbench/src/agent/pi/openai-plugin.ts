import type { AgentProviderSelection } from "../../contracts/agent-provider-settings.ts";
import { createFirstPartyAgentPlugin, type AgentPluginDescriptor, type AgentPluginPort } from "../agent-plugin-contract.ts";
import type { AgentModelProviderHostPort } from "../provider-host.ts";
import { createPiDecisionPlugin } from "./decision-adapter.ts";
import { createOpenAiPiModel, createOpenAiPiStreamFn } from "./openai-stream.ts";

export function createOpenAiPiPlugin(
  host: AgentModelProviderHostPort,
  selection: AgentProviderSelection,
  descriptor: AgentPluginDescriptor,
): AgentPluginPort {
  return createFirstPartyAgentPlugin({
    ...descriptor,
    async decide(request, signal, observer) {
      const plugin = createPiDecisionPlugin({
        ...descriptor,
        model: createOpenAiPiModel(selection),
        streamFn: createOpenAiPiStreamFn(host, request, selection),
      });
      return plugin.decide(request, signal, observer);
    },
  });
}
