import type { ScoreEntityTarget } from "../commands/contracts";
import type { ScoreMetadata } from "../domain/score-document";
import type {
  KernelHistoryState,
  ReadResult,
  ScoreEntityOwnership,
  ScoreRangeSelection,
  SelectedScoreEntity,
} from "../read/contracts";

export type KernelRegistryApiVersion = 1;
export type KernelStartupManifestVersion = 1;

export type KernelModuleOrigin = "official" | "third-party";
export type KernelModuleRuntime =
  | "builtin"
  | "internal-module"
  | "javascript-typescript";
export type KernelTrustLevel = "system-trusted" | "sandboxed";

export type KernelCapability =
  | "registry:read"
  | "command:register"
  | "selector:register"
  | "command:execute"
  | "selector:execute"
  | "score:read"
  | "event:subscribe";

export type CoreModuleRegistrationEntryId =
  | "core.commands.v1"
  | "core.selectors.v1";

export type OfficialModuleRegistrationEntryId =
  "kernel.domain-commands.v1";

export type KernelModuleRegistrationEntryId =
  | CoreModuleRegistrationEntryId
  | OfficialModuleRegistrationEntryId;

export interface KernelModuleIdentity {
  readonly moduleId: string;
  readonly origin: KernelModuleOrigin;
  readonly runtime: KernelModuleRuntime;
  readonly trustLevel: KernelTrustLevel;
  readonly apiVersion: KernelRegistryApiVersion;
  readonly capabilities: readonly KernelCapability[];
}

export interface KernelStartupModuleDeclaration
  extends KernelModuleIdentity {
  readonly registrationEntryIds: readonly KernelModuleRegistrationEntryId[];
}

export interface KernelStartupModuleManifest {
  readonly startupManifestVersion: KernelStartupManifestVersion;
  readonly modules: readonly KernelStartupModuleDeclaration[];
}

export type CoreSelectorId =
  | "core.selector.score-metadata"
  | "core.selector.score-entity"
  | "core.selector.score-entity-ownership"
  | "core.selector.score-range"
  | "core.selector.history-state"
  | "core.selector.dirty-state";

export interface RegistryModuleSummary {
  readonly moduleId: string;
  readonly apiVersion: 1;
}

interface RegistryContributionSummaryBase {
  readonly id: string;
  readonly sourceModuleId: string;
  readonly apiVersion: 1;
  readonly requiredCapabilities: readonly KernelCapability[];
  readonly titleKey: string;
}

export type RegistryContributionSummary =
  | (RegistryContributionSummaryBase & {
      readonly kind: "command";
      readonly targetKind: ScoreEntityTarget["kind"];
    })
  | (RegistryContributionSummaryBase & {
      readonly kind: "selector";
      readonly inputKind: "snapshot" | "read-state";
    });

export interface RegistrySummary {
  readonly startupManifestVersion: 1;
  readonly modules: readonly RegistryModuleSummary[];
  readonly contributions: readonly RegistryContributionSummary[];
}

export type CoreSelectorRequest =
  | { readonly selectorId: "core.selector.score-metadata" }
  | {
      readonly selectorId: "core.selector.score-entity";
      readonly address: unknown;
    }
  | {
      readonly selectorId: "core.selector.score-entity-ownership";
      readonly address: unknown;
    }
  | {
      readonly selectorId: "core.selector.score-range";
      readonly range: unknown;
    }
  | { readonly selectorId: "core.selector.history-state" }
  | { readonly selectorId: "core.selector.dirty-state" };

export type CoreSelectorResult =
  | ReadResult<ScoreMetadata>
  | ReadResult<SelectedScoreEntity>
  | ReadResult<ScoreEntityOwnership>
  | ReadResult<ScoreRangeSelection>
  | ReadResult<KernelHistoryState>
  | ReadResult<boolean>;

export type KernelRegistryStartupFailure =
  | { readonly code: "registry.invalid-startup-input" }
  | {
      readonly code: "registry.registration-entry-not-found";
      readonly registrationEntryId: string;
    }
  | {
      readonly code: "registry.registration-owner-mismatch";
      readonly registrationEntryId: string;
      readonly moduleId: string;
    }
  | { readonly code: "registry.duplicate-module-id"; readonly moduleId: string }
  | {
      readonly code: "registry.duplicate-contribution-id";
      readonly contributionId: string;
    }
  | { readonly code: "registry.unsupported-origin"; readonly moduleId: string }
  | { readonly code: "registry.unsupported-runtime"; readonly moduleId: string }
  | {
      readonly code: "registry.unsupported-trust-level";
      readonly moduleId: string;
    }
  | {
      readonly code: "registry.api-version-incompatible";
      readonly moduleId: string;
    }
  | {
      readonly code: "registry.capability-denied";
      readonly moduleId: string;
      readonly capability: KernelCapability;
    }
  | {
      readonly code: "registry.invalid-contribution";
      readonly registrationEntryId: string;
    }
  | {
      readonly code: "registry.handler-mismatch";
      readonly contributionId: string;
    }
  | { readonly code: "registry.internal-error" };

export type KernelRegistryAccessFailure =
  | { readonly code: "registry.invalid-invocation" }
  | { readonly code: "registry.module-not-found"; readonly moduleId: string }
  | {
      readonly code: "registry.contribution-not-found";
      readonly contributionId: string;
    }
  | {
      readonly code: "registry.capability-denied";
      readonly moduleId: string;
      readonly capability: KernelCapability;
    }
  | { readonly code: "registry.internal-error" };

export type KernelGatewayResult<T> =
  | { readonly status: "authorized"; readonly value: T }
  | { readonly status: "rejected"; readonly failure: KernelRegistryAccessFailure };
