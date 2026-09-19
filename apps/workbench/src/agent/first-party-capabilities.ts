import type { AgentCapabilityDescriptor } from "./agent-contracts.ts";
import {
  isScoreMeasureRangeInputV1,
  isScorePrepareTempoChangeInputV1,
  isScoreReadMeasuresInputV1,
  isScoreUpdateMetadataInputV1,
  isScoreUpdateTitleInputV1,
} from "../contracts/capability.ts";

const emptyInput = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.keys(value).length === 0;
};

export const SCORE_READ_SUMMARY_DESCRIPTOR: AgentCapabilityDescriptor = {
  id: "score.read-summary",
  contractVersion: 1,
  name: "读取乐谱概要",
  description: "读取当前乐谱的文档标识、版本、标题和小节数量。",
  kind: "query",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSummary: "ScoreSummaryV1: documentId, documentVersion, title, measureCount",
  preconditions: ["当前工作区已打开乐谱"],
  sideEffects: {
    document: "read",
    filesystem: "none",
    network: "none",
    settings: "none",
    playback: "none",
  },
  scopeLimit: "document",
  requiresDocument: true,
  approvalRequirement: "risk-based",
  costClass: "constant",
  allowedPhases: ["planning", "executing", "verifying"],
  validateInput: emptyInput,
};

export const SCORE_READ_METADATA_DESCRIPTOR: AgentCapabilityDescriptor = {
  id: "score.read-metadata",
  contractVersion: 1,
  name: "读取乐谱元数据",
  description: "读取当前乐谱的文档标识、版本、标题、作者和速度。",
  kind: "query",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSummary: "ScoreMetadataV1: documentId, documentVersion, title, authors, tempoBpm",
  preconditions: ["当前工作区已打开乐谱"],
  sideEffects: {
    document: "read",
    filesystem: "none",
    network: "none",
    settings: "none",
    playback: "none",
  },
  scopeLimit: "document",
  requiresDocument: true,
  approvalRequirement: "risk-based",
  costClass: "constant",
  allowedPhases: ["planning", "executing", "verifying"],
  validateInput: emptyInput,
};

export const SCORE_READ_STRUCTURE_DESCRIPTOR: AgentCapabilityDescriptor = {
  id: "score.read-structure",
  contractVersion: 1,
  name: "读取乐谱结构",
  description: "读取当前乐谱的小节、声部和谱表数量，不返回音符或完整乐谱内容。",
  kind: "query",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSummary: "ScoreStructureV1: documentId, documentVersion, measureCount, partCount, staffCount",
  preconditions: ["当前工作区已打开乐谱"],
  sideEffects: {
    document: "read",
    filesystem: "none",
    network: "none",
    settings: "none",
    playback: "none",
  },
  scopeLimit: "document",
  requiresDocument: true,
  approvalRequirement: "risk-based",
  costClass: "constant",
  allowedPhases: ["planning", "executing", "verifying"],
  validateInput: emptyInput,
};

export const SCORE_READ_MEASURE_RANGE_DESCRIPTOR: AgentCapabilityDescriptor = {
  id: "score.read-measure-range",
  contractVersion: 1,
  name: "读取小节结构范围",
  description: "按稳定小节标识读取连续范围内的小节 ID、拍号和弱起信息，不返回声部或音符。",
  kind: "query",
  inputSchema: {
    type: "object",
    properties: {
      startMeasureId: { type: "string", minLength: 1, maxLength: 256 },
      endMeasureId: { type: "string", minLength: 1, maxLength: 256 },
      maxMeasures: { type: "integer", minimum: 1, maximum: 32 },
    },
    required: ["startMeasureId", "endMeasureId", "maxMeasures"],
    additionalProperties: false,
  },
  outputSummary: "ScoreMeasureRangeV1: document identity, normalized endpoints and bounded measure definitions",
  preconditions: ["当前工作区已打开乐谱", "范围端点是当前文档中的小节标识"],
  sideEffects: {
    document: "read",
    filesystem: "none",
    network: "none",
    settings: "none",
    playback: "none",
  },
  scopeLimit: "range",
  requiresDocument: true,
  approvalRequirement: "risk-based",
  costClass: "range",
  allowedPhases: ["planning", "executing", "verifying"],
  validateInput: isScoreMeasureRangeInputV1,
  estimateRangeUnits: (input) => isScoreMeasureRangeInputV1(input) ? input.maxMeasures : null,
};

export const SCORE_READ_MEASURES_DESCRIPTOR: AgentCapabilityDescriptor = {
  id: "score.read-measures",
  contractVersion: 1,
  name: "读取指定小节",
  description: "按小节序号、稳定标识或当前选择区读取连续小节的拍号和弱起信息。",
  kind: "query",
  inputSchema: {
    type: "object",
    properties: {
      reference: {
        oneOf: [
          {
            type: "object",
            properties: {
              kind: { const: "ordinal-range" },
              startOrdinal: { type: "integer", minimum: 1 },
              endOrdinal: { type: "integer", minimum: 1 },
            },
            required: ["kind", "startOrdinal", "endOrdinal"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { const: "stable-id-range" },
              startMeasureId: { type: "string", minLength: 1, maxLength: 256 },
              endMeasureId: { type: "string", minLength: 1, maxLength: 256 },
            },
            required: ["kind", "startMeasureId", "endMeasureId"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: { kind: { const: "current-selection" } },
            required: ["kind"],
            additionalProperties: false,
          },
        ],
      },
    },
    required: ["reference"],
    additionalProperties: false,
  },
  outputSummary: "ScoreMeasureRangeV1: resolved document identity, endpoints and bounded measure definitions",
  preconditions: ["当前工作区已打开乐谱", "引用可在当前文档版本中解析"],
  sideEffects: {
    document: "read",
    filesystem: "none",
    network: "none",
    settings: "none",
    playback: "none",
  },
  scopeLimit: "range",
  requiresDocument: true,
  approvalRequirement: "risk-based",
  costClass: "range",
  allowedPhases: ["planning", "executing", "verifying"],
  validateInput: isScoreReadMeasuresInputV1,
};

export const SCORE_UPDATE_TITLE_DESCRIPTOR: AgentCapabilityDescriptor = {
  id: "score.update-title",
  contractVersion: 1,
  name: "修改作品标题",
  description: "修改当前乐谱的作品标题，保留作者、速度和其他乐谱内容。",
  kind: "mutation",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 120 },
    },
    required: ["title"],
    additionalProperties: false,
  },
  outputSummary: "ScoreTitleUpdateV1: document identity, previous title, updated title and undo availability",
  preconditions: ["当前工作区已打开乐谱", "用户批准后文档版本仍与任务快照一致"],
  sideEffects: {
    document: "write",
    filesystem: "none",
    network: "none",
    settings: "none",
    playback: "none",
  },
  scopeLimit: "document",
  requiresDocument: true,
  approvalRequirement: "risk-based",
  costClass: "constant",
  allowedPhases: ["planning", "executing", "verifying"],
  validateInput: isScoreUpdateTitleInputV1,
  summarizeApproval: (input) => isScoreUpdateTitleInputV1(input)
    ? `将作品标题修改为《${input.title}》`
    : "将修改作品标题",
  previewApproval: (input) => isScoreUpdateTitleInputV1(input)
    ? {
        kind: "field-change",
        field: "score.title",
        before: null,
        after: input.title,
      }
    : null,
};

export const SCORE_UPDATE_TEMPO_DESCRIPTOR: AgentCapabilityDescriptor = {
  id: "score.update-tempo",
  contractVersion: 1,
  name: "修改作品速度",
  description: "修改当前乐谱的全局速度，保留标题、作者和其他乐谱内容。",
  kind: "mutation",
  inputSchema: {
    type: "object",
    properties: {
      tempoBpm: { type: "number", exclusiveMinimum: 0 },
    },
    required: ["tempoBpm"],
    additionalProperties: false,
  },
  outputSummary: "ScoreTempoUpdateV1: committed ChangeSet identity, before and after tempo, document version and undo availability",
  preconditions: ["当前工作区已打开乐谱", "用户批准由当前文档版本准备的精确变更集"],
  sideEffects: {
    document: "write",
    filesystem: "none",
    network: "none",
    settings: "none",
    playback: "none",
  },
  scopeLimit: "document",
  requiresDocument: true,
  approvalRequirement: "risk-based",
  costClass: "constant",
  allowedPhases: ["planning", "executing", "verifying"],
  executionMode: "prepared-change-set",
  validateInput: isScorePrepareTempoChangeInputV1,
  summarizeApproval: (input) => isScorePrepareTempoChangeInputV1(input)
    ? `将作品速度修改为 ${input.tempoBpm} BPM`
    : "将修改作品速度",
};

export const SCORE_UPDATE_METADATA_DESCRIPTOR: AgentCapabilityDescriptor = {
  id: "score.update-metadata",
  contractVersion: 1,
  name: "修改作品元数据",
  description: "在一个原子事务中修改当前乐谱的标题、全局速度或两者。",
  kind: "mutation",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 120 },
      tempoBpm: { type: "number", exclusiveMinimum: 0 },
    },
    minProperties: 1,
    additionalProperties: false,
  },
  outputSummary: "ScoreMetadataTransactionUpdateV1: committed ChangeSet identity, applied operations, exact before and after snapshots, document version and undo availability",
  preconditions: ["当前工作区已打开乐谱", "用户批准由当前文档版本准备的完整元数据事务"],
  sideEffects: {
    document: "write",
    filesystem: "none",
    network: "none",
    settings: "none",
    playback: "none",
  },
  scopeLimit: "document",
  requiresDocument: true,
  approvalRequirement: "risk-based",
  costClass: "constant",
  allowedPhases: ["planning", "executing", "verifying"],
  executionMode: "prepared-change-set",
  validateInput: isScoreUpdateMetadataInputV1,
  summarizeApproval: (input) => isScoreUpdateMetadataInputV1(input)
    ? `将在一个事务中修改作品的 ${Object.keys(input).length} 项元数据`
    : "将修改作品元数据",
};

export const FIRST_PARTY_CAPABILITY_CATALOG: readonly AgentCapabilityDescriptor[] = [
  SCORE_READ_SUMMARY_DESCRIPTOR,
  SCORE_READ_METADATA_DESCRIPTOR,
  SCORE_READ_STRUCTURE_DESCRIPTOR,
  SCORE_READ_MEASURES_DESCRIPTOR,
  SCORE_UPDATE_TITLE_DESCRIPTOR,
  SCORE_UPDATE_TEMPO_DESCRIPTOR,
  SCORE_UPDATE_METADATA_DESCRIPTOR,
];
