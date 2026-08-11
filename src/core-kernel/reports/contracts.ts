import type {
  CommandBusCreationFailure,
  CommandFailure,
} from "../commands/contracts";
import type { ScoreAddress, ScoreRange } from "../domain/address";
import type { JsonObject } from "../domain/extensions";
import type { EventSubscriptionResult } from "../events/contracts";
import type { CheckpointFailure, ReadFailure } from "../read/contracts";
import type {
  KernelRegistryAccessFailure,
  KernelRegistryStartupFailure,
} from "../registry/contracts";
import type {
  DiagnosticCode,
  DiagnosticPath,
} from "../validation/diagnostics";

export type ReportFailureCode =
  | "report.invalid-input"
  | "report.internal-error";

export type ModuleFailureCode = "module.internal-error";

export type MigrationFailureCode =
  | "migration.invalid-input"
  | "migration.invalid-request"
  | "migration.target-not-found"
  | "migration.unsupported-source-version"
  | "migration.unsupported-target-version"
  | "migration.contribution-semantic-invalid"
  | "migration.contribution-contract-violation"
  | "migration.contribution-internal-error"
  | "migration.assembly-mismatch"
  | "migration.semantic-invalid"
  | "migration.internal-error";

export type EventSubscriptionFailure = Extract<
  EventSubscriptionResult,
  { readonly status: "rejected" }
>["failure"];

export type KernelIssueCode =
  | DiagnosticCode
  | CommandFailure["code"]
  | CommandBusCreationFailure["code"]
  | CheckpointFailure["code"]
  | ReadFailure["code"]
  | EventSubscriptionFailure["code"]
  | KernelRegistryStartupFailure["code"]
  | KernelRegistryAccessFailure["code"]
  | ReportFailureCode
  | ModuleFailureCode
  | MigrationFailureCode;

export type KernelSeverity = "warning" | "error" | "fatal";

export type KernelIssueLocation =
  | { readonly kind: "diagnostic-path"; readonly path: DiagnosticPath }
  | { readonly kind: "score-address"; readonly address: ScoreAddress }
  | { readonly kind: "score-range"; readonly range: ScoreRange };

export type CoreIssueSubsystem =
  | "codec"
  | "validation"
  | "profile"
  | "command"
  | "read"
  | "session"
  | "event"
  | "registry"
  | "report"
  | "migration";

export type KernelIssueSource =
  | {
      readonly kind: "core";
      readonly subsystem: CoreIssueSubsystem;
    }
  | {
      readonly kind: "module";
      readonly moduleId: string;
      readonly contributionId?: string;
    };

export interface KernelIssue<Code extends KernelIssueCode = KernelIssueCode> {
  readonly issueVersion: 1;
  readonly code: Code;
  readonly severity: KernelSeverity;
  readonly messageKey: `core.${Code}`;
  readonly source: KernelIssueSource;
  readonly location?: KernelIssueLocation;
  readonly details?: JsonObject;
}

export type KernelReportKind = "validation" | "migration";

export type KernelReportStatus =
  | "completed"
  | "completed-with-warnings"
  | "rejected";

export interface KernelReportSummary {
  readonly issueCount: number;
  readonly warningCount: number;
  readonly errorCount: number;
  readonly fatalCount: number;
}

export interface KernelReport<
  Kind extends KernelReportKind = KernelReportKind,
> {
  readonly reportVersion: 1;
  readonly kind: Kind;
  readonly status: KernelReportStatus;
  readonly summary: KernelReportSummary;
  readonly issues: readonly KernelIssue[];
}

export type MigrationReport = KernelReport<"migration">;
