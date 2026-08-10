import type { JsonObject } from "../domain/extensions";
import type {
  KernelIssueLocation,
  KernelIssueSource,
  KernelSeverity,
} from "../reports/contracts";

export abstract class KernelErrorBase<Code extends string> extends Error {
  readonly code: Code;

  protected constructor(code: Code) {
    super(code);
    this.code = code;
  }

  abstract toIssue(): {
    readonly issueVersion: 1;
    readonly code: Code;
    readonly severity: KernelSeverity;
    readonly messageKey: string;
    readonly source: KernelIssueSource;
    readonly location?: KernelIssueLocation;
    readonly details?: JsonObject;
  };
}
