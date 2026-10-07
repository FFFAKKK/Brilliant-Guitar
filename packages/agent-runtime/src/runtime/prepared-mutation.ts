import type { CapabilityDocumentPrecondition, CapabilityResult, CapabilityTransportRequest } from "../contracts/capability.ts";
import { isAgentApprovalPreview } from "./agent-contracts.ts";
import type { AgentApprovalPreview, AgentWorkspaceScope } from "./agent-contracts.ts";

export interface AgentPreparedExecution {
  readonly kind: "change-set";
  readonly changeSetId: string;
  readonly preparation: Readonly<{
    invocationId: string;
    capabilityId: string;
    contractVersion: number;
  }>;
  readonly commit: Readonly<{
    capabilityId: string;
    contractVersion: number;
    documentPrecondition: CapabilityDocumentPrecondition;
    input: unknown;
  }>;
  readonly approvalSummary: string;
  readonly approvalPreview: AgentApprovalPreview;
}

export interface AgentPreparedMutationRequest {
  readonly preparationInvocationId: string;
  readonly capabilityId: string;
  readonly contractVersion: number;
  readonly input: unknown;
  readonly workspace: AgentWorkspaceScope;
  readonly rangeBudget: number;
}

export interface AgentPreparedMutationPort {
  prepare(request: AgentPreparedMutationRequest): Promise<AgentPreparedExecution>;
}

export class AgentPreparedMutationError extends Error {
  readonly outcome: "definite-failure" | "unknown";

  constructor(message: string, outcome: "definite-failure" | "unknown") {
    super(message);
    this.outcome = outcome;
  }
}

/**
 * Fail-closed default for runtimes that have not supplied the typed
 * prepared mutation adapter. It must never reconstruct a generic prepare RPC.
 */
export class UnavailableAgentPreparedMutationPort implements AgentPreparedMutationPort {
  async prepare(): Promise<AgentPreparedExecution> {
    throw new AgentPreparedMutationError(
      "Prepared mutation adapter is unavailable",
      "definite-failure",
    );
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasOnlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function isDocumentPrecondition(value: unknown): value is CapabilityDocumentPrecondition {
  const candidate = record(value);
  return candidate !== null
    && hasOnlyKeys(candidate, ["documentId", "documentVersion"])
    && isStableId(candidate.documentId)
    && Number.isSafeInteger(candidate.documentVersion)
    && (candidate.documentVersion as number) >= 0;
}

export function isAgentPreparedExecution(value: unknown): value is AgentPreparedExecution {
  const candidate = record(value);
  if (candidate === null
    || !hasOnlyKeys(candidate, [
      "kind",
      "changeSetId",
      "preparation",
      "commit",
      "approvalSummary",
      "approvalPreview",
    ])
    || candidate.kind !== "change-set"
    || typeof candidate.changeSetId !== "string"
    || !/^sha256:[0-9a-f]{64}$/.test(candidate.changeSetId)
    || typeof candidate.approvalSummary !== "string"
    || candidate.approvalSummary.length === 0
    || candidate.approvalSummary.length > 512
    || !isAgentApprovalPreview(candidate.approvalPreview)) return false;

  const preparation = record(candidate.preparation);
  const commit = record(candidate.commit);
  if (preparation === null
    || !hasOnlyKeys(preparation, ["invocationId", "capabilityId", "contractVersion"])
    || !isStableId(preparation.invocationId)
    || !isStableId(preparation.capabilityId)
    || preparation.contractVersion !== 1
    || commit === null
    || !hasOnlyKeys(commit, ["capabilityId", "contractVersion", "documentPrecondition", "input"])
    || !isStableId(commit.capabilityId)
    || commit.contractVersion !== 1
    || !isDocumentPrecondition(commit.documentPrecondition)) return false;

  return true;
}

interface PreparedInvocationLike {
  readonly invocationId: string;
  readonly capabilityId: string;
  readonly contractVersion: number;
  readonly input: unknown;
  readonly preparedExecution?: AgentPreparedExecution | null;
}

export function capabilityRequestForInvocation(
  invocation: PreparedInvocationLike,
  workspace: AgentWorkspaceScope,
): CapabilityTransportRequest {
  const prepared = invocation.preparedExecution;
  if (prepared !== undefined && prepared !== null) return {
    invocationId: invocation.invocationId,
    capabilityId: prepared.commit.capabilityId,
    contractVersion: prepared.commit.contractVersion,
    workspaceId: workspace.workspaceId,
    documentPrecondition: prepared.commit.documentPrecondition,
    input: prepared.commit.input,
  };
  return {
    invocationId: invocation.invocationId,
    capabilityId: invocation.capabilityId,
    contractVersion: invocation.contractVersion,
    workspaceId: workspace.workspaceId,
    documentPrecondition: workspace.documentId === null || workspace.documentVersion === null
      ? null
      : {
          documentId: workspace.documentId,
          documentVersion: workspace.documentVersion,
        },
    input: invocation.input,
  };
}

export function normalizeCapabilityResultForInvocation(
  invocation: PreparedInvocationLike,
  result: CapabilityResult<unknown>,
): CapabilityResult<unknown> {
  if (invocation.preparedExecution === undefined || invocation.preparedExecution === null) {
    return result;
  }
  return result.status === "completed"
    ? {
        status: result.status,
        invocationId: invocation.invocationId,
        capabilityId: invocation.capabilityId,
        contractVersion: invocation.contractVersion,
        data: result.data,
      }
    : {
        status: result.status,
        invocationId: invocation.invocationId,
        capabilityId: invocation.capabilityId,
        contractVersion: invocation.contractVersion,
        code: result.code,
        message: result.message,
      };
}
