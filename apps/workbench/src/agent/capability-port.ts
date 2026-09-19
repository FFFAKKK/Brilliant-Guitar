import {
  isCapabilityResult,
} from "../contracts/capability.ts";
import type {
  CapabilityResult,
  CapabilityTransportRequest,
} from "../contracts/capability.ts";
import type { ApplicationCapabilityInvoker } from "../contracts/application-capability.ts";
import { ApplicationCapabilityGatewayError } from "../services/application-capability-gateway.ts";
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

export class WorkbenchAgentCapabilityPort implements AgentCapabilityPort {
  private readonly host: ApplicationCapabilityInvoker;

  constructor(host: ApplicationCapabilityInvoker) {
    this.host = host;
  }

  async invoke(
    request: CapabilityTransportRequest,
    _context?: AgentCapabilityInvocationContext,
  ): Promise<CapabilityResult<unknown>> {
    let value: unknown;
    try {
      value = await this.host.invokeCapability(request);
    } catch (error) {
      if (error instanceof ApplicationCapabilityGatewayError) {
        throw new AgentCapabilityPortError(error.message, error.outcome);
      }
      throw new AgentCapabilityPortError("Agent Capability dispatch outcome is unknown", "unknown");
    }
    const isUnknown = (_data: unknown): _data is unknown => true;
    if (!isCapabilityResult(value, isUnknown)) throw new AgentCapabilityPortError(
      "Agent Capability returned an invalid result",
      "unknown",
    );
    if (value.invocationId !== request.invocationId
      || value.capabilityId !== request.capabilityId
      || value.contractVersion !== request.contractVersion) {
      throw new AgentCapabilityPortError(
        "Agent Capability result identity does not match the invocation",
        "unknown",
      );
    }
    return value;
  }
}
