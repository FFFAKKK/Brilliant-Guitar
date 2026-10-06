import type { AgentProviderRequest } from "../src/agent/provider.ts";
import { ToolsetResolver } from "../src/agent/toolset-resolver.ts";
import { FIRST_PARTY_CAPABILITY_CATALOG } from "../src/agent/first-party-capabilities.ts";

export const policy = {
  policyVersion: 1, allowedCapabilityIds: ["score.read-summary"], allowedKinds: ["query"],
  maxToolsPerTurn: 1, maxCostClass: "constant", approvalMode: "disallow",
} as const;

export const providerRequest: AgentProviderRequest = {
  runId: "run-external-1", turnId: "turn-1", goal: "读取当前乐谱摘要\n只读，不修改。",
  runState: { lifecycle: "active", phase: "planning" },
  context: {
    contextItems: [{ contextItemId: "context-1", kind: "authoritative-fact", content: { text: "版本 7" },
      sourceType: "score", sourceId: "score-1", documentId: "score-1", documentVersion: 7,
      scope: "document", trustLevel: "authoritative", priority: "required", createdAt: 1, expiresAt: null, estimatedTokens: 4 }],
    omittedItems: [], versionWarnings: [],
    budget: { estimatedTokens: 4, itemCount: 1, tokenBudget: 400, itemCountBudget: 16, exceeded: false },
  },
  toolset: new ToolsetResolver().resolve({ runState: { lifecycle: "active", phase: "planning" }, policy,
    intent: { kind: "read", requestedCapabilityIds: ["score.read-summary"], scope: "document" },
    hasDocument: true, rangeBudget: 32, catalog: FIRST_PARTY_CAPABILITY_CATALOG }).snapshot,
};
