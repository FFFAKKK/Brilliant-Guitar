import type { CapabilityResult, CapabilityTransportRequest } from "../contracts/capability.ts";
import type { AgentWorkspaceScope } from "./agent-contracts.ts";
import type { AgentReadPreview, AgentReadResultLimitV1 } from "../contracts/tool-feedback-admission.ts";

export interface AgentCapabilityPort {
  previewRead?(request: CapabilityTransportRequest,
    context: AgentCapabilityInvocationContext & { readonly resultLimit: AgentReadResultLimitV1 }): AgentReadPreview;
  invoke(
    request: CapabilityTransportRequest,
    context?: AgentCapabilityInvocationContext,
  ): Promise<CapabilityResult<unknown>>;
}

export interface AgentCapabilityInvocationContext {
  readonly workspace: AgentWorkspaceScope;
  readonly rangeBudget: number;
  readonly resultLimit?: AgentReadResultLimitV1;
}

export class AgentCapabilityPortError extends Error {
  readonly outcome: "definite-failure" | "unknown";

  constructor(message: string, outcome: "definite-failure" | "unknown") {
    super(message);
    this.outcome = outcome;
  }
}
