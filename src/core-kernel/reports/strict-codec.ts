import type { JsonObject, JsonValue } from "../domain/extensions";
import type {
  CommandBusCreationFailure,
  CommandFailure,
} from "../commands/contracts";
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
  SemanticDiagnostic,
} from "../validation/diagnostics";
import type { KernelIssueSource } from "./contracts";

const DIAGNOSTIC_CODES = Object.freeze({
  "decode.encode-failed": true,
  "decode.extra-field": true,
  "decode.json-syntax": true,
  "decode.json-value": true,
  "decode.non-finite-number": true,
  "decode.required-field": true,
  "decode.type": true,
  "decode.union": true,
  "decode.unreadable-input": true,
  "decode.unsupported-schema-version": true,
  "semantic.extension-duplicate": true,
  "semantic.extension-namespace-invalid": true,
  "semantic.extension-owner-missing": true,
  "semantic.extension-payload-invalid": true,
  "semantic.extension-schema-version-invalid": true,
  "semantic.fraction-non-canonical": true,
  "semantic.fraction-sign-invalid": true,
  "semantic.id-duplicate": true,
  "semantic.id-empty": true,
  "semantic.measure-coverage-duplicate": true,
  "semantic.measure-coverage-missing": true,
  "semantic.measure-duration-invalid": true,
  "semantic.measure-reference-missing": true,
  "semantic.measure-required": true,
  "semantic.meter-denominator-invalid": true,
  "semantic.meter-numerator-invalid": true,
  "semantic.note-value-invalid": true,
  "semantic.notes-required": true,
  "semantic.part-required": true,
  "semantic.pickup-exceeds-measure": true,
  "semantic.sequence-exceeds-measure": true,
  "semantic.sequence-start-out-of-bounds": true,
  "semantic.sounding-pitch-invalid": true,
  "semantic.staff-line-count-invalid": true,
  "semantic.staff-reference-missing": true,
  "semantic.staff-required": true,
  "semantic.tempo-invalid": true,
  "semantic.time-arithmetic-overflow": true,
  "semantic.transposition-invalid": true,
  "semantic.voice-required": true,
  "semantic.written-pitch-invalid": true,
  "unsupported.chord": true,
  "unsupported.dots": true,
  "unsupported.meter": true,
  "unsupported.note-value-base": true,
  "unsupported.part-count": true,
  "unsupported.pickup": true,
  "unsupported.sequence-duration": true,
  "unsupported.sequence-start": true,
  "unsupported.staff-count": true,
  "unsupported.time-modification": true,
  "unsupported.voice-count": true,
} satisfies Record<DiagnosticCode, true>);

const COMMAND_FAILURE_CODES = Object.freeze({
  "command.invalid-envelope": true,
  "command.unsupported-version": true,
  "command.unknown-id": true,
  "command.target-mismatch": true,
  "command.target-not-found": true,
  "command.anchor-not-found": true,
  "command.anchor-wrong-owner": true,
  "command.anchor-self-reference": true,
  "command.semantic-invalid": true,
  "command.resource-limit-exceeded": true,
  "command.version-overflow": true,
  "command.internal-error": true,
  "history.empty-undo": true,
  "history.empty-redo": true,
  "history.invariant-violation": true,
  "event.reentrant-write": true,
  "event.sequence-overflow": true,
} satisfies Record<CommandFailure["code"], true>);

const COMMAND_BUS_CREATION_FAILURE_CODES = Object.freeze({
  "command.invalid-initial-document": true,
} satisfies Record<CommandBusCreationFailure["code"], true>);

const CHECKPOINT_FAILURE_CODES = Object.freeze({
  "checkpoint.invalid": true,
  "checkpoint.document-mismatch": true,
  "checkpoint.version-unavailable": true,
  "checkpoint.invariant-violation": true,
  "event.reentrant-write": true,
  "event.sequence-overflow": true,
} satisfies Record<CheckpointFailure["code"], true>);

const READ_FAILURE_CODES = Object.freeze({
  "read.invalid-address": true,
  "read.entity-not-found": true,
  "read.invalid-range": true,
  "read.range-endpoint-not-found": true,
  "read.range-owner-mismatch": true,
  "read.invalid-snapshot": true,
  "read.invariant-violation": true,
} satisfies Record<ReadFailure["code"], true>);

const EVENT_SUBSCRIPTION_FAILURE_CODES = Object.freeze({
  "event.invalid-handler": true,
} satisfies Record<EventSubscriptionFailure["code"], true>);

const REGISTRY_STARTUP_FAILURE_CODES = Object.freeze({
  "registry.invalid-startup-input": true,
  "registry.registration-entry-not-found": true,
  "registry.registration-owner-mismatch": true,
  "registry.duplicate-module-id": true,
  "registry.duplicate-contribution-id": true,
  "registry.unsupported-origin": true,
  "registry.unsupported-runtime": true,
  "registry.unsupported-trust-level": true,
  "registry.api-version-incompatible": true,
  "registry.capability-denied": true,
  "registry.invalid-contribution": true,
  "registry.handler-mismatch": true,
  "registry.internal-error": true,
} satisfies Record<KernelRegistryStartupFailure["code"], true>);

const REGISTRY_ACCESS_FAILURE_CODES = Object.freeze({
  "registry.invalid-invocation": true,
  "registry.module-not-found": true,
  "registry.contribution-not-found": true,
  "registry.capability-denied": true,
  "registry.internal-error": true,
} satisfies Record<KernelRegistryAccessFailure["code"], true>);

const KERNEL_CAPABILITIES = Object.freeze({
  "registry:read": true,
  "command:register": true,
  "selector:register": true,
  "command:execute": true,
  "selector:execute": true,
  "score:read": true,
  "event:subscribe": true,
} satisfies Record<KernelCapability, true>);

function isListedCode<Code extends string>(
  value: unknown,
  codes: Readonly<Record<Code, true>>,
): value is Code {
  return typeof value === "string" &&
    Reflect.getOwnPropertyDescriptor(codes, value)?.value === true;
}

function isDiagnosticCode(value: unknown): value is DiagnosticCode {
  return isListedCode(value, DIAGNOSTIC_CODES);
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
  acceptedCodes: Readonly<Record<Failure["code"], true>>,
): Failure | undefined {
  const record = readExactDataRecord(input, ["code"]);
  return record !== undefined &&
    isListedCode(record.code, acceptedCodes)
    ? ({ code: record.code } as Failure)
    : undefined;
}

function decodeSemanticDiagnostics(
  input: unknown,
): readonly SemanticDiagnostic[] | undefined {
  const values = readDenseArray(input);
  if (values === undefined) {
    return undefined;
  }
  const diagnostics: SemanticDiagnostic[] = [];
  for (const value of values) {
    const diagnostic = decodeDiagnosticInput(value);
    if (
      diagnostic === undefined ||
      !diagnostic.code.startsWith("semantic.")
    ) {
      return undefined;
    }
    diagnostics.push(diagnostic as SemanticDiagnostic);
  }
  return diagnostics;
}

export function decodeCommandFailure(
  input: unknown,
): CommandFailure | undefined {
  try {
    const codeOnly = readExactDataRecord(input, ["code"]);
    if (
      isListedCode(codeOnly?.code, COMMAND_FAILURE_CODES) &&
      codeOnly.code !== "command.semantic-invalid" &&
      codeOnly.code !== "command.resource-limit-exceeded"
    ) {
      return { code: codeOnly.code };
    }
    const record = readExactDataRecord(input, ["code", "diagnostics"]);
    const diagnostics = decodeSemanticDiagnostics(record?.diagnostics);
    if (
      record !== undefined &&
      record.code === "command.semantic-invalid" &&
      diagnostics !== undefined
    ) {
      return { code: "command.semantic-invalid", diagnostics };
    }

    const resource = readExactDataRecord(input, [
      "code",
      "limitKind",
      "limit",
      "actual",
    ]);
    if (
      resource?.code !== "command.resource-limit-exceeded" ||
      (resource.limitKind !== "input-depth" &&
        resource.limitKind !== "input-properties") ||
      typeof resource.limit !== "number" ||
      !Number.isSafeInteger(resource.limit) ||
      resource.limit < 0 ||
      typeof resource.actual !== "number" ||
      !Number.isSafeInteger(resource.actual) ||
      resource.actual < 0
    ) {
      return undefined;
    }
    return {
      code: "command.resource-limit-exceeded",
      limitKind: resource.limitKind,
      limit: resource.limit,
      actual: resource.actual,
    };
  } catch {
    return undefined;
  }
}

export function decodeCommandBusCreationFailure(
  input: unknown,
): CommandBusCreationFailure | undefined {
  try {
    const codeOnly = readExactDataRecord(input, ["code"]);
    if (
      isListedCode(codeOnly?.code, COMMAND_BUS_CREATION_FAILURE_CODES)
    ) {
      return { code: "command.invalid-initial-document" };
    }

    const record = readExactDataRecord(input, ["code", "diagnostics"]);
    if (record?.code !== "command.invalid-initial-document") {
      return undefined;
    }
    const diagnostics = decodeSemanticDiagnostics(record.diagnostics);
    return diagnostics === undefined
      ? undefined
      : { code: "command.invalid-initial-document", diagnostics };
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
      EVENT_SUBSCRIPTION_FAILURE_CODES,
    );
  } catch {
    return undefined;
  }
}

function decodeSafeId(value: unknown): string | undefined {
  return isSafeRegistryId(value) ? value : undefined;
}

function decodeCapability(value: unknown): KernelCapability | undefined {
  return isListedCode(value, KERNEL_CAPABILITIES)
    ? value
    : undefined;
}

export function decodeRegistryStartupFailure(
  input: unknown,
): KernelRegistryStartupFailure | undefined {
  try {
    const codeOnly = readExactDataRecord(input, ["code"]);
    if (
      isListedCode(codeOnly?.code, REGISTRY_STARTUP_FAILURE_CODES) &&
      (codeOnly.code === "registry.invalid-startup-input" ||
        codeOnly.code === "registry.internal-error")
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
      isListedCode(codeOnly?.code, REGISTRY_ACCESS_FAILURE_CODES) &&
      (codeOnly.code === "registry.invalid-invocation" ||
        codeOnly.code === "registry.internal-error")
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
