import {
  isScoreMetadataV1,
  isScoreMeasureRangeV1,
  isScoreStructureV1,
  isScoreSummaryV1,
} from "../contracts/capability.ts";
import type { CapabilityResult } from "../contracts/capability.ts";
import type { AgentContextItem } from "./agent-contracts.ts";
import type { AgentInvocationState } from "./invocation-state.ts";

export interface AgentCompletionInvocation {
  readonly invocationId: string;
  readonly capabilityId: string;
  readonly state: AgentInvocationState;
  readonly result: CapabilityResult<unknown> | null;
}

export interface AgentCompletionVerification {
  readonly satisfied: boolean;
  readonly reason: string;
  readonly evidence: readonly string[];
}

export interface AgentCompletionInput {
  readonly goal: string;
  readonly contextItems: readonly AgentContextItem[];
  readonly invocations: readonly AgentCompletionInvocation[];
}

export type AgentCompletionVerifier = (
  input: AgentCompletionInput,
) => AgentCompletionVerification;

function verifyCapabilityCompletion(
  input: AgentCompletionInput,
  capabilityId: string,
  isData: (value: unknown) => boolean,
  missingReason: string,
  successReason: string,
): AgentCompletionVerification {
  const invocation = input.invocations.find((item) => item.capabilityId === capabilityId
    && item.state.status === "succeeded"
    && item.result?.status === "completed"
    && isData(item.result.data));
  if (invocation === undefined || invocation.result?.status !== "completed"
    || !isData(invocation.result.data)) {
    return {
      satisfied: false,
      reason: missingReason,
      evidence: [],
    };
  }
  const identity = invocation.result.data as { documentId: string; documentVersion: number };
  return {
    satisfied: true,
    reason: successReason,
    evidence: [
      invocation.invocationId,
      `${identity.documentId}@${identity.documentVersion}`,
    ],
  };
}

export const verifyScoreSummaryCompletion: AgentCompletionVerifier = (input) => verifyCapabilityCompletion(
  input,
  "score.read-summary",
  isScoreSummaryV1,
  "缺少经过验证的乐谱概要结果",
  "乐谱概要已由应用能力读取并通过合同校验",
);

export const verifyScoreMetadataCompletion: AgentCompletionVerifier = (input) => verifyCapabilityCompletion(
  input,
  "score.read-metadata",
  isScoreMetadataV1,
  "缺少经过验证的乐谱元数据结果",
  "乐谱元数据已由应用能力读取并通过合同校验",
);

export const verifyScoreStructureCompletion: AgentCompletionVerifier = (input) => verifyCapabilityCompletion(
  input,
  "score.read-structure",
  isScoreStructureV1,
  "缺少经过验证的乐谱结构结果",
  "乐谱结构已由应用能力读取并通过合同校验",
);

export const verifyScoreMeasureRangeCompletion: AgentCompletionVerifier = (input) => verifyCapabilityCompletion(
  input,
  "score.read-measure-range",
  isScoreMeasureRangeV1,
  "缺少经过验证的小节范围结果",
  "小节范围已由应用能力读取并通过合同校验",
);

export const verifyScoreMeasuresCompletion: AgentCompletionVerifier = (input) => verifyCapabilityCompletion(
  input,
  "score.read-measures",
  isScoreMeasureRangeV1,
  "缺少经过验证的引用小节读取结果",
  "小节引用已由控制面解析，读取结果已通过合同校验",
);
