import type { ScoreDocument } from "../domain/score-document";
import type { ExtensionOwner, JsonObject } from "../domain/extensions";
import type { ModuleKernelIssue } from "../registry/integrated-contracts";
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

export interface KernelExtensionMigrationRequestV1 {
  readonly migrationVersion: 1;
  readonly moduleId: string;
  readonly contributionId: string;
  readonly effectKind: string;
  readonly namespace: string;
  readonly owner: ExtensionOwner;
  readonly sourceSchemaVersion: number;
  readonly targetSchemaVersion: number;
  readonly payload: JsonObject;
}

export type KernelExtensionMigrationFailure =
  | MigrationFailure
  | { readonly code: "migration.invalid-request" }
  | { readonly code: "migration.target-not-found" }
  | { readonly code: "migration.unsupported-target-version" }
  | {
      readonly code: "migration.contribution-semantic-invalid";
      readonly issues: readonly ModuleKernelIssue[];
    }
  | {
      readonly code: "migration.contribution-contract-violation";
      readonly moduleId: string;
      readonly contributionId: string;
    }
  | {
      readonly code: "migration.contribution-internal-error";
      readonly moduleId: string;
      readonly contributionId: string;
    }
  | { readonly code: "migration.assembly-mismatch" };

export type KernelExtensionMigrationResult =
  | {
      readonly status: "migrated";
      readonly document: ScoreDocument;
      readonly report: MigrationReport;
    }
  | {
      readonly status: "not-required";
      readonly document: ScoreDocument;
      readonly report: MigrationReport;
    }
  | {
      readonly status: "rejected";
      readonly failure: KernelExtensionMigrationFailure;
      readonly report: MigrationReport;
    };
