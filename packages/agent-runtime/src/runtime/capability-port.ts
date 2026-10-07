import type { CapabilityResult, CapabilityTransportRequest } from "../contracts/capability.ts";
import type { AgentWorkspaceScope } from "./agent-contracts.ts";

export interface AgentCapabilityPort {
  invoke(
    request: CapabilityTransportRequest,
    context?: AgentCapabilityInvocationContext,
  ): Promise<CapabilityResult<unknown>>;
}

export interface AgentCapabilityInvocationContext {
  readonly workspace: AgentWorkspaceScope;
  readonly rangeBudget: number;
}

export class AgentCapabilityPortError extends Error {
  readonly outcome: "definite-failure" | "unknown";

  constructor(message: string, outcome: "definite-failure" | "unknown") {
    super(message);
    this.outcome = outcome;
  }
}
