import type {
  AgentContextItem,
  ContextBuildInput,
  ContextBuildResult,
  ContextPriority,
  ContextVersionWarning,
  OmittedContextItem,
} from "./agent-contracts.ts";
import { conversationContent, isInvocationContext } from "./context-identity.ts";
import { freezeContextSelectionReport, STANDALONE_CONTEXT_POLICY, type ContextSelectionPlan, type ContextSelectionOmission, type ContextSelectionPolicyId } from "../contracts/context-selection.ts";

export interface ContextSelectionOptions {
  readonly policy: ContextSelectionPolicyId;
  readonly turnId: string;
  readonly executedResultIds: ReadonlySet<string>;
  readonly onSelection: (plan: ContextSelectionPlan) => void;
}

const PRIORITY_RANK: Record<ContextPriority, number> = {
  required: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function estimatedTokens(item: AgentContextItem): number | null {
  return Number.isSafeInteger(item.estimatedTokens) && item.estimatedTokens >= 0
    ? item.estimatedTokens : null;
}

function itemKey(item: AgentContextItem): string {
  if (isInvocationContext(item)) return item.contextItemId;
  return [item.sourceType, item.sourceId, item.documentId ?? "", item.documentVersion ?? "", item.scope].join("\u001f");
}

function syntheticItem(
  contextItemId: string,
  kind: AgentContextItem["kind"],
  content: unknown,
  sourceType: string,
  sourceId: string,
  scope: string,
  trustLevel: AgentContextItem["trustLevel"],
  now: number,
): AgentContextItem {
  return {
    contextItemId,
    kind,
    content,
    sourceType,
    sourceId,
    documentId: null,
    documentVersion: null,
    scope,
    trustLevel,
    priority: "required",
    createdAt: now,
    expiresAt: null,
    estimatedTokens: Math.max(1, Math.ceil(JSON.stringify(content).length / 4)),
  };
}

function versionWarnings(
  items: readonly AgentContextItem[],
  currentVersion: number | null,
  currentDocumentId?: string | null,
): readonly ContextVersionWarning[] {
  const versions = new Map<string, Set<number>>();
  for (const item of items) {
    if (item.documentId === null || item.documentVersion === null) continue;
    const values = versions.get(item.documentId) ?? new Set<number>();
    values.add(item.documentVersion);
    versions.set(item.documentId, values);
  }
  const warnings: ContextVersionWarning[] = [];
  for (const [documentId, values] of versions) {
    const sorted = [...values].sort((left, right) => left - right);
    const objectVersion = currentDocumentId !== undefined && documentId !== currentDocumentId ? null : currentVersion;
    if (sorted.length > 1) warnings.push({
      code: "version-mixed",
      documentId,
      versions: sorted,
      currentVersion: objectVersion,
    });
    if (currentVersion !== null && (currentDocumentId === undefined || documentId === currentDocumentId)
      && sorted.some((version) => version !== currentVersion)) warnings.push({
      code: "version-mismatch",
      documentId,
      versions: sorted,
      currentVersion,
    });
  }
  return warnings;
}

export class ContextBuilder {
  build(input: ContextBuildInput, selection?: ContextSelectionOptions): ContextBuildResult {
    if (selection && selection.policy !== STANDALONE_CONTEXT_POLICY) throw new Error("未知上下文选择策略");
    const workspaceContext = {
      workspaceId: input.workspace.workspaceId,
      documentId: input.workspace.documentId,
      documentVersion: input.workspace.documentVersion,
      selectionAvailable: input.workspace.selection !== null,
    };
    const baseItems: AgentContextItem[] = [
      syntheticItem("run.goal", "user-goal", { runId: input.runId, goal: input.goal },
        "user", `${input.runId}:goal`, "run", "user-provided", input.now),
      syntheticItem("run.state", "system-constraint", input.runState,
        "control-plane", input.runId, "run", "authoritative", input.now),
      syntheticItem("workspace.scope", "workspace-scope", workspaceContext,
        "workspace", input.workspace.workspaceId, "workspace", "authoritative", input.now),
    ];
    if (input.turnInput !== null) baseItems.push(syntheticItem(
      "turn.input", "user-goal", { text: input.turnInput },
      "user", `${input.runId}:turn`, "turn", "user-provided", input.now,
    ));

    const allItems = [...baseItems, ...input.items];
    const omitted: OmittedContextItem[] = [];
    const reportedOmissions: { contextItemId: string; reason: ContextSelectionOmission }[] = [];
    let invalid = false;
    const recentCount = Math.min(2, Math.max(0, input.budget.historyTurnBudget));
    const recent = new Set((recentCount ? input.items.filter((item) => item.sourceType === "conversation" && item.scope === input.workspace.workspaceId)
      .slice(-recentCount) : []).map((item) => item.contextItemId));
    const protectedReason = (item: AgentContextItem): "required" | "recent-conversation" | "executed-result" | "priority" =>
      item.priority === "required" ? "required" : recent.has(item.contextItemId) ? "recent-conversation"
        : selection?.executedResultIds.has(item.contextItemId) ? "executed-result" : "priority";
    const omit = (item: AgentContextItem, reason: ContextSelectionOmission): void => {
      reportedOmissions.push({ contextItemId: item.contextItemId, reason });
      if (["duplicate", "item-count-budget", "token-budget", "history-turn-budget", "expired", "invalid-estimate"].includes(reason)) {
        omitted.push({ contextItemId: item.contextItemId, reason: reason as OmittedContextItem["reason"] });
      }
    };
    const seenIds = new Map<string, string>();
    const candidatesByKey = new Map<string, { item: AgentContextItem; index: number; tokens: number }>();
    allItems.forEach((item, index) => {
      const required = selection ? protectedReason(item) !== "priority" : item.priority === "required";
      const reject = (reason: ContextSelectionOmission): void => { omit(item, reason); if (selection && required) invalid = true; };
      if (selection && (item.sourceType === "conversation" && !conversationContent(item, input.workspace.workspaceId)
        || item.sourceType === "host-resource-catalog" && (item.scope !== input.workspace.workspaceId || item.contextItemId !== "resource.catalog"
          || item.trustLevel !== "authoritative" || typeof item.content !== "object" || item.content === null
          || (item.content as { sessionId?: unknown }).sessionId !== input.workspace.workspaceId))) { reject("out-of-scope"); return; }
      if (item.expiresAt !== null && item.expiresAt <= input.now && (selection || !required)) {
        reject("expired");
        return;
      }
      let tokens = estimatedTokens(item);
      if (tokens === null) {
        reject("invalid-estimate");
        return;
      }
      if (selection) {
        let signature: string;
        try {
          const serialized = JSON.stringify(item.content);
          if (serialized === undefined) throw new Error("Invalid context content");
          tokens = Math.max(tokens, Math.ceil(serialized.length / 4));
          signature = JSON.stringify([item.kind, item.sourceType, item.sourceId, item.documentId, item.documentVersion, item.scope, item.trustLevel, serialized]);
        } catch { reject("invalid-content"); return; }
        const previous = seenIds.get(item.contextItemId);
        if (previous !== undefined && previous !== signature) { invalid = true; omit(item, "identity-conflict"); return; }
        seenIds.set(item.contextItemId, signature);
        if (item.documentId !== null && item.documentId === input.workspace.documentId && item.documentVersion !== null
          && item.documentVersion !== input.workspace.documentVersion && !selection.executedResultIds.has(item.contextItemId)) {
          reject("version-mismatch"); return;
        }
      }
      const candidate = { item, index, tokens };
      const key = itemKey(item);
      const existing = candidatesByKey.get(key);
      if (existing === undefined) {
        candidatesByKey.set(key, candidate);
        return;
      }
      const candidateRank = selection && required ? -1 : PRIORITY_RANK[item.priority];
      const existingRank = selection && protectedReason(existing.item) !== "priority" ? -1 : PRIORITY_RANK[existing.item.priority];
      const candidateWins = candidateRank < existingRank
        || candidateRank === existingRank && item.createdAt > existing.item.createdAt;
      if (candidateWins) {
        omit(existing.item, "duplicate");
        candidatesByKey.set(key, candidate);
      } else {
        omit(item, "duplicate");
      }
    });
    const deduplicatedCandidates = [...candidatesByKey.values()];
    const historyTurnBudget = Number.isSafeInteger(input.budget.historyTurnBudget)
      && input.budget.historyTurnBudget >= 0
      ? input.budget.historyTurnBudget
      : 0;
    const historyCandidates = deduplicatedCandidates.filter(
      (candidate) => candidate.item.kind === "task-history",
    );
    const retainedHistory = new Set([...historyCandidates]
      .sort((left, right) => selection ? right.index - left.index : right.item.createdAt - left.item.createdAt || right.index - left.index)
      .slice(0, historyTurnBudget));
    for (const candidate of historyCandidates) {
      if (selection && protectedReason(candidate.item) !== "priority") retainedHistory.add(candidate);
      if (!retainedHistory.has(candidate)) omit(candidate.item, "history-turn-budget");
    }
    const candidates = deduplicatedCandidates.filter(
      (candidate) => candidate.item.kind !== "task-history" || retainedHistory.has(candidate),
    );
    candidates.sort((left, right) => {
      const rank = (item: AgentContextItem): number => selection && protectedReason(item) !== "priority" ? -1 : PRIORITY_RANK[item.priority];
      const history = (item: AgentContextItem): number => item.sourceType === "conversation" ? 0 : 1;
      return rank(left.item) - rank(right.item) || (selection ? history(left.item) - history(right.item) : 0)
        || (selection && history(left.item) === 0 && history(right.item) === 0 ? right.index - left.index : left.index - right.index);
    });

    const selected: AgentContextItem[] = [];
    let tokens = 0;
    for (const candidate of candidates) {
      const required = selection ? protectedReason(candidate.item) !== "priority" : candidate.item.priority === "required";
      const countExceeded = selected.length >= input.budget.itemCountBudget;
      const tokenExceeded = tokens + candidate.tokens > input.budget.tokenBudget;
      if (!required && countExceeded) {
        omit(candidate.item, "item-count-budget");
        continue;
      }
      if (!required && tokenExceeded) {
        omit(candidate.item, "token-budget");
        continue;
      }
      selected.push(candidate.item);
      tokens += candidate.tokens;
    }

    const optionalRemovalOrder = selected.filter((item) => protectedReason(item) === "priority").map((item) => item.contextItemId).reverse();
    if (selection) selected.sort((left, right) => allItems.indexOf(left) - allItems.indexOf(right));
    const result: ContextBuildResult = {
      contextItems: selected,
      omittedItems: omitted,
      versionWarnings: versionWarnings(selected, input.workspace.documentVersion, selection ? input.workspace.documentId : undefined),
      budget: {
        estimatedTokens: tokens,
        itemCount: selected.length,
        tokenBudget: input.budget.tokenBudget,
        itemCountBudget: input.budget.itemCountBudget,
        exceeded: tokens > input.budget.tokenBudget || selected.length > input.budget.itemCountBudget,
      },
    };
    if (selection) selection.onSelection(Object.freeze({ optionalRemovalOrder: Object.freeze(optionalRemovalOrder), report: freezeContextSelectionReport({
      schemaVersion: 1, policyVersion: selection.policy, runId: input.runId, turnId: selection.turnId, stage: "context-selection",
      status: invalid ? "invalid-context" : result.budget.exceeded ? "budget-exceeded" : "ready", estimator: "json-characters-div4-v1",
      selected: selected.map((item) => ({ contextItemId: item.contextItemId, protected: protectedReason(item) !== "priority", reason: protectedReason(item) })),
      omitted: reportedOmissions, budget: result.budget,
    }) }));
    return result;
  }
}
