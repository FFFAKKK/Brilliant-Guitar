import type {
  CommandFailure,
  CoreCommandEnvelope,
} from "./contracts";
import {
  decodeCoreCommandTarget,
  decodeCoreCommandTargetKind,
  readExactRecord,
} from "./core-command-adapters";
import {
  type CoreExecutionAssembly,
  DEFAULT_CORE_EXECUTION_ASSEMBLY,
  findCoreExecutionDefinition,
} from "./execution-assembly";
import { deepFreezeValue } from "../read/deep-freeze";

export type DecodeResult =
  | { readonly ok: true; readonly value: CoreCommandEnvelope }
  | { readonly ok: false; readonly failure: CommandFailure };

export function decodeCoreCommand(
  input: unknown,
  assembly: CoreExecutionAssembly = DEFAULT_CORE_EXECUTION_ASSEMBLY,
): DecodeResult {
  try {
    const envelope = readExactRecord(input, [
      "commandVersion",
      "commandId",
      "target",
      "payload",
    ]);
    if (envelope === undefined) {
      return { ok: false, failure: { code: "command.invalid-envelope" } };
    }
    if (
      typeof envelope.commandVersion !== "number" ||
      !Number.isSafeInteger(envelope.commandVersion)
    ) {
      return { ok: false, failure: { code: "command.invalid-envelope" } };
    }
    if (envelope.commandVersion !== 1) {
      return { ok: false, failure: { code: "command.unsupported-version" } };
    }
    if (typeof envelope.commandId !== "string") {
      return { ok: false, failure: { code: "command.invalid-envelope" } };
    }
    const definition = findCoreExecutionDefinition(
      assembly,
      envelope.commandId,
    );
    if (definition === undefined) {
      return { ok: false, failure: { code: "command.unknown-id" } };
    }
    const actualTargetKind = decodeCoreCommandTargetKind(envelope.target);
    if (actualTargetKind === undefined) {
      return { ok: false, failure: { code: "command.invalid-envelope" } };
    }
    if (actualTargetKind !== definition.targetKind) {
      return { ok: false, failure: { code: "command.target-mismatch" } };
    }
    const target = decodeCoreCommandTarget(envelope.target, definition.targetKind);
    if (target === undefined) {
      return { ok: false, failure: { code: "command.invalid-envelope" } };
    }
    const decoded = definition.decodePayload(envelope.payload, target);
    return decoded === undefined
      ? { ok: false, failure: { code: "command.invalid-envelope" } }
      : { ok: true, value: deepFreezeValue(decoded) };
  } catch {
    return { ok: false, failure: { code: "command.invalid-envelope" } };
  }
}
