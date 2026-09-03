# RKP-2 Stage 6 Tracked-byte and EOL Portability Prerequisite — Audit-return Re-entry PRD

## Decision

Create a bounded docs-only re-entry planning candidate from the exact returned implementation candidate 1f3f6061f093e1e169ccf4105cde444b0e49f82f. The dedicated audit task 01a06532-e9ab-7603-bddc-f9d55b3f5bb9 returned P0/P1/P2=0/2/0: the four-file EOL repair is technically correct, but the expected lane cannot be independently reconstructed and the live branch/state/gate projection is contradictory.

This planning candidate closes only those two P1 findings. It does not change or recreate the four technical files. It does not run task.py start, activate implementation, accept or archive the returned candidate, integrate anything, resume S6.2/S6.3/E3, run qualification, switch the default runtime, create RKP-3, or push.

The sole live gate after this docs-only commit is DEDICATED INDEPENDENT EOL PREREQUISITE RE-ENTRY PLANNING AUDIT.

## Goal

Make the next evidence replay independently reproducible from pinned Git commits and complete committed executable inputs, while preserving the already-audited technical blobs and restoring one unambiguous current branch, state, and authorization gate across the child task and both parent projections.

## Confirmed evidence

- Docs-only planning base and returned implementation candidate: 1f3f6061f093e1e169ccf4105cde444b0e49f82f.
- Current planning branch: codex/rkp-2-stage-6-eol-audit-return-planning-repair.
- Current planning worktree: .worktrees/rkp-2-stage-6-eol-audit-return-planning-repair.
- Historical fresh I0 source: 64bc508cd56bd0a250f890af186c097dc2b6880e.
- Historical technical commit/tree: 30d4acb0e3ce29e849c2a89b2ac1225bb5dafe49 / 022f8b25e53ca68f33be08d0a2cedef65af2aa94.
- 64bc508c... is an ancestor of 30d4acb0..., and 30d4acb0... is an ancestor of 1f3f6061....
- 30d4acb0... -> 1f3f6061... changes exactly the existing six coordination paths and no technical path.
- The dedicated audit independently verified the four-file repair, Rust reconstruction, seven literal .gitattributes rules, raw-byte matrix, focused Node signatures, and zero S6.2 worker/fixture/wrapper delta.
- The synthetic expected V1/V2 commits 4d0770e3... and b591edfa..., and replay object 3307cff2..., do not resolve from the repository.
- The historical evidence records hashes for project-expected.mjs and coordination-set.mjs, but not their complete bytes; the old temporary roots were deleted.
- Therefore the returned candidate may remain a historical diagnostic object, but implementation_candidate_ready is false and no prior expected-lane result is current acceptance evidence.

## Requirements

### Re-entry planning authority

- **EOL-RE-R001**: R-P0 is based exactly on 1f3f6061... and may change only the nine literal docs/state paths listed below.
- **EOL-RE-R002**: Every path outside the nine-path R-P0 allowlist has zero delta from 1f3f6061....
- **EOL-RE-R003**: The four technical paths remain byte-identical to their blobs at 30d4acb0....
- **EOL-RE-R004**: The S6.2 fixture, worker, worker test, and process wrapper remain unchanged.
- **EOL-RE-R005**: The returned audit and its P1 findings are added as current history without rewriting any earlier audit record.

### Durable reconstruction capsule

- **EOL-RE-R006**: Before any future re-entry result is treated as evidence, the existing allowed implementation-evidence.md path must contain the complete executable bytes of every lane-construction, capture, extraction, canonicalization, and comparison tool.
- **EOL-RE-R007**: The minimum complete-source set is project-expected.mjs, coordination-set.mjs, capture-node-signatures.mjs, capture-node-command.mjs, capture-eol-matrix.mjs, rust-boundary-verifier.mjs, and every non-built-in helper imported by them.
- **EOL-RE-R008**: The complete binary-safe I0_EXPECTED_PATCH.diff payload must be embedded losslessly in implementation-evidence.md, with encoding, decoded byte length, and SHA-256.
- **EOL-RE-R009**: Each source entry must have a filename, encoding, byte length, SHA-256, complete body, and an extraction manifest. A hash, excerpt, shell history, deleted temp path, or synthetic object ID is not a substitute for complete bytes.
- **EOL-RE-R010**: Standard Node built-ins and source files from a pinned repository commit are the only implicit dependencies. Any task-local imported helper must also be embedded completely.
- **EOL-RE-R011**: A reviewer must be able to extract the capsule verbatim to a new E-drive temporary root, verify every hash before execution, and reconstruct control, expected V1, expected V2, historical technical, and candidate lanes without the three missing synthetic objects or any old temp root.

### Fresh-lane independence

- **EOL-RE-R012**: Every lane starts from a new --no-local --no-checkout clone and a pinned source commit; existing directories or copies of historical temporary roots are invalid.
- **EOL-RE-R013**: The fresh control lane uses the future REENTRY_I0_SOURCE_HEAD.
- **EOL-RE-R014**: Expected V1 and V2 lanes use that same source plus the committed builder and six-path coordination projection. Byte-distinct placeholders must prove content insensitivity before candidate comparison.
- **EOL-RE-R015**: A separate historical-technical reconstruction lane starts at 64bc508c..., decodes/applies the committed I0_EXPECTED_PATCH.diff, runs the committed Rust verifier, and requires all four reconstructed technical blobs to equal 30d4acb0....
- **EOL-RE-R016**: Expected values are derived from the pinned source plus the predeclared committed builder, never from the candidate.
- **EOL-RE-R017**: The final candidate is independently reconstructed from its pinned source and compared with the predeclared expected lane using the same verified tool bytes.

### Current state and lifecycle

- **EOL-RE-R018**: The child task, PRD, design, implementation plan, evidence header/footer, review candidate, operator handoff, RKP-2 parent, and Rust parent expose the same current branch, planning state, and sole live gate.
- **EOL-RE-R019**: Historical task_start_run=true, I0/I1 execution, and technical results remain historical facts; they do not make the returned candidate ready or authorize a new run.
- **EOL-RE-R020**: A future R-A0 requires both a P0/P1/P2=0/0/0 audit of this exact planning HEAD and new explicit user implementation authorization.
- **EOL-RE-R021**: R-A0 must not call task.py start; the historical start is not renewed.
- **EOL-RE-R022**: TypeScript remains the default runtime. Acceptance, archive, integration, S6.2, S6.3, E3, qualification, runtime cutover, RKP-3, and push remain unauthorized.
- **EOL-RE-R023**: All future temporary clones, tool extraction, Cargo targets, TEMP/TMP roots, and transcripts use explicit E-drive paths.

## Exact path sets

### R-P0 docs-only planning allowlist

1. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/prd.md
2. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/design.md
3. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implement.md
4. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json
5. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md
6. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md
7. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md
8. .trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json
9. .trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json

The set is literal and exact. A directory prefix, glob, optional file, JSONL file, research file, spec, source, test, package/Cargo/toolchain file, or tenth path is outside R-P0 authority.

### Future re-entry coordination allowlist

1. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json
2. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md
3. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md
4. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md
5. .trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json
6. .trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json

This remains the original exact six-path coordination contract. Complete tools and the patch payload are embedded inside the already-allowed implementation-evidence.md; no seventh path is created.

### Protected technical paths

1. .gitattributes
2. crates/brilliant-kernel-runtime/src/runtime.rs
3. crates/brilliant-kernel-runtime/src/store.rs
4. crates/brilliant-kernel-runtime/src/indices.rs

The active re-entry technical allowlist is empty. These four blobs are verified against 30d4acb0..., not modified or recommitted.

### Protected S6.2 paths

1. test/core-kernel/fixtures/cvn-7-qualification-score.ts
2. test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts
3. test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts
4. test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1

## Acceptance criteria

- **EOL-RE-AC01**: The R-P0 commit is a single-parent child of 1f3f6061..., changes exactly the nine planning paths, and is clean/staged-empty after commit.
- **EOL-RE-AC02**: The four technical blobs equal 30d4acb0...; the four protected S6.2 paths have zero delta from 1f3f6061....
- **EOL-RE-AC03**: All current-state authorities expose the same planning branch/worktree, implementation_candidate_ready=false, and the dedicated re-entry planning-audit gate.
- **EOL-RE-AC04**: The exact six-path future coordination allowlist is identical in task meta, this PRD, design, and implementation plan.
- **EOL-RE-AC05**: The future technical allowlist is empty; no planning language authorizes editing the four audited technical paths.
- **EOL-RE-AC06**: The durable capsule contract covers every executable dependency and the complete lossless patch payload, with extract-before-run hash verification.
- **EOL-RE-AC07**: The fresh-lane contract reconstructs control/expected-V1/expected-V2/historical-technical/candidate results without old temp roots or missing object IDs.
- **EOL-RE-AC08**: Child and both parent Trellis validation, JSON/JSONL parsing, Markdown fence parity, literal path-set checks, and git diff --check pass.
- **EOL-RE-AC09**: Typecheck/build pass and the focused governance classifier remains exactly 11/7/4/0 with the four known historical titles. A planning-worktree full run may additionally expose only the pre-commit dirty-tree guard and file-level failures caused by the absent ignored native addon artifact; those results are environment diagnostics, not green evidence, and the independent audit must rerun the full classifier from a clean suitable environment. Any other failure blocks R-P0.
- **EOL-RE-AC10**: No lifecycle authorization advances and task.py start is not run.
- **EOL-RE-AC11**: A new dedicated independent planning audit returns P0/P1/P2=0/0/0 against the exact clean R-P0 HEAD before implementation authorization may be requested.

## Out of scope

- Editing or recommitting .gitattributes or any Rust technical file.
- Reusing the historical evidence as accepted evidence without reconstruction.
- Adding a seventh coordination path, a task-directory allowlist, a glob, or an optional file.
- Running task.py start, Cargo implementation gates, S6.2/S6.3/E3, qualification, or runtime cutover.
- Acceptance, archive, integration, RKP-3 creation, push, or mutation of another worktree.

## User benefit

The next reviewer can reproduce the decisive oracle from durable committed inputs rather than trusting vanished temporary state, while the already-correct technical repair remains untouched and every lifecycle actor sees one current gate.
