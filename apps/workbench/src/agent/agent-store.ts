import type { AgentRunState } from "./agent-contracts.ts";
import type { AgentRunRecord } from "./run-controller.ts";
import type {
  AgentRunEventRecord,
} from "./run-state.ts";

export interface AgentRunStoreEntry {
  readonly schemaVersion: 1;
  readonly run: AgentRunRecord;
  readonly events: readonly AgentRunEventRecord[];
  readonly lastSequence: number;
}

export interface AgentRunStoreCommitInput {
  readonly runId: string;
  readonly expectedSequence: number;
  readonly event: AgentRunEventRecord;
  readonly nextRun: AgentRunRecord;
}

export type AgentRunStoreCommitResult =
  | { readonly status: "committed"; readonly entry: AgentRunStoreEntry }
  | { readonly status: "sequence-conflict"; readonly currentSequence: number }
  | { readonly status: "invalid"; readonly code: "run-mismatch" | "event-sequence" | "snapshot-sequence" };

export interface AgentRunRecoverySummary {
  readonly runId: string;
  readonly workspaceId: string;
  readonly goal: string;
  readonly state: AgentRunState;
  readonly lastSequence: number;
}

export interface AgentRunStorePort {
  load(runId: string): Promise<AgentRunStoreEntry | null>;
  commit(input: AgentRunStoreCommitInput): Promise<AgentRunStoreCommitResult>;
  listRecoverable(): Promise<readonly AgentRunRecoverySummary[]>;
  quarantine(runId: string): Promise<boolean>;
}

function isRecoverable(state: AgentRunState): boolean {
  return state.lifecycle !== "terminal";
}

export class InMemoryAgentRunStore implements AgentRunStorePort {
  private readonly entries = new Map<string, AgentRunStoreEntry>();
  private readonly quarantined = new Map<string, AgentRunStoreEntry>();

  async load(runId: string): Promise<AgentRunStoreEntry | null> {
    return this.entries.get(runId) ?? null;
  }

  async commit(input: AgentRunStoreCommitInput): Promise<AgentRunStoreCommitResult> {
    if (input.event.runId !== input.runId || input.nextRun.runId !== input.runId) {
      return { status: "invalid", code: "run-mismatch" };
    }
    if (input.event.sequence !== input.expectedSequence + 1) {
      return { status: "invalid", code: "event-sequence" };
    }
    if (input.nextRun.events.at(-1)?.sequence !== input.event.sequence) {
      return { status: "invalid", code: "snapshot-sequence" };
    }

    const existing = this.entries.get(input.runId);
    const currentSequence = existing?.lastSequence ?? 0;
    if (currentSequence !== input.expectedSequence) {
      return { status: "sequence-conflict", currentSequence };
    }

    const entry: AgentRunStoreEntry = {
      schemaVersion: 1,
      run: input.nextRun,
      events: [...(existing?.events ?? []), input.event],
      lastSequence: input.event.sequence,
    };
    this.entries.set(input.runId, entry);
    return { status: "committed", entry };
  }

  async listRecoverable(): Promise<readonly AgentRunRecoverySummary[]> {
    return [...this.entries.values()]
      .filter((entry) => isRecoverable(entry.run.state))
      .map((entry) => ({
        runId: entry.run.runId,
        workspaceId: entry.run.workspace.workspaceId,
        goal: entry.run.goal,
        state: entry.run.state,
        lastSequence: entry.lastSequence,
      }));
  }

  async quarantine(runId: string): Promise<boolean> {
    const entry = this.entries.get(runId);
    if (entry === undefined) return false;
    this.entries.delete(runId);
    this.quarantined.set(runId, entry);
    return true;
  }
}
