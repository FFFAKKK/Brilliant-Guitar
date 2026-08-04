import {
  createModuleKernelIssue,
  createOperationKernelIssue,
  createReportKernelIssue,
} from "../errors/kernel-error";
import type { JsonObject } from "../domain/extensions";
import { deepFreezeValue } from "../read/deep-freeze";
import type {
  CommandBusCreationFailure,
  CommandFailure,
} from "../commands/contracts";
import type { EventSubscriptionResult } from "../events/contracts";
import type { CheckpointFailure, ReadFailure } from "../read/contracts";
import type {
  KernelRegistryAccessFailure,
  KernelRegistryStartupFailure,
} from "../registry/contracts";
import type {
  Diagnostic,
  DiagnosticCode,
} from "../validation/diagnostics";
import type {
  KernelIssue,
  KernelIssueLocation,
  KernelIssueSource,
} from "./contracts";
import {
  decodeCheckpointFailure,
  decodeCommandBusCreationFailure,
  decodeCommandFailure,
  decodeDiagnosticInput,
  decodeEventSubscriptionFailure,
  decodeModuleIssueSource,
  decodeReadFailure,
  decodeRegistryAccessFailure,
  decodeRegistryStartupFailure,
} from "./strict-codec";

interface DiagnosticIssueFactoryInput {
  readonly code: DiagnosticCode;
  readonly source: KernelIssueSource;
  readonly location: KernelIssueLocation;
  readonly details?: JsonObject;
}

type DiagnosticIssueFactory = (
  input: DiagnosticIssueFactoryInput,
) => KernelIssue;

function reportFailure(
  code: "report.invalid-input" | "report.internal-error",
): KernelIssue {
  return createReportKernelIssue({
    code,
    source: { kind: "core", subsystem: "report" },
  });
}

function sourceForDiagnosticCode(code: DiagnosticCode): KernelIssueSource {
  if (code.startsWith("decode.")) {
    return { kind: "core", subsystem: "codec" };
  }
  if (code.startsWith("semantic.")) {
    return { kind: "core", subsystem: "validation" };
  }
  return { kind: "core", subsystem: "profile" };
}

export function mapDiagnosticToKernelIssueWithFactory(
  diagnostic: Diagnostic,
  factory: DiagnosticIssueFactory,
): KernelIssue {
  try {
    const decoded = decodeDiagnosticInput(diagnostic);
    if (decoded === undefined) {
      return reportFailure("report.invalid-input");
    }
    return factory({
      code: decoded.code,
      source: sourceForDiagnosticCode(decoded.code),
      location: { kind: "diagnostic-path", path: decoded.path },
      ...(decoded.details === undefined ? {} : { details: decoded.details }),
    });
  } catch {
    return reportFailure("report.internal-error");
  }
}

export function mapDiagnosticToKernelIssue(
  diagnostic: Diagnostic,
): KernelIssue {
  return mapDiagnosticToKernelIssueWithFactory(
    diagnostic,
    (input) => createOperationKernelIssue(input),
  );
}

export function createModuleInternalIssue(
  source: Extract<KernelIssueSource, { readonly kind: "module" }>,
): KernelIssue<"module.internal-error">;
export function createModuleInternalIssue(source: unknown): KernelIssue;
export function createModuleInternalIssue(
  source: unknown,
): KernelIssue {
  try {
    const decoded = decodeModuleIssueSource(source);
    return decoded === undefined
      ? reportFailure("report.invalid-input")
      : createModuleKernelIssue({ source: decoded });
  } catch {
    return reportFailure("report.internal-error");
  }
}

function invalidFailureArray(): readonly KernelIssue[] {
  return deepFreezeValue([reportFailure("report.invalid-input")]);
}

function internalFailureArray(): readonly KernelIssue[] {
  return deepFreezeValue([reportFailure("report.internal-error")]);
}

function operationIssue(
  code: Exclude<
    KernelIssue["code"],
    | "module.internal-error"
    | "migration.invalid-input"
    | "migration.unsupported-source-version"
    | "migration.semantic-invalid"
    | "migration.internal-error"
    | "report.invalid-input"
    | "report.internal-error"
  >,
  subsystem: Extract<KernelIssueSource, { readonly kind: "core" }>["subsystem"],
  details?: JsonObject,
): KernelIssue {
  return createOperationKernelIssue({
    code,
    source: { kind: "core", subsystem },
    ...(details === undefined ? {} : { details }),
  });
}

function freezeIssueArray(issues: readonly KernelIssue[]): readonly KernelIssue[] {
  return deepFreezeValue([...issues]);
}

function assertNever(value: never): never {
  throw new Error(`unreachable issue mapping: ${String(value)}`);
}

export function mapCommandFailureToKernelIssues(
  failure: CommandFailure,
): readonly KernelIssue[] {
  try {
    const decoded = decodeCommandFailure(failure);
    if (decoded === undefined) {
      return invalidFailureArray();
    }
    if (decoded.code === "command.semantic-invalid") {
      const diagnosticIssues = decoded.diagnostics.map(
        mapDiagnosticToKernelIssue,
      );
      if (
        diagnosticIssues.some(
          (issue) =>
            issue.code === "report.invalid-input" ||
            issue.code === "report.internal-error",
        )
      ) {
        return invalidFailureArray();
      }
      return freezeIssueArray([
        operationIssue(decoded.code, "command"),
        ...diagnosticIssues,
      ]);
    }
    if (decoded.code === "command.resource-limit-exceeded") {
      return freezeIssueArray([
        operationIssue(decoded.code, "command", {
          limitKind: decoded.limitKind,
          limit: decoded.limit,
          actual: decoded.actual,
        }),
      ]);
    }
    const subsystem = decoded.code.startsWith("event.")
      ? "event"
      : "command";
    return freezeIssueArray([operationIssue(decoded.code, subsystem)]);
  } catch {
    return internalFailureArray();
  }
}

export function mapCommandBusCreationFailureToKernelIssues(
  failure: CommandBusCreationFailure,
): readonly KernelIssue[] {
  try {
    const decoded = decodeCommandBusCreationFailure(failure);
    if (decoded === undefined) {
      return invalidFailureArray();
    }
    if (!("diagnostics" in decoded)) {
      return freezeIssueArray([
        operationIssue(decoded.code, "command"),
      ]);
    }
    const diagnosticIssues = decoded.diagnostics.map(
      mapDiagnosticToKernelIssue,
    );
    if (
      diagnosticIssues.some(
        (issue) =>
          issue.code === "report.invalid-input" ||
          issue.code === "report.internal-error",
      )
    ) {
      return invalidFailureArray();
    }
    return freezeIssueArray([
      operationIssue(decoded.code, "command"),
      ...diagnosticIssues,
    ]);
  } catch {
    return internalFailureArray();
  }
}

export function mapCheckpointFailureToKernelIssues(
  failure: CheckpointFailure,
): readonly KernelIssue[] {
  try {
    const decoded = decodeCheckpointFailure(failure);
    if (decoded === undefined) {
      return invalidFailureArray();
    }
    const subsystem = decoded.code.startsWith("event.") ? "event" : "session";
    return freezeIssueArray([operationIssue(decoded.code, subsystem)]);
  } catch {
    return internalFailureArray();
  }
}

export function mapReadFailureToKernelIssues(
  failure: ReadFailure,
): readonly KernelIssue[] {
  try {
    const decoded = decodeReadFailure(failure);
    return decoded === undefined
      ? invalidFailureArray()
      : freezeIssueArray([operationIssue(decoded.code, "read")]);
  } catch {
    return internalFailureArray();
  }
}

export function mapEventSubscriptionFailureToKernelIssues(
  failure: Extract<EventSubscriptionResult, { readonly status: "rejected" }>[
    "failure"
  ],
): readonly KernelIssue[] {
  try {
    const decoded = decodeEventSubscriptionFailure(failure);
    return decoded === undefined
      ? invalidFailureArray()
      : freezeIssueArray([operationIssue(decoded.code, "event")]);
  } catch {
    return internalFailureArray();
  }
}

export function mapRegistryStartupFailureToKernelIssues(
  failure: KernelRegistryStartupFailure,
): readonly KernelIssue[] {
  try {
    const decoded = decodeRegistryStartupFailure(failure);
    if (decoded === undefined) {
      return invalidFailureArray();
    }
    switch (decoded.code) {
      case "registry.invalid-startup-input":
      case "registry.internal-error":
        return freezeIssueArray([operationIssue(decoded.code, "registry")]);
      case "registry.registration-entry-not-found":
      case "registry.invalid-contribution":
        return freezeIssueArray([
          operationIssue(decoded.code, "registry", {
            registrationEntryId: decoded.registrationEntryId,
          }),
        ]);
      case "registry.registration-owner-mismatch":
        return freezeIssueArray([
          operationIssue(decoded.code, "registry", {
            registrationEntryId: decoded.registrationEntryId,
            moduleId: decoded.moduleId,
          }),
        ]);
      case "registry.duplicate-module-id":
      case "registry.unsupported-origin":
      case "registry.unsupported-runtime":
      case "registry.unsupported-trust-level":
      case "registry.api-version-incompatible":
        return freezeIssueArray([
          operationIssue(decoded.code, "registry", {
            moduleId: decoded.moduleId,
          }),
        ]);
      case "registry.duplicate-contribution-id":
      case "registry.handler-mismatch":
        return freezeIssueArray([
          operationIssue(decoded.code, "registry", {
            contributionId: decoded.contributionId,
          }),
        ]);
      case "registry.capability-denied":
        return freezeIssueArray([
          operationIssue(decoded.code, "registry", {
            moduleId: decoded.moduleId,
            capability: decoded.capability,
          }),
        ]);
    }
    return assertNever(decoded);
  } catch {
    return internalFailureArray();
  }
}

export function mapRegistryAccessFailureToKernelIssues(
  failure: KernelRegistryAccessFailure,
): readonly KernelIssue[] {
  try {
    const decoded = decodeRegistryAccessFailure(failure);
    if (decoded === undefined) {
      return invalidFailureArray();
    }
    switch (decoded.code) {
      case "registry.invalid-invocation":
      case "registry.internal-error":
        return freezeIssueArray([operationIssue(decoded.code, "registry")]);
      case "registry.module-not-found":
        return freezeIssueArray([
          operationIssue(decoded.code, "registry", {
            moduleId: decoded.moduleId,
          }),
        ]);
      case "registry.contribution-not-found":
        return freezeIssueArray([
          operationIssue(decoded.code, "registry", {
            contributionId: decoded.contributionId,
          }),
        ]);
      case "registry.capability-denied":
        return freezeIssueArray([
          operationIssue(decoded.code, "registry", {
            moduleId: decoded.moduleId,
            capability: decoded.capability,
          }),
        ]);
    }
    return assertNever(decoded);
  } catch {
    return internalFailureArray();
  }
}
