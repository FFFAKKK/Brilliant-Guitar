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

## 2. Oracle artifact layout

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

## 3. Manifest contract

`oracle-manifest-v1.json` has this exact logical shape:

```ts
interface RustMigrationOracleManifestV1 {
  readonly schemaVersion: 1;
  readonly baselineCommit: "b21540fa3636e6c8e827ff24c2099f4ff331285d";
  readonly persistedSchema: "brilliant-score-1";
  readonly applicationRuntimeExportCount: 51;
  readonly moduleSdkRuntimeExportCount: 8;
  readonly moduleSdkTypeExportCount: 34;
  readonly contributionAbiFieldCount: 9;
  readonly commandIds: readonly string[];
  readonly scenarioCount: 64;
  readonly scenarioIds: readonly string[];
  readonly scenarioHashes: Readonly<Record<string, string>>;
  readonly scenariosFileSha256: string;
}
```

The manifest is data-only and exact-shape decoded by the test. Extra or missing fields fail.

## 4. Scenario contract

Each JSONL row has this exact logical shape:

```ts
interface RustMigrationOracleScenarioV1 {
  readonly schemaVersion: 1;
  readonly scenarioId: string;
  readonly scenarioClass: "accepted-command" | "rejected-command" | "cross-cutting";
  readonly coveredCommandIds: readonly string[];
  readonly assemblyKind: "core-only" | "integrated";
  readonly initialDocument: ScoreDocument;
  readonly operations: readonly OracleOperationV1[];
  readonly observations: readonly OracleObservationV1[];
  readonly finalDocument: ScoreDocument;
}
```

Operations are limited to the existing public actions: `submit`, `undo`, `redo`, `markPersisted`, `read`, `replay`, `migrateKernelExtension` and controlled subscription/unsubscription. An observation contains only current public result/read/history/dirty/event data.

## 5. Scenario naming and ordering

Order is fixed:

1. `command.accepted.<commandId>` for the 28 catalog command IDs in accepted catalog order;
2. `command.rejected.<commandId>` in the same order;
3. the eight cross-cutting IDs in PRD order, prefixed `cross.`.

Scenario IDs are unique. The generator asserts the 28-command set equals the live catalog exactly once, preventing a later command from silently missing oracle coverage.

## 6. Canonicalization and hashing

Canonicalization recursively sorts object keys using ordinal JavaScript string order, preserves array order, rejects unsupported values and writes compact JSON. Each row is `canonicalJson + "\n"`. SHA-256 uses the UTF-8 bytes of the row without relying on platform paths or timestamps. The file hash covers the complete concatenated JSONL bytes.

The capture test builds the expected bytes in memory and compares them with committed fixtures. A separate manifest test parses every line, verifies exact counts/IDs/hashes, and validates the qualification contract.

## 7. Qualification V2 data contract

The JSON contract stores:

- evidence method version 2;
- reference environment fingerprint `node24_15_0_win32_x64_nt10_0_26200_i9_13900hx_32cpu_39_7gib`;
- warmup 5 and measured 20;
- representative/stress fixture counts and RSS ceilings;
- all parent latency targets;
- complexity counter names and local-edit expected values;
- `livenessPolicy = "calibrated-evidence-validity-guard"`;
- `officialRunAuthorized = false` for RKP-0.

RKP-0 does not choose a new liveness constant. RKP-7 calibration produces that value before Qualification V2 review.

## 8. Rollback

RKP-0 is one docs/test-only implementation commit. Reverting it removes the transition authority and oracle artifacts while leaving the `b21540fa` production tree untouched. No migration or persisted data exists at this stage.
