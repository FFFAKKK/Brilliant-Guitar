import type { JsonObject } from "../domain/extensions";
import { deepFreezeValue } from "../read/deep-freeze";
import type {
  KernelIssue,
  KernelIssueCode,
  KernelIssueLocation,
  KernelIssueSource,
  MigrationFailureCode,
  ReportFailureCode,
} from "../reports/contracts";
import {
  messageKeyForKernelIssueCode,
  severityForKernelIssueCode,
} from "./classification";

type OperationIssueCode = Exclude<
  KernelIssueCode,
  MigrationFailureCode | "module.internal-error" | ReportFailureCode
>;

interface SafeKernelErrorInput<Code extends KernelIssueCode> {
  readonly code: Code;
  readonly source: KernelIssueSource;
  readonly location?: KernelIssueLocation;
  readonly details?: JsonObject;
}

function cloneAndFreeze<T>(value: T): T {
  return deepFreezeValue(structuredClone(value));
}

abstract class KernelError<Code extends KernelIssueCode> extends Error {
  readonly code: Code;
  readonly source: KernelIssueSource;
  readonly location?: KernelIssueLocation;
  readonly details?: JsonObject;

  protected constructor(input: SafeKernelErrorInput<Code>) {
    super(input.code);
    this.name = "KernelError";
    this.code = input.code;
    this.source = cloneAndFreeze(input.source);
    if (input.location !== undefined) {
      this.location = cloneAndFreeze(input.location);
    }
    if (input.details !== undefined) {
      this.details = cloneAndFreeze(input.details);
    }
  }

  toIssue(): KernelIssue<Code> {
    const issue = {
      issueVersion: 1,
      code: this.code,
      severity: severityForKernelIssueCode(this.code),
      messageKey: messageKeyForKernelIssueCode(this.code),
      source: cloneAndFreeze(this.source),
      ...(this.location === undefined
        ? {}
        : { location: cloneAndFreeze(this.location) }),
      ...(this.details === undefined
        ? {}
        : { details: cloneAndFreeze(this.details) }),
    } as const;
    return deepFreezeValue(issue);
  }
}

class OperationKernelError<
  Code extends OperationIssueCode,
> extends KernelError<Code> {
  constructor(input: SafeKernelErrorInput<Code>) {
    super(input);
  }
}

class MigrationKernelError<
  Code extends MigrationFailureCode,
> extends KernelError<Code> {
  constructor(input: SafeKernelErrorInput<Code>) {
    super(input);
  }
}

class ModuleKernelError extends KernelError<"module.internal-error"> {
  constructor(input: SafeKernelErrorInput<"module.internal-error">) {
    super(input);
  }
}

class ReportKernelError<Code extends ReportFailureCode> extends KernelError<Code> {
  constructor(input: SafeKernelErrorInput<Code>) {
    super(input);
  }
}

export function createOperationKernelIssue<Code extends OperationIssueCode>(
  input: SafeKernelErrorInput<Code>,
): KernelIssue<Code> {
  return new OperationKernelError(input).toIssue();
}

export function createMigrationKernelIssue<Code extends MigrationFailureCode>(
  input: SafeKernelErrorInput<Code>,
): KernelIssue<Code> {
  return new MigrationKernelError(input).toIssue();
}

export function createModuleKernelIssue(input: {
  readonly source: Extract<KernelIssueSource, { readonly kind: "module" }>;
  readonly location?: KernelIssueLocation;
  readonly details?: JsonObject;
}): KernelIssue<"module.internal-error"> {
  return new ModuleKernelError({
    code: "module.internal-error",
    source: input.source,
    ...(input.location === undefined ? {} : { location: input.location }),
    ...(input.details === undefined ? {} : { details: input.details }),
  }).toIssue();
}

export function createReportKernelIssue<Code extends ReportFailureCode>(
  input: SafeKernelErrorInput<Code>,
): KernelIssue<Code> {
  return new ReportKernelError(input).toIssue();
}
