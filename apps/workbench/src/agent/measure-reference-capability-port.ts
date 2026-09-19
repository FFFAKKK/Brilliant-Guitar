import {
  isScoreReadMeasuresInputV1,
} from "../contracts/capability.ts";
import type {
  CapabilityResult,
  CapabilityTransportRequest,
  ScoreMeasureRangeV1,
} from "../contracts/capability.ts";
import type {
  AgentCapabilityInvocationContext,
  AgentCapabilityPort,
} from "./capability-port.ts";
import { AgentCapabilityPortError } from "./capability-port.ts";
import type { MeasureReferenceReadResult } from "./measure-reference-read-service.ts";
import { MeasureReferenceReadService } from "./measure-reference-read-service.ts";

const SCORE_READ_MEASURES_ID = "score.read-measures";
const SCORE_READ_MEASURES_VERSION = 1;

function identity(request: CapabilityTransportRequest) {
  return {
    invocationId: request.invocationId,
    capabilityId: request.capabilityId,
    contractVersion: request.contractVersion,
  };
}

function projectResult(
  request: CapabilityTransportRequest,
  result: MeasureReferenceReadResult,
): CapabilityResult<ScoreMeasureRangeV1> {
  if (result.status === "completed") {
    return Object.freeze({
      ...identity(request),
      status: "completed",
      data: result.data,
    });
  }
  if (result.status === "unresolved") {
    return Object.freeze({
      ...identity(request),
      status: "rejected",
      code: result.resolution.code,
      message: result.resolution.message,
    });
  }
  return Object.freeze({
    ...identity(request),
    status: result.retryable ? "unavailable" : "failed",
    code: result.code,
    message: result.message,
  });
}

/** Resolves model-facing measure references without exposing internal index capabilities. */
export class MeasureReferenceAgentCapabilityPort implements AgentCapabilityPort {
  readonly #delegate: AgentCapabilityPort;
  readonly #service: MeasureReferenceReadService;

  constructor(delegate: AgentCapabilityPort, service: MeasureReferenceReadService) {
    this.#delegate = delegate;
    this.#service = service;
  }

  async invoke(
    request: CapabilityTransportRequest,
    context?: AgentCapabilityInvocationContext,
  ): Promise<CapabilityResult<unknown>> {
    if (request.capabilityId !== SCORE_READ_MEASURES_ID) {
      return this.#delegate.invoke(request, context);
    }
    if (request.contractVersion !== SCORE_READ_MEASURES_VERSION) {
      throw new AgentCapabilityPortError(
        "Composite measure Capability contract version is unsupported",
        "definite-failure",
      );
    }
    if (!isScoreReadMeasuresInputV1(request.input)) {
      throw new AgentCapabilityPortError(
        "Composite measure Capability input is invalid",
        "definite-failure",
      );
    }
    if (context === undefined
      || context.workspace.workspaceId !== request.workspaceId
      || context.workspace.documentId === null
      || context.workspace.documentVersion === null) {
      throw new AgentCapabilityPortError(
        "Composite measure Capability invocation context is unavailable",
        "definite-failure",
      );
    }

    const selection = context.workspace.selection?.kind === "measure-range"
      ? context.workspace.selection
      : null;
    const result = await this.#service.read({
      workspaceId: request.workspaceId,
      documentId: context.workspace.documentId,
      documentVersion: context.workspace.documentVersion,
      reference: request.input.reference,
      selection,
      rangeBudget: context.rangeBudget,
    });
    return projectResult(request, result);
  }
}
