import {
  isCapabilityResult,
  isScoreMeasureRangeV1,
  isScoreMetadataV1,
  isScoreSummaryV1,
  isScoreStructureV1,
} from "../contracts/capability.ts";
import type {
  CapabilityResult,
  CapabilityTransportRequest,
} from "../contracts/capability.ts";
import type { AgentWorkspaceScope } from "./agent-contracts.ts";

interface CapabilityHost {
  invokeAgentCapability(request: CapabilityTransportRequest): Promise<unknown>;
}

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

type CapabilityResultDecoder = (value: unknown) => CapabilityResult<unknown> | null;

function decodeScoreSummary(value: unknown): CapabilityResult<unknown> | null {
  return isCapabilityResult(value, isScoreSummaryV1) ? value : null;
}

function decodeScoreMetadata(value: unknown): CapabilityResult<unknown> | null {
  return isCapabilityResult(value, isScoreMetadataV1) ? value : null;
}

function decodeScoreStructure(value: unknown): CapabilityResult<unknown> | null {
  return isCapabilityResult(value, isScoreStructureV1) ? value : null;
}

function decodeScoreMeasureRange(value: unknown): CapabilityResult<unknown> | null {
  return isCapabilityResult(value, isScoreMeasureRangeV1) ? value : null;
}

const FIRST_PARTY_RESULT_DECODERS: ReadonlyMap<string, CapabilityResultDecoder> = new Map([
  ["score.read-summary", decodeScoreSummary],
  ["score.read-metadata", decodeScoreMetadata],
  ["score.read-structure", decodeScoreStructure],
  ["score.read-measure-range", decodeScoreMeasureRange],
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

  async invoke(
    request: CapabilityTransportRequest,
    _context?: AgentCapabilityInvocationContext,
  ): Promise<CapabilityResult<unknown>> {
    const decoder = this.decoders.get(request.capabilityId);
    if (decoder === undefined) throw new AgentCapabilityPortError(
      "Agent Capability result decoder is unavailable",
      "definite-failure",
    );
    let value: unknown;
    try {
      value = await this.host.invokeAgentCapability(request);
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
