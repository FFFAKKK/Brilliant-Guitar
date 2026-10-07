export * from "@brilliant-guitar/agent-runtime/runtime/run-controller";
import { AgentRunController as CoreController, type AgentRunControllerDependencies } from "@brilliant-guitar/agent-runtime/runtime/run-controller";
import type { AgentWorkspaceScope } from "./agent-contracts.ts";

function sameMeasureSelection(
  left: AgentWorkspaceScope["selection"],
  right: AgentWorkspaceScope["selection"],
): boolean {
  return left !== null
    && right !== null
    && left.kind === right.kind
    && left.documentId === right.documentId
    && left.documentVersion === right.documentVersion
    && left.startMeasureId === right.startMeasureId
    && left.endMeasureId === right.endMeasureId;
}

/** Software compatibility composition; execution is inherited from the single core Controller. */
export class AgentRunController extends CoreController {
  constructor(dependencies: AgentRunControllerDependencies) {
    super({ ...dependencies, validateProvidedInput: dependencies.validateProvidedInput ?? ((required, provided, workspace) =>
      sameMeasureSelection(provided.selection, workspace.selection)
      && provided.selection.documentId === required.constraints.documentId) });
  }
}
