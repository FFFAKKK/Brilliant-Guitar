import type { JsonObject } from "../domain/extensions";
import type {
  KernelIssueLocation,
  KernelSeverity,
} from "../reports/contracts";

export const kernelIntegratedCatalogBrand: unique symbol = Symbol(
  "brilliant-guitar.kernel-integrated-catalog",
);

export interface KernelIntegratedCatalog {
  readonly [kernelIntegratedCatalogBrand]: true;
}

export interface ExtensionRuntimeRequirementV1 {
  readonly requirementVersion: 1;
  readonly namespace: string;
  readonly moduleId: string;
  readonly contributionId: string;
  readonly supportedSchemaVersions: readonly number[];
  readonly requiredForWrite: true;
}

export type ModuleIssueCode = `${string}.${string}`;

export interface ModuleKernelIssue {
  readonly issueVersion: 1;
  readonly code: ModuleIssueCode;
  readonly severity: KernelSeverity;
  readonly messageKey: string;
  readonly source: {
    readonly kind: "module";
    readonly moduleId: string;
    readonly contributionId: string;
  };
  readonly location?: KernelIssueLocation;
  readonly details?: JsonObject;
}
