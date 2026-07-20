import type { JsonObject, JsonValue } from "../domain/extensions";
import type { CommandFailure } from "../commands/contracts";
import type { EventSubscriptionResult } from "../events/contracts";
import type { CheckpointFailure, ReadFailure } from "../read/contracts";
import {
  isSafeRegistryId,
  readDenseArray,
  readExactDataRecord,
} from "../registry/strict-codec";
import type {
  KernelCapability,
  KernelRegistryAccessFailure,
  KernelRegistryStartupFailure,
} from "../registry/contracts";
import type {
  Diagnostic,
  DiagnosticCode,
  DiagnosticPath,
} from "../validation/diagnostics";
import type { KernelIssueSource } from "./contracts";

const DIAGNOSTIC_CODES = new Set<string>([
  "decode.encode-failed",
  "decode.extra-field",
  "decode.json-syntax",
  "decode.json-value",
  "decode.non-finite-number",
  "decode.required-field",
  "decode.type",
  "decode.union",
  "decode.unreadable-input",
  "decode.unsupported-schema-version",
  "semantic.extension-duplicate",
  "semantic.extension-namespace-invalid",
  "semantic.extension-owner-missing",
  "semantic.extension-payload-invalid",
  "semantic.extension-schema-version-invalid",
  "semantic.fraction-non-canonical",
  "semantic.fraction-sign-invalid",
  "semantic.id-duplicate",
  "semantic.id-empty",
  "semantic.measure-coverage-duplicate",
  "semantic.measure-coverage-missing",
  "semantic.measure-duration-invalid",
  "semantic.measure-reference-missing",
  "semantic.measure-required",
  "semantic.meter-denominator-invalid",
  "semantic.meter-numerator-invalid",
  "semantic.note-value-invalid",
  "semantic.notes-required",
  "semantic.part-required",
  "semantic.pickup-exceeds-measure",
  "semantic.sequence-exceeds-measure",
  "semantic.sequence-start-out-of-bounds",
  "semantic.sounding-pitch-invalid",
  "semantic.staff-line-count-invalid",
  "semantic.staff-reference-missing",
  "semantic.staff-required",
  "semantic.tempo-invalid",
  "semantic.time-arithmetic-overflow",
  "semantic.transposition-invalid",
  "semantic.voice-required",
  "semantic.written-pitch-invalid",
  "unsupported.chord",
  "unsupported.dots",
  "unsupported.meter",
  "unsupported.note-value-base",
  "unsupported.part-count",
  "unsupported.pickup",
  "unsupported.sequence-duration",
  "unsupported.sequence-start",
  "unsupported.staff-count",
  "unsupported.time-modification",
  "unsupported.voice-count",
]);

const COMMAND_CODE_ONLY_FAILURES = new Set<string>([
  "command.invalid-envelope",
  "command.unsupported-version",
  "command.unknown-id",
  "command.target-mismatch",
  "command.target-not-found",
  "command.anchor-not-found",
  "command.anchor-wrong-owner",
  "command.version-overflow",
  "command.internal-error",
  "history.empty-undo",
  "history.empty-redo",
  "history.invariant-violation",
  "event.reentrant-write",
  "event.sequence-overflow",
]);

const CHECKPOINT_FAILURE_CODES = new Set<string>([
  "checkpoint.invalid",
  "checkpoint.document-mismatch",
  "checkpoint.version-unavailable",
  "checkpoint.invariant-violation",
  "event.reentrant-write",
  "event.sequence-overflow",
]);

const READ_FAILURE_CODES = new Set<string>([
  "read.invalid-address",
  "read.entity-not-found",
  "read.invalid-range",
  "read.range-endpoint-not-found",
  "read.range-owner-mismatch",
  "read.invalid-snapshot",
  "read.invariant-violation",
]);

const KERNEL_CAPABILITIES = new Set<string>([
  "registry:read",
  "command:register",
  "selector:register",
  "command:execute",
  "selector:execute",
  "score:read",
  "event:subscribe",
]);

function isDiagnosticCode(value: unknown): value is DiagnosticCode {
  return typeof value === "string" && DIAGNOSTIC_CODES.has(value);
}

function cloneJsonValue(
  value: unknown,
  active: Set<object>,
): JsonValue | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "object" || active.has(value)) {
    return undefined;
  }

  active.add(value);
  try {
    if (Array.isArray(value)) {
      const input = readDenseArray(value);
      if (input === undefined) {
        return undefined;
      }
      const output: JsonValue[] = [];
      for (const item of input) {
        const decoded = cloneJsonValue(item, active);
        if (decoded === undefined) {
          return undefined;
        }
        output.push(decoded);
      }
      return output;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return undefined;
    }
    const keys = Reflect.ownKeys(value);
    const output: Record<string, JsonValue> = {};
    for (const key of keys) {
      if (typeof key !== "string") {
        return undefined;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        !descriptor.enumerable
      ) {
        return undefined;
      }
      const decoded = cloneJsonValue(descriptor.value, active);
      if (decoded === undefined) {
        return undefined;
      }
      Object.defineProperty(output, key, {
        configurable: true,
        enumerable: true,
        value: decoded,
        writable: true,
      });
    }
    return output;
  } finally {
    active.delete(value);
  }
}

export function decodeJsonObject(input: unknown): JsonObject | undefined {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return undefined;
    }
    const decoded = cloneJsonValue(input, new Set<object>());
    return typeof decoded === "object" && decoded !== null && !Array.isArray(decoded)
      ? (decoded as JsonObject)
      : undefined;
  } catch {
    return undefined;
  }
}

function decodeDiagnosticPath(input: unknown): DiagnosticPath | undefined {
  const values = readDenseArray(input);
  if (values === undefined) {
    return undefined;
  }
  const path: (string | number)[] = [];
  for (const value of values) {
    if (
      typeof value !== "string" &&
      !(typeof value === "number" && Number.isSafeInteger(value))
    ) {
      return undefined;
    }
    path.push(value);
  }
  return path;
}

export function decodeDiagnosticInput(
  input: unknown,
): Diagnostic | undefined {
  try {
    const withDetails = readExactDataRecord(input, [
      "code",
      "messageKey",
      "path",
      "details",
    ]);
    const record =
      withDetails ?? readExactDataRecord(input, ["code", "messageKey", "path"]);
    if (record === undefined || !isDiagnosticCode(record.code)) {
      return undefined;
    }
    const code = record.code;
    if (record.messageKey !== `core.${code}`) {
      return undefined;
    }
    const path = decodeDiagnosticPath(record.path);
    if (path === undefined) {
      return undefined;
    }
    if (withDetails === undefined) {
      return { code, messageKey: `core.${code}`, path };
    }
    const details = decodeJsonObject(record.details);
    return details === undefined
      ? undefined
      : { code, messageKey: `core.${code}`, path, details };
  } catch {
    return undefined;
  }
}

export function decodeModuleIssueSource(
  input: unknown,
): Extract<KernelIssueSource, { readonly kind: "module" }> | undefined {
  try {
    const withContribution = readExactDataRecord(input, [
      "kind",
      "moduleId",
      "contributionId",
    ]);
    const record =
      withContribution ?? readExactDataRecord(input, ["kind", "moduleId"]);
    if (
      record === undefined ||
      record.kind !== "module" ||
      !isSafeRegistryId(record.moduleId)
    ) {
      return undefined;
    }
    if (withContribution === undefined) {
      return { kind: "module", moduleId: record.moduleId };
    }
    if (!isSafeRegistryId(record.contributionId)) {
      return undefined;
    }
    return {
      kind: "module",
      moduleId: record.moduleId,
      contributionId: record.contributionId,
    };
  } catch {
    return undefined;
  }
}

function decodeCodeOnlyFailure<Failure extends { readonly code: string }>(
  input: unknown,
  acceptedCodes: ReadonlySet<string>,
): Failure | undefined {
  const record = readExactDataRecord(input, ["code"]);
  return record !== undefined &&
    typeof record.code === "string" &&
    acceptedCodes.has(record.code)
    ? ({ code: record.code } as Failure)
    : undefined;
}

export function decodeCommandFailure(
  input: unknown,
): CommandFailure | undefined {
  try {
    const codeOnly = decodeCodeOnlyFailure<CommandFailure>(
      input,
      COMMAND_CODE_ONLY_FAILURES,
    );
    if (codeOnly !== undefined) {
      return codeOnly;
    }
    const record = readExactDataRecord(input, ["code", "diagnostics"]);
    const values = readDenseArray(record?.diagnostics);
    if (
      record === undefined ||
      record.code !== "command.semantic-invalid" ||
      values === undefined
    ) {
      return undefined;
    }
    const diagnostics: Extract<
      CommandFailure,
      { readonly code: "command.semantic-invalid" }
    >["diagnostics"][number][] = [];
    for (const value of values) {
      const diagnostic = decodeDiagnosticInput(value);
      if (
        diagnostic === undefined ||
        !diagnostic.code.startsWith("semantic.")
      ) {
        return undefined;
      }
      diagnostics.push(diagnostic as (typeof diagnostics)[number]);
    }
    return { code: "command.semantic-invalid", diagnostics };
  } catch {
    return undefined;
  }
}

export function decodeCheckpointFailure(
  input: unknown,
): CheckpointFailure | undefined {
  try {
    return decodeCodeOnlyFailure<CheckpointFailure>(
      input,
      CHECKPOINT_FAILURE_CODES,
    );
  } catch {
    return undefined;
  }
}

export function decodeReadFailure(input: unknown): ReadFailure | undefined {
  try {
    return decodeCodeOnlyFailure<ReadFailure>(input, READ_FAILURE_CODES);
  } catch {
    return undefined;
  }
}

type EventSubscriptionFailure = Extract<
  EventSubscriptionResult,
  { readonly status: "rejected" }
>["failure"];

export function decodeEventSubscriptionFailure(
  input: unknown,
): EventSubscriptionFailure | undefined {
  try {
    return decodeCodeOnlyFailure<EventSubscriptionFailure>(
      input,
      new Set(["event.invalid-handler"]),
    );
  } catch {
    return undefined;
  }
}

function decodeSafeId(value: unknown): string | undefined {
  return isSafeRegistryId(value) ? value : undefined;
}

function decodeCapability(value: unknown): KernelCapability | undefined {
  return typeof value === "string" && KERNEL_CAPABILITIES.has(value)
    ? (value as KernelCapability)
    : undefined;
}

export function decodeRegistryStartupFailure(
  input: unknown,
): KernelRegistryStartupFailure | undefined {
  try {
    const codeOnly = readExactDataRecord(input, ["code"]);
    if (
      codeOnly?.code === "registry.invalid-startup-input" ||
      codeOnly?.code === "registry.internal-error"
    ) {
      return { code: codeOnly.code };
    }

    const registration = readExactDataRecord(input, [
      "code",
      "registrationEntryId",
    ]);
    const registrationEntryId = decodeSafeId(registration?.registrationEntryId);
    if (
      registrationEntryId !== undefined &&
      (registration?.code === "registry.registration-entry-not-found" ||
        registration?.code === "registry.invalid-contribution")
    ) {
      return { code: registration.code, registrationEntryId };
    }

    const owner = readExactDataRecord(input, [
      "code",
      "registrationEntryId",
      "moduleId",
    ]);
    const ownerRegistrationEntryId = decodeSafeId(owner?.registrationEntryId);
    const ownerModuleId = decodeSafeId(owner?.moduleId);
    if (
      owner?.code === "registry.registration-owner-mismatch" &&
      ownerRegistrationEntryId !== undefined &&
      ownerModuleId !== undefined
    ) {
      return {
        code: "registry.registration-owner-mismatch",
        registrationEntryId: ownerRegistrationEntryId,
        moduleId: ownerModuleId,
      };
    }

    const module = readExactDataRecord(input, ["code", "moduleId"]);
    const moduleId = decodeSafeId(module?.moduleId);
    if (moduleId !== undefined) {
      switch (module?.code) {
        case "registry.duplicate-module-id":
        case "registry.unsupported-origin":
        case "registry.unsupported-runtime":
        case "registry.unsupported-trust-level":
        case "registry.api-version-incompatible":
          return { code: module.code, moduleId };
      }
    }

    const contribution = readExactDataRecord(input, [
      "code",
      "contributionId",
    ]);
    const contributionId = decodeSafeId(contribution?.contributionId);
    if (contributionId !== undefined) {
      if (contribution?.code === "registry.duplicate-contribution-id") {
        return { code: contribution.code, contributionId };
      }
      if (contribution?.code === "registry.handler-mismatch") {
        return { code: contribution.code, contributionId };
      }
    }

    const capabilityRecord = readExactDataRecord(input, [
      "code",
      "moduleId",
      "capability",
    ]);
    const capabilityModuleId = decodeSafeId(capabilityRecord?.moduleId);
    const capability = decodeCapability(capabilityRecord?.capability);
    return capabilityRecord?.code === "registry.capability-denied" &&
      capabilityModuleId !== undefined &&
      capability !== undefined
      ? {
          code: "registry.capability-denied",
          moduleId: capabilityModuleId,
          capability,
        }
      : undefined;
  } catch {
    return undefined;
  }
}

export function decodeRegistryAccessFailure(
  input: unknown,
): KernelRegistryAccessFailure | undefined {
  try {
    const codeOnly = readExactDataRecord(input, ["code"]);
    if (
      codeOnly?.code === "registry.invalid-invocation" ||
      codeOnly?.code === "registry.internal-error"
    ) {
      return { code: codeOnly.code };
    }

    const module = readExactDataRecord(input, ["code", "moduleId"]);
    const moduleId = decodeSafeId(module?.moduleId);
    if (module?.code === "registry.module-not-found" && moduleId !== undefined) {
      return { code: "registry.module-not-found", moduleId };
    }

    const contribution = readExactDataRecord(input, [
      "code",
      "contributionId",
    ]);
    const contributionId = decodeSafeId(contribution?.contributionId);
    if (
      contribution?.code === "registry.contribution-not-found" &&
      contributionId !== undefined
    ) {
      return { code: "registry.contribution-not-found", contributionId };
    }

    const capabilityRecord = readExactDataRecord(input, [
      "code",
      "moduleId",
      "capability",
    ]);
    const capabilityModuleId = decodeSafeId(capabilityRecord?.moduleId);
    const capability = decodeCapability(capabilityRecord?.capability);
    return capabilityRecord?.code === "registry.capability-denied" &&
      capabilityModuleId !== undefined &&
      capability !== undefined
      ? {
          code: "registry.capability-denied",
          moduleId: capabilityModuleId,
          capability,
        }
      : undefined;
  } catch {
    return undefined;
  }
}
