import {
  isCapabilityResult,
  isScoreMeasureIndexInputV1,
  isScoreMeasureRangeInputV1,
} from "../contracts/capability.ts";
import type {
  CapabilityResult,
  CapabilityTransportRequest,
  ScoreMeasureIndexInputV1,
  ScoreMeasureIndexV1,
  ScoreMeasureRangeInputV1,
  ScoreMeasureRangeV1,
  ScoreMetadataV1,
  ScoreStructureV1,
  ScoreSummaryV1,
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

/** Minimal host surface; the adapter does not depend on Agent session orchestration. */
export interface DirectScoreReadHost {
  scoreReadPort?(): ScoreReadPort;
  readScoreSummary?(): Promise<CapabilityResult<ScoreSummaryV1>>;
  readScoreMetadata?(): Promise<CapabilityResult<ScoreMetadataV1>>;
  readScoreStructure?(): Promise<CapabilityResult<ScoreStructureV1>>;
  readScoreMeasureIndex(input: ScoreMeasureIndexInputV1): Promise<CapabilityResult<ScoreMeasureIndexV1>>;
  readScoreMeasureRange(input: ScoreMeasureRangeInputV1): Promise<CapabilityResult<ScoreMeasureRangeV1>>;
}

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

function rebindLegacy<T>(request: CapabilityTransportRequest, result: unknown): CapabilityResult<T> {
  if (!isCapabilityResult(result, (_data): _data is T => true)) {
    throw new AgentCapabilityPortError("Score read returned an invalid result", "unknown");
  }
  return result.status === "completed"
    ? Object.freeze({ ...identity(request), status: "completed", data: result.data })
    : Object.freeze({ ...identity(request), status: result.status, code: result.code, message: result.message });
}

function projectTyped(request: CapabilityTransportRequest, result: ScoreReadResult<unknown>): CapabilityResult<unknown> {
  return result.status === "ready"
    ? Object.freeze({ ...identity(request), status: "completed", data: result.data })
    : Object.freeze({ ...identity(request), status: result.status, code: result.code, message: result.message });
}

/** Direct Tool Adapter for score queries; mutations remain on the compatibility port. */
export class DirectScoreReadAgentPort implements AgentCapabilityPort {
  readonly #fallback: AgentCapabilityPort;
  readonly #host: DirectScoreReadHost;

  constructor(fallback: AgentCapabilityPort, host: DirectScoreReadHost) {
    this.#fallback = fallback;
    this.#host = host;
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

    let typed: ScoreReadPort | undefined;
    try {
      typed = this.#host.scoreReadPort?.();
    } catch {
      throw new AgentCapabilityPortError("Score read port is unavailable", "unknown");
    }
    if (typed !== undefined) {
      try {
        const result = request.capabilityId === "score.read-summary"
          ? await typed.readSummary()
          : request.capabilityId === "score.read-metadata"
            ? await typed.readMetadata()
            : request.capabilityId === "score.read-structure"
              ? await typed.readStructure()
              : request.capabilityId === "score.read-measure-index"
                ? await typed.readMeasureIndex(request.input as ScoreMeasureIndexInputV1)
                : await typed.readMeasureRange(request.input as ScoreMeasureRangeInputV1);
        return projectTyped(request, result);
      } catch {
        throw new AgentCapabilityPortError("Score read outcome is unknown", "unknown");
      }
    }

    if (request.capabilityId === "score.read-summary") {
      if (this.#host.readScoreSummary === undefined) return this.#fallback.invoke(request, context);
      try { return rebindLegacy(request, await this.#host.readScoreSummary()); }
      catch { throw new AgentCapabilityPortError("Score read outcome is unknown", "unknown"); }
    }
    if (request.capabilityId === "score.read-metadata") {
      if (this.#host.readScoreMetadata === undefined) return this.#fallback.invoke(request, context);
      try { return rebindLegacy(request, await this.#host.readScoreMetadata()); }
      catch { throw new AgentCapabilityPortError("Score read outcome is unknown", "unknown"); }
    }
    if (request.capabilityId === "score.read-structure") {
      if (this.#host.readScoreStructure === undefined) return this.#fallback.invoke(request, context);
      try { return rebindLegacy(request, await this.#host.readScoreStructure()); }
      catch { throw new AgentCapabilityPortError("Score read outcome is unknown", "unknown"); }
    }
    if (request.capabilityId === "score.read-measure-index") {
      try {
        return rebindLegacy(request, await this.#host.readScoreMeasureIndex(request.input as ScoreMeasureIndexInputV1));
      }
      catch { throw new AgentCapabilityPortError("Score read outcome is unknown", "unknown"); }
    }
    try {
      return rebindLegacy(request, await this.#host.readScoreMeasureRange(request.input as ScoreMeasureRangeInputV1));
    }
    catch { throw new AgentCapabilityPortError("Score read outcome is unknown", "unknown"); }
  }
}
