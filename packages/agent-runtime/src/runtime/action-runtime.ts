import type { CapabilityResult, CapabilityTransportRequest } from "../contracts/capability.ts";
import type { AgentTaskIntent, AgentWorkspaceScope } from "./agent-contracts.ts";
import { AgentCapabilityPortError } from "./capability-port.ts";
import type { AgentCapabilityPort } from "./capability-port.ts";
import type {
  AgentPreparedExecution,
  AgentPreparedMutationPort,
  AgentPreparedMutationRequest,
} from "./prepared-mutation.ts";
import { AgentWorkflowResolutionError, AgentWorkflowRuntime } from "./workflow-runtime.ts";
import type { WorkflowRuntimeContext } from "./workflow-runtime.ts";
import type { AgentReadPreview, AgentReadResultLimitV1 } from "../contracts/tool-feedback-admission.ts";
import { snapshotAgentValue } from "./tool-feedback.ts";

export class AgentActionRuntimeError extends AgentCapabilityPortError {
  constructor(message: string) {
    super(message, "definite-failure");
  }
}

/** One Agent effect boundary; the controller still owns approval, receipts and recovery. */
export class AgentActionRuntime {
  readonly #capabilities: AgentCapabilityPort;
  readonly #preparedMutations: AgentPreparedMutationPort;
  readonly #workflows: AgentWorkflowRuntime | null;

  constructor(
    capabilities: AgentCapabilityPort,
    preparedMutations: AgentPreparedMutationPort,
    workflows: AgentWorkflowRuntime | null = null,
  ) {
    this.#capabilities = capabilities;
    this.#preparedMutations = preparedMutations;
    this.#workflows = workflows;
  }

  context(
    intent: AgentTaskIntent,
    workspace: AgentWorkspaceScope,
    rangeBudget: number,
  ): WorkflowRuntimeContext | null {
    if (intent.workflow === undefined) return null;
    const entry = intent.requestedCapabilityIds[0];
    if (this.#workflows === null || intent.requestedCapabilityIds.length !== 1 || entry === undefined) {
      throw new AgentActionRuntimeError("Pinned workflow is unavailable to this Agent Run");
    }
    try {
      return this.#workflows.createContext(intent.workflow, entry, workspace, rangeBudget);
    } catch (error) {
      if (error instanceof AgentWorkflowResolutionError || error instanceof RangeError) {
        throw new AgentActionRuntimeError(error.message);
      }
      throw error;
    }
  }

  async prepare(
    request: AgentPreparedMutationRequest,
    context: WorkflowRuntimeContext | null,
  ): Promise<AgentPreparedExecution> {
    this.#authorize(context, request.capabilityId);
    return this.#preparedMutations.prepare(request);
  }

  async invoke(
    request: CapabilityTransportRequest,
    workspace: AgentWorkspaceScope,
    rangeBudget: number,
    context: WorkflowRuntimeContext | null,
    operationId: string = request.capabilityId,
    resultLimit?: AgentReadResultLimitV1,
  ): Promise<CapabilityResult<unknown>> {
    this.#authorize(context, operationId);
    return this.#capabilities.invoke(resultLimit ? snapshotAgentValue(request) : request,
      resultLimit ? snapshotAgentValue({ workspace, rangeBudget, resultLimit }) : { workspace, rangeBudget });
  }

  previewRead(request: CapabilityTransportRequest, workspace: AgentWorkspaceScope, rangeBudget: number,
    context: WorkflowRuntimeContext | null, resultLimit: AgentReadResultLimitV1): AgentReadPreview {
    this.#authorize(context, request.capabilityId);
    return this.#capabilities.previewRead?.(request, snapshotAgentValue({ workspace, rangeBudget, resultLimit })) ?? { status: "unsupported" };
  }

  #authorize(context: WorkflowRuntimeContext | null, operationId: string): void {
    if (context === null) return;
    try {
      context.assertOperation(operationId);
    } catch (error) {
      if (error instanceof AgentWorkflowResolutionError) {
        throw new AgentActionRuntimeError(error.message);
      }
      throw error;
    }
  }
}
