# RKP-2 Stage 6 EOL Prerequisite — Audit-return Re-entry Implementation Plan

## Current state and sole live gate

- Docs-only R-P0 base: 1f3f6061f093e1e169ccf4105cde444b0e49f82f.
- Branch: codex/rkp-2-stage-6-eol-audit-return-planning-repair.
- Worktree: .worktrees/rkp-2-stage-6-eol-audit-return-planning-repair.
- The base is the clean implementation candidate reviewed by task 01a06532-e9ab-7603-bddc-f9d55b3f5bb9.
- Review verdict: RETURN, P0/P1/P2=0/2/0.
- P1-1: complete executable sources for expected/coordination lane construction and the complete I0_EXPECTED_PATCH.diff payload were not retained; synthetic objects 4d0770e3..., b591edfa..., and 3307cff2... no longer resolve.
- P1-2: implement.md, child state/evidence, and both parent projections disagree about the current branch, candidate state, and next gate.
- Historical task_start_run=true remains a lifecycle fact. This re-entry never calls task.py start.
- User and production implementation authorization are false. The returned implementation candidate is not ready for acceptance.
- The sole live gate is DEDICATED INDEPENDENT EOL PREREQUISITE RE-ENTRY PLANNING AUDIT.

This planning candidate does not repair technical code, accept or archive the returned candidate, integrate anything, resume S6.2/S6.3/E3, run qualification, switch the runtime, create RKP-3, or push.

## Historical and protected objects

- Historical fresh I0: 64bc508cd56bd0a250f890af186c097dc2b6880e.
- Audited technical commit/tree: 30d4acb0e3ce29e849c2a89b2ac1225bb5dafe49 / 022f8b25e53ca68f33be08d0a2cedef65af2aa94.
- Returned implementation candidate: 1f3f6061f093e1e169ccf4105cde444b0e49f82f.

The following technical paths are frozen exactly as the blobs at 30d4acb0...:

1. .gitattributes
2. crates/brilliant-kernel-runtime/src/runtime.rs
3. crates/brilliant-kernel-runtime/src/store.rs
4. crates/brilliant-kernel-runtime/src/indices.rs

The S6.2 fixture, worker, worker test, and process wrapper are also protected with zero delta from 1f3f6061.... A need to edit any protected path invalidates this plan.

## Exact R-P0 planning allowlist

Relative to 1f3f6061..., this docs-only planning candidate changes exactly these nine paths:

1. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/prd.md
2. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/design.md
3. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implement.md
4. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json
5. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md
6. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md
7. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md
8. .trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json
9. .trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json

The set is literal and exact. A directory prefix, glob, optional file, research or JSONL file, spec, source, test, package/Cargo/toolchain file, or tenth path is outside authority.

## Exact future re-entry allowlists

The future technical allowlist is empty. The historical technical object is verified, not recreated on the active branch.

After a separately authorized R-A0, the future evidence candidate may change exactly these six coordination paths relative to REENTRY_I0_SOURCE_HEAD:

1. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json
2. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md
3. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md
4. .trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md
5. .trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json
6. .trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json

Complete reconstruction sources and the patch payload are embedded in implementation-evidence.md. They do not add a seventh path.

## Fixed stage sequence

    R-P0 docs-only re-entry planning candidate
      -> dedicated independent re-entry planning audit
      -> new explicit user implementation authorization
      -> R-A0 docs-only activation and fresh REENTRY_I0_SOURCE_HEAD
      -> R-I0 durable reconstruction capsule plus fresh lanes
      -> R-I1 independent candidate reconstruction
      -> R-I2 regression, evidence/lifecycle freeze, clean candidate
      -> dedicated independent implementation re-audit
      -> explicit owner decision

No stage may be skipped. This turn stops after R-P0 and does not run the planning audit itself.

## R-P0 — docs-only planning candidate

1. Confirm exact path, branch, clean/staged-empty state, and base 1f3f6061... before editing.
2. Prove 64bc508c... is an ancestor of 30d4acb0..., and 30d4acb0... is an ancestor of 1f3f6061....
3. Prove 30d4acb0... -> 1f3f6061... changes exactly the six historical coordination paths and no technical path.
4. Record audit task 01a06532-e9ab-7603-bddc-f9d55b3f5bb9, reviewed HEAD, RETURN 0/2/0 verdict, and both P1 findings without rewriting earlier history.
5. Make this task, RKP-2 parent, Rust parent, PRD, design, plan, evidence header/footer, review candidate, and operator handoff expose the same current branch/state/gate.
6. Require the actual planning diff to equal the exact nine-path R-P0 allowlist.
7. Require the four technical blobs to equal 30d4acb0... and the S6.2 protected set to have zero delta.
8. Require task meta, PRD, design, and this plan to expose the same six future coordination paths and count 6.
9. Require the future technical allowlist to be empty.
10. Run child and both parent Trellis validation.
11. Parse every JSON and JSONL row; require all JSONL paths to exist and be unique per manifest.
12. Check Markdown fence parity and git diff --check.
13. Run TypeScript typecheck/build and require the focused governance classifier to remain 11/7/4/0 with the four known historical titles. Classify a full planning-worktree run separately: before commit it may add only the dirty-tree guard and three file-level failures caused by the absent ignored native addon artifact. Those are environment diagnostics, not green evidence; any other failure blocks R-P0, and the independent auditor reruns the full classifier from a clean suitable environment.
14. Verify E3 count zero, TypeScript default, and all later authorization flags false.
15. Commit only the nine docs/state paths with subject:

    docs(rkp-2): plan audit-return EOL evidence re-entry

16. Rerun exact path, protected-byte, validation, and clean/staged-empty gates against the committed HEAD.
17. Stop and hand the exact clean HEAD to a new dedicated independent planning auditor.

## R-A0 — separately authorized docs-only activation

R-A0 is future work. It remains blocked until the exact R-P0 HEAD receives P0/P1/P2=0/0/0 and the user explicitly authorizes evidence re-entry.

1. Do not call task.py start; the historical start is already recorded and is not renewed.
2. Update only the child task.json and the two parent task.json projections.
3. Record planning-audit identity, exact reviewed HEAD, and new authorization scope.
4. Commit a clean docs-only activation and freeze that commit/tree as REENTRY_I0_SOURCE_HEAD.
5. Require the four technical blobs to equal 30d4acb0... and every later-stage authorization to remain false.
6. The activation commit contains no newly captured result and is never called an evidence candidate.

## R-I0 — durable capsule and fresh predeclared lanes

### Complete committed-source contract

Before any R-I0 result is evidence, implementation-evidence.md must contain complete executable UTF-8 bytes, not excerpts, for:

- project-expected.mjs;
- coordination-set.mjs;
- capture-node-signatures.mjs;
- capture-node-command.mjs;
- capture-eol-matrix.mjs;
- rust-boundary-verifier.mjs;
- every extraction, canonical-JSON, path-set, or comparison helper not wholly contained in those files;
- the complete binary-safe I0_EXPECTED_PATCH.diff payload in a lossless encoding.

Each entry carries filename, encoding, complete body, byte length, SHA-256, import ownership, and command role. One extraction manifest maps every block to its filename. Extraction occurs only below a new E-drive root; every byte length and hash is checked before execution.

Standard Node built-ins and source files read from an explicitly pinned repository checkout are the only implicit dependencies. Missing imports, undeclared generated code, shell-history reconstruction, here-strings, snippets, deleted temp paths, and old synthetic object IDs invalidate evidence.

### Fresh lane construction

Create each lane as a new E-drive git clone --no-local --no-checkout and check out its pinned commit exactly once.

1. Control lane: REENTRY_I0_SOURCE_HEAD, verified tools, fixed Node executable/version, focused/full tuple, signatures, and manifest.
2. Expected V1 lane: REENTRY_I0_SOURCE_HEAD plus the committed builder and exact six-path V1 coordination projection.
3. Expected V2 lane: an independent checkout of the same source with byte-distinct V2 placeholders; require V1/V2 path sets and predeclared signature relations to be content-insensitive.
4. Historical technical reconstruction lane: 64bc508c... plus the decoded complete I0_EXPECTED_PATCH.diff; run the committed Rust verifier and require the four output blobs to equal 30d4acb0....
5. Freeze commands, source commits/trees, tool hashes, path sets, exit codes, signatures, and cleanup roots in the six allowed coordination files.

Synthetic commits created inside fresh lanes are disposable run outputs. Evidence is valid only when a reviewer can regenerate equivalent trees and signatures from pinned source commits plus the complete committed capsule.

## R-I1 — independent reconstruction

1. Start from a fresh checkout of the future evidence candidate, not the operator working tree.
2. Extract the complete tools from that candidate and verify all hashes.
3. Rebuild control, expected V1, expected V2, and historical technical lanes from their pinned sources.
4. Run coordination-set.mjs and require task meta, PRD, design, implement, expected projection, and actual candidate range to expose exactly the same six paths.
5. Require candidate technical blobs to equal 30d4acb0... and candidate delta from REENTRY_I0_SOURCE_HEAD to equal the six coordination paths only.
6. Require control replay equality, V1/V2 content insensitivity, and candidate equality to the predeclared expected transition under the fixed Node signature rules.
7. A mismatch invalidates evidence; do not patch the candidate or derive new expected values from it.

## R-I2 — regression and evidence freeze

Run the raw-byte checkout matrix, Rust reconstruction, Cargo, TypeScript, and Node gates using the complete committed capsule. Historical results may guide classification but may not replace a fresh run.

Before freezing the candidate require:

- child and both parent Trellis validation pass;
- every JSON and JSONL row parses and JSONL paths are existing/unique;
- Markdown fences are balanced and git diff --check passes;
- exact six-path candidate coordination diff;
- zero technical delta relative to 30d4acb0...;
- zero S6.2 fixture/worker/wrapper delta;
- E3 execution count remains zero;
- TypeScript remains default;
- acceptance, archive, integration, S6.2, S6.3, qualification, cutover, RKP-3, and push remain unauthorized;
- temporary lane roots are removed only after complete sources, commands, and decisive results are committed;
- worktree is clean and staged-empty after the evidence commit.

The candidate then stops at a dedicated independent implementation re-audit. A 0/0/0 result permits only a later owner decision.

## Independent R-P0 planning audit checklist

The R-P0 auditor must independently verify:

1. exact base, branch, worktree, candidate HEAD, ancestry, and clean/staged-empty state;
2. exact nine-path planning diff and zero outside delta;
3. technical blob equality with 30d4acb0... and protected S6.2 zero delta;
4. one live gate across plan, child state/evidence/review/handoff, and both parent projections;
5. planning_candidate_ready=true, implementation_candidate_ready=false, and the RETURN 0/2/0 audit record;
6. complete-source and complete-patch retention requirements cover every executable dependency;
7. fresh control/expected-V1/expected-V2/historical-technical/candidate reconstruction has no dependency on the three missing synthetic objects or old temp roots;
8. future technical allowlist is empty and future coordination allowlist is exactly six literal paths;
9. no lifecycle authorization advanced and task.py start was not run.

## Stop conditions

Stop and return to planning if:

- exact branch, worktree, base, or allowlist drifts;
- a technical or S6.2 protected path must change;
- a complete tool or patch payload cannot be embedded and independently extracted;
- a reconstruction depends on an old synthetic object or deleted temp directory;
- expected values are derived from the candidate;
- task or parent projections expose more than one current gate;
- task.py start, acceptance, archive, integration, S6.2/S6.3/E3, qualification, cutover, RKP-3, or push would be required.

## Rollback points

- RP0: returned audited base 1f3f6061....
- RP1: independently accepted R-P0 planning HEAD.
- RP2: future REENTRY_I0_SOURCE_HEAD.
- RP3: future evidence-only candidate.

Rollback uses a new bounded revert commit. It never resets history, edits another worktree, or changes the four technical files.
