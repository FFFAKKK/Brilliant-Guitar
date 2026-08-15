# RKP-0 Authority Contract and Oracle Freeze

## Goal

Create the exact, deterministic authority and TypeScript behavior oracle required to judge later Rust work. This stage changes documentation, transition specifications, test-only capture code and golden fixtures; it changes no production runtime.

## Background

The `b21540fa` CVN-7 candidate is clean and passes typecheck/build, CVN-7 `84/84` and full `516/516`. Its one latest official run timed out during frozen `stress-submit`, leaving 411 requests and 410 results. The missing result makes the run incomplete and invalid as qualification evidence. RKP-0 records this result and freezes what later Rust stages must reproduce.

## Requirements

### RKP0-R001 — Record the fifth official input exactly

Update the CVN-7 task ledger and durable Core roadmap with:

- candidate/harness `b21540fa3636e6c8e827ff24c2099f4ff331285d`;
- baseline `38afdc3fd508dc67f7aa446fd323837a5d550b70`;
- request-written/coordinator-completed times `2026-08-15T00:35:09.7269066+08:00` / `2026-08-15T03:35:10.0778114+08:00`;
- action `stress-submit`, fixture `stress`, phase `memory`;
- `worker_started=true`, requests/results `411/410`;
- timeout `10,800,000 ms`, stderr classification `worker-timeout`;
- native exit `1`, signal `null`, launcher failure `null`;
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
- the exact ordered names of all 51 application runtime exports;
- the exact ordered names of all Module SDK 8 runtime / 34 type exports;
- the exact ordered names of the nine compiled contribution ABI fields;
- Core-only and integrated factory modes;
- public failure/result/event/diagnostic families;
- representative and stress fixture source path, generator export, version, seed and exact counts;
- the SHA-256 of `qualification-v2-contract.json`, the canonical scenario-matrix authority and the SDK-surface migration authority.

The manifest exact shape is defined by `design.md` section 4. A strict decoder rejects extra/missing fields. Counts alone never satisfy the export or ABI gate. Artifact decode entry points accept only raw UTF-8 JSON text, reject every non-string input before reflection, parse with the captured JSON primordial, validate only the parse result, and return a detached deeply frozen value. No public decoder accepts an object graph supplied by a caller.

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

`research/oracle-scenario-matrix.md` fixes all 64 scenario IDs, source tests, fixtures, assembly recipes, operation programs, success/failure results and state/history/event/inverse expectations. The operator implements that matrix verbatim and does not select a substitute fixture or rejection branch. RKP-0 creates no new command semantics.

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

Operation indices are dense from zero and every operation has exactly one same-index observation. Every accepted command performs submit/undo/redo and proves inverse equality. Every rejected command uses the fixed missing-target branch and records byte-identical document, history, dirty, event sequence and event list.

Host paths, timestamps, process IDs, object identity and machine-specific values are excluded.

### RKP0-R006 — Canonical artifact method

- UTF-8, LF line endings;
- object keys recursively sorted by ordinal code-unit order;
- arrays preserve accepted semantic order;
- one compact JSON object per JSONL line;
- final LF required;
- manifest records ordered scenario IDs, per-scenario hash and whole-file SHA-256;
- regenerating twice from clean `b21540fa` must produce byte-identical files;
- a fresh worktree under the repository's normal `core.autocrlf` policy must preserve the committed raw UTF-8/LF bytes and hashes without normalization inside the test.

### RKP0-R007 — Freeze Qualification V2 budgets

Add a strict data-only performance contract containing the parent 60 FPS targets, current 5 warmups/20 measured fresh-process samples, exact public-call timed region, nearest-rank P95/P99 (`ceil(p*n)-1`, indices 18/19 for 20 samples), non-finite handling, unchanged fixture generators/seeds/counts, RSS sampling, and evidence-validity/liveness precedence. RKP-0 runs no official qualification measurement and leaves the replacement liveness constant unset for RKP-7 calibration.

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

### Canonical checkout normalization

- `.gitattributes`, limited to adding exactly these three entries and changing no existing attribute:
  - `test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json text eol=lf`;
  - `test/core-kernel/rust-migration/fixtures/oracle-scenarios-v1.jsonl text eol=lf`;
  - `test/core-kernel/rust-migration/fixtures/qualification-v2-contract.json text eol=lf`.

No wildcard attribute is permitted. These entries only preserve the raw canonical bytes already required by RKP-0; they do not change runtime or schema semantics.

### Authority and task state

- `.trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze/task.json`;
- `.trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze/operator-handoff.md`;
- `.trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze/review-candidate.md`;
- `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json`;
- `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/implement.md`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/task.json`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/implement.md`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/research/core-vnext-performance-baseline.md`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/research/cvn-roadmap-and-stage-plan.md`;
- `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/task.json`;
- `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/operator-handoff.md`;
- `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/review-candidate.md`;
- `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/evidence/README.md`;
- new `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/research/official-run-failure-ledger.jsonl`;
- `.trellis/spec/core-kernel/index.md`;
- `.trellis/spec/core-kernel/backend/index.md`;
- new `.trellis/spec/core-kernel/backend/rust-runtime-transition.md`.

The failure ledger is UTF-8/LF JSONL outside `evidence/`. It uses the exact schema and unique `failureId` in `design.md` section 2; duplicate keys, extra fields or a partial artifact under `evidence/` fail the gate.

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
- [ ] `RKP0-AC003`: manifest verifies exact names for 28 commands, 51 application runtime exports, SDK `8/34`, ABI 9, plus both fixture contracts and `brilliant-score-1`.
- [ ] `RKP0-AC004`: corpus contains exactly the 64 unique ordered scenarios in `research/oracle-scenario-matrix.md`, with one observation per operation, per-command inverse proof and rejection zero delta.
- [ ] `RKP0-AC005`: two clean regenerations are byte-identical, all stored hashes verify, and a second fresh worktree observes the same LF bytes, sizes and SHA-256 values.
- [ ] `RKP0-AC006`: the 60 FPS, scale, memory, complexity and liveness contracts are machine-readable and documentation-aligned.
- [ ] `RKP0-AC007`: new oracle tests, CVN-7 tests and full tests pass; existing full baseline remains at least 516 plus the new RKP-0 tests.
- [ ] `RKP0-AC008`: production/build-config/post-Core/archives show zero prohibited delta.
- [ ] `RKP0-AC009`: RKP-1 through RKP-9 task directories are absent.
- [ ] `RKP0-AC010`: independent implementation review returns P0/P1/P2=`0/0/0` before acceptance/archive.
- [ ] `RKP0-AC011`: the exact SDK migration matrix protects the CVN-2 8/34 entry from implicit RKP-9 cleanup and separates Rust official extensions from the later public TypeScript/React surface.
- [ ] `RKP0-AC012`: the allowed-file comparison is mechanically equal to the explicit repository-relative path list above; directory wildcards are not accepted and `.gitattributes` changes equal the three literal entries above.
