import type {
  CommandBusCreationFailure,
  CommandFailure,
} from "../commands/contracts";
import type { ScoreDocument } from "../domain/score-document";
import type {
  EventSubscriptionResult,
  IntegratedKernelEvent,
} from "../events/contracts";
import type { ScoreSupportResult } from "../profiles/score-feature-profile";
import type {
  KernelReadState,
  MarkPersistedResult,
  ReadResult,
} from "../read/contracts";
import type { JsonObject, ExtensionOwner } from "../domain/extensions";
import type {
  KernelIssueLocation,
  KernelSeverity,
} from "../reports/contracts";
import type { KernelModuleGateway } from "./gateway";
import type {
  KernelGatewayResult,
  KernelRegistryAccessFailure,
} from "./contracts";

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

export interface KernelKnownRequirementInventoryV1 {
  readonly inventoryVersion: 1;
  readonly requirements: readonly ExtensionRuntimeRequirementV1[];
}

export type KernelDomainAvailabilityFact =
  | {
      readonly reason: "required-contribution-unavailable";
      readonly namespace: string;
      readonly owner: ExtensionOwner;
      readonly extensionSchemaVersion: number;
      readonly moduleId: string;
      readonly contributionId: string;
      readonly supportedSchemaVersions: readonly number[];
    }
  | {
      readonly reason: "required-contribution-incompatible";
      readonly namespace: string;
      readonly owner: ExtensionOwner;
      readonly extensionSchemaVersion: number;
      readonly moduleId: string;
      readonly contributionId: string;
      readonly supportedSchemaVersions: readonly number[];
    };

export type KernelWriteAvailability =
  | { readonly status: "writable" }
  | {
      readonly status: "read-only";
      readonly reason: "domain-validation-incomplete";
      readonly facts: readonly KernelDomainAvailabilityFact[];
    };

export type KernelValidationAvailability =
  | { readonly status: "complete" }
  | {
      readonly status: "incomplete";
      readonly facts: readonly KernelDomainAvailabilityFact[];
    };

export interface IntegratedKernelReadState extends KernelReadState {
  readonly writeAvailability: KernelWriteAvailability;
  readonly validationAvailability: KernelValidationAvailability;
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

export interface ModuleCommandAssessment {
  readonly moduleId: string;
  readonly contributionId: string;
  readonly status: "supported" | "unsupported";
  readonly issues: readonly ModuleKernelIssue[];
}

export interface KernelCommandAssessment {
  readonly core: ScoreSupportResult;
  readonly modules: readonly ModuleCommandAssessment[];
}

export type KernelContributionFailure =
  | {
      readonly code: "command.required-contribution-unavailable";
      readonly facts: readonly KernelDomainAvailabilityFact[];
    }
  | {
      readonly code: "command.required-contribution-incompatible";
      readonly facts: readonly KernelDomainAvailabilityFact[];
    }
  | {
      readonly code: "command.contribution-semantic-invalid";
      readonly issues: readonly ModuleKernelIssue[];
    }
  | {
      readonly code: "command.contribution-contract-violation";
      readonly moduleId: string;
      readonly contributionId: string;
    }
  | {
      readonly code: "command.contribution-internal-error";
      readonly moduleId: string;
      readonly contributionId: string;
    }
  | { readonly code: "command.assembly-mismatch" };

export interface KernelIntegratedResourceFailure {
  readonly code: "command.resource-limit-exceeded";
  readonly limitKind:
    | "effects"
    | "affected-addresses"
    | "compatibility-facts"
    | "module-issues";
  readonly limit: number;
  readonly actual: number;
}

export type KernelCommandFailure =
  | CommandFailure
  | KernelContributionFailure
  | KernelIntegratedResourceFailure;

export type KernelCommandBusCreationFailure =
  | CommandBusCreationFailure
  | { readonly code: "command.invalid-requirement-inventory" }
  | Extract<
      KernelContributionFailure,
      {
        readonly code:
          | "command.contribution-semantic-invalid"
          | "command.contribution-contract-violation"
          | "command.contribution-internal-error"
          | "command.assembly-mismatch";
      }
    >
  | {
      readonly code: "command.resource-limit-exceeded";
      readonly limitKind: "compatibility-facts" | "module-issues";
      readonly limit: number;
      readonly actual: number;
    };

export type KernelCommandResult =
  | {
      readonly status: "committed" | "no-op";
      readonly documentVersion: number;
      readonly assessment: KernelCommandAssessment;
      readonly undoDepth: number;
      readonly redoDepth: number;
    }
  | {
      readonly status: "rejected";
      readonly documentVersion: number;
      readonly failure: KernelCommandFailure;
      readonly undoDepth: number;
      readonly redoDepth: number;
    };

export interface IntegratedCommandBus {
  submit(input: unknown): KernelCommandResult;
  undo(): KernelCommandResult;
  redo(): KernelCommandResult;
  read(): ReadResult<IntegratedKernelReadState>;
  markPersisted(input: unknown): MarkPersistedResult;
  subscribe(handler: unknown): EventSubscriptionResult;
}

export type IntegratedKernelModuleGateway = Omit<
  KernelModuleGateway,
  "submit" | "undo" | "redo" | "read"
> & {
  submit(input: unknown): KernelGatewayResult<KernelCommandResult>;
  undo(): KernelGatewayResult<KernelCommandResult>;
  redo(): KernelGatewayResult<KernelCommandResult>;
  read(): KernelGatewayResult<ReadResult<IntegratedKernelReadState>>;
};

export type IntegratedKernelModuleGatewayCreationResult =
  | { readonly ok: true; readonly gateway: IntegratedKernelModuleGateway }
  | {
      readonly ok: false;
      readonly failure:
        | KernelRegistryAccessFailure
        | { readonly code: "registry.assembly-mismatch" };
    };

export type IntegratedCommandBusCreationResult =
  | { readonly ok: true; readonly value: IntegratedCommandBus }
  | { readonly ok: false; readonly failure: KernelCommandBusCreationFailure };

export type ReplayKernelCommandsResult =
  | {
      readonly status: "replayed";
      readonly finalDocument: ScoreDocument;
      readonly documentVersion: number;
      readonly results: readonly KernelCommandResult[];
      readonly writeAvailability: KernelWriteAvailability;
      readonly validationAvailability: KernelValidationAvailability;
    }
  | {
      readonly status: "rejected";
      readonly finalDocument: ScoreDocument;
      readonly documentVersion: number;
      readonly results: readonly KernelCommandResult[];
      readonly failedCommandIndex: number;
      readonly failure: KernelCommandFailure;
      readonly writeAvailability: KernelWriteAvailability;
      readonly validationAvailability: KernelValidationAvailability;
    }
  | {
      readonly status: "invalid-initial-document";
      readonly failure: KernelCommandBusCreationFailure;
    };

export type IntegratedKernelEventHandler = (
  event: IntegratedKernelEvent,
) => void;
