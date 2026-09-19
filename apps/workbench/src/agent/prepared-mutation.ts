import {
  isScoreCommitMetadataTransactionInputV1,
  isScoreCommitTempoChangeInputV1,
  isScoreMetadataTransactionChangeSetV1,
  isScorePrepareTempoChangeInputV1,
  isScoreTempoChangeSetV1,
  isScoreUpdateMetadataInputV1,
} from "../contracts/capability.ts";
import type {
  CapabilityDocumentPrecondition,
  CapabilityResult,
  CapabilityTransportRequest,
  ScoreCommitMetadataTransactionInputV1,
  ScoreCommitTempoChangeInputV1,
  ScoreMetadataTransactionChangeSetV1,
  ScoreUpdateMetadataInputV1,
} from "../contracts/capability.ts";
import { isAgentApprovalPreview } from "./agent-contracts.ts";
import type {
  AgentApprovalPreview,
  AgentWorkspaceScope,
} from "./agent-contracts.ts";
import type {
  AgentCapabilityInvocationContext,
  AgentCapabilityPort,
} from "./capability-port.ts";

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

  const precondition = commit.documentPrecondition as CapabilityDocumentPrecondition;
  const preview = candidate.approvalPreview as AgentApprovalPreview;
  if (preparation.capabilityId === "score.prepare-tempo-change"
    && commit.capabilityId === "score.commit-tempo-change"
    && isScoreCommitTempoChangeInputV1(commit.input)) {
    const input = commit.input as ScoreCommitTempoChangeInputV1;
    return input.changeSet.changeSetId === candidate.changeSetId
      && input.changeSet.documentId === precondition.documentId
      && input.changeSet.baseDocumentVersion === precondition.documentVersion
      && preview.kind === "field-change"
      && preview.field === "score.tempo"
      && preview.before === `${input.changeSet.beforeTempoBpm} BPM`
      && preview.after === `${input.changeSet.afterTempoBpm} BPM`;
  }
  if (preparation.capabilityId === "score.prepare-metadata-transaction"
    && commit.capabilityId === "score.commit-metadata-transaction"
    && isScoreCommitMetadataTransactionInputV1(commit.input)) {
    const input = commit.input as ScoreCommitMetadataTransactionInputV1;
    return input.changeSet.changeSetId === candidate.changeSetId
      && input.changeSet.documentId === precondition.documentId
      && input.changeSet.baseDocumentVersion === precondition.documentVersion
      && metadataApprovalPreviewMatches(preview, input.changeSet);
  }
  return false;
}

function metadataApprovalPreviewMatches(
  preview: AgentApprovalPreview,
  changeSet: ScoreMetadataTransactionChangeSetV1,
): boolean {
  if (preview.kind !== "change-list" || preview.changes.length !== changeSet.operations.length) {
    return false;
  }
  const expected = metadataApprovalChanges(changeSet);
  return preview.changes.every((change, index) => {
    const item = expected[index];
    return item !== undefined
      && change.field === item.field
      && change.before === item.before
      && change.after === item.after;
  });
}

function metadataApprovalChanges(changeSet: ScoreMetadataTransactionChangeSetV1) {
  return changeSet.operations.map((operation) => operation === "set-title"
    ? {
        kind: "field-change" as const,
        field: "score.title",
        before: changeSet.before.title,
        after: changeSet.after.title,
      }
    : {
        kind: "field-change" as const,
        field: "score.tempo",
        before: `${changeSet.before.tempoBpm} BPM`,
        after: `${changeSet.after.tempoBpm} BPM`,
      });
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

export class FirstPartyPreparedMutationCoordinator implements AgentPreparedMutationPort {
  private readonly capabilities: AgentCapabilityPort;

  constructor(capabilities: AgentCapabilityPort) {
    this.capabilities = capabilities;
  }

  async prepare(request: AgentPreparedMutationRequest): Promise<AgentPreparedExecution> {
    if (request.capabilityId === "score.update-metadata"
      && request.contractVersion === 1
      && isScoreUpdateMetadataInputV1(request.input)) {
      return this.prepareMetadataTransaction(request, request.input);
    }
    if (request.capabilityId !== "score.update-tempo"
      || request.contractVersion !== 1
      || !isScorePrepareTempoChangeInputV1(request.input)) {
      throw new AgentPreparedMutationError("Prepared mutation is unsupported", "definite-failure");
    }
    if (request.workspace.documentId === null || request.workspace.documentVersion === null) {
      throw new AgentPreparedMutationError(
        "Prepared mutation requires a versioned document",
        "definite-failure",
      );
    }

    const documentPrecondition = {
      documentId: request.workspace.documentId,
      documentVersion: request.workspace.documentVersion,
    };
    const preparationRequest: CapabilityTransportRequest = {
      invocationId: request.preparationInvocationId,
      capabilityId: "score.prepare-tempo-change",
      contractVersion: 1,
      workspaceId: request.workspace.workspaceId,
      documentPrecondition,
      input: request.input,
    };
    const context: AgentCapabilityInvocationContext = {
      workspace: request.workspace,
      rangeBudget: request.rangeBudget,
    };
    const result = await this.capabilities.invoke(preparationRequest, context);
    if (result.status !== "completed" || !isScoreTempoChangeSetV1(result.data)) {
      throw new AgentPreparedMutationError(
        result.status === "completed" ? "Prepared mutation returned invalid data" : result.message,
        "definite-failure",
      );
    }
    const changeSet = result.data;
    if (changeSet.documentId !== documentPrecondition.documentId
      || changeSet.baseDocumentVersion !== documentPrecondition.documentVersion
      || changeSet.afterTempoBpm !== request.input.tempoBpm) {
      throw new AgentPreparedMutationError(
        "Prepared mutation does not match the requested intent",
        "definite-failure",
      );
    }

    return {
      kind: "change-set",
      changeSetId: changeSet.changeSetId,
      preparation: {
        invocationId: request.preparationInvocationId,
        capabilityId: preparationRequest.capabilityId,
        contractVersion: preparationRequest.contractVersion,
      },
      commit: {
        capabilityId: "score.commit-tempo-change",
        contractVersion: 1,
        documentPrecondition,
        input: { changeSet },
      },
      approvalSummary: `将作品速度从 ${changeSet.beforeTempoBpm} BPM 修改为 ${changeSet.afterTempoBpm} BPM`,
      approvalPreview: {
        kind: "field-change",
        field: "score.tempo",
        before: `${changeSet.beforeTempoBpm} BPM`,
        after: `${changeSet.afterTempoBpm} BPM`,
      },
    };
  }

  private async prepareMetadataTransaction(
    request: AgentPreparedMutationRequest,
    input: ScoreUpdateMetadataInputV1,
  ): Promise<AgentPreparedExecution> {
    if (request.workspace.documentId === null || request.workspace.documentVersion === null) {
      throw new AgentPreparedMutationError(
        "Prepared mutation requires a versioned document",
        "definite-failure",
      );
    }
    const documentPrecondition = {
      documentId: request.workspace.documentId,
      documentVersion: request.workspace.documentVersion,
    };
    const preparationRequest: CapabilityTransportRequest = {
      invocationId: request.preparationInvocationId,
      capabilityId: "score.prepare-metadata-transaction",
      contractVersion: 1,
      workspaceId: request.workspace.workspaceId,
      documentPrecondition,
      input,
    };
    const result = await this.capabilities.invoke(preparationRequest, {
      workspace: request.workspace,
      rangeBudget: request.rangeBudget,
    });
    if (result.status !== "completed" || !isScoreMetadataTransactionChangeSetV1(result.data)) {
      throw new AgentPreparedMutationError(
        result.status === "completed" ? "Prepared mutation returned invalid data" : result.message,
        "definite-failure",
      );
    }
    const changeSet = result.data;
    if (changeSet.documentId !== documentPrecondition.documentId
      || changeSet.baseDocumentVersion !== documentPrecondition.documentVersion
      || input.title !== undefined && changeSet.after.title !== input.title
      || input.tempoBpm !== undefined && changeSet.after.tempoBpm !== input.tempoBpm) {
      throw new AgentPreparedMutationError(
        "Prepared mutation does not match the requested intent",
        "definite-failure",
      );
    }
    const changes = metadataApprovalChanges(changeSet);
    return {
      kind: "change-set",
      changeSetId: changeSet.changeSetId,
      preparation: {
        invocationId: request.preparationInvocationId,
        capabilityId: preparationRequest.capabilityId,
        contractVersion: preparationRequest.contractVersion,
      },
      commit: {
        capabilityId: "score.commit-metadata-transaction",
        contractVersion: 1,
        documentPrecondition,
        input: { changeSet },
      },
      approvalSummary: `将一次性修改作品的 ${changes.length} 项元数据`,
      approvalPreview: {
        kind: "change-list",
        changes,
      },
    };
  }
}
