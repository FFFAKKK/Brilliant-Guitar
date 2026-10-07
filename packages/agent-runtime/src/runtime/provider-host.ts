import type { AgentProviderCredentialSnapshot } from "../contracts/agent-provider-credential.ts";
import type {
  AgentProviderDecideRequestV1,
  AgentProviderDecisionEnvelopeV1,
  AgentProviderStreamEventV1,
} from "../contracts/agent-provider-turn.ts";
import type {
  AgentModelStreamEnvelopeV1,
  AgentModelStreamEventV1,
  AgentModelStreamRequestV1,
} from "../contracts/agent-model-stream.ts";

/** Narrow credential surface available to Provider adapters. It never exposes plaintext credentials. */
export interface AgentProviderCredentialHostPort {
  readAgentProviderCredentialStatus(providerId: string): Promise<AgentProviderCredentialSnapshot>;
}

/** Compatibility host surface for the legacy product-level decision Provider. */
export interface AgentDecisionProviderHostPort extends AgentProviderCredentialHostPort {
  decideAgentProvider(
    request: AgentProviderDecideRequestV1,
    signal?: AbortSignal | null,
    observer?: ((event: AgentProviderStreamEventV1) => void) | null,
  ): Promise<AgentProviderDecisionEnvelopeV1>;
}

/** Raw model host surface used by the first-party Pi Agent Plugin. */
export interface AgentModelProviderHostPort extends AgentProviderCredentialHostPort {
  streamAgentModel(
    request: AgentModelStreamRequestV1,
    signal?: AbortSignal | null,
    observer?: ((event: AgentModelStreamEventV1) => void) | null,
  ): Promise<AgentModelStreamEnvelopeV1>;
}

/** Transitional aggregate kept at the application host boundary while legacy Provider support remains. */
export interface AgentProviderHostPort extends AgentDecisionProviderHostPort {
  /** Present in desktop hosts that support the first-party raw model stream. */
  streamAgentModel?: AgentModelProviderHostPort["streamAgentModel"];
}
