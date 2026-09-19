import type { ScoreEntityTarget } from "../commands/contracts";
import type { ScoreAddress } from "../domain/address";
import type {
  ExtensionBlock,
  ExtensionOwner,
  JsonObject,
} from "../domain/extensions";
import type {
  ScoreDocument,
  ScoreDocumentSchemaVersion,
} from "../domain/score-document";
import type { KernelIssueLocation } from "../reports/contracts";
import type { KernelRegistryStartupFailure } from "../registry/contracts";
import type {
  ExtensionRuntimeRequirementV1,
  KernelIntegratedCatalog,
  ModuleIssueCode,
  ModuleKernelIssue,
} from "../registry/integrated-contracts";
import type { CoreEffectRequestV1 } from "./core-effects";

export type { CoreWrittenPitchEffectRequestV1 } from "./core-effects";

export interface DomainContributionReadViewV1 {
  readonly viewVersion: 1;
  readonly documentId: string;
  readonly schemaVersion: ScoreDocumentSchemaVersion;
  readonly documentVersion: number;
  readonly coreDocument: Omit<ScoreDocument, "extensions">;
  readonly compatibleExtensions: readonly ExtensionBlock[];
}

export interface DomainCommandDescriptorV1 {
  readonly descriptorVersion: 1;
  readonly commandId: string;
  readonly commandVersion: 1;
  readonly source: {
    readonly moduleId: string;
    readonly contributionId: string;
  };
  readonly targetKind: ScoreEntityTarget["kind"];
  readonly requiredCapabilities: readonly ["command:execute", "score:read"];
  readonly titleKey: string;
}

export interface DomainCommandDecodeInputV1 {
  readonly target: unknown;
  readonly payload: unknown;
}

export type DomainCommandDecodeResultV1<Command> =
  | { readonly status: "decoded"; readonly command: Command }
  | { readonly status: "invalid" };

export type DomainCommandDecoderV1<Command> = (
  input: DomainCommandDecodeInputV1,
) => DomainCommandDecodeResultV1<Command>;

export interface ModuleOwnedEffectRequestV1 {
  readonly requestVersion: 1;
  readonly requestKind: "module.extension";
  readonly effectKind: string;
  readonly namespace: string;
  readonly owner: ExtensionOwner;
  readonly payload: JsonObject;
}

export type DomainEffectRequestV1 =
  | CoreEffectRequestV1
  | ModuleOwnedEffectRequestV1;

export type DomainCommandPreparationResultV1 =
  | { readonly status: "no-op" }
  | {
      readonly status: "rejected";
      readonly issues: readonly ModuleKernelIssue[];
    }
  | {
      readonly status: "changed";
      readonly effectRequests: readonly [
        DomainEffectRequestV1,
        ...DomainEffectRequestV1[],
      ];
      readonly affected: readonly ScoreAddress[];
    };

export type DomainCommandPreparerV1<Command> = (
  view: DomainContributionReadViewV1,
  command: Command,
) => DomainCommandPreparationResultV1;

export interface DomainCommandDefinitionInputV1<Command> {
  readonly descriptor: DomainCommandDescriptorV1;
  readonly decode: DomainCommandDecoderV1<Command>;
  readonly prepare: DomainCommandPreparerV1<Command>;
}

export const compiledDomainCommandDefinitionBrand: unique symbol = Symbol(
  "brilliant-guitar.module-sdk.v1.domain-command-definition",
);

export interface CompiledDomainCommandDefinitionV1 {
  readonly descriptor: DomainCommandDescriptorV1;
  readonly [compiledDomainCommandDefinitionBrand]: true;
}

export type DomainSemanticValidatorV1 = (
  view: DomainContributionReadViewV1,
) => readonly ModuleKernelIssue[];

export interface DomainSupportClassificationV1 {
  readonly status: "supported" | "unsupported";
  readonly issues: readonly ModuleKernelIssue[];
}

export type DomainSupportClassifierV1 = (
  view: DomainContributionReadViewV1,
) => DomainSupportClassificationV1;

export interface ModuleEffectDescriptorV1 {
  readonly descriptorVersion: 1;
  readonly effectKind: string;
  readonly source: {
    readonly moduleId: string;
    readonly contributionId: string;
  };
  readonly namespace: string;
  readonly ownerKinds:
    | readonly ["score"]
    | readonly ["part"]
    | readonly ["score", "part"];
  readonly supportedSchemaVersions: readonly number[];
}

export type ModuleEffectPayloadDecodeResultV1<Payload> =
  | { readonly status: "decoded"; readonly payload: Payload }
  | { readonly status: "invalid" };

export type ModuleEffectPayloadDecoderV1<Payload> = (
  input: unknown,
) => ModuleEffectPayloadDecodeResultV1<Payload>;

export interface ModuleEffectApplyInputV1<Payload> {
  readonly view: DomainContributionReadViewV1;
  readonly owner: ExtensionOwner;
  readonly currentBlock: ExtensionBlock | undefined;
  readonly payload: Payload;
}

export type ModuleEffectApplyResultV1 =
  | { readonly status: "remove" }
  | {
      readonly status: "replace";
      readonly schemaVersion: number;
      readonly payload: JsonObject;
    }
  | {
      readonly status: "rejected";
      readonly issues: readonly ModuleKernelIssue[];
    };

export type ModuleEffectTransformerV1<Payload> = (
  input: ModuleEffectApplyInputV1<Payload>,
) => ModuleEffectApplyResultV1;

export interface ModuleEffectDefinitionInputV1<Payload> {
  readonly descriptor: ModuleEffectDescriptorV1;
  readonly decode: ModuleEffectPayloadDecoderV1<Payload>;
  readonly transform: ModuleEffectTransformerV1<Payload>;
}

export const compiledModuleEffectDefinitionBrand: unique symbol = Symbol(
  "brilliant-guitar.module-sdk.v1.module-effect-definition",
);

export interface CompiledModuleEffectDefinitionV1 {
  readonly descriptor: ModuleEffectDescriptorV1;
  readonly [compiledModuleEffectDefinitionBrand]: true;
}

export interface CompiledDomainCommandContributionV1 {
  readonly apiVersion: 1;
  readonly moduleId: string;
  readonly contributionId: string;
  readonly extensionNamespaces: readonly string[];
  readonly extensionRequirements: readonly ExtensionRuntimeRequirementV1[];
  readonly commands: readonly CompiledDomainCommandDefinitionV1[];
  readonly validate: DomainSemanticValidatorV1;
  readonly classify: DomainSupportClassifierV1;
  readonly effects: readonly CompiledModuleEffectDefinitionV1[];
}

export interface CompiledDomainCommandRegistrationEntryV1 {
  readonly registrationEntryId: "kernel.domain-commands.v1";
  readonly ownerModuleId: string;
  readonly kind: "domain-command";
  readonly contributions: readonly CompiledDomainCommandContributionV1[];
}

export type OfficialModuleDefinitionResultV1<T> =
  | { readonly status: "defined"; readonly value: T }
  | { readonly status: "invalid" };

export interface ModuleIssueInputV1<
  ModuleId extends string = string,
  Code extends ModuleIssueCode & `${ModuleId}.${string}` = ModuleIssueCode &
    `${ModuleId}.${string}`,
> {
  readonly code: Code;
  readonly source: {
    readonly kind: "module";
    readonly moduleId: ModuleId;
    readonly contributionId: string;
  };
  readonly location?: KernelIssueLocation;
  readonly details?: JsonObject;
}

export type ModuleIssueCreationResultV1 =
  | { readonly status: "created"; readonly issue: ModuleKernelIssue }
  | { readonly status: "invalid" };

export type OfficialModuleCatalogCompilationResultV1 =
  | { readonly ok: true; readonly catalog: KernelIntegratedCatalog }
  | { readonly ok: false; readonly failure: KernelRegistryStartupFailure };

export interface OfficialModuleSdkV1Limits {
  readonly modules: 64;
  readonly contributions: 256;
  readonly commands: 4096;
  readonly effects: 4096;
  readonly extensionNamespaces: 1024;
  readonly supportedSchemaVersionsPerRequirement: 256;
  readonly moduleIssuesPerCallback: 1024;
  readonly moduleIssuesPerTransaction: 4096;
  readonly compatibilityFacts: 131072;
}

export const OFFICIAL_MODULE_SDK_V1_LIMITS: OfficialModuleSdkV1Limits =
  Object.freeze({
    modules: 64,
    contributions: 256,
    commands: 4096,
    effects: 4096,
    extensionNamespaces: 1024,
    supportedSchemaVersionsPerRequirement: 256,
    moduleIssuesPerCallback: 1024,
    moduleIssuesPerTransaction: 4096,
    compatibilityFacts: 131072,
  });
