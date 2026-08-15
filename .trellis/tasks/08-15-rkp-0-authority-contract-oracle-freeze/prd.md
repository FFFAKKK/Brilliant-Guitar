# RKP-0 Authority Contract and Oracle Freeze

## Goal

Create the exact, deterministic authority and TypeScript behavior oracle required to judge later Rust work. This stage changes documentation, transition specifications, test-only capture code and golden fixtures; it changes no production runtime.

## Background

The `b21540fa` CVN-7 candidate is clean and passes typecheck/build, CVN-7 `84/84` and full `516/516`. Its one latest official run timed out during frozen `stress-submit`, leaving 411 requests and 410 results. The missing result makes the run incomplete and invalid as qualification evidence. RKP-0 records this result and freezes what later Rust stages must reproduce.

## Requirements

### RKP0-R001 — Record the fifth official input exactly

Update the CVN-7 task ledger and durable Core roadmap with:

- candidate/harness `b21540fa3636e6c8e827ff24c2099f4ff331285d`;
- action `stress-submit`, fixture `stress`, phase `memory`;
- `worker_started=true`, requests/results `411/410`;
- timeout `10,800,000 ms`, stderr classification `worker-timeout`;
- `measurement_complete=false`, `evidence_valid=false`, `partial_evidence=false`, `reusable_evidence=false`;
- frozen workload `102,400 Event / 51,200 Note / 10,000 envelopes / 2 GiB` unchanged;
- CVN-7 qualification and post-Core activation remain pending.

### RKP0-R002 — Add transition authority without falsifying current state

Add a Core transition specification that describes the staged Rust target. Existing Pure TypeScript specifications remain the current-runtime authority until RKP-8. Index pages must distinguish `current runtime` from `accepted transition target`.

### RKP0-R003 — Freeze the public behavior inventory

The oracle manifest shall record and automatically verify:

- planning baseline commit;
- schema `brilliant-score-1`;
- 28 ordered Core command IDs;
- 51 application runtime exports;
- Module SDK 8 runtime / 34 type exports;
- nine-field compiled contribution ABI;
- Core-only and integrated factory modes;
- public failure/result/event/diagnostic families;
- representative and stress fixture provenance and counts.

### RKP0-R004 — Create exactly 64 canonical oracle scenarios

Commit a deterministic JSONL corpus:

1. one accepted scenario for each of the 28 Core command IDs;
2. one deterministic rejection scenario for each of the same 28 IDs;
3. eight cross-cutting scenarios:
   - submit/no-op/markPersisted/dirty;
   - undo/redo and redo-tail truncation;
   - atomic batch commit;
   - batch-child rejection with zero delta;
   - semantic replay equality;
   - integrated two-module order and availability;
   - detached ExtensionBlock migration;
   - assembly mismatch plus subscriber-failure isolation.

Existing accepted test fixtures and failure precedence are the source of each scenario. RKP-0 creates no new command semantics.

### RKP0-R005 — Freeze observable output

Each scenario shall record:

- scenario ID and class;
- initial document and assembly kind;
- ordered public operations;
- public result after every operation;
- public read/snapshot and history/dirty summary;
- ordered committed/dirty events;
- final document;
- canonical scenario SHA-256.

Host paths, timestamps, process IDs, object identity and machine-specific values are excluded.

### RKP0-R006 — Canonical artifact method

- UTF-8, LF line endings;
- object keys recursively sorted by ordinal code-unit order;
- arrays preserve accepted semantic order;
- one compact JSON object per JSONL line;
- final LF required;
- manifest records ordered scenario IDs, per-scenario hash and whole-file SHA-256;
- regenerating twice from clean `b21540fa` must produce byte-identical files.

### RKP0-R007 — Freeze Qualification V2 budgets

Add a data-only performance contract containing the parent 60 FPS targets, current 5 warmups/20 measured samples, the existing reference environment fingerprint, unchanged RSS ceilings and separate liveness calibration rules. RKP-0 runs no official qualification measurement.

### RKP0-R008 — Freeze future complexity counters

Define the later Rust counters and their ordinary-local-edit acceptance values:

- `fullDocumentScans = 0`;
- `fullDocumentClones = 0`;
- `fullSemanticValidations = 0`;
- `fullSnapshotMaterializations = 0`;
- `indexedEntityLookups >= 1`;
- `affectedEntityCount` reports the exact transaction closure.

RKP-0 defines and tests the contract shape only; runtime counter production begins in RKP-3/RKP-5.

### RKP0-R009 — Maintain the one-stage gate

Only this child exists. RKP-1 through RKP-9 remain names in the parent roadmap rather than Trellis task directories. RKP-0 completion does not activate RKP-1; independent review and archive occur first.

### RKP0-R010 — Preserve production and product boundaries

Relative to `b21540fa`, RKP-0 has zero delta under:

- `src/**`;
- `package.json`, lock files and `tsconfig.json`;
- Cargo/Rust source files;
- post-Core roadmap PRD/design/operator handoff;
- accepted archived tasks.

## Allowed Files

### Authority and task state

- this RKP-0 task directory;
- the new Rust remediation parent task directory;
- Core VNext parent `task.json`, `implement.md`, performance baseline and durable roadmap;
- CVN-7 `task.json`, `operator-handoff.md`, `review-candidate.md`, `evidence/README.md` and a new failure ledger;
- Core Kernel spec indices and one new `backend/rust-runtime-transition.md`.

### Test-only oracle

- `test/core-kernel/rust-migration/oracle-schema.ts`;
- `test/core-kernel/rust-migration/ts-oracle-fixtures.ts`;
- `test/core-kernel/rust-migration/ts-oracle-capture.test.ts`;
- `test/core-kernel/rust-migration/oracle-manifest.test.ts`;
- `test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json`;
- `test/core-kernel/rust-migration/fixtures/oracle-scenarios-v1.jsonl`;
- `test/core-kernel/rust-migration/fixtures/qualification-v2-contract.json`.

Any extra path returns to planning review.

## Out of Scope

- Rust toolchain installation, Cargo workspace or native addon;
- production algorithm changes;
- runtime indices, ChangeSets or incremental validators;
- CVN-7 official rerun or evidence publication;
- post-Core implementation or public plugin runtime;
- creation of RKP-1 or later task directories.

## Acceptance Criteria

- [ ] `RKP0-AC001`: CVN-7 and Core roadmap record the exact fifth invalid input without reusing partial evidence.
- [ ] `RKP0-AC002`: transition spec distinguishes current TypeScript authority from future Rust authority.
- [ ] `RKP0-AC003`: manifest verifies 28 commands, 51 application runtime exports, SDK `8/34`, ABI 9 and `brilliant-score-1`.
- [ ] `RKP0-AC004`: corpus contains exactly 64 unique ordered scenarios with the required 28+28+8 partition.
- [ ] `RKP0-AC005`: two clean regenerations are byte-identical and all stored hashes verify.
- [ ] `RKP0-AC006`: the 60 FPS, scale, memory, complexity and liveness contracts are machine-readable and documentation-aligned.
- [ ] `RKP0-AC007`: new oracle tests, CVN-7 tests and full tests pass; existing full baseline remains at least 516 plus the new RKP-0 tests.
- [ ] `RKP0-AC008`: production/build-config/post-Core/archives show zero prohibited delta.
- [ ] `RKP0-AC009`: RKP-1 through RKP-9 task directories are absent.
- [ ] `RKP0-AC010`: independent implementation review returns P0/P1/P2=`0/0/0` before acceptance/archive.
