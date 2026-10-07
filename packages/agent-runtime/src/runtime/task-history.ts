import type {
  AgentContextItem,
  AgentRunFailureCode,
  AgentRunState,
  AgentWorkspaceScope,
} from "./agent-contracts.ts";

const MAX_GOAL_CHARACTERS = 400;
const MAX_RESPONSE_CHARACTERS = 800;

interface AgentTaskHistoryEntryBase {
  readonly submissionId: string;
  readonly runId: string;
  readonly goal: string;
  readonly workspaceId: string;
  readonly documentId: string | null;
  readonly documentVersion: number | null;
  readonly completedAt: number;
}

export type AgentTaskHistoryEntry =
  | AgentTaskHistoryEntryBase & {
      readonly outcome: "completed";
      readonly response: string | null;
      readonly failureCode: null;
    }
  | AgentTaskHistoryEntryBase & {
      readonly outcome: "failed";
      readonly response: null;
      readonly failureCode: AgentRunFailureCode;
    };

export interface AgentTaskHistoryEntryInput {
  readonly submissionId: string;
  readonly runId: string;
  readonly goal: string;
  readonly state: AgentRunState;
  readonly response: string | null;
  readonly workspace: AgentWorkspaceScope;
  readonly completedAt: number;
}

function compactText(value: string, limit: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  const characters = Array.from(normalized);
  if (characters.length <= limit) return normalized;
  return `${characters.slice(0, Math.max(0, limit - 3)).join("")}...`;
}

function estimateTokens(content: unknown): number {
  const serialized = JSON.stringify(content);
  return Math.max(1, Math.ceil((serialized?.length ?? 0) / 4));
}

export function createAgentTaskHistoryEntry(
  input: AgentTaskHistoryEntryInput,
): AgentTaskHistoryEntry | null {
  if (input.state.lifecycle !== "terminal" || input.state.terminalReason === "cancelled") return null;

  const base = {
    submissionId: input.submissionId,
    runId: input.runId,
    goal: compactText(input.goal, MAX_GOAL_CHARACTERS),
    workspaceId: input.workspace.workspaceId,
    documentId: input.workspace.documentId,
    documentVersion: input.workspace.documentVersion,
    completedAt: input.completedAt,
  };
  if (input.state.terminalReason === "completed") return Object.freeze({
    ...base,
    outcome: "completed",
    response: input.response === null
      ? null
      : compactText(input.response, MAX_RESPONSE_CHARACTERS) || null,
    failureCode: null,
  });
  if (!("failureCode" in input.state)) return null;
  return Object.freeze({
    ...base,
    outcome: "failed",
    response: null,
    failureCode: input.state.failureCode,
  });
}

export function projectAgentTaskHistoryContext(
  entries: readonly AgentTaskHistoryEntry[],
  workspace: AgentWorkspaceScope,
): readonly AgentContextItem[] {
  return entries
    .filter((entry) => entry.workspaceId === workspace.workspaceId
      && entry.documentId === workspace.documentId)
    .map((entry) => {
      const content = Object.freeze({
        runId: entry.runId,
        goal: entry.goal,
        outcome: entry.outcome,
        response: entry.response,
        failureCode: entry.failureCode,
      });
      return Object.freeze({
        contextItemId: `task-history:${entry.runId}`,
        kind: "task-history" as const,
        content,
        sourceType: "task-history",
        sourceId: entry.submissionId,
        documentId: entry.documentId,
        documentVersion: entry.documentVersion,
        scope: entry.documentId === null ? "run" : "document",
        trustLevel: "derived" as const,
        priority: "low" as const,
        createdAt: entry.completedAt,
        expiresAt: null,
        estimatedTokens: estimateTokens(content),
      });
    });
}
