import {
  isCapabilityResult,
  isScoreSummaryV1,
} from "../contracts/capability.ts";
import type {
  CapabilityResult,
  CapabilityTransportRequest,
} from "../contracts/capability.ts";

interface CapabilityHost {
  invokeCapability(request: CapabilityTransportRequest): Promise<unknown>;
}

export interface AgentCapabilityPort {
  invoke(request: CapabilityTransportRequest): Promise<CapabilityResult<unknown>>;
}

export class AgentCapabilityPortError extends Error {
  readonly outcome: "definite-failure" | "unknown";

  constructor(message: string, outcome: "definite-failure" | "unknown") {
    super(message);
    this.outcome = outcome;
  }
}

type CapabilityResultDecoder = (value: unknown) => CapabilityResult<unknown> | null;

function decodeScoreSummary(value: unknown): CapabilityResult<unknown> | null {
  return isCapabilityResult(value, isScoreSummaryV1) ? value : null;
}

const FIRST_PARTY_RESULT_DECODERS: ReadonlyMap<string, CapabilityResultDecoder> = new Map([
  ["score.read-summary", decodeScoreSummary],
]);

export class WorkbenchAgentCapabilityPort implements AgentCapabilityPort {
  private readonly host: CapabilityHost;
  private readonly decoders: ReadonlyMap<string, CapabilityResultDecoder>;

  constructor(
    host: CapabilityHost,
    decoders: ReadonlyMap<string, CapabilityResultDecoder> = FIRST_PARTY_RESULT_DECODERS,
  ) {
    this.host = host;
    this.decoders = decoders;
  }

  async invoke(request: CapabilityTransportRequest): Promise<CapabilityResult<unknown>> {
    const decoder = this.decoders.get(request.capabilityId);
    if (decoder === undefined) throw new AgentCapabilityPortError(
      "Agent Capability result decoder is unavailable",
      "definite-failure",
    );
    let value: unknown;
    try {
      value = await this.host.invokeCapability(request);
    } catch {
      throw new AgentCapabilityPortError("Agent Capability dispatch outcome is unknown", "unknown");
    }
    const result = decoder(value);
    if (result === null) throw new AgentCapabilityPortError(
      "Agent Capability returned an invalid result",
      "unknown",
    );
    if (result.invocationId !== request.invocationId
      || result.capabilityId !== request.capabilityId
      || result.contractVersion !== request.contractVersion) {
      throw new AgentCapabilityPortError(
        "Agent Capability result identity does not match the invocation",
        "unknown",
      );
    }
    return result;
  }
}
