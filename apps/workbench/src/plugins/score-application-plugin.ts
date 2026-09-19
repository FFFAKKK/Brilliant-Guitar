import {
  isScoreCommitMetadataTransactionInputV1,
  isScoreCommitTempoChangeInputV1,
  isScoreMeasureIndexInputV1,
  isScoreMeasureIndexV1,
  isScoreMeasureRangeInputV1,
  isScoreMeasureRangeV1,
  isScoreMetadataTransactionChangeSetV1,
  isScoreMetadataTransactionUpdateV1,
  isScoreMetadataV1,
  isScorePrepareTempoChangeInputV1,
  isScoreStructureV1,
  isScoreSummaryV1,
  isScoreTempoChangeSetV1,
  isScoreTempoUpdateV1,
  isScoreTitleUpdateV1,
  isScoreUpdateMetadataInputV1,
  isScoreUpdateTitleInputV1,
} from "../contracts/capability.ts";
import type { ApplicationCapabilityContribution } from "../contracts/application-capability.ts";
import type { WorkflowContribution } from "../contracts/workflow.ts";
import { definePlugin } from "./plugin-sdk.ts";

function emptyInput(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === 0;
}

const SCORE_APPLICATION_CAPABILITIES: readonly ApplicationCapabilityContribution[] = [
  { id: "score.read-summary", contractVersion: 1, callers: ["ui", "agent"],
    validateInput: emptyInput, validateOutput: isScoreSummaryV1 },
  { id: "score.read-metadata", contractVersion: 1, callers: ["ui", "agent"],
    validateInput: emptyInput, validateOutput: isScoreMetadataV1 },
  { id: "score.read-structure", contractVersion: 1, callers: ["ui", "agent"],
    validateInput: emptyInput, validateOutput: isScoreStructureV1 },
  { id: "score.read-measure-index", contractVersion: 1, callers: ["ui", "agent"],
    validateInput: isScoreMeasureIndexInputV1, validateOutput: isScoreMeasureIndexV1 },
  { id: "score.read-measure-range", contractVersion: 1, callers: ["ui", "agent"],
    validateInput: isScoreMeasureRangeInputV1, validateOutput: isScoreMeasureRangeV1 },
  { id: "score.update-title", contractVersion: 1, callers: ["agent"],
    validateInput: isScoreUpdateTitleInputV1, validateOutput: isScoreTitleUpdateV1 },
  { id: "score.prepare-tempo-change", contractVersion: 1, callers: ["agent"],
    validateInput: isScorePrepareTempoChangeInputV1, validateOutput: isScoreTempoChangeSetV1 },
  { id: "score.commit-tempo-change", contractVersion: 1, callers: ["agent"],
    validateInput: isScoreCommitTempoChangeInputV1, validateOutput: isScoreTempoUpdateV1 },
  { id: "score.prepare-metadata-transaction", contractVersion: 1, callers: ["agent"],
    validateInput: isScoreUpdateMetadataInputV1, validateOutput: isScoreMetadataTransactionChangeSetV1 },
  { id: "score.commit-metadata-transaction", contractVersion: 1, callers: ["agent"],
    validateInput: isScoreCommitMetadataTransactionInputV1,
    validateOutput: isScoreMetadataTransactionUpdateV1 },
];

/** Domain-sized workflows. Atomic prepare/commit operations remain implementation details. */
export const SCORE_WORKFLOWS: readonly WorkflowContribution[] = [
  {
    id: "score.inspect",
    contractVersion: 1,
    name: "检查乐谱",
    description: "按任务需要读取乐谱概要、元数据、结构或有界小节范围。",
    runtime: "agent-orchestration-v1",
    operationIds: [
      "score.read-summary",
      "score.read-metadata",
      "score.read-structure",
      "score.read-measures",
    ],
    entryOperationIds: [
      "score.read-summary",
      "score.read-metadata",
      "score.read-structure",
      "score.read-measures",
    ],
  },
  {
    id: "score.edit-metadata",
    contractVersion: 1,
    name: "编辑作品元数据",
    description: "在审批、版本前置条件和完成校验保护下修改标题、速度或组合元数据。",
    runtime: "agent-orchestration-v1",
    operationIds: [
      "score.read-metadata",
      "score.update-title",
      "score.update-tempo",
      "score.update-metadata",
    ],
    entryOperationIds: [
      "score.update-title",
      "score.update-tempo",
      "score.update-metadata",
    ],
  },
];

/** Trusted application operations owned by the score plugin, with no UI dependency. */
export const SCORE_APPLICATION_PLUGIN = definePlugin({
  id: "brilliant.score",
  name: "乐谱核心能力",
  version: "1.0.0",
  applicationCapabilities: SCORE_APPLICATION_CAPABILITIES,
  workflows: SCORE_WORKFLOWS,
});
