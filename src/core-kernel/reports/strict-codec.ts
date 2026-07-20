import type { JsonObject, JsonValue } from "../domain/extensions";
import {
  isSafeRegistryId,
  readDenseArray,
  readExactDataRecord,
} from "../registry/strict-codec";
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
