export const CVN7_TASK_ID = "cvn-7-core-vnext-final-qualification" as const;
export const CVN7_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const CVN7_QUALIFICATION_BASE =
  "38afdc3fd508dc67f7aa446fd323837a5d550b70" as const;
export const CVN7_PORTABLE_RATIO_LIMIT = 1.2 as const;
export const CVN7_WARMUP_COUNT = 5 as const;
export const CVN7_MEASURED_COUNT = 20 as const;
export const CVN7_REPRESENTATIVE_RSS_LIMIT_BYTES = 1_073_741_824 as const;
export const CVN7_STRESS_RSS_LIMIT_BYTES = 2_147_483_648 as const;
export const CVN7_FUNCTIONAL_TIMEOUT_MS = 1_800_000 as const;
export const CVN7_SAMPLE_TIMEOUT_MS = 600_000 as const;
export const CVN7_STRESS_TIMEOUT_MS = 10_800_000 as const;
export const CVN7_TIMEOUT_GRACE_MS = 5_000 as const;

export const CVN7_OPERATIONS = [
  "submit-single",
  "undo-single",
  "redo-single",
  "read-cached",
  "snapshot-first",
  "batch-100",
  "replay-100",
  "construct-integrated",
] as const;

export type QualificationOperation = (typeof CVN7_OPERATIONS)[number];
export type QualificationFixtureKind = "representative" | "stress";
export type QualificationRunMode =
  | "functional"
  | "portable"
  | "reference"
  | "stress"
  | "all";

export const CVN7_OPERATION_BUDGETS_MS: Readonly<
  Record<QualificationOperation, number>
> = Object.freeze({
  "submit-single": 100,
  "undo-single": 100,
  "redo-single": 100,
  "read-cached": 50,
  "snapshot-first": 50,
  "batch-100": 300,
  "replay-100": 2_000,
  "construct-integrated": 1_000,
});

export interface QualificationEvidenceHeaderV1 {
  readonly schemaVersion: 1;
  readonly taskId: typeof CVN7_TASK_ID;
  readonly qualificationBaseCommit: string;
  readonly candidateCommit: string;
  readonly harnessCommit: string;
  readonly generatedAtUtc: string;
}

export interface QualificationFixtureProvenanceV1 {
  readonly generatorVersion: 1;
  readonly fixtureKind: QualificationFixtureKind;
  readonly seed: string;
}

export interface QualificationEntityCountsV1 {
  readonly measures: number;
  readonly parts: number;
  readonly staves: number;
  readonly measureContents: number;
  readonly voices: number;
  readonly events: number;
  readonly notes: number;
  readonly knownExtensionBlocks: number;
  readonly unknownExtensionBlocks: number;
}

export interface QualificationCaseTraceV1 {
  readonly contractId: `CVN-FC-${string}`;
  readonly primaryOwner: string;
  readonly consumerOwner: "CVN-7";
  readonly caseId: `CVN7-Q-${string}`;
  readonly qualificationTitle: `CVN7-Q-${string}`;
  readonly qualificationTestFile: string;
  readonly decisiveTestFile: string;
  readonly decisiveTestTitle: string;
}

export interface QualificationContractTraceReportV1
  extends QualificationEvidenceHeaderV1 {
  readonly contracts: readonly QualificationCaseTraceV1[];
  readonly expectedCount: 44;
  readonly fullSuitePassed: boolean;
  readonly qualificationSuitePassed: boolean;
}

export interface QualificationBuildManifestEntryV1 {
  readonly relativePath: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface QualificationBuildManifestV1
  extends QualificationEvidenceHeaderV1 {
  readonly buildRole: "baseline" | "candidate";
  readonly commit: string;
  readonly fileCount: number;
  readonly treeSha256: string;
  readonly entries: readonly QualificationBuildManifestEntryV1[];
}

export interface QualificationFixtureReportV1
  extends QualificationEvidenceHeaderV1 {
  readonly fixtureProvenance: QualificationFixtureProvenanceV1;
  readonly counts: QualificationEntityCountsV1;
  readonly idsUnique: boolean;
  readonly coverageComplete: boolean;
  readonly semanticValid: boolean;
  readonly codecRoundTripEqual: boolean;
  readonly repeatedGenerationEqual: boolean;
}

export interface QualificationFunctionalCaseV1 {
  readonly caseId: string;
  readonly status: "passed" | "failed";
  readonly failureKind?: string;
}

export interface QualificationFunctionalMatrixV1
  extends QualificationEvidenceHeaderV1 {
  readonly fixtureProvenance: QualificationFixtureProvenanceV1;
  readonly cases: readonly QualificationFunctionalCaseV1[];
  readonly passed: boolean;
}

export interface QualificationBenchmarkPairV1 {
  readonly pairIndex: number;
  readonly invocationOrder:
    | "baseline-then-candidate"
    | "candidate-then-baseline";
  readonly baselineDurationMs: number;
  readonly candidateDurationMs: number;
}

export interface QualificationBenchmarkOperationV1 {
  readonly operation: QualificationOperation;
  readonly warmupCount: 5;
  readonly measuredCount: 20;
  readonly fixtureProvenance: QualificationFixtureProvenanceV1;
  readonly pairs: readonly QualificationBenchmarkPairV1[];
  readonly baselineMedianMs: number;
  readonly baselineP95Ms: number;
  readonly candidateMedianMs: number;
  readonly candidateP95Ms: number;
  readonly medianRatio: number;
  readonly p95Ratio: number;
  readonly portableRatioPassed: boolean;
  readonly absoluteBudgetMs: number;
  readonly absoluteBudgetApplied: boolean;
  readonly absoluteBudgetPassed: boolean | null;
}

export interface QualificationPortableAbReportV1
  extends QualificationEvidenceHeaderV1 {
  readonly fixtureProvenance: QualificationFixtureProvenanceV1;
  readonly operations: readonly QualificationBenchmarkOperationV1[];
  readonly passed: boolean;
}

export interface QualificationMemoryObservationV1 {
  readonly setupBeforeHeapUsedBytes: number;
  readonly operationBeforeHeapUsedBytes: number;
  readonly operationAfterHeapUsedBytes: number;
  readonly resultEncodeAfterHeapUsedBytes: number;
  readonly observedPeakHeapUsedBytes: number;
  readonly maxRssRaw: number;
  readonly maxRssPlatformUnit: "kilobytes";
  readonly maxRssBytes: number;
}

export interface QualificationEnvironmentCheckV1 {
  readonly field: string;
  readonly matched: boolean;
}

export interface QualificationEnvironmentV1
  extends QualificationEvidenceHeaderV1 {
  readonly nodeVersion: string;
  readonly nodeExecutableSha256: string;
  readonly platform: string;
  readonly arch: string;
  readonly osType: string;
  readonly osRelease: string;
  readonly osVersion: string;
  readonly reportLabel: string;
  readonly cpuModels: readonly string[];
  readonly logicalCpuCount: number;
  readonly physicalMemoryBytes: number;
  readonly physicalMemoryGiBRounded: number;
  readonly processExecArgv: readonly string[];
  readonly nodeOptionsPresent: boolean;
  readonly packageLockSha256: string;
  readonly baselineBuildTreeSha256: string;
  readonly candidateBuildTreeSha256: string;
  readonly debuggerOrInstrumentationPresent: boolean;
  readonly checks: readonly QualificationEnvironmentCheckV1[];
  readonly environmentMatch: boolean;
}

export interface QualificationReferenceWindowsReportV1
  extends QualificationEvidenceHeaderV1 {
  readonly fixtureProvenance: QualificationFixtureProvenanceV1;
  readonly environmentMatch: boolean;
  readonly operations: readonly QualificationBenchmarkOperationV1[];
  readonly representativeMemoryAggregation: "fieldwise-max-across-eight-operations";
  readonly representativeMemoryOperationCount: 8;
  readonly representativeMemory: QualificationMemoryObservationV1;
  readonly absoluteBudgetsPassed: boolean | null;
  readonly result:
    | "REFERENCE_GATE_PASSED_PENDING_STRESS"
    | "NOT_QUALIFIED_REFERENCE_PERFORMANCE"
    | "REFERENCE_ENVIRONMENT_PENDING";
  readonly qualified: false;
}

export interface QualificationStressReportV1
  extends QualificationEvidenceHeaderV1 {
  readonly fixtureProvenance: QualificationFixtureProvenanceV1;
  readonly counts: QualificationEntityCountsV1;
  readonly envelopeCount: 10_000;
  readonly liveCommittedCount: number;
  readonly replayCommittedCount: number;
  readonly statusSequencesEqual: boolean;
  readonly finalDocumentEqual: boolean;
  readonly documentVersionEqual: boolean;
  readonly supportEqual: boolean;
  readonly availabilityEqual: boolean;
  readonly effectBasedHistoryVerified: boolean;
  readonly wholeDocumentHistoryEvidenceAbsent: boolean;
  readonly historyEvidence: {
    readonly relativeArtifactPath: string;
    readonly artifactSha256: string;
    readonly historyEntryLocated: boolean;
    readonly effectFieldsPresent: boolean;
    readonly wholeDocumentFieldsAbsent: boolean;
  };
  readonly memory: QualificationMemoryObservationV1;
  readonly peakRssLimitBytes: number;
  readonly trendLatencyMs: number;
  readonly processCompleted: boolean;
  readonly unhandledRejectionObserved: boolean;
  readonly passed: boolean;
}

export type QualificationDecision =
  | "QUALIFIED"
  | "NOT_QUALIFIED_FUNCTIONAL"
  | "NOT_QUALIFIED_DETERMINISM"
  | "NOT_QUALIFIED_RESOURCE"
  | "NOT_QUALIFIED_PORTABLE_PERFORMANCE"
  | "NOT_QUALIFIED_REFERENCE_PERFORMANCE"
  | "EVIDENCE_INVALID"
  | "REFERENCE_ENVIRONMENT_PENDING"
  | "BLOCKING_EVIDENCE_COMPLETE_PENDING_INDEPENDENT_REVIEW";

export interface QualificationSummaryV1 extends QualificationEvidenceHeaderV1 {
  readonly result: QualificationDecision;
  readonly qualified: boolean;
  readonly functionalPassed: boolean;
  readonly deterministicPassed: boolean;
  readonly resourcePassed: boolean;
  readonly portablePassed: boolean;
  readonly referencePassed: boolean;
  readonly stressPassed: boolean;
  readonly independentReviewPassed: boolean;
}

export const CVN7_WORKER_ACTIONS = [
  "fixture-verify",
  "functional-case",
  "latency-sample",
  "memory-sample",
  "stress-submit",
  "stress-replay",
  "build-probe",
] as const;

export type QualificationWorkerAction = (typeof CVN7_WORKER_ACTIONS)[number];

export interface QualificationWorkerRequestV1 {
  readonly schemaVersion: 1;
  readonly action: QualificationWorkerAction;
  readonly buildRoot: string;
  readonly fixture: QualificationFixtureKind;
  readonly operation?: QualificationOperation;
  readonly phase: "warmup" | "measured" | "memory" | "functional";
  readonly sampleIndex?: number;
}

export type QualificationWorkerResultV1 =
  | {
      readonly schemaVersion: 1;
      readonly status: "passed";
      readonly action: QualificationWorkerAction;
      readonly result: unknown;
    }
  | {
      readonly schemaVersion: 1;
      readonly status: "failed";
      readonly action: QualificationWorkerAction;
      readonly failureKind: string;
      readonly phase: QualificationWorkerRequestV1["phase"];
    };
