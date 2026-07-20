import { decodeScoreDocument } from "../codec/decode-score-document";
import { createMigrationKernelIssue } from "../errors/kernel-error";
import { deepFreezeValue } from "../read/deep-freeze";
import { mapDiagnosticToKernelIssue } from "../reports/adapters";
import { buildKernelReport } from "../reports/build-report";
import type { KernelIssue } from "../reports/contracts";
import type {
  DecodeDiagnostic,
  Diagnostic,
} from "../validation/diagnostics";
import { validateScoreDocumentSemantics } from "../validation/validate-score-semantics";
import type { MigrationFailure, MigrationResult } from "./contracts";

export interface MigrationDependencies {
  readonly decode: typeof decodeScoreDocument;
  readonly validate: typeof validateScoreDocumentSemantics;
}

const DEFAULT_MIGRATION_DEPENDENCIES: MigrationDependencies = {
  decode: decodeScoreDocument,
  validate: validateScoreDocumentSemantics,
};

function migrationIssue(
  code: MigrationFailure["code"],
): KernelIssue {
  return createMigrationKernelIssue({
    code,
    source: { kind: "core", subsystem: "migration" },
  });
}

function internalFailure(): MigrationResult {
  return deepFreezeValue({
    status: "rejected",
    failure: { code: "migration.internal-error" },
    report: buildKernelReport("migration", [
      migrationIssue("migration.internal-error"),
    ]),
  });
}

function mapDiagnostics(diagnostics: readonly Diagnostic[]): readonly KernelIssue[] {
  const issues: KernelIssue[] = [];
  for (const diagnostic of diagnostics) {
    const issue = mapDiagnosticToKernelIssue(diagnostic);
    if (
      issue.code === "report.invalid-input" ||
      issue.code === "report.internal-error"
    ) {
      throw new Error("invalid dependency diagnostic");
    }
    issues.push(issue);
  }
  return issues;
}

function rejectedResult(
  failure: MigrationFailure,
  diagnostics: readonly Diagnostic[],
): MigrationResult {
  const detachedFailure = deepFreezeValue(structuredClone(failure));
  const issues = [migrationIssue(failure.code), ...mapDiagnostics(diagnostics)];
  return deepFreezeValue({
    status: "rejected",
    failure: detachedFailure,
    report: buildKernelReport("migration", issues),
  });
}

function areDecodeDiagnostics(
  diagnostics: readonly Diagnostic[],
): diagnostics is readonly DecodeDiagnostic[] {
  return diagnostics.every((diagnostic) => diagnostic.code.startsWith("decode."));
}

export function migrateScoreDocumentWithDependencies(
  input: unknown,
  dependencies: MigrationDependencies,
): MigrationResult {
  try {
    const decoded = dependencies.decode(input);
    if (!decoded.ok) {
      if (!areDecodeDiagnostics(decoded.diagnostics)) {
        return internalFailure();
      }
      const unsupported = decoded.diagnostics.some(
        ({ code }) => code === "decode.unsupported-schema-version",
      );
      return unsupported
        ? rejectedResult(
            { code: "migration.unsupported-source-version" },
            decoded.diagnostics,
          )
        : rejectedResult(
            {
              code: "migration.invalid-input",
              diagnostics: decoded.diagnostics,
            },
            decoded.diagnostics,
          );
    }

    const semantic = dependencies.validate(decoded.value);
    if (!semantic.ok) {
      return rejectedResult(
        {
          code: "migration.semantic-invalid",
          diagnostics: semantic.diagnostics,
        },
        semantic.diagnostics,
      );
    }

    const document = deepFreezeValue(structuredClone(decoded.value));
    return deepFreezeValue({
      status: "not-required",
      document,
      report: buildKernelReport("migration", []),
    });
  } catch {
    return internalFailure();
  }
}

export function migrateScoreDocument(input: unknown): MigrationResult {
  return migrateScoreDocumentWithDependencies(
    input,
    DEFAULT_MIGRATION_DEPENDENCIES,
  );
}
