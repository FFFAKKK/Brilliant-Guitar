import type { ScoreDocument } from "../domain/score-document";
import type {
  CommandResult,
  ReplayCoreCommandsResult,
} from "./contracts";
import { createCommandRuntime, submitCommand } from "./runtime";

export function replayCoreCommands(
  initialDocument: ScoreDocument,
  acceptedCommands: readonly unknown[],
): ReplayCoreCommandsResult {
  const created = createCommandRuntime(initialDocument);
  if (!created.ok) {
    return {
      status: "invalid-initial-document",
      failure: created.failure,
    };
  }

  let state = created.state;
  const results: CommandResult[] = [];
  for (let index = 0; index < acceptedCommands.length; index += 1) {
    const transition = submitCommand(state, acceptedCommands[index]);
    state = transition.state;
    results.push(structuredClone(transition.result));
    if (transition.result.status === "rejected") {
      return {
        status: "rejected",
        finalDocument: structuredClone(state.document),
        documentVersion: state.documentVersion,
        results,
        failedCommandIndex: index,
        failure: structuredClone(transition.result.failure),
      };
    }
  }

  return {
    status: "replayed",
    finalDocument: structuredClone(state.document),
    documentVersion: state.documentVersion,
    results,
  };
}
