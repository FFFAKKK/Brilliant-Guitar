import type {
  AgentApprovalDecision,
  AgentRequiredApproval,
} from "./agent-contracts.ts";
import type { AgentInvocationStatus } from "./invocation-state.ts";
import type { AgentInvocationRecord, AgentRunRecord } from "./run-controller.ts";

export type AgentApprovalExecutionOutcome =
  | "awaiting-decision"
  | "denied"
  | "approved-pending"
  | "succeeded"
  | "failed"
  | "outcome-unknown";

export interface AgentApprovalAuditItem {
  readonly invocationId: string;
  readonly capabilityId: string;
  readonly finalStatus: AgentInvocationStatus | "missing";
  readonly attemptCount: number;
  readonly retryCount: number;
}

export interface AgentApprovalAuditRecord {
  readonly approvalId: string;
  readonly requestEventId: string;
  readonly requestedAt: number;
  readonly approval: AgentRequiredApproval;
  readonly decisionEventId: string | null;
  readonly decidedAt: number | null;
  readonly decision: AgentApprovalDecision | null;
  readonly executionOutcome: AgentApprovalExecutionOutcome;
  readonly items: readonly AgentApprovalAuditItem[];
}

function invocationAuditItem(
  invocationId: string,
  capabilityId: string,
  invocation: AgentInvocationRecord | undefined,
): AgentApprovalAuditItem {
  return Object.freeze({
    invocationId,
    capabilityId,
    finalStatus: invocation?.state.status ?? "missing",
    attemptCount: invocation?.events.filter(
      (record) => record.event.type === "invocation.started",
    ).length ?? 0,
    retryCount: invocation?.events.filter(
      (record) => record.event.type === "invocation.retry-authorized",
    ).length ?? 0,
  });
}

function executionOutcome(
  decision: AgentApprovalDecision | null,
  items: readonly AgentApprovalAuditItem[],
): AgentApprovalExecutionOutcome {
  if (decision === null) return "awaiting-decision";
  if (decision.outcome === "denied") return "denied";
  if (items.some((item) => item.finalStatus === "outcome-unknown")) return "outcome-unknown";
  if (items.every((item) => item.finalStatus === "succeeded")) return "succeeded";
  if (items.some((item) => ["failed", "rejected", "cancelled", "timed-out", "missing"].includes(
    item.finalStatus,
  ))) return "failed";
  return "approved-pending";
}

export function projectAgentApprovalAudits(run: AgentRunRecord): readonly AgentApprovalAuditRecord[] {
  const decisions = new Map<string, Readonly<{
    eventId: string;
    occurredAt: number;
    decision: AgentApprovalDecision;
  }>>();
  for (const record of run.events) {
    if (record.event.type !== "approval.approved" && record.event.type !== "approval.denied") continue;
    decisions.set(record.event.decision.approvalId, {
      eventId: record.eventId,
      occurredAt: record.occurredAt,
      decision: record.event.decision,
    });
  }

  const audits: AgentApprovalAuditRecord[] = [];
  for (const record of run.events) {
    if (record.event.type !== "approval.required") continue;
    const approval = record.event.approval;
    const decision = decisions.get(approval.approvalId) ?? null;
    const items = Object.freeze(approval.items.map((item) => invocationAuditItem(
      item.invocationId,
      item.capabilityId,
      run.invocations.find((invocation) => invocation.invocationId === item.invocationId),
    )));
    audits.push(Object.freeze({
      approvalId: approval.approvalId,
      requestEventId: record.eventId,
      requestedAt: record.occurredAt,
      approval,
      decisionEventId: decision?.eventId ?? null,
      decidedAt: decision?.occurredAt ?? null,
      decision: decision?.decision ?? null,
      executionOutcome: executionOutcome(decision?.decision ?? null, items),
      items,
    }));
  }
  return Object.freeze(audits);
}

export function getAgentApprovalAudit(
  run: AgentRunRecord,
  approvalId: string,
): AgentApprovalAuditRecord | null {
  return projectAgentApprovalAudits(run).find((record) => record.approvalId === approvalId) ?? null;
}
