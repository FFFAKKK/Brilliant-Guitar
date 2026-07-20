import { createReportKernelIssue } from "../errors/kernel-error";
import { readDenseArray } from "../registry/strict-codec";
import type { Diagnostic } from "../validation/diagnostics";
import { mapDiagnosticToKernelIssue } from "./adapters";
import type { KernelReport } from "./contracts";
import { buildKernelReport } from "./build-report";
import { decodeDiagnosticInput } from "./strict-codec";

function decodeDiagnosticArray(input: unknown): readonly Diagnostic[] | undefined {
  try {
    const values = readDenseArray(input);
    if (values === undefined) {
      return undefined;
    }
    const diagnostics: Diagnostic[] = [];
    for (const value of values) {
      const diagnostic = decodeDiagnosticInput(value);
      if (diagnostic === undefined) {
        return undefined;
      }
      diagnostics.push(diagnostic);
    }
    return diagnostics;
  } catch {
    return undefined;
  }
}

function failureReport(
  code: "report.invalid-input" | "report.internal-error",
): KernelReport<"validation"> {
  return buildKernelReport("validation", [
    createReportKernelIssue({
      code,
      source: { kind: "core", subsystem: "report" },
    }),
  ]);
}

export function createKernelValidationReport(
  diagnostics: readonly Diagnostic[],
): KernelReport<"validation"> {
  const decoded = decodeDiagnosticArray(diagnostics);
  if (decoded === undefined) {
    return failureReport("report.invalid-input");
  }
  try {
    const issues = decoded.map(mapDiagnosticToKernelIssue);
    if (issues.some((issue) => issue.code === "report.invalid-input")) {
      return failureReport("report.invalid-input");
    }
    if (issues.some((issue) => issue.code === "report.internal-error")) {
      return failureReport("report.internal-error");
    }
    return buildKernelReport("validation", issues);
  } catch {
    return failureReport("report.internal-error");
  }
}
