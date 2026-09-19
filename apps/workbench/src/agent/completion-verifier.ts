import {
  isScoreCommitMetadataTransactionInputV1,
  isScoreMetadataV1,
  isScoreMetadataTransactionUpdateV1,
  isScoreMeasureRangeV1,
  isScoreCommitTempoChangeInputV1,
  isScorePrepareTempoChangeInputV1,
  isScoreStructureV1,
  isScoreSummaryV1,
  isScoreTitleUpdateV1,
  isScoreTempoUpdateV1,
  isScoreUpdateTitleInputV1,
  isScoreUpdateMetadataInputV1,
} from "../contracts/capability.ts";
import type { CapabilityResult } from "../contracts/capability.ts";
import type { AgentContextItem } from "./agent-contracts.ts";
import type { AgentInvocationState } from "./invocation-state.ts";
import { isAgentPreparedExecution } from "./prepared-mutation.ts";
import type { AgentPreparedExecution } from "./prepared-mutation.ts";

export interface AgentCompletionInvocation {
  readonly invocationId: string;
  readonly capabilityId: string;
  readonly input: unknown;
  readonly preparedExecution?: AgentPreparedExecution | null;
  readonly baseDocumentVersion: number | null;
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

export const verifyScoreTitleUpdateCompletion: AgentCompletionVerifier = (input) => {
  const invocation = input.invocations.find((item) => item.capabilityId === "score.update-title"
    && item.state.status === "succeeded"
    && item.result?.status === "completed");
  const result = invocation?.result;
  if (invocation === undefined
    || result?.status !== "completed"
    || !isScoreUpdateTitleInputV1(invocation.input)
    || !isScoreTitleUpdateV1(result.data)) {
    return {
      satisfied: false,
      reason: "缺少经过验证的标题修改结果",
      evidence: [],
    };
  }
  if (result.data.title !== invocation.input.title) {
    return {
      satisfied: false,
      reason: "标题修改结果与已批准的目标标题不一致",
      evidence: [],
    };
  }
  if (invocation.baseDocumentVersion === null
    || result.data.documentVersion !== invocation.baseDocumentVersion + 1) {
    return {
      satisfied: false,
      reason: "标题修改没有产生预期的单次文档版本变更",
      evidence: [],
    };
  }
  if (!result.data.undoAvailable) {
    return {
      satisfied: false,
      reason: "标题修改完成后没有可用的撤销记录",
      evidence: [],
    };
  }
  return {
    satisfied: true,
    reason: "作品标题与已批准目标一致，文档版本和撤销记录均已确认",
    evidence: [
      invocation.invocationId,
      `${result.data.documentId}@${result.data.documentVersion}`,
      `score.title=${result.data.title}`,
    ],
  };
};

export const verifyScoreTempoUpdateCompletion: AgentCompletionVerifier = (input) => {
  const invocation = input.invocations.find((item) => item.capabilityId === "score.update-tempo"
    && item.state.status === "succeeded"
    && item.result?.status === "completed");
  const result = invocation?.result;
  const prepared = invocation?.preparedExecution;
  if (invocation === undefined
    || result?.status !== "completed"
    || !isScorePrepareTempoChangeInputV1(invocation.input)
    || !isAgentPreparedExecution(prepared)
    || !isScoreCommitTempoChangeInputV1(prepared.commit.input)
    || !isScoreTempoUpdateV1(result.data)) {
    return {
      satisfied: false,
      reason: "缺少经过验证的速度修改结果",
      evidence: [],
    };
  }
  const changeSet = prepared.commit.input.changeSet;
  if (changeSet.afterTempoBpm !== invocation.input.tempoBpm
    || result.data.changeSetId !== prepared.changeSetId
    || result.data.changeSetId !== changeSet.changeSetId
    || result.data.previousTempoBpm !== changeSet.beforeTempoBpm
    || result.data.tempoBpm !== changeSet.afterTempoBpm) {
    return {
      satisfied: false,
      reason: "速度修改结果与已批准的变更集不一致",
      evidence: [],
    };
  }
  if (invocation.baseDocumentVersion !== changeSet.baseDocumentVersion
    || result.data.documentId !== changeSet.documentId
    || result.data.documentVersion !== changeSet.baseDocumentVersion + 1) {
    return {
      satisfied: false,
      reason: "速度修改没有产生预期的单次文档版本变更",
      evidence: [],
    };
  }
  if (!result.data.undoAvailable) {
    return {
      satisfied: false,
      reason: "速度修改完成后没有可用的撤销记录",
      evidence: [],
    };
  }
  return {
    satisfied: true,
    reason: "作品速度与已批准变更集一致，文档版本和撤销记录均已确认",
    evidence: [
      invocation.invocationId,
      prepared.changeSetId,
      `${result.data.documentId}@${result.data.documentVersion}`,
      `score.tempo=${result.data.tempoBpm}`,
    ],
  };
};

export const verifyScoreMetadataTransactionCompletion: AgentCompletionVerifier = (input) => {
  const invocation = input.invocations.find((item) => item.capabilityId === "score.update-metadata"
    && item.state.status === "succeeded"
    && item.result?.status === "completed");
  const result = invocation?.result;
  const prepared = invocation?.preparedExecution;
  if (invocation === undefined
    || result?.status !== "completed"
    || !isScoreUpdateMetadataInputV1(invocation.input)
    || !isAgentPreparedExecution(prepared)
    || !isScoreCommitMetadataTransactionInputV1(prepared.commit.input)
    || !isScoreMetadataTransactionUpdateV1(result.data)) {
    return {
      satisfied: false,
      reason: "缺少经过验证的作品元数据事务结果",
      evidence: [],
    };
  }
  const changeSet = prepared.commit.input.changeSet;
  if (invocation.input.title !== undefined && changeSet.after.title !== invocation.input.title
    || invocation.input.tempoBpm !== undefined
      && changeSet.after.tempoBpm !== invocation.input.tempoBpm
    || result.data.changeSetId !== prepared.changeSetId
    || result.data.changeSetId !== changeSet.changeSetId
    || result.data.previous.title !== changeSet.before.title
    || result.data.previous.tempoBpm !== changeSet.before.tempoBpm
    || result.data.current.title !== changeSet.after.title
    || result.data.current.tempoBpm !== changeSet.after.tempoBpm
    || result.data.appliedOperations.length !== changeSet.operations.length
    || !result.data.appliedOperations.every(
      (operation, index) => operation === changeSet.operations[index],
    )) {
    return {
      satisfied: false,
      reason: "作品元数据事务结果与已批准的变更集不一致",
      evidence: [],
    };
  }
  if (invocation.baseDocumentVersion !== changeSet.baseDocumentVersion
    || result.data.documentId !== changeSet.documentId
    || result.data.documentVersion !== changeSet.baseDocumentVersion + 1) {
    return {
      satisfied: false,
      reason: "作品元数据事务没有产生预期的单次文档版本变更",
      evidence: [],
    };
  }
  if (!result.data.undoAvailable) {
    return {
      satisfied: false,
      reason: "作品元数据事务完成后没有可用的单步撤销记录",
      evidence: [],
    };
  }
  return {
    satisfied: true,
    reason: "作品元数据事务与已批准变更集一致，原子版本变更和撤销记录均已确认",
    evidence: [
      invocation.invocationId,
      prepared.changeSetId,
      `${result.data.documentId}@${result.data.documentVersion}`,
      `operations=${result.data.appliedOperations.join(",")}`,
    ],
  };
};
