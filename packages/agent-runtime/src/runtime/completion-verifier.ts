import type { CapabilityDocumentPrecondition, CapabilityResult } from "../contracts/capability.ts";
import type { AgentContextItem } from "./agent-contracts.ts";
import type { AgentInvocationState } from "./invocation-state.ts";
import type { AgentPreparedExecution } from "./prepared-mutation.ts";

export interface AgentCompletionInvocation {
  readonly invocationId: string;
  readonly capabilityId: string;
  readonly input: unknown;
  readonly preparedExecution?: AgentPreparedExecution | null;
  readonly baseDocumentVersion: number | null;
  readonly documentPrecondition?: CapabilityDocumentPrecondition | null;
  readonly state: AgentInvocationState;
  readonly result: CapabilityResult<unknown> | null;
}

export interface AgentCompletionVerification {
  readonly satisfied: boolean;
  readonly reason: string;
  readonly evidence: readonly string[];
}

export interface AgentCompletionInput {
  readonly goal: string;
  readonly responseText?: string | null;
  readonly contextItems: readonly AgentContextItem[];
  readonly invocations: readonly AgentCompletionInvocation[];
}

export type AgentCompletionVerifier = (
  input: AgentCompletionInput,
) => AgentCompletionVerification;
