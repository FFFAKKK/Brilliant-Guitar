import type { ScoreDocument } from "../domain/score-document";
import { captureStrictInput } from "../codec/strict-input-capture";
import type {
  CommandResult,
  ReplayCoreCommandsResult,
} from "./contracts";
import { createCommandRuntime, submitCommand } from "./runtime";
import { createIntegratedCommandBus } from "./integrated-runtime";
import type {
  KernelCommandFailure,
  KernelCommandResult,
  KernelIntegratedCatalog,
  ReplayKernelCommandsResult,
} from "../registry/integrated-contracts";
import { readDenseArray } from "../registry/strict-codec";

const structuredCloneValue = structuredClone;

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
    results[results.length] = structuredCloneValue(transition.result);
    if (transition.result.status === "rejected") {
      return {
        status: "rejected",
        finalDocument: structuredCloneValue(state.document),
        documentVersion: state.documentVersion,
        results,
        failedCommandIndex: index,
        failure: structuredCloneValue(transition.result.failure),
      };
    }
  }

  return {
    status: "replayed",
    finalDocument: structuredCloneValue(state.document),
    documentVersion: state.documentVersion,
    results,
  };
}

export function replayKernelCommands(
  initialDocument: ScoreDocument,
  acceptedCommands: readonly unknown[],
  catalog: KernelIntegratedCatalog,
): ReplayKernelCommandsResult;
export function replayKernelCommands(
  initialDocument: ScoreDocument,
  acceptedCommands: readonly unknown[],
  catalog: KernelIntegratedCatalog,
  knownRequirements: unknown,
): ReplayKernelCommandsResult;
export function replayKernelCommands(
  initialDocument: ScoreDocument,
  acceptedCommands: readonly unknown[],
  catalog: KernelIntegratedCatalog,
  knownRequirements?: unknown,
): ReplayKernelCommandsResult {
  const created = createIntegratedCommandBus(
    initialDocument,
    catalog,
    knownRequirements,
    arguments.length >= 4,
  );
  if (!created.ok) {
    return {
      status: "invalid-initial-document",
      failure: created.failure,
    };
  }

  const capturedCommands = captureStrictInput(acceptedCommands);
  const commands = capturedCommands.status === "captured"
    ? readDenseArray(capturedCommands.value)
    : undefined;
  if (commands === undefined) {
    const read = created.value.read();
    if (!read.ok) {
      return {
        status: "invalid-initial-document",
        failure: { code: "command.assembly-mismatch" },
      };
    }
    const failure: KernelCommandFailure =
      capturedCommands.status === "resource-limit-exceeded"
        ? {
            code: "command.resource-limit-exceeded",
            limitKind: capturedCommands.limitKind,
            limit: capturedCommands.limit,
            actual: capturedCommands.actual,
          }
        : { code: "command.invalid-envelope" };
    return {
      status: "rejected",
      finalDocument: structuredCloneValue(read.value.snapshot.document),
      documentVersion: read.value.snapshot.documentVersion,
      results: [],
      failedCommandIndex: 0,
      failure,
      writeAvailability: read.value.writeAvailability,
      validationAvailability: read.value.validationAvailability,
    };
  }

  const results: KernelCommandResult[] = [];
  for (let index = 0; index < commands.length; index += 1) {
    const result = created.value.submit(commands[index]);
    results[results.length] = structuredCloneValue(result);
    if (result.status === "rejected") {
      const read = created.value.read();
      if (!read.ok) {
        return {
          status: "invalid-initial-document",
          failure: { code: "command.assembly-mismatch" },
        };
      }
      return {
        status: "rejected",
        finalDocument: structuredCloneValue(read.value.snapshot.document),
        documentVersion: read.value.snapshot.documentVersion,
        results,
        failedCommandIndex: index,
        failure: structuredCloneValue(result.failure),
        writeAvailability: read.value.writeAvailability,
        validationAvailability: read.value.validationAvailability,
      };
    }
  }
  const read = created.value.read();
  if (!read.ok) {
    return {
      status: "invalid-initial-document",
      failure: { code: "command.assembly-mismatch" },
    };
  }
  return {
    status: "replayed",
    finalDocument: structuredCloneValue(read.value.snapshot.document),
    documentVersion: read.value.snapshot.documentVersion,
    results,
    writeAvailability: read.value.writeAvailability,
    validationAvailability: read.value.validationAvailability,
  };
}
