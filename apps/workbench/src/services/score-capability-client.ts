import {
  isCapabilityResult,
  isScoreMeasureIndexV1,
  isScoreMeasureRangeV1,
  isScoreMetadataV1,
  isScoreSummaryV1,
  isScoreStructureV1,
} from "../contracts/capability.ts";
import type {
  CapabilityResult,
  CapabilityTransportRequest,
  ScoreMeasureIndexInputV1,
  ScoreMeasureIndexV1,
  ScoreMeasureRangeInputV1,
  ScoreMeasureRangeV1,
  ScoreMetadataV1,
  ScoreSummaryV1,
  ScoreStructureV1,
} from "../contracts/capability.ts";

interface CapabilityHost {
  invokeCapability(request: CapabilityTransportRequest): Promise<unknown>;
}

const SCORE_READ_SUMMARY_ID = "score.read-summary";
const SCORE_READ_METADATA_ID = "score.read-metadata";
const SCORE_READ_STRUCTURE_ID = "score.read-structure";
const SCORE_READ_MEASURE_INDEX_ID = "score.read-measure-index";
const SCORE_READ_MEASURE_RANGE_ID = "score.read-measure-range";
const SCORE_READ_SUMMARY_VERSION = 1;
const SCORE_READ_METADATA_VERSION = 1;
const SCORE_READ_STRUCTURE_VERSION = 1;
const SCORE_READ_MEASURE_INDEX_VERSION = 1;
const SCORE_READ_MEASURE_RANGE_VERSION = 1;

export class ScoreCapabilityClient {
  private readonly host: CapabilityHost;
  private readonly workspaceId: string;

  constructor(
    host: CapabilityHost,
    workspaceId: string,
  ) {
    this.host = host;
    this.workspaceId = workspaceId;
  }

  async readSummary(): Promise<CapabilityResult<ScoreSummaryV1>> {
    return this.invoke(SCORE_READ_SUMMARY_ID, SCORE_READ_SUMMARY_VERSION, {}, isScoreSummaryV1);
  }

  async readMetadata(): Promise<CapabilityResult<ScoreMetadataV1>> {
    return this.invoke(SCORE_READ_METADATA_ID, SCORE_READ_METADATA_VERSION, {}, isScoreMetadataV1);
  }

  async readStructure(): Promise<CapabilityResult<ScoreStructureV1>> {
    return this.invoke(SCORE_READ_STRUCTURE_ID, SCORE_READ_STRUCTURE_VERSION, {}, isScoreStructureV1);
  }

  async readMeasureIndex(
    input: ScoreMeasureIndexInputV1,
  ): Promise<CapabilityResult<ScoreMeasureIndexV1>> {
    return this.invoke(
      SCORE_READ_MEASURE_INDEX_ID,
      SCORE_READ_MEASURE_INDEX_VERSION,
      input,
      isScoreMeasureIndexV1,
    );
  }

  async readMeasureRange(
    input: ScoreMeasureRangeInputV1,
  ): Promise<CapabilityResult<ScoreMeasureRangeV1>> {
    return this.invoke(
      SCORE_READ_MEASURE_RANGE_ID,
      SCORE_READ_MEASURE_RANGE_VERSION,
      input,
      isScoreMeasureRangeV1,
    );
  }

  private async invoke<T>(
    capabilityId: string,
    contractVersion: number,
    input: unknown,
    isData: (value: unknown) => value is T,
  ): Promise<CapabilityResult<T>> {
    const request: CapabilityTransportRequest = {
      invocationId: crypto.randomUUID(),
      capabilityId,
      contractVersion,
      workspaceId: this.workspaceId,
      input,
    };
    const result = await this.host.invokeCapability(request);
    if (!isCapabilityResult(result, isData)) {
      throw new Error("能力调用结果无效");
    }
    if (result.invocationId !== request.invocationId
      || result.capabilityId !== request.capabilityId
      || result.contractVersion !== request.contractVersion) {
      throw new Error("能力调用结果与请求不匹配");
    }
    return result;
  }
}
