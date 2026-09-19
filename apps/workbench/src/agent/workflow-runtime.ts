import type {
  RegisteredWorkflow,
  WorkflowDirectory,
} from "../contracts/workflow.ts";
import type { AgentWorkflowIdentity } from "./agent-contracts.ts";

export type AgentWorkflowResolutionErrorCode =
  | "workflow-not-found"
  | "workflow-ambiguous"
  | "workflow-version-mismatch"
  | "workflow-owner-mismatch"
  | "workflow-operation-unavailable"
  | "workflow-entry-mismatch";

export class AgentWorkflowResolutionError extends Error {
  readonly code: AgentWorkflowResolutionErrorCode;

  constructor(code: AgentWorkflowResolutionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
function identity(workflow: RegisteredWorkflow): AgentWorkflowIdentity {
  return Object.freeze({
    id: workflow.id,
    contractVersion: workflow.contractVersion,
    ownerPluginId: workflow.ownerPluginId,
    ownerPluginVersion: workflow.ownerPluginVersion,
  });
}

/** Resolves immutable plugin-owned workflow definitions for an Agent session. */
export class AgentWorkflowRuntime {
  readonly #directory: WorkflowDirectory;
  readonly #availableOperationIds: ReadonlySet<string>;

  constructor(directory: WorkflowDirectory, availableOperationIds: readonly string[]) {
    this.#directory = directory;
    this.#availableOperationIds = new Set(availableOperationIds);
  }

  resolveEntryOperation(operationId: string): AgentWorkflowIdentity {
    const matches = this.#directory.list().filter(
      (workflow) => workflow.runtime === "agent-orchestration-v1"
        && workflow.entryOperationIds.includes(operationId),
    );
    if (matches.length === 0) throw new AgentWorkflowResolutionError(
      "workflow-not-found",
      `No active workflow owns Agent entry operation: ${operationId}`,
    );
    if (matches.length > 1) throw new AgentWorkflowResolutionError(
      "workflow-ambiguous",
      `Multiple active workflows own Agent entry operation: ${operationId}`,
    );
    const workflow = matches[0]!;
    this.#assertOperationsAvailable(workflow);
    return identity(workflow);
  }

  resolvePinned(
    expected: AgentWorkflowIdentity,
    entryOperationId: string,
  ): AgentWorkflowIdentity {
    const workflow = this.#directory.get(expected.id);
    if (workflow === undefined) throw new AgentWorkflowResolutionError(
      "workflow-not-found",
      `Pinned workflow is unavailable: ${expected.id}`,
    );
    if (workflow.contractVersion !== expected.contractVersion
      || workflow.ownerPluginVersion !== expected.ownerPluginVersion) {
      throw new AgentWorkflowResolutionError(
        "workflow-version-mismatch",
        `Pinned workflow version changed: ${expected.id}`,
      );
    }
    if (workflow.ownerPluginId !== expected.ownerPluginId) throw new AgentWorkflowResolutionError(
      "workflow-owner-mismatch",
      `Pinned workflow owner changed: ${expected.id}`,
    );
    if (!workflow.entryOperationIds.includes(entryOperationId)) {
      throw new AgentWorkflowResolutionError(
        "workflow-entry-mismatch",
        `Operation is not an entry point of pinned workflow: ${entryOperationId}`,
      );
    }
    this.#assertOperationsAvailable(workflow);
    return identity(workflow);
  }

  #assertOperationsAvailable(workflow: RegisteredWorkflow): void {
    const unavailable = workflow.operationIds.find((id) => !this.#availableOperationIds.has(id));
    if (unavailable !== undefined) throw new AgentWorkflowResolutionError(
      "workflow-operation-unavailable",
      `Workflow operation is unavailable to Agent: ${unavailable}`,
    );
  }
}
