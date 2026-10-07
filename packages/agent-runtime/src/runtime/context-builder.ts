import type {
  AgentContextItem,
  ContextBuildInput,
  ContextBuildResult,
  ContextPriority,
  ContextVersionWarning,
  OmittedContextItem,
} from "./agent-contracts.ts";

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
    if (sorted.length > 1) warnings.push({
      code: "version-mixed",
      documentId,
      versions: sorted,
      currentVersion,
    });
    if (currentVersion !== null && sorted.some((version) => version !== currentVersion)) warnings.push({
      code: "version-mismatch",
      documentId,
      versions: sorted,
      currentVersion,
    });
  }
  return warnings;
}

export class ContextBuilder {
  build(input: ContextBuildInput): ContextBuildResult {
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
    const candidatesByKey = new Map<string, { item: AgentContextItem; index: number; tokens: number }>();
    allItems.forEach((item, index) => {
      if (item.expiresAt !== null && item.expiresAt <= input.now && item.priority !== "required") {
        omitted.push({ contextItemId: item.contextItemId, reason: "expired" });
        return;
      }
      const tokens = estimatedTokens(item);
      if (tokens === null) {
        omitted.push({ contextItemId: item.contextItemId, reason: "invalid-estimate" });
        return;
      }
      const candidate = { item, index, tokens };
      const key = itemKey(item);
      const existing = candidatesByKey.get(key);
      if (existing === undefined) {
        candidatesByKey.set(key, candidate);
        return;
      }
      const candidateRank = PRIORITY_RANK[item.priority];
      const existingRank = PRIORITY_RANK[existing.item.priority];
      const candidateWins = candidateRank < existingRank
        || candidateRank === existingRank && item.createdAt > existing.item.createdAt;
      if (candidateWins) {
        omitted.push({ contextItemId: existing.item.contextItemId, reason: "duplicate" });
        candidatesByKey.set(key, candidate);
      } else {
        omitted.push({ contextItemId: item.contextItemId, reason: "duplicate" });
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
      .sort((left, right) => right.item.createdAt - left.item.createdAt || right.index - left.index)
      .slice(0, historyTurnBudget));
    for (const candidate of historyCandidates) {
      if (!retainedHistory.has(candidate)) omitted.push({
        contextItemId: candidate.item.contextItemId,
        reason: "history-turn-budget",
      });
    }
    const candidates = deduplicatedCandidates.filter(
      (candidate) => candidate.item.kind !== "task-history" || retainedHistory.has(candidate),
    );
    candidates.sort((left, right) => PRIORITY_RANK[left.item.priority] - PRIORITY_RANK[right.item.priority]
      || left.index - right.index);

    const selected: AgentContextItem[] = [];
    let tokens = 0;
    for (const candidate of candidates) {
      const required = candidate.item.priority === "required";
      const countExceeded = selected.length >= input.budget.itemCountBudget;
      const tokenExceeded = tokens + candidate.tokens > input.budget.tokenBudget;
      if (!required && countExceeded) {
        omitted.push({ contextItemId: candidate.item.contextItemId, reason: "item-count-budget" });
        continue;
      }
      if (!required && tokenExceeded) {
        omitted.push({ contextItemId: candidate.item.contextItemId, reason: "token-budget" });
        continue;
      }
      selected.push(candidate.item);
      tokens += candidate.tokens;
    }

    return {
      contextItems: selected,
      omittedItems: omitted,
      versionWarnings: versionWarnings(selected, input.workspace.documentVersion),
      budget: {
        estimatedTokens: tokens,
        itemCount: selected.length,
        tokenBudget: input.budget.tokenBudget,
        itemCountBudget: input.budget.itemCountBudget,
        exceeded: tokens > input.budget.tokenBudget || selected.length > input.budget.itemCountBudget,
      },
    };
  }
}
