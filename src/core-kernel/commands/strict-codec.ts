import { captureStrictInput } from "../codec/strict-input-capture";
import { deepFreezeValue } from "../read/deep-freeze";
import type { CommandFailure, CoreCommandEnvelope } from "./contracts";
import {
  decodeCoreCommandTarget,
  decodeCoreCommandTargetKind,
  readExactRecord,
} from "./core-command-adapters";
import {
  DEFAULT_CORE_EXECUTION_ASSEMBLY,
  findCoreExecutionDefinition,
  type CoreExecutionAssembly,
} from "./execution-assembly";

export type DecodeResult =
  | { readonly ok: true; readonly value: CoreCommandEnvelope }
  | { readonly ok: false; readonly failure: CommandFailure };

function ownDataValue(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function invalidEnvelope(): DecodeResult {
  return { ok: false, failure: { code: "command.invalid-envelope" } };
}

function decodeBoundedVnextCommand(
  input: unknown,
  commandVersion: number,
  commandId: string,
  assembly: CoreExecutionAssembly,
): DecodeResult {
  const captured = captureStrictInput(input);
  if (captured.status === "resource-limit-exceeded") {
    return {
      ok: false,
      failure: {
        code: "command.resource-limit-exceeded",
        limitKind: captured.limitKind,
        limit: captured.limit,
        actual: captured.actual,
      },
    };
  }
  if (captured.status === "invalid") {
    return invalidEnvelope();
  }

  const envelope = readExactRecord(captured.value, [
    "commandVersion",
    "commandId",
    "target",
    "payload",
  ]);
  if (envelope === undefined) {
    return invalidEnvelope();
  }
  const capturedVersion = ownDataValue(envelope, "commandVersion");
  const capturedId = ownDataValue(envelope, "commandId");
  const capturedTarget = ownDataValue(envelope, "target");
  const capturedPayload = ownDataValue(envelope, "payload");
  if (capturedVersion !== commandVersion || capturedId !== commandId) {
    return invalidEnvelope();
  }
  const definition = findCoreExecutionDefinition(assembly, commandId);
  if (definition === undefined) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const capturedTargetKind = decodeCoreCommandTargetKind(capturedTarget);
  if (capturedTargetKind !== definition.targetKind) {
    return invalidEnvelope();
  }
  const target = decodeCoreCommandTarget(capturedTarget, definition.targetKind);
  if (target === undefined) {
    return invalidEnvelope();
  }
  const decoded = definition.decodePayload(capturedPayload, target);
  return decoded === undefined
    ? invalidEnvelope()
    : { ok: true, value: deepFreezeValue(decoded) };
}

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
      return invalidEnvelope();
    }
    const commandVersion = ownDataValue(envelope, "commandVersion");
    if (
      typeof commandVersion !== "number" ||
      !Number.isSafeInteger(commandVersion)
    ) {
      return invalidEnvelope();
    }
    if (commandVersion !== 1) {
      return { ok: false, failure: { code: "command.unsupported-version" } };
    }
    const commandId = ownDataValue(envelope, "commandId");
    if (typeof commandId !== "string") {
      return invalidEnvelope();
    }
    const definition = findCoreExecutionDefinition(assembly, commandId);
    if (definition === undefined) {
      return { ok: false, failure: { code: "command.unknown-id" } };
    }
    const rawTarget = ownDataValue(envelope, "target");
    const actualTargetKind = decodeCoreCommandTargetKind(rawTarget);
    if (actualTargetKind === undefined) {
      return invalidEnvelope();
    }
    if (actualTargetKind !== definition.targetKind) {
      return { ok: false, failure: { code: "command.target-mismatch" } };
    }
    if (definition.inputBoundary === "vnext-bounded-v1") {
      return decodeBoundedVnextCommand(
        input,
        commandVersion,
        commandId,
        assembly,
      );
    }

    const target = decodeCoreCommandTarget(rawTarget, definition.targetKind);
    if (target === undefined) {
      return invalidEnvelope();
    }
    const decoded = definition.decodePayload(
      ownDataValue(envelope, "payload"),
      target,
    );
    return decoded === undefined
      ? invalidEnvelope()
      : { ok: true, value: deepFreezeValue(decoded) };
  } catch {
    return invalidEnvelope();
  }
}
