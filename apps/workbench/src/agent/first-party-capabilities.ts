import type { AgentCapabilityDescriptor } from "./agent-contracts.ts";

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

export const FIRST_PARTY_CAPABILITY_CATALOG: readonly AgentCapabilityDescriptor[] = [
  SCORE_READ_SUMMARY_DESCRIPTOR,
];
