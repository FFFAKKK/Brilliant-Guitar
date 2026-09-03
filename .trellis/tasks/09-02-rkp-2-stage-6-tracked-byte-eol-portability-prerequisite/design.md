# RKP-2 Stage 6 EOL Prerequisite — Audit-return Re-entry Design

## 1. Design objective

The returned implementation candidate 1f3f6061f093e1e169ccf4105cde444b0e49f82f contains a technically correct four-file EOL repair but does not contain enough durable executable material to reproduce its pre-I1 expected lane. It also exposes conflicting current state across the child task, both parents, the implementation plan, and the evidence file.

The re-entry design fixes the evidence and authority model without changing the audited technical tree. It treats the old results as diagnostic history, creates a new docs-only planning authority, and makes the next evidence candidate reconstructible from pinned commits plus complete source bytes embedded in an already-authorized evidence path.

## 2. Authority graph and sole live gate

    64bc508c historical fresh I0
      -> 30d4acb0 audited four-file technical commit
      -> 1f3f6061 returned evidence candidate, audit RETURN 0/2/0
      -> R-P0 docs-only re-entry planning candidate
      -> dedicated independent re-entry planning audit
      -> new explicit user implementation authorization
      -> R-A0 docs-only activation and REENTRY_I0_SOURCE_HEAD freeze
      -> R-I0 durable capsule plus fresh control/expected lanes
      -> R-I1 independent reconstruction
      -> R-I2 regression and evidence candidate freeze
      -> dedicated independent implementation re-audit
      -> explicit owner decision

The current turn ends at R-P0. The sole live gate is DEDICATED INDEPENDENT EOL PREREQUISITE RE-ENTRY PLANNING AUDIT.

Historical task_start_run=true and historical I0/I1 results remain facts, not live authorization. R-A0 does not call task.py start.

## 3. Immutable object boundaries

### 3.1 Historical inputs

- Historical fresh I0: 64bc508cd56bd0a250f890af186c097dc2b6880e.
- Audited technical commit/tree: 30d4acb0e3ce29e849c2a89b2ac1225bb5dafe49 / 022f8b25e53ca68f33be08d0a2cedef65af2aa94.
- Returned implementation candidate: 1f3f6061f093e1e169ccf4105cde444b0e49f82f.
- Independent audit: task 01a06532-e9ab-7603-bddc-f9d55b3f5bb9, RETURN, P0/P1/P2=0/2/0.

The three old synthetic objects 4d0770e3..., b591edfa..., and 3307cff2... are diagnostic identifiers only. No gate may resolve, load, compare against, or otherwise depend on them.

### 3.2 Protected technical tree

These blobs must equal 30d4acb0... throughout re-entry:

1. .gitattributes
2. crates/brilliant-kernel-runtime/src/runtime.rs
3. crates/brilliant-kernel-runtime/src/store.rs
4. crates/brilliant-kernel-runtime/src/indices.rs

The active re-entry technical allowlist is empty. The historical technical patch is reconstructed in a detached verification lane; it is never reapplied to or recommitted on the active branch.

### 3.3 Protected S6.2 inputs

The qualification fixture, scale worker, worker test, and process wrapper have zero delta from 1f3f6061.... No S6.2 evidence or workload is executed.

## 4. Literal path ownership

### 4.1 R-P0 planning set

R-P0 changes exactly nine existing docs/state paths:

1. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/prd.md
2. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/design.md
3. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implement.md
4. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json
5. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md
6. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md
7. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md
8. .trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json
9. .trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json

The set is exact. It is not a task-directory prefix and has no optional member.

### 4.2 Future re-entry coordination set

The future candidate range from REENTRY_I0_SOURCE_HEAD contains exactly:

1. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json
2. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md
3. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md
4. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md
5. .trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json
6. .trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json

The complete executable capsule lives inside implementation-evidence.md, which is already one of these six paths. No generator, patch, transcript, JSONL, research file, or helper becomes a seventh coordination path.

## 5. Durable reconstruction capsule

### 5.1 Required contents

Before an R-I0 or later result can be evidence, implementation-evidence.md contains complete executable bytes for:

- project-expected.mjs;
- coordination-set.mjs;
- capture-node-signatures.mjs;
- capture-node-command.mjs;
- capture-eol-matrix.mjs;
- rust-boundary-verifier.mjs;
- every extraction, canonical-JSON, path-set, or comparison helper not wholly contained in those files;
- the complete I0_EXPECTED_PATCH.diff payload in a lossless encoding.

Each source record contains:

- logical filename and relative extraction path;
- encoding;
- complete body boundaries;
- encoded byte length;
- decoded byte length where applicable;
- SHA-256 over the exact executable or patch bytes;
- imports and their ownership;
- command roles and expected arguments.

A top-level extraction manifest enumerates every record exactly once. The extractor writes only below a new E-drive root, verifies all lengths and hashes before execution, rejects undeclared imports, and rejects content reconstructed from shell history, here-strings, snippets, or deleted files.

Standard Node built-ins and files read directly from a pinned repository checkout are the only implicit dependencies. Any other helper is part of the capsule.

### 5.2 Patch representation

I0_EXPECTED_PATCH.diff is stored as a complete lossless payload, preferably base64 with an explicit UTF-8/binary decoding contract. Its decoded byte length and SHA-256 are authoritative. A prose edit list, hunk excerpt, hash-only record, or regeneration claim is insufficient.

The patch is generated from historical 64bc508c... by the committed project-expected.mjs and must reconstruct the exact four blobs at 30d4acb0.... The resulting Git object ID need not equal an old disposable synthetic commit.

## 6. Fresh lane construction

All lanes are new E-drive git clone --no-local --no-checkout roots. Each is checked out once at its pinned source and must begin clean. Existing roots and local-object-only references are invalid.

### 6.1 Control lane

Checkout REENTRY_I0_SOURCE_HEAD. Extract and hash-verify the committed tools, then capture the fixed Node version/executable, focused and full counts/titles, title-level failure signatures, and repository manifest.

### 6.2 Expected V1 and V2 lanes

Create two independent checkouts of REENTRY_I0_SOURCE_HEAD. Run the verified project-expected.mjs and coordination-set.mjs to project exactly the six future coordination paths using deterministic V1 and byte-distinct V2 placeholders.

The V1/V2 path sets must be identical. Every signature relation required by the plan must be invariant to placeholder contents. Failure means the expected projection is content-sensitive and invalid.

### 6.3 Historical technical reconstruction lane

Checkout 64bc508c.... Decode the complete committed I0_EXPECTED_PATCH.diff, verify its byte length/SHA, apply it, run the committed rust-boundary-verifier.mjs and its five synthetic self-tests, and require all four output blobs to equal 30d4acb0... byte-for-byte.

This lane proves the existing technical object from durable inputs. It does not edit the active branch.

### 6.4 Candidate reconstruction lane

Checkout the eventual R-I2 candidate in a new lane. Extract the capsule from that candidate, verify all hashes, rebuild the three lane classes above, run coordination-set.mjs, and require:

- candidate technical blobs equal 30d4acb0...;
- candidate delta from REENTRY_I0_SOURCE_HEAD is the exact six-path set;
- control replay equals the frozen control record;
- expected V1/V2 satisfy the predeclared relation;
- candidate signatures equal the predeclared expected transition;
- no expected value was copied or derived from candidate output.

## 7. State projection model

Every current-state authority uses the same tuple:

- branch: codex/rkp-2-stage-6-eol-audit-return-planning-repair;
- worktree: .worktrees/rkp-2-stage-6-eol-audit-return-planning-repair;
- status: in_progress as a historical Trellis lifecycle fact;
- planning_candidate_ready: true after the R-P0 commit;
- implementation_candidate_ready: false;
- production_implementation_authorized: false;
- user_implementation_authorization: false;
- current_phase: ready_for_dedicated_independent_reentry_planning_audit;
- next_gate: dedicated_independent_EOL_prerequisite_reentry_planning_audit.

The evidence file labels all pre-return records as historical diagnostic evidence. Its first and last current-state declarations use the tuple above. The review candidate and operator handoff request only the planning audit.

R-A0 becomes legal only after the exact R-P0 HEAD passes P0/P1/P2=0/0/0 and the user separately authorizes evidence re-entry. R-A0 updates only the three task JSON projections, does not call task.py start, commits a clean docs-only activation, and freezes that commit as REENTRY_I0_SOURCE_HEAD.

## 8. Validation design

R-P0 validation must prove:

1. exact branch, base, single-parent relation, and clean/staged-empty state;
2. exact nine-path diff from 1f3f6061...;
3. zero delta outside the nine paths;
4. four technical blob equality with 30d4acb0...;
5. zero protected S6.2 path delta;
6. exact six-path future coordination equality across task meta, PRD, design, and implement;
7. empty future technical allowlist;
8. one current branch/state/gate across child and parents;
9. complete durable-capsule and fresh-lane requirements;
10. child and both parent Trellis validation;
11. JSON/JSONL parse and JSONL path uniqueness;
12. Markdown fence parity and git diff --check;
13. TypeScript typecheck/build;
14. focused governance classifier at the exact 11/7/4/0 historical tuple;
15. full classifier classification: before commit, only the dirty-tree guard, the three file-level failures caused by the absent ignored native addon artifact, and the four known governance failures may appear; this is diagnostic rather than green evidence and must be rerun by the independent auditor from a clean suitable environment;
16. E3 count zero, TypeScript default, and every later authorization false.

R-I2 later reruns the raw-byte matrix, Rust reconstruction, Cargo gates, Node gates, and capsule extraction/replay. Historical green records guide classification but do not replace a fresh run.

## 9. Failure and rollback

Stop and return to planning if:

- any path outside the literal set is needed;
- any protected technical or S6.2 path changes;
- a complete tool or patch payload cannot be embedded and extracted;
- a lane depends on an old synthetic object or deleted temp root;
- expected output is derived from the candidate;
- more than one current gate remains;
- task.py start or any forbidden lifecycle action would be required.

Rollback uses a new bounded revert commit at the applicable docs/evidence boundary. It never resets history, mutates the returned implementation worktree, or rewrites the four technical files.

## 10. Trade-off

Embedding full source and patch bytes makes implementation-evidence.md larger, but it preserves the six-path contract and turns the oracle from an operator-local claim into a replayable artifact. Adding separate tool files would be easier to browse but would create the prohibited seventh coordination path, so that alternative is rejected.
