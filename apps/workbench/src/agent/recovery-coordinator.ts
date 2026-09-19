import type { CapabilityResult } from "../contracts/capability.ts";
import type { AgentRunStoreEntry, AgentRunStorePort } from "./agent-store.ts";
import { reduceAgentInvocationState } from "./invocation-state.ts";
import type { AgentInvocationEvent, AgentInvocationEventRecord } from "./invocation-state.ts";
import type { AgentInvocationRecord, AgentRunRecord } from "./run-controller.ts";
import { reduceAgentRunState } from "./run-state.ts";
import type { AgentRunEvent, AgentRunEventRecord } from "./run-state.ts";

export type AgentInvocationReceiptLookup =
  | { readonly status: "resolved"; readonly result: CapabilityResult<unknown> }
  | { readonly status: "started" }
  | { readonly status: "not-started" }
  | { readonly status: "identity-conflict"; readonly message: string }
  | { readonly status: "unavailable"; readonly message: string };

export interface AgentInvocationReceiptPort {
  lookup(input: {
    readonly runId: string;
    readonly workspaceId: string;
    readonly invocation: AgentInvocationRecord;
  }): Promise<AgentInvocationReceiptLookup>;
}

export type AgentRunRecoveryResult =
  | {
      readonly status: "awaiting-user";
      readonly run: AgentRunRecord;
      readonly waitReason: "user-input" | "approval";
    }
  | {
      readonly status: "ready-to-resume";
      readonly run: AgentRunRecord;
      readonly reason: "host-interrupted" | "invocation-resolved";
    }
  | {
      readonly status: "retry-available";
      readonly run: AgentRunRecord;
      readonly invocationId: string;
    }
  | {
      readonly status: "reconciliation-required";
      readonly run: AgentRunRecord;
      readonly invocationId: string;
      readonly receiptStatus: "started" | "identity-conflict" | "unavailable";
    }
  | {
      readonly status: "terminal";
      readonly run: AgentRunRecord;
      readonly reason: "cancelled" | "capability-failed";
    }
  | {
      readonly status: "missing";
      readonly runId: string;
    };

export type AgentRecoveryResumeErrorCode =
  | "run-missing"
  | "run-not-recovering"
  | "invocation-reconciliation-required";

export class AgentRecoveryResumeError extends Error {
  readonly code: AgentRecoveryResumeErrorCode;

  constructor(code: AgentRecoveryResumeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface AgentRecoveryCoordinatorDependencies {
  readonly store: AgentRunStorePort;
  readonly receipts: AgentInvocationReceiptPort;
  readonly now?: () => number;
  readonly nextEventId?: () => string;
}

const OUTSTANDING_INVOCATION_STATES = new Set([
  "dispatched",
  "running",
  "outcome-unknown",
]);

function outstandingInvocation(run: AgentRunRecord): AgentInvocationRecord | null {
  return [...run.invocations]
    .reverse()
    .find((invocation) => OUTSTANDING_INVOCATION_STATES.has(invocation.state.status)) ?? null;
}

function receiptMatchesInvocation(
  result: CapabilityResult<unknown>,
  invocation: AgentInvocationRecord,
): boolean {
  return result.invocationId === invocation.invocationId
    && result.capabilityId === invocation.capabilityId
    && result.contractVersion === invocation.contractVersion;
}

export class AgentRecoveryCoordinator {
  private readonly store: AgentRunStorePort;
  private readonly receipts: AgentInvocationReceiptPort;
  private readonly now: () => number;
  private readonly nextEventId: () => string;

  constructor(dependencies: AgentRecoveryCoordinatorDependencies) {
    this.store = dependencies.store;
    this.receipts = dependencies.receipts;
    this.now = dependencies.now ?? (() => Date.now());
    this.nextEventId = dependencies.nextEventId ?? (() => crypto.randomUUID());
  }

  async recoverAll(): Promise<readonly AgentRunRecoveryResult[]> {
    const summaries = await this.store.listRecoverable();
    const results: AgentRunRecoveryResult[] = [];
    for (const summary of summaries) {
      results.push(await this.recover(summary.runId));
    }
    return results;
  }

  async recover(runId: string): Promise<AgentRunRecoveryResult> {
    const loaded = await this.store.load(runId);
    if (loaded === null) return { status: "missing", runId };

    const run = loaded.run;
    if (run.state.lifecycle === "terminal") {
      return {
        status: "terminal",
        run,
        reason: run.state.terminalReason === "cancelled" ? "cancelled" : "capability-failed",
      };
    }
    if (run.state.lifecycle === "waiting"
      && (run.state.waitReason === "user-input" || run.state.waitReason === "approval")) {
      return {
        status: "awaiting-user",
        run,
        waitReason: run.state.waitReason,
      };
    }

    const invocation = outstandingInvocation(run);
    if (invocation !== null) {
      return this.reconcileInvocation(loaded, invocation);
    }

    if (run.state.lifecycle === "waiting" && run.state.waitReason === "cancellation-pending") {
      const cancelled = await this.commitRunEvent(loaded, { type: "cancellation.confirmed" });
      return { status: "terminal", run: cancelled.run, reason: "cancelled" };
    }
    const recovering = await this.ensureRecovering(loaded, "host-interrupted");
    return { status: "ready-to-resume", run: recovering.run, reason: "host-interrupted" };
  }

  async resume(runId: string): Promise<AgentRunRecord> {
    const entry = await this.store.load(runId);
    if (entry === null) {
      throw new AgentRecoveryResumeError("run-missing", "Agent Run does not exist");
    }
    if (entry.run.state.lifecycle !== "recovering") {
      throw new AgentRecoveryResumeError(
        "run-not-recovering",
        "Agent Run is not waiting for an explicit recovery resume",
      );
    }
    const invocation = outstandingInvocation(entry.run);
    if (invocation !== null) {
      throw new AgentRecoveryResumeError(
        "invocation-reconciliation-required",
        "Capability Invocation must be reconciled before the Run can resume",
      );
    }
    let resumed = await this.commitRunEvent(entry, { type: "run.resumed" });
    if (resumed.run.state.lifecycle !== "active") return resumed.run;

    if (resumed.run.state.phase === "preparing") {
      resumed = await this.commitRunEvent(resumed, { type: "run.prepared" });
    } else if (resumed.run.state.phase === "executing") {
      resumed = await this.commitRunEvent(resumed, { type: "invocations.completed" });
      resumed = await this.commitRunEvent(resumed, { type: "verification.continue" });
    } else if (resumed.run.state.phase === "verifying") {
      resumed = await this.commitRunEvent(resumed, { type: "verification.continue" });
    }
    return resumed.run;
  }

  private async reconcileInvocation(
    entry: AgentRunStoreEntry,
    invocation: AgentInvocationRecord,
  ): Promise<AgentRunRecoveryResult> {
    let receipt: AgentInvocationReceiptLookup;
    try {
      receipt = await this.receipts.lookup({
        runId: entry.run.runId,
        workspaceId: entry.run.workspace.workspaceId,
        invocation,
      });
    } catch {
      receipt = { status: "unavailable", message: "Capability receipt lookup failed" };
    }

    if (receipt.status === "resolved" && receiptMatchesInvocation(receipt.result, invocation)) {
      return this.applyResolvedReceipt(entry, invocation, receipt.result);
    }
    if (receipt.status === "not-started") {
      if (entry.run.state.lifecycle === "waiting"
        && entry.run.state.waitReason === "cancellation-pending") {
        const cancelled = await this.commitRunEvent(entry, { type: "cancellation.confirmed" });
        return { status: "terminal", run: cancelled.run, reason: "cancelled" };
      }
      const recovering = await this.ensureRecovering(entry, "host-interrupted");
      return {
        status: "retry-available",
        run: recovering.run,
        invocationId: invocation.invocationId,
      };
    }

    let current = entry;
    if (invocation.state.status !== "outcome-unknown") {
      current = await this.recordInvocationOutcome(
        current,
        invocation,
        { type: "invocation.outcome-unknown" },
        null,
        "outcome-unknown",
      );
    }
    current = await this.ensureRecovering(current, "capability-outcome-unknown");
    return {
      status: "reconciliation-required",
      run: current.run,
      invocationId: invocation.invocationId,
      receiptStatus: receipt.status === "started"
        ? "started"
        : receipt.status === "identity-conflict"
          ? "identity-conflict"
          : "unavailable",
    };
  }

  private async applyResolvedReceipt(
    entry: AgentRunStoreEntry,
    invocation: AgentInvocationRecord,
    result: CapabilityResult<unknown>,
  ): Promise<AgentRunRecoveryResult> {
    const invocationEvent: AgentInvocationEvent = result.status === "completed"
      ? { type: "invocation.succeeded" }
      : result.status === "rejected"
        ? { type: "invocation.rejected" }
        : { type: "invocation.failed" };
    const outcome = result.status === "completed"
      ? "completed"
      : result.status === "rejected"
        ? "rejected"
        : "failed";
    let current = await this.recordInvocationOutcome(
      entry,
      invocation,
      invocationEvent,
      result,
      outcome,
    );

    if (entry.run.state.lifecycle === "waiting"
      && entry.run.state.waitReason === "cancellation-pending") {
      current = await this.commitRunEvent(current, { type: "cancellation.confirmed" });
      return { status: "terminal", run: current.run, reason: "cancelled" };
    }
    if (result.status !== "completed") {
      current = await this.commitRunEvent(current, {
        type: "run.failed",
        code: "capability-failed",
      });
      return { status: "terminal", run: current.run, reason: "capability-failed" };
    }

    current = await this.ensureRecovering(current, "host-interrupted");
    return {
      status: "ready-to-resume",
      run: current.run,
      reason: "invocation-resolved",
    };
  }

  private async recordInvocationOutcome(
    entry: AgentRunStoreEntry,
    invocation: AgentInvocationRecord,
    invocationEvent: AgentInvocationEvent,
    result: CapabilityResult<unknown> | null,
    outcome: "completed" | "failed" | "rejected" | "outcome-unknown",
  ): Promise<AgentRunStoreEntry> {
    const transition = reduceAgentInvocationState(invocation.state, invocationEvent);
    if (!transition.accepted) throw new Error(transition.message);
    const event: AgentInvocationEventRecord = {
      eventId: this.nextEventId(),
      invocationId: invocation.invocationId,
      sequence: invocation.events.length + 1,
      occurredAt: this.now(),
      event: invocationEvent,
    };
    const updated: AgentInvocationRecord = {
      ...invocation,
      state: transition.state,
      result,
      events: [...invocation.events, event],
    };
    const invocations = entry.run.invocations.map((item) => (
      item.invocationId === invocation.invocationId ? updated : item
    ));
    return this.commitRunEvent(entry, {
      type: "invocation.outcome-recorded",
      invocationId: invocation.invocationId,
      status: outcome,
    }, { ...entry.run, invocations });
  }

  private async ensureRecovering(
    entry: AgentRunStoreEntry,
    reason: "capability-outcome-unknown" | "host-interrupted",
  ): Promise<AgentRunStoreEntry> {
    if (entry.run.state.lifecycle === "recovering") return entry;
    return this.commitRunEvent(entry, { type: "run.recovery-required", reason });
  }

  private async commitRunEvent(
    entry: AgentRunStoreEntry,
    event: AgentRunEvent,
    run: AgentRunRecord = entry.run,
  ): Promise<AgentRunStoreEntry> {
    const transition = reduceAgentRunState(run.state, event);
    if (!transition.accepted) throw new Error(transition.message);
    const eventRecord: AgentRunEventRecord = {
      eventId: this.nextEventId(),
      runId: run.runId,
      sequence: entry.lastSequence + 1,
      occurredAt: this.now(),
      event,
    };
    const nextRun: AgentRunRecord = {
      ...run,
      state: transition.state,
      events: [...run.events, eventRecord],
    };
    const committed = await this.store.commit({
      runId: run.runId,
      expectedSequence: entry.lastSequence,
      event: eventRecord,
      nextRun,
    });
    if (committed.status === "committed") return committed.entry;
    if (committed.status === "sequence-conflict") {
      throw new Error(`Agent recovery sequence conflict at ${committed.currentSequence}`);
    }
    throw new Error(`Agent recovery commit rejected: ${committed.code}`);
  }
}
