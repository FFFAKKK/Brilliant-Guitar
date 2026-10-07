import {
  isScoreCommitMetadataTransactionInputV1,
  isScoreCommitTempoChangeInputV1,
  isScorePrepareTempoChangeInputV1,
  isScoreUpdateMetadataInputV1,
} from "../contracts/capability.ts";
import type {
  CapabilityDocumentPrecondition,
  ScoreCommitMetadataTransactionInputV1,
  ScoreCommitTempoChangeInputV1,
  ScoreMetadataTransactionChangeSetV1,
  ScoreUpdateMetadataInputV1,
} from "../contracts/capability.ts";
import type {
  AgentApprovalPreview,
} from "./agent-contracts.ts";
import {
  ScoreChangeSetPortError,
} from "./score-change-set-port.ts";
import type {
  ScoreChangeSetPort,
} from "./score-change-set-port.ts";

import { AgentPreparedMutationError, isAgentPreparedExecution as isPreparedEnvelope } from "@brilliant-guitar/agent-runtime/runtime/prepared-mutation";
import type { AgentPreparedExecution, AgentPreparedMutationRequest, AgentPreparedMutationPort } from "@brilliant-guitar/agent-runtime/runtime/prepared-mutation";
export { AgentPreparedMutationError, UnavailableAgentPreparedMutationPort, capabilityRequestForInvocation, normalizeCapabilityResultForInvocation } from "@brilliant-guitar/agent-runtime/runtime/prepared-mutation";
export type { AgentPreparedExecution, AgentPreparedMutationRequest, AgentPreparedMutationPort } from "@brilliant-guitar/agent-runtime/runtime/prepared-mutation";

export function isAgentPreparedExecution(value: unknown): value is AgentPreparedExecution {
  if (!isPreparedEnvelope(value)) return false;
  const candidate = value as unknown as Record<string, unknown>;
  const preparation = candidate.preparation as Record<string, unknown>;
  const commit = candidate.commit as Record<string, unknown>;
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

export class FirstPartyPreparedMutationCoordinator implements AgentPreparedMutationPort {
  private readonly changeSets: ScoreChangeSetPort;

  constructor(changeSets: ScoreChangeSetPort) {
    this.changeSets = changeSets;
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
    let changeSet;
    try {
      changeSet = await this.changeSets.prepareTempoChange(request.input, {
        preparationInvocationId: request.preparationInvocationId,
        workspaceId: request.workspace.workspaceId,
        documentPrecondition,
      });
    } catch (error) {
      if (error instanceof ScoreChangeSetPortError) {
        throw new AgentPreparedMutationError(error.message, error.outcome);
      }
      throw error;
    }
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
        capabilityId: "score.prepare-tempo-change",
        contractVersion: 1,
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
    let changeSet;
    try {
      changeSet = await this.changeSets.prepareMetadataTransaction(input, {
        preparationInvocationId: request.preparationInvocationId,
        workspaceId: request.workspace.workspaceId,
        documentPrecondition,
      });
    } catch (error) {
      if (error instanceof ScoreChangeSetPortError) {
        throw new AgentPreparedMutationError(error.message, error.outcome);
      }
      throw error;
    }
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
        capabilityId: "score.prepare-metadata-transaction",
        contractVersion: 1,
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
