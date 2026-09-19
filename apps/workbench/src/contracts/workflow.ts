export const AGENT_ORCHESTRATION_WORKFLOW_RUNTIME = "agent-orchestration-v1" as const;

export type WorkflowRuntimeId = typeof AGENT_ORCHESTRATION_WORKFLOW_RUNTIME;

/**
 * A workflow is an aggregate entry point over application operations. The
 * plugin platform owns registration and lifecycle; a runtime owns execution.
 */
export interface WorkflowContribution {
  readonly id: string;
  readonly contractVersion: number;
  readonly name: string;
  readonly description: string;
  readonly runtime: WorkflowRuntimeId;
  /** Operations the workflow runtime may expose while executing this workflow. */
  readonly operationIds: readonly string[];
  /** Operations that may be used to deterministically select this workflow. */
  readonly entryOperationIds: readonly string[];
}
export interface RegisteredWorkflow extends WorkflowContribution {
  readonly ownerPluginId: string;
  readonly ownerPluginVersion: string;
}

/** Read-only session directory. Its contents are frozen when PluginPlatform starts. */
export interface WorkflowDirectory {
  get(id: string): RegisteredWorkflow | undefined;
  list(): readonly RegisteredWorkflow[];
  listByPlugin(ownerPluginId: string): readonly RegisteredWorkflow[];
}
