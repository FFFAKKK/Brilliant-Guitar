export const PURE_CORE_KERNEL_V1_SCOPE = {
  milestone: "Pure Core Kernel V1",
  runtime: "pure-typescript",
  forbiddenCapabilities: [
    "react-ui",
    "tauri-shell",
    "vexflow-rendering",
    "web-audio-playback",
    "pdf-export",
    "png-export",
    "guitar-pro-import-export",
    "physical-bgp-io",
    "plugin-runtime",
  ],
} as const;

export * from "./domain/fraction";
export * from "./domain/extensions";
export * from "./domain/musical-time";
export * from "./domain/pitch";
export * from "./domain/score-document";
export * from "./domain/address";
export * from "./codec/decode-score-document";
export * from "./codec/score-json";
export { createScoreDocument } from "./factory/create-score-document";
export type {
  CreateScoreDocumentFailure,
  CreateScoreDocumentInputV1,
  CreateScoreDocumentResult,
  InitialPartV1,
} from "./factory/contracts";
export * from "./validation/diagnostics";
export * from "./validation/validate-score-semantics";
export * from "./profiles/score-feature-profile";
export * from "./commands/contracts";
export * from "./commands/command-bus";
export * from "./commands/replay";
export * from "./read/contracts";
export * from "./read/selectors";
export * from "./events/contracts";

export { CORE_KERNEL_STARTUP_MANIFEST } from "./registry/builtins";
export {
  createKernelRegistry,
  KernelModuleGateway,
  KernelRegistry,
} from "./registry/runtime";
export type {
  CoreModuleRegistrationEntryId,
  CoreSelectorId,
  CoreSelectorRequest,
  CoreSelectorResult,
  KernelCapability,
  KernelGatewayResult,
  KernelModuleIdentity,
  KernelModuleOrigin,
  KernelModuleRuntime,
  KernelRegistryAccessFailure,
  KernelRegistryApiVersion,
  KernelRegistryStartupFailure,
  KernelStartupManifestVersion,
  KernelStartupModuleDeclaration,
  KernelStartupModuleManifest,
  KernelTrustLevel,
  RegistryContributionSummary,
  RegistryModuleSummary,
  RegistrySummary,
} from "./registry/contracts";
export type {
  KernelModuleGatewayCreationResult,
  KernelRegistryCreationResult,
} from "./registry/runtime";
export type {
  ExtensionRuntimeRequirementV1,
  IntegratedCommandBus,
  IntegratedCommandBusCreationResult,
  IntegratedKernelModuleGateway,
  IntegratedKernelModuleGatewayCreationResult,
  IntegratedKernelReadState,
  KernelCommandAssessment,
  KernelCommandBusCreationFailure,
  KernelCommandFailure,
  KernelCommandResult,
  KernelContributionFailure,
  KernelDomainAvailabilityFact,
  KernelIntegratedCatalog,
  KernelKnownRequirementInventoryV1,
  KernelValidationAvailability,
  KernelWriteAvailability,
  ModuleCommandAssessment,
  ModuleIssueCode,
  ModuleKernelIssue,
  ReplayKernelCommandsResult,
} from "./registry/integrated-contracts";

export {
  createModuleInternalIssue,
  mapCheckpointFailureToKernelIssues,
  mapCommandBusCreationFailureToKernelIssues,
  mapCommandFailureToKernelIssues,
  mapDiagnosticToKernelIssue,
  mapEventSubscriptionFailureToKernelIssues,
  mapReadFailureToKernelIssues,
  mapRegistryAccessFailureToKernelIssues,
  mapRegistryStartupFailureToKernelIssues,
} from "./reports/adapters";
export { createKernelValidationReport } from "./reports/validation-report";
export type {
  CoreIssueSubsystem,
  EventSubscriptionFailure,
  KernelIssue,
  KernelIssueCode,
  KernelIssueLocation,
  KernelIssueSource,
  KernelReport,
  KernelReportKind,
  KernelReportStatus,
  KernelReportSummary,
  KernelSeverity,
  MigrationFailureCode,
  MigrationReport,
  ModuleFailureCode,
  ReportFailureCode,
} from "./reports/contracts";
export { migrateScoreDocument } from "./migration/migrate-score-document";
export { migrateKernelExtension } from "./migration/migrate-kernel-extension";
export { replayKernelCommands } from "./commands/replay";
export type {
  KernelExtensionMigrationFailure,
  KernelExtensionMigrationRequestV1,
  KernelExtensionMigrationResult,
  MigrationFailure,
  MigrationResult,
} from "./migration/contracts";
