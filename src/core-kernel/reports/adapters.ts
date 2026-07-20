import {
  createModuleKernelIssue,
  createOperationKernelIssue,
  createReportKernelIssue,
} from "../errors/kernel-error";
import type { JsonObject } from "../domain/extensions";
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
  decodeDiagnosticInput,
  decodeModuleIssueSource,
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
