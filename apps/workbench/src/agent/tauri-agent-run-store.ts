import { invoke } from "@tauri-apps/api/core";

import type {
  AgentRunRecoverySummary,
  AgentRunStoreCommitInput,
  AgentRunStoreCommitResult,
  AgentRunStoreEntry,
  AgentRunStorePort,
} from "./agent-store.ts";
import {
  isAgentApprovalDecision,
  isAgentProvidedUserInput,
  isAgentRequiredApproval,
  isAgentRequiredUserInput,
} from "./agent-contracts.ts";
import type { AgentRunState } from "./agent-contracts.ts";
import type { AgentRunRecord } from "./run-controller.ts";
import type { AgentRunEventRecord } from "./run-state.ts";
import { isAgentPreparedExecution } from "./prepared-mutation.ts";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export class AgentRunStoreProtocolError extends Error {}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isWorkflowIdentity(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const workflow = value as Record<string, unknown>;
  return typeof workflow.id === "string"
    && workflow.id.length > 0
    && Number.isSafeInteger(workflow.contractVersion)
    && (workflow.contractVersion as number) >= 1
    && typeof workflow.ownerPluginId === "string"
    && workflow.ownerPluginId.length > 0
    && typeof workflow.ownerPluginVersion === "string"
    && /^\d+\.\d+\.\d+$/.test(workflow.ownerPluginVersion);
}

function isSequence(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isInvocationSnapshot(value: unknown): boolean {
  const candidate = record(value);
  const state = record(candidate?.state);
  return candidate !== null
    && typeof candidate.invocationId === "string"
    && typeof candidate.capabilityId === "string"
    && Number.isSafeInteger(candidate.contractVersion)
    && state !== null
    && typeof state.status === "string"
    && (candidate.preparedExecution === undefined
      || candidate.preparedExecution === null
      || isAgentPreparedExecution(candidate.preparedExecution));
}

function preparedApprovalBindingsMatch(
  events: readonly unknown[],
  invocations: readonly unknown[],
): boolean {
  for (const eventValue of events) {
    const event = record(record(eventValue)?.event);
    if (event?.type !== "approval.required") continue;
    const approval = record(event.approval);
    if (!Array.isArray(approval?.items)) return false;
    for (const itemValue of approval.items) {
      const item = record(itemValue);
      if (item === null || item.changeSetId === undefined || item.changeSetId === null) continue;
      const invocation = invocations
        .map(record)
        .find((candidate) => candidate?.invocationId === item.invocationId);
      if (invocation === undefined
        || invocation === null
        || !isAgentPreparedExecution(invocation.preparedExecution)
        || invocation.preparedExecution.changeSetId !== item.changeSetId) return false;
    }
  }
  return true;
}

function isAgentRunState(value: unknown): value is AgentRunState {
  const candidate = record(value);
  if (candidate === null) return false;
  if (!["preparing", "planning", "executing", "verifying"].includes(String(candidate.phase))) {
    return false;
  }
  if (candidate.lifecycle === "active") return true;
  if (candidate.lifecycle === "waiting") {
    return ["user-input", "approval", "cancellation-pending"].includes(String(candidate.waitReason));
  }
  if (candidate.lifecycle === "recovering") {
    return ["capability-outcome-unknown", "host-interrupted"].includes(String(candidate.recoveryReason));
  }
  if (candidate.lifecycle !== "terminal") return false;
  if (["completed", "cancelled"].includes(String(candidate.terminalReason))) return true;
  return candidate.terminalReason === "failed" && typeof candidate.failureCode === "string";
}

function decodeEvent(value: unknown): AgentRunEventRecord {
  const candidate = record(value);
  const event = record(candidate?.event);
  if (candidate === null
    || typeof candidate.eventId !== "string"
    || typeof candidate.runId !== "string"
    || !isSequence(candidate.sequence)
    || typeof candidate.occurredAt !== "number"
    || event === null
    || typeof event.type !== "string"
    || (event.type === "user-input.required" && !isAgentRequiredUserInput(event.input))
    || (event.type === "user-input.provided" && !isAgentProvidedUserInput(event.input))
    || (event.type === "approval.required" && !isAgentRequiredApproval(event.approval))
    || (event.type === "approval.approved"
      && (!isAgentApprovalDecision(event.decision) || event.decision.outcome !== "approved"))
    || (event.type === "approval.denied"
      && (!isAgentApprovalDecision(event.decision) || event.decision.outcome !== "denied"))
    || (event.type === "invocation.retry-authorized"
      && (typeof event.invocationId !== "string"
        || event.invocationId.length === 0
        || event.authorizedBy !== "local-user"))) {
    throw new AgentRunStoreProtocolError("Agent Run Store returned an invalid event record");
  }
  return candidate as unknown as AgentRunEventRecord;
}

function decodeRun(value: unknown): AgentRunRecord {
  const candidate = record(value);
  const workspace = record(candidate?.workspace);
  const policy = record(candidate?.policy);
  const intent = record(candidate?.intent);
  if (candidate === null
    || typeof candidate.runId !== "string"
    || workspace === null
    || typeof workspace.workspaceId !== "string"
    || typeof candidate.goal !== "string"
    || !isAgentRunState(candidate.state)
    || typeof candidate.createdAt !== "number"
    || policy === null
    || typeof policy.policyVersion !== "number"
    || !isStringArray(policy.allowedCapabilityIds)
    || !isStringArray(policy.allowedKinds)
    || typeof policy.maxToolsPerTurn !== "number"
    || typeof policy.maxCostClass !== "string"
    || !["disallow", "risk-based", "always"].includes(String(policy.approvalMode))
    || intent === null
    || typeof intent.kind !== "string"
    || !isStringArray(intent.requestedCapabilityIds)
    || typeof intent.scope !== "string"
    || (intent.workflow !== undefined && !isWorkflowIdentity(intent.workflow))
    || !Array.isArray(candidate.events)
    || !Array.isArray(candidate.turns)
    || !Array.isArray(candidate.invocations)
    || !candidate.invocations.every(isInvocationSnapshot)
    || !Array.isArray(candidate.contextItems)) {
    throw new AgentRunStoreProtocolError("Agent Run Store returned an invalid run snapshot");
  }
  candidate.events.forEach(decodeEvent);
  if (!preparedApprovalBindingsMatch(candidate.events, candidate.invocations)) {
    throw new AgentRunStoreProtocolError("Agent Run Store returned a mismatched prepared approval");
  }
  return candidate as unknown as AgentRunRecord;
}

function decodeEntry(value: unknown): AgentRunStoreEntry {
  const candidate = record(value);
  if (candidate === null
    || candidate.schemaVersion !== 1
    || !Array.isArray(candidate.events)
    || !isSequence(candidate.lastSequence)) {
    throw new AgentRunStoreProtocolError("Agent Run Store returned an invalid entry");
  }
  const run = decodeRun(candidate.run);
  const events = candidate.events.map(decodeEvent);
  if (events.length !== run.events.length
    || (events.at(-1)?.sequence ?? 0) !== candidate.lastSequence
    || events.some((event) => event.runId !== run.runId)) {
    throw new AgentRunStoreProtocolError("Agent Run Store returned an inconsistent entry");
  }
  return {
    schemaVersion: 1,
    run,
    events,
    lastSequence: candidate.lastSequence,
  };
}

function decodeCommitResult(value: unknown): AgentRunStoreCommitResult {
  const candidate = record(value);
  if (candidate?.status === "committed") {
    return { status: "committed", entry: decodeEntry(candidate.entry) };
  }
  if (candidate?.status === "sequence-conflict" && isSequence(candidate.currentSequence)) {
    return { status: "sequence-conflict", currentSequence: candidate.currentSequence };
  }
  if (candidate?.status === "invalid"
    && ["run-mismatch", "event-sequence", "snapshot-sequence"].includes(String(candidate.code))) {
    return {
      status: "invalid",
      code: candidate.code as "run-mismatch" | "event-sequence" | "snapshot-sequence",
    };
  }
  throw new AgentRunStoreProtocolError("Agent Run Store returned an invalid commit result");
}

function decodeRecoverySummary(value: unknown): AgentRunRecoverySummary {
  const candidate = record(value);
  if (candidate === null
    || typeof candidate.runId !== "string"
    || typeof candidate.workspaceId !== "string"
    || typeof candidate.goal !== "string"
    || !isAgentRunState(candidate.state)
    || !isSequence(candidate.lastSequence)) {
    throw new AgentRunStoreProtocolError("Agent Run Store returned an invalid recovery summary");
  }
  return candidate as unknown as AgentRunRecoverySummary;
}

export class TauriAgentRunStore implements AgentRunStorePort {
  private readonly invokeCommand: Invoke;

  constructor(invokeCommand: Invoke = invoke) {
    this.invokeCommand = invokeCommand;
  }

  async load(runId: string): Promise<AgentRunStoreEntry | null> {
    const value = await this.invokeCommand<unknown>("workbench_agent_run_load_v1", { runId });
    return value === null ? null : decodeEntry(value);
  }

  async commit(input: AgentRunStoreCommitInput): Promise<AgentRunStoreCommitResult> {
    return decodeCommitResult(await this.invokeCommand<unknown>(
      "workbench_agent_run_commit_v1",
      { input },
    ));
  }

  async listRecoverable(): Promise<readonly AgentRunRecoverySummary[]> {
    const value = await this.invokeCommand<unknown>("workbench_agent_run_list_recoverable_v1", {});
    if (!Array.isArray(value)) {
      throw new AgentRunStoreProtocolError("Agent Run Store returned an invalid recovery list");
    }
    return value.map(decodeRecoverySummary);
  }

  async quarantine(runId: string): Promise<boolean> {
    const value = await this.invokeCommand<unknown>("workbench_agent_run_quarantine_v1", { runId });
    if (typeof value !== "boolean") {
      throw new AgentRunStoreProtocolError("Agent Run Store returned an invalid quarantine result");
    }
    return value;
  }
}
