import type { ScoreDocument } from "../domain/score-document";
import type { MigrationReport } from "../reports/contracts";
import type {
  DecodeDiagnostic,
  SemanticDiagnostic,
} from "../validation/diagnostics";

export type MigrationFailure =
  | {
      readonly code: "migration.invalid-input";
      readonly diagnostics: readonly DecodeDiagnostic[];
    }
  | { readonly code: "migration.unsupported-source-version" }
  | {
      readonly code: "migration.semantic-invalid";
      readonly diagnostics: readonly SemanticDiagnostic[];
    }
  | { readonly code: "migration.internal-error" };

export type MigrationResult =
  | {
      readonly status: "not-required";
      readonly document: ScoreDocument;
      readonly report: MigrationReport;
    }
  | {
      readonly status: "rejected";
      readonly failure: MigrationFailure;
      readonly report: MigrationReport;
    };
