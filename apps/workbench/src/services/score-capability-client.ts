import {
  isCapabilityResult,
  isScoreSummaryV1,
} from "../contracts/capability.ts";
import type {
  CapabilityResult,
  CapabilityTransportRequest,
  ScoreSummaryV1,
} from "../contracts/capability.ts";

interface CapabilityHost {
  invokeCapability(request: CapabilityTransportRequest): Promise<unknown>;
}

const SCORE_READ_SUMMARY_ID = "score.read-summary";
const SCORE_READ_SUMMARY_VERSION = 1;

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
    const request: CapabilityTransportRequest = {
      invocationId: crypto.randomUUID(),
      capabilityId: SCORE_READ_SUMMARY_ID,
      contractVersion: SCORE_READ_SUMMARY_VERSION,
      workspaceId: this.workspaceId,
      input: {},
    };
    const result = await this.host.invokeCapability(request);
    if (!isCapabilityResult(result, isScoreSummaryV1)) {
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
