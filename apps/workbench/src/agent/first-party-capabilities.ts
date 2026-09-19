import type { AgentCapabilityDescriptor } from "./agent-contracts.ts";
import {
  isScoreMeasureRangeInputV1,
  isScoreReadMeasuresInputV1,
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
  requiresApproval: false,
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
  requiresApproval: false,
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
  requiresApproval: false,
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
  requiresApproval: false,
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
  requiresApproval: false,
  costClass: "range",
  allowedPhases: ["planning", "executing", "verifying"],
  validateInput: isScoreReadMeasuresInputV1,
};

export const FIRST_PARTY_CAPABILITY_CATALOG: readonly AgentCapabilityDescriptor[] = [
  SCORE_READ_SUMMARY_DESCRIPTOR,
  SCORE_READ_METADATA_DESCRIPTOR,
  SCORE_READ_STRUCTURE_DESCRIPTOR,
  SCORE_READ_MEASURES_DESCRIPTOR,
];
