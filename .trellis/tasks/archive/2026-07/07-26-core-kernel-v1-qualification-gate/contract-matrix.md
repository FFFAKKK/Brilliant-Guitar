# Core Kernel V1 Contract Matrix

## Classification

- `covered`: the public contract has an owning active spec and decisive existing test evidence.
- `coverage-gap`: the contract is specified but lacks decisive test evidence.
- `spec-gap`: a public behavior exists but the owning spec does not decide the observed boundary.
- `reproducible-bug`: a stable public reproduction contradicts an approved contract.

Each public runtime contract group appears once below. Type-only data contracts are grouped with the runtime boundary that owns them. K1-6 adds no new production API, so its row covers only the cross-contract acceptance behavior.

| # | Stage | Promised contract | Public entry point | Owning specification | Existing decisive evidence | Result |
|---:|---|---|---|---|---|---|
| 1 | K1-0 | Pure TypeScript scope, forbidden capability boundary, restricted root export | `PURE_CORE_KERNEL_V1_SCOPE`, `src/core-kernel/index.ts` | `pure-kernel-boundary.md`; `quality-guidelines.md` | `smoke.test.ts:6`; `public-api-boundary.test.ts:63`; `forbidden-dependency-boundary.test.ts:90,124` | covered |
| 2 | K1-1 | Canonical exact Fraction construction, arithmetic, comparison, overflow failure | `createFraction`, `isCanonicalFraction`, `addFractions`, `subtractFractions`, `multiplyFractions`, `compareFractions` | `score-document-model.md` / Current Exact Musical Time | `fraction.test.ts:24-142` | covered |
| 3 | K1-1 | Public unknown-value predicates for JSON, WrittenPitch, and Transposition | `isJsonValue`, `isWrittenPitch`, `isTransposition` | Data shapes are owned by `score-document-model.md`; hostile-object behavior is not decided | `extensions.test.ts:6` covers ordinary/cycle/sparse JSON; `pitch-transposition.test.ts:23-59` covers higher-level typed use; root-export presence only for the predicates | spec-gap (`CKV1-AUDIT-001`) |
| 4 | K1-1 | NoteValue guards and exact duration/measure/start derivation | `isNoteValueBase`, `isNoteValueDots`, `getNoteValueDuration`, `getEffectiveMeasureDuration`, `deriveSequenceEventStarts` | `score-document-model.md` / Current Exact Musical Time | `note-value.test.ts:31-99` | covered |
| 5 | K1-1 | Deterministic written-to-sounding pitch transposition and stable failures | `transposeWrittenPitch`; `WrittenPitch`, `SoundingPitch`, `Transposition` | `score-document-model.md` / Current Pitch and Transposition | `pitch-transposition.test.ts:23-59`; semantic pitch coverage in `score-semantics.test.ts:624` | covered |
| 6 | K1-1 | `brilliant-score-1` document shape, one measure-order truth, notation facts only | `SCORE_DOCUMENT_SCHEMA_VERSION`, `isScoreDocumentSchemaVersion`; `ScoreDocument` family | `score-document-model.md` / Current Document Shape and Ownership | `score-document-model.test.ts:6,19`; `score-semantics.test.ts:271,301` | covered |
| 7 | K1-1 | Score/Part ExtensionBlock envelope and opaque finite JSON preservation | `ExtensionBlock`, `ExtensionOwner`, `JsonValue` | `score-document-model.md` / Current Extension Envelope | `unknown-extension-roundtrip.test.ts:11`; `command-internals.test.ts:784`; `migration.test.ts:192`; K1-6 integration flow | covered |
| 8 | K1-1 | Strict score decode, JSON parse/encode, stable diagnostics, detached round-trip | `decodeScoreDocument`, `parseScoreDocumentJson`, `encodeScoreDocumentJson` | `score-document-model.md` / Three-Layer Validation; `errors-reports.md` / K1-1 diagnostics | `score-document-codec.test.ts:23-310`; `core-kernel-integration.test.ts:308` | covered |
| 9 | K1-1 | Closed diagnostic codes, deterministic message keys/paths/details | `createDiagnostic`; `Diagnostic` family | `errors-reports.md` / Current Diagnostic Contract | codec diagnostics at `score-document-codec.test.ts:40-310`; semantic closed-code evidence at `score-semantics.test.ts:338-624`; unsupported evidence at `score-feature-profile.test.ts:79-210` | covered |
| 10 | K1-1 | Non-mutating semantic validation of IDs, references, coverage, time, pitch, extension envelopes | `validateScoreDocumentSemantics` | `score-document-model.md` / Semantic Invariants; `errors-reports.md` / K1-1 pipeline | `score-semantics.test.ts:46-624` | covered |
| 11 | K1-1 | Semantic-valid support classification distinct from invalidity; frozen default profile | `K1_SCORE_FEATURE_PROFILE`, `validateScoreFeatureProfile` | `score-document-model.md` / Current K1 Score Feature Profile | `score-feature-profile.test.ts:35-210`; `core-kernel-integration-boundaries.test.ts:124,179` | covered |
| 12 | K1-2 | Six versioned semantic commands, stable targets/anchors, strict envelope rejection | `CoreCommandEnvelope` family; `CommandBus.submit` decode boundary | `command-transaction.md` / Signatures and Contracts | `command-internals.test.ts:89-310`; `command-system.test.ts:214,238` | covered |
| 13 | K1-2 | Validated creation, atomic submit, commit/no-op/reject, alias and exception isolation | `CommandBus.create`, `CommandBus.submit` | `command-transaction.md` / Contracts and Error Matrix | `command-system.test.ts:278-376,478-521`; `command-internals.test.ts:385,673` | covered |
| 14 | K1-2 | Deterministic one-entry history, atomic undo/redo, redo preservation/invalidation | `CommandBus.undo`, `CommandBus.redo`; result/history contracts | `command-transaction.md` / Contracts | `command-system.test.ts:411,451`; `command-internals.test.ts:428-584` | covered |
| 15 | K1-2 | Replay through live submit semantics, stop-on-rejection, detached deterministic result | `replayCoreCommands` | `command-transaction.md` / Replay contract | `command-system.test.ts:537-623`; `core-kernel-integration.test.ts:383,555` | covered |
| 16 | K1-3 | Stable seven-kind addresses, hierarchical points/ranges, reverse normalization | `ScoreAddress`, `ScorePoint`, `ScoreRange`; range selector contract | `snapshot-events.md` / Address and Range | `address-range.test.ts:61-280` | covered |
| 17 | K1-3 | Atomic frozen snapshots and six deterministic selectors | `CommandBus.read`; `selectScoreMetadata`, `selectScoreEntity`, `selectScoreEntityOwnership`, `selectScoreRange`, `selectHistoryState`, `selectDirtyState` | `snapshot-events.md` / Read and Checkpoint | `read-system.test.ts:56-233`; `address-range.test.ts:280` | covered |
| 18 | K1-3 | Checkpoint identity and dirty state across save/undo/redo without IO | `CommandBus.markPersisted`; checkpoint/read contracts | `snapshot-events.md` / Read and Checkpoint | `dirty-checkpoint.test.ts:54-153`; `command-internals.test.ts:649` | covered |
| 19 | K1-3 | Deterministic post-commit events, dirty toggles, sync order, subscriber and reentrancy isolation | `CommandBus.subscribe`; `KernelEvent` family | `snapshot-events.md` / Events | `event-system.test.ts:169-450`; `command-internals.test.ts:673` | covered |
| 20 | K1-4 | Frozen startup manifest, strict manifest decode, deterministic ready Registry | `CORE_KERNEL_STARTUP_MANIFEST`, `createKernelRegistry`, `KernelRegistry` | `registry-capability.md` / Startup contracts | `registry-contracts.test.ts:74-643` | covered |
| 21 | K1-4 | Module gateway capability isolation and delegation for summary/read/select/command/history/events | `KernelRegistry.createGateway`; `KernelModuleGateway` methods | `registry-capability.md` / Gateway contracts | `registry-gateway.test.ts:293-1000`; `core-kernel-integration-boundaries.test.ts:288` | covered |
| 22 | K1-5 | Data-only KernelIssue construction, diagnostic/module mapping, privacy and freeze | `mapDiagnosticToKernelIssue`, `createModuleInternalIssue`; `KernelIssue` family | `errors-reports.md` / Public Issue Contract | `kernel-issues.test.ts:30-238` | covered |
| 23 | K1-5 | Exhaustive privacy-safe adapters for command creation/runtime, checkpoint, read, event, Registry failures | `mapCommandFailureToKernelIssues`, `mapCommandBusCreationFailureToKernelIssues`, `mapCheckpointFailureToKernelIssues`, `mapReadFailureToKernelIssues`, `mapEventSubscriptionFailureToKernelIssues`, `mapRegistryStartupFailureToKernelIssues`, `mapRegistryAccessFailureToKernelIssues` | `errors-reports.md` / Failure Adapters | `kernel-failure-adapters.test.ts:84-406`; `core-kernel-integration-boundaries.test.ts:203,320` | covered |
| 24 | K1-5 | Derived frozen validation report status/counts with hostile-input collapse | `createKernelValidationReport`; `KernelReport` family | `errors-reports.md` / Kernel Validation Report | `kernel-reports.test.ts:22-135`; `core-kernel-integration-boundaries.test.ts:320` | covered |
| 25 | K1-5 | Current-schema-only detached migration compatibility and privacy-safe reports | `migrateScoreDocument`; `MigrationResult`, `MigrationReport` | `errors-reports.md` / Current-Schema Migration Compatibility | `migration.test.ts:33-278`; `forbidden-dependency-boundary.test.ts:132` | covered |
| 26 | K1-6 | One deterministic four-measure public flow plus cross-boundary failure/privacy matrix | no new API; consumes the public root only | `integration-gate.md` | `core-kernel-integration.test.ts:308-555`; `core-kernel-integration-boundaries.test.ts:124-320` (8/8 focused) | covered |

## Totals

- `covered`: 25
- `coverage-gap`: 0
- `spec-gap`: 1
- `reproducible-bug`: 0
- total: 26
