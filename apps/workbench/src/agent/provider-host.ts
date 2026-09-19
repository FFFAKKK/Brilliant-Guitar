import type { AgentProviderCredentialSnapshot } from "../contracts/agent-provider-credential.ts";
import type {
  AgentProviderDecideRequestV1,
  AgentProviderDecisionEnvelopeV1,
  AgentProviderStreamEventV1,
} from "../contracts/agent-provider-turn.ts";

/** Narrow host surface available to Provider adapters. It never exposes plaintext credentials. */
export interface AgentProviderHostPort {
  readAgentProviderCredentialStatus(providerId: string): Promise<AgentProviderCredentialSnapshot>;
  decideAgentProvider(
    request: AgentProviderDecideRequestV1,
    signal?: AbortSignal | null,
    observer?: ((event: AgentProviderStreamEventV1) => void) | null,
  ): Promise<AgentProviderDecisionEnvelopeV1>;
}
