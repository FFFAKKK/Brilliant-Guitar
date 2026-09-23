import {
  isScoreMeasureIndexInputV1,
  isScoreMeasureRangeInputV1,
  matchesCapabilityDocumentPrecondition,
} from "../contracts/capability.ts";
import type {
  CapabilityResult,
  CapabilityTransportRequest,
  ScoreMeasureIndexInputV1,
  ScoreMeasureRangeInputV1,
} from "../contracts/capability.ts";
import type { ScoreReadPort, ScoreReadResult } from "../services/score-read-port.ts";
import type { AgentCapabilityInvocationContext, AgentCapabilityPort } from "./capability-port.ts";
import { AgentCapabilityPortError } from "./capability-port.ts";

const DIRECT_READ_IDS = new Set([
  "score.read-summary",
  "score.read-metadata",
  "score.read-structure",
  "score.read-measure-index",
  "score.read-measure-range",
]);

function emptyInput(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === 0;
}

function identity(request: CapabilityTransportRequest) {
  return {
    invocationId: request.invocationId,
    capabilityId: request.capabilityId,
    contractVersion: request.contractVersion,
  } as const;
}

function projectTyped(request: CapabilityTransportRequest, result: ScoreReadResult<unknown>): CapabilityResult<unknown> {
  return result.status === "ready"
    ? Object.freeze({ ...identity(request), status: "completed", data: result.data })
    : Object.freeze({ ...identity(request), status: result.status, code: result.code, message: result.message });
}

function expectedDocument(
  request: CapabilityTransportRequest,
  context: AgentCapabilityInvocationContext | undefined,
): CapabilityTransportRequest["documentPrecondition"] {
  if (request.documentPrecondition !== null) return request.documentPrecondition;
  if (context === undefined
    || context.workspace.documentId === null
    || context.workspace.documentVersion === null) return null;
  return {
    documentId: context.workspace.documentId,
    documentVersion: context.workspace.documentVersion,
  };
}

/** Direct Tool Adapter for score queries; mutations remain on the compatibility port. */
export class DirectScoreReadAgentPort implements AgentCapabilityPort {
  readonly #fallback: AgentCapabilityPort;
  readonly #scoreRead: ScoreReadPort;

  constructor(fallback: AgentCapabilityPort, scoreRead: ScoreReadPort) {
    this.#fallback = fallback;
    this.#scoreRead = scoreRead;
  }

  async invoke(
    request: CapabilityTransportRequest,
    context?: AgentCapabilityInvocationContext,
  ): Promise<CapabilityResult<unknown>> {
    if (!DIRECT_READ_IDS.has(request.capabilityId)) return this.#fallback.invoke(request, context);
    if (request.contractVersion !== 1) {
      throw new AgentCapabilityPortError("Score read contract version is unsupported", "definite-failure");
    }
    if ((request.capabilityId === "score.read-summary"
      || request.capabilityId === "score.read-metadata"
      || request.capabilityId === "score.read-structure") && !emptyInput(request.input)) {
      throw new AgentCapabilityPortError("Score read input is invalid", "definite-failure");
    }
    if (request.capabilityId === "score.read-measure-index" && !isScoreMeasureIndexInputV1(request.input)) {
      throw new AgentCapabilityPortError("Score measure index input is invalid", "definite-failure");
    }
    if (request.capabilityId === "score.read-measure-range" && !isScoreMeasureRangeInputV1(request.input)) {
      throw new AgentCapabilityPortError("Score measure range input is invalid", "definite-failure");
    }

    const requestedDocument = expectedDocument(request, context);
    try {
      const result = request.capabilityId === "score.read-summary"
        ? await this.#scoreRead.readSummary(requestedDocument)
        : request.capabilityId === "score.read-metadata"
          ? await this.#scoreRead.readMetadata(requestedDocument)
          : request.capabilityId === "score.read-structure"
            ? await this.#scoreRead.readStructure(requestedDocument)
            : request.capabilityId === "score.read-measure-index"
              ? await this.#scoreRead.readMeasureIndex(
                request.input as ScoreMeasureIndexInputV1,
                requestedDocument,
              )
              : await this.#scoreRead.readMeasureRange(
                request.input as ScoreMeasureRangeInputV1,
                requestedDocument,
              );
      if (result.status === "ready"
        && !matchesCapabilityDocumentPrecondition(result.data, requestedDocument)) {
        throw new AgentCapabilityPortError(
          "Score read result does not match the requested document",
          "unknown",
        );
      }
      return projectTyped(request, result);
    } catch {
      throw new AgentCapabilityPortError("Score read outcome is unknown", "unknown");
    }
  }
}
