# Design — RKP-0 Authority Contract and Oracle Freeze

## 1. Authority update model

RKP-0 adds a transition contract rather than rewriting the current production claim:

```text
Current accepted runtime authority
  = Pure TypeScript Core at b21540fa

Accepted transition target
  = staged Rust runtime described by rust-runtime-transition.md

Target becomes current authority
  = only after accepted RKP-8 cutover
```

The CVN-7 task remains in-progress/unqualified. Its fifth official input is appended to the failure ledger, while `evidence/` retains no partial result artifacts.

## 2. Failure-ledger contract

The only new ledger path is `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/research/official-run-failure-ledger.jsonl`. It is not qualification evidence. RKP-0 appends exactly one canonical row with this exact logical shape:

```ts
interface Cvn7OfficialRunFailureV1 {
  readonly schemaVersion: 1;
  readonly failureId: "cvn7-official-2026-08-15-b21540fa-stress-submit-memory";
  readonly requestWrittenAt: "2026-08-15T00:35:09.7269066+08:00";
  readonly coordinatorCompletedAt: "2026-08-15T03:35:10.0778114+08:00";
  readonly mode: "all";
  readonly baselineCommit: "38afdc3fd508dc67f7aa446fd323837a5d550b70";
  readonly candidateCommit: "b21540fa3636e6c8e827ff24c2099f4ff331285d";
  readonly harnessCommit: "b21540fa3636e6c8e827ff24c2099f4ff331285d";
  readonly action: "stress-submit";
  readonly fixture: "stress";
  readonly phase: "memory";
  readonly workerStarted: true;
  readonly requestCount: 411;
  readonly resultCount: 410;
  readonly timeoutMs: 10_800_000;
  readonly processExitCode: 1;
  readonly signal: null;
  readonly launcherFailure: null;
  readonly stderrClassification: "worker-timeout";
  readonly measurementComplete: false;
  readonly evidenceValid: false;
  readonly partialEvidence: false;
  readonly reusableEvidence: false;
  readonly classification: "EVIDENCE_INVALID";
  readonly workload: {
    readonly events: 102_400;
    readonly notes: 51_200;
    readonly envelopes: 10_000;
    readonly rssLimitBytes: 2_147_483_648;
  };
  readonly nextOwner: "08-15-rkp-0-authority-contract-oracle-freeze";
}
```

Rows use canonical compact JSON plus final LF and sort by `(requestWrittenAt, failureId)`. `failureId` is the unique key. Exact-shape decoding rejects duplicate keys/rows and extra/missing fields. TEMP paths and partial worker output are excluded. Nothing is added beneath CVN-7 `evidence/` except the existing `README.md` status wording.

## 3. Oracle artifact layout

```text
test/core-kernel/rust-migration/
  oracle-schema.ts
  ts-oracle-fixtures.ts
  ts-oracle-capture.test.ts
  oracle-manifest.test.ts
  fixtures/
    oracle-manifest-v1.json
    oracle-scenarios-v1.jsonl
    qualification-v2-contract.json
```

The normal `npm test` discovery runs the two `*.test.ts` files. No package script is added.

## 4. Manifest contract

`oracle-manifest-v1.json` has this exact logical shape:

```ts
interface RustMigrationOracleManifestV1 {
  readonly schemaVersion: 1;
  readonly baselineCommit: "b21540fa3636e6c8e827ff24c2099f4ff331285d";
  readonly persistedSchema: "brilliant-score-1";
  readonly applicationRuntimeExports: readonly string[];
  readonly moduleSdkRuntimeExports: readonly string[];
  readonly moduleSdkTypeExports: readonly string[];
  readonly contributionAbiFields: readonly string[];
  readonly commandIds: readonly string[];
  readonly factoryModes: readonly ["core-only", "integrated"];
  readonly publicContractFamilies: readonly [
    "CommandResult",
    "KernelCommandResult",
    "KernelCommandFailure",
    "KernelEvent",
    "IntegratedKernelEvent",
    "KernelIssue",
    "ModuleKernelIssue",
    "KernelValidationReport",
    "MigrationResult",
    "KernelExtensionMigrationResult",
  ];
  readonly fixtureContracts: readonly [
    RepresentativeOracleFixtureContractV1,
    StressOracleFixtureContractV1,
  ];
  readonly scenarioCount: 64;
  readonly scenarioIds: readonly string[];
  readonly scenarioHashes: Readonly<Record<string, string>>;
  readonly scenariosFileSha256: string;
  readonly qualificationV2ContractSha256: string;
  readonly scenarioSpecification: {
    readonly file: ".trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze/research/oracle-scenario-matrix.md";
    readonly sha256: string;
  };
  readonly sdkSurfaceSpecification: {
    readonly file: ".trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze/research/sdk-surface-migration-matrix.md";
    readonly sha256: string;
  };
}

interface RepresentativeOracleFixtureContractV1 {
  readonly fixtureKind: "representative";
  readonly sourceFile: "test/core-kernel/fixtures/cvn-7-qualification-score.ts";
  readonly generatorExport: "createRepresentativeCvn7Score";
  readonly generatorVersion: 1;
  readonly seed: "cvn7-representative-v1";
  readonly counts: {
    readonly measures: 200;
    readonly parts: 8;
    readonly staves: 8;
    readonly measureContents: 1_600;
    readonly voices: 3_200;
    readonly events: 25_600;
    readonly notes: 12_800;
    readonly knownExtensionBlocks: 9;
    readonly unknownExtensionBlocks: 1;
  };
  readonly workload: {
    readonly historySubmitCount: 2_000;
    readonly batchChildCount: 100;
    readonly replayEnvelopeCount: 100;
    readonly stressEnvelopeCount: 0;
  };
  readonly rssLimitBytes: 1_073_741_824;
}

interface StressOracleFixtureContractV1 {
  readonly fixtureKind: "stress";
  readonly sourceFile: "test/core-kernel/fixtures/cvn-7-qualification-score.ts";
  readonly generatorExport: "createStressCvn7Score";
  readonly generatorVersion: 1;
  readonly seed: "cvn7-stress-v1";
  readonly counts: {
    readonly measures: 400;
    readonly parts: 16;
    readonly staves: 16;
    readonly measureContents: 6_400;
    readonly voices: 12_800;
    readonly events: 102_400;
    readonly notes: 51_200;
    readonly knownExtensionBlocks: 17;
    readonly unknownExtensionBlocks: 1;
  };
  readonly workload: {
    readonly historySubmitCount: 0;
    readonly batchChildCount: 0;
    readonly replayEnvelopeCount: 0;
    readonly stressEnvelopeCount: 10_000;
  };
  readonly rssLimitBytes: 2_147_483_648;
}
```

The 51 application names equal `CORE_RUNTIME_KEYS` in `test/core-kernel/cvn-7-public-baseline.test.ts:11-31`. The exact SDK names and ABI fields equal `research/sdk-surface-migration-matrix.md`. Counts are derived from these arrays and must be 51/8/34/9; a same-count different-name set fails. The two fixture rows are ordered representative then stress and must equal the literal values above. The manifest is data-only and exact-shape decoded; extra or missing fields fail.

## 5. Scenario and operation contracts

Each JSONL row has this exact logical shape:

```ts
interface RustMigrationOracleScenarioV1 {
  readonly schemaVersion: 1;
  readonly scenarioId: string;
  readonly scenarioClass: "accepted-command" | "rejected-command" | "cross-cutting";
  readonly coveredCommandIds: readonly string[];
  readonly assemblyKind: "core-only" | "integrated";
  readonly sourceAuthority: {
    readonly file: string;
    readonly testTitle: string;
  };
  readonly initialDocument: ScoreDocument;
  readonly initialState: OracleStateProjectionV1;
  readonly operations: readonly OracleOperationV1[];
  readonly observations: readonly OracleObservationV1[];
  readonly finalDocument: ScoreDocument;
  readonly finalState: OracleStateProjectionV1;
  readonly inverseProof:
    | { readonly kind: "not-applicable" }
    | {
        readonly kind: "undo-redo";
        readonly initialDocumentSha256: string;
        readonly afterSubmitDocumentSha256: string;
        readonly afterUndoDocumentSha256: string;
        readonly afterRedoDocumentSha256: string;
      };
}

type OracleOperationV1 =
  | { readonly operationVersion: 1; readonly operationIndex: number; readonly kind: "submit"; readonly input: unknown }
  | { readonly operationVersion: 1; readonly operationIndex: number; readonly kind: "undo" }
  | { readonly operationVersion: 1; readonly operationIndex: number; readonly kind: "redo" }
  | { readonly operationVersion: 1; readonly operationIndex: number; readonly kind: "mark-persisted"; readonly input: unknown }
  | { readonly operationVersion: 1; readonly operationIndex: number; readonly kind: "read"; readonly projection: "snapshot+history+dirty" }
  | { readonly operationVersion: 1; readonly operationIndex: number; readonly kind: "replay"; readonly replayKind: "core" | "integrated"; readonly initialDocument: ScoreDocument; readonly commands: readonly unknown[]; readonly assemblyRef: "none" | "cvn6-a" | "cvn6-b" }
  | { readonly operationVersion: 1; readonly operationIndex: number; readonly kind: "migrate-kernel-extension"; readonly inputDocument: unknown; readonly request: unknown; readonly assemblyRef: "cvn6-a" | "cvn6-b" }
  | { readonly operationVersion: 1; readonly operationIndex: number; readonly kind: "create-gateway"; readonly registryAssemblyRef: "core" | "cvn6-a" | "cvn6-b"; readonly busAssemblyRef: "core" | "cvn6-a" | "cvn6-b"; readonly moduleId: string }
  | { readonly operationVersion: 1; readonly operationIndex: number; readonly kind: "subscribe"; readonly subscriptionId: string; readonly behavior: "collect" | "throw-sync" | "reject-async" }
  | { readonly operationVersion: 1; readonly operationIndex: number; readonly kind: "unsubscribe"; readonly subscriptionId: string };

interface OracleStateProjectionV1 {
  readonly documentSha256: string;
  readonly documentVersion: number;
  readonly history: { readonly undoDepth: number; readonly redoDepth: number };
  readonly dirty: boolean;
  readonly eventSequence: number;
}

interface OracleObservationV1 {
  readonly observationVersion: 1;
  readonly operationIndex: number;
  readonly result: unknown;
  readonly state: OracleStateProjectionV1;
  readonly publishedEvents: readonly IntegratedKernelEvent[];
  readonly callbackTrace: readonly string[];
}
```

Input/result values are descriptor-first captured and must be JSON-compatible data. For `subscribe`, the callable unsubscribe identity is normalized to `{status:"subscribed",subscriptionId}`; `unsubscribe` is `{status:"completed",subscriptionId}`. No other public field is omitted. Operation indices are dense from zero; observations have equal length and exactly matching indices. Async subscriber isolation settles one microtask turn inside the following read operation. The literal construction/result matrix is `research/oracle-scenario-matrix.md`.

## 6. Scenario naming and ordering

Order is fixed:

1. `command.accepted.<commandId>` for the 28 catalog command IDs in accepted catalog order;
2. `command.rejected.<commandId>` in the same order;
3. the eight cross-cutting IDs in PRD order, prefixed `cross.`.

Scenario IDs are unique. The generator asserts the 28-command set equals the live catalog exactly once, preventing a later command from silently missing oracle coverage.

The implementation uses the exact fixtures, envelopes, source tests, `A8`/`R4` programs and cross-cutting programs in `research/oracle-scenario-matrix.md`. Any observed failure-precedence drift stops the stage; the operator does not replace the row.

## 7. Canonicalization and hashing

Canonicalization recursively sorts object keys using ordinal JavaScript string order, preserves array order, rejects unsupported values and writes compact JSON. Each row is `canonicalJson + "\n"`. SHA-256 uses the UTF-8 bytes of the row without relying on platform paths or timestamps. The file hash covers the complete concatenated JSONL bytes.

The three committed oracle fixtures are listed individually in `.gitattributes` with `text eol=lf`; no wildcard attribute is allowed and existing attribute entries remain unchanged. The capture test builds the expected bytes in memory and compares them with committed raw fixtures. A separate manifest test parses every line, verifies exact counts/IDs/hashes, and validates the qualification contract. A fresh-worktree gate reads the raw bytes without EOL normalization and requires the same byte sizes, final LF and SHA-256 values.

Artifact decoding has one untrusted boundary: `decode*Text(input: unknown)`. It checks `typeof input === "string"` before any reflection, parses through a captured primordial `JSON.parse`, applies exact-shape validation only to that parse result, detaches it, and deeply freezes the accepted value. Object, array, accessor, Proxy and sparse-array inputs are rejected without property access because they never enter structural validation. Internal parsed-value validators are not exported. Negative tests prove zero getter/Proxy invocation, sparse rejection, exact-shape rejection and alias-mutation isolation.

## 8. Qualification V2 data contract

`qualification-v2-contract.json` is exact-shape decoded and contains only:

```ts
interface QualificationV2Contract {
  readonly schemaVersion: 2;
  readonly evidenceMethodVersion: 2;
  readonly referenceEnvironmentFingerprint: "node24_15_0_win32_x64_nt10_0_26200_i9_13900hx_32cpu_39_7gib";
  readonly fixtureContracts: RustMigrationOracleManifestV1["fixtureContracts"];
  readonly sampling: {
    readonly warmupCount: 5;
    readonly measuredCount: 20;
    readonly isolation: "fresh-process-and-fresh-session-per-sample";
    readonly timedRegion: "immediately-before-public-call-to-synchronous-result-return";
    readonly excluded: readonly ["process-spawn", "module-import", "fixture-generation", "session-construction", "evidence-serialization"];
    readonly sort: "ascending-numeric-copy";
    readonly percentile: "nearest-rank-ceil-p-times-n-minus-one";
    readonly p95IndexFor20: 18;
    readonly p99IndexFor20: 19;
    readonly invalidDuration: "non-finite-or-non-positive-invalidates-evidence";
  };
  readonly latencyGates: readonly [
    { readonly operation: "representative-submit"; readonly p95Ms: 8; readonly p99Ms: 16 },
    { readonly operation: "representative-undo"; readonly p95Ms: 8; readonly p99Ms: 16 },
    { readonly operation: "representative-redo"; readonly p95Ms: 8; readonly p99Ms: 16 },
    { readonly operation: "stress-fixture-local-edit"; readonly p95Ms: 16; readonly p99Ms: 33 },
    { readonly operation: "cached-selector-read"; readonly p95Ms: 1; readonly p99Ms: null },
    { readonly operation: "batch-100"; readonly p95Ms: 100; readonly p99Ms: null },
    { readonly operation: "replay-100"; readonly p95Ms: 500; readonly p99Ms: null }
  ];
  readonly stressGates: readonly [
    { readonly operation: "stress-submit-10000"; readonly completeSequenceMaxMs: 180_000 },
    { readonly operation: "stress-replay-10000"; readonly completeSequenceMaxMs: 180_000 }
  ];
  readonly memory: {
    readonly sampling: "separate-worker-fieldwise-max";
    readonly checkpoints: readonly ["setup-before", "operation-before", "operation-after", "result-encode-after", "process-max-rss"];
    readonly maxRssKiBNormalization: "raw-times-1024";
    readonly representativeLimitBytes: 1_073_741_824;
    readonly stressLimitBytes: 2_147_483_648;
  };
  readonly complexity: {
    readonly fullDocumentScans: 0;
    readonly fullDocumentClones: 0;
    readonly fullSemanticValidations: 0;
    readonly fullSnapshotMaterializations: 0;
    readonly indexedEntityLookupsMinimum: 1;
    readonly affectedEntityCount: "exact-transaction-closure";
  };
  readonly liveness: {
    readonly policy: "calibrated-evidence-validity-guard";
    readonly timeoutMs: null;
    readonly calibrationOwner: "RKP-7";
    readonly timeoutClassification: "EVIDENCE_INVALID";
    readonly terminateProcessTree: true;
    readonly publishPartialEvidence: false;
    readonly precedence: "evidence-validity-before-performance-verdict";
  };
  readonly officialRunAuthorized: false;
}
```

The seven latency rows each use 5 warmups and 20 measurements. P99 is still computed and stored for all rows; `null` means trend-only rather than an unstated gate. Stress submit/replay each measure one complete deterministic 10,000-envelope sequence from fresh identical initial state. The timing region includes TypeScript/native DTO conversion performed by the public call and excludes only the literal setup/evidence items above.

RSS rules equal CVN-7. Any timeout, missing sample, non-finite duration, fixture/hash mismatch or worker termination makes the complete method `EVIDENCE_INVALID` before latency/resource classification and publishes zero partial evidence.

RKP-0 does not choose a new liveness constant. RKP-7 calibration produces that value and method-version repair before Qualification V2 review without changing generator, seed, counts, RSS ceilings or performance budgets.

## 9. Rollback

RKP-0 is one docs/test-only implementation commit. Reverting it removes the transition authority and oracle artifacts while leaving the `b21540fa` production tree untouched. No migration or persisted data exists at this stage.
