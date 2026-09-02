# RKP-2 Stage 6 Tracked-byte and EOL Portability Prerequisite — Implementation Plan

## Current state

- Planning base: `55cb575c606646e8449359b0c46d5c905b3bb3c6`.
- Branch: `codex/rkp-2-stage-6-eol-portability-prerequisite`.
- Worktree: `.worktrees/rkp-2-stage-6-eol-portability-prerequisite`.
- Task status: `in_progress`, paused before I1 after the historical I0 stop.
- Historical `task_start_run`: `true`; current user/production implementation authorization: `false`.
- Production implementation authorization: `false`.
- Dedicated planning review: pending.
- S6.2 E3 run count: `0`.
- Default runtime: TypeScript.

Do not execute the re-entry I0 until an exact docs-only repair commit receives a dedicated independent P0/P1/P2=`0/0/0` verdict and the user separately authorizes that repaired object.

## Fixed stage sequence

```text
P0 planning freeze
  -> independent planning audit
  -> explicit prerequisite authorization
  -> I0 activation and baseline capture
  -> I1 EOL policy + Rust test-only repair
  -> I2 dual-checkout byte matrix
  -> I3 full regression and evidence freeze
  -> dedicated implementation audit
  -> explicit acceptance/archive/integration decision
  -> NEW S6.2 planning task
```

No stage may be skipped. A failing gate stops the task at that stage.

## P0 — Planning candidate freeze

### Inputs

- Base `55cb575c606646e8449359b0c46d5c905b3bb3c6`.
- Dedicated blocker audit `01a060d4-9bdb-7b71-b8be-868ff5685d9e`.
- Diagnostic S6.2 line `02ef4af... -> 5c709b8... -> c3c4d19...`.

### Planning-only files

- this task directory;
- RKP-2 parent `task.json`;
- Rust remediation parent `task.json`.

### Planning gates

1. verify base HEAD and both S6.2/audit commits exist but are not ancestors accidentally included after `55cb575c`;
2. verify new task is referenced exactly once by the RKP-2 parent;
3. verify no `src/**`, `test/**`, `crates/**`, `.gitattributes`, Cargo, package, tsconfig or toolchain delta;
4. validate child, RKP-2 parent and Rust parent Trellis manifests;
5. parse all JSON and JSONL; require every JSONL path to exist and appear at most once per manifest;
6. check Markdown fence parity and `git diff --check`;
7. run TypeScript typecheck, build and the current full baseline only as planning regression evidence;
8. commit docs only with:

```text
docs(rkp-2): plan tracked-byte EOL portability prerequisite
```

9. require clean/staged-empty status;
10. send the exact planning HEAD to a dedicated planning auditor.

## I0 — Activation and immutable baseline

### Entry gate

- exact planning HEAD has independent verdict `PASS FOR BOUNDED EOL PREREQUISITE IMPLEMENTATION`, P0/P1/P2=`0/0/0`;
- user authorization names this prerequisite or explicitly accepts its exact audited scope;
- branch HEAD and tree match the reviewed candidate;
- worktree clean and staged empty;
- RKP-2 parent has no different current planning or implementation child;
- old S6.2 branch remains untouched.

This is a re-entry gate after the historical I0 stop at `fa756bb3755ab4f9dcc8bc1b5e5ada571102927f`. The earlier authorization is consumed, its A0 source and temporary lanes are diagnostic only, and none may satisfy the new gate.

### Actions

1. write the new planning audit task ID, verdict, exact repaired HEAD and new authorization scope into this task and both parent projections;
2. run native `task.py start` only to establish the operator session pointer; because the task is already historically `in_progress`, this call is idempotent and must not be represented as a new planning-to-in-progress transition;
3. set this prerequisite as the sole implementation child of the RKP-2 parent; clear its planning pointer;
4. keep Rust remediation's direct implementation child as the RKP-2 parent, and set its blocking descendant to this task;
5. keep `stage_6_s6_2_started=false`, `stage_6_s6_3_started=false`, TypeScript default and every later authorization false;
6. commit this lifecycle projection as a new clean re-entry activation commit, then set the new `I0_SOURCE_HEAD` to that exact commit; no technical edit or `implementation-evidence.md` may exist at that HEAD. The old A0 `13a3a6a...`, stop commit `fa756bb...`, patch/verifier hashes and temporary checkouts are not reusable inputs;
7. create a fresh detached control checkout of `I0_SOURCE_HEAD` on E: and record the exact activation Node baseline tuple with Node `v24.15.0`, `isolation: "none"`, `concurrency: 1`, one title-level event per failure, exact one-level `.cause` unwrapping, and the resolved Node executable fixed by `design.md` section 8.2:
   - focused command and exit;
   - total/pass/fail/skip;
   - sorted failure titles;
   - full command and exit;
   - total/pass/fail/skip;
   - sorted failure titles;
   - one programmatically captured primary assertion signature per failing title, using the exact canonical record in `design.md` section 8.2;
   - 80-file count and SHA-256;
8. from a second fresh detached `I0_SOURCE_HEAD` checkout, generate the deterministic `I0_EXPECTED_PATCH.diff` by the exact-text substitutions in `design.md` sections 4.1, 5.3 and 8.3; require one match per substitution, run the five synthetic verifier self-tests, add the exact final coordination-path projection, and prove placeholder content-insensitivity by changing each new evidence path independently from `EOL_EXPECTED_TRANSITION_V1\n` to `EOL_EXPECTED_TRANSITION_V2\n` without changing any signature; then freeze the expected-transition signatures before I1;
9. record current seven-path `git ls-files --eol`, byte lengths and SHA-256 as diagnostic pre-fix values;
10. record in task-local planning evidence: `I0_SOURCE_HEAD`, Node executable and exact `process.version=v24.15.0`, compiled focused-test path/bytes/SHA, capture-script source/SHA, I0 control signatures, expected-transition signatures, patch bytes/SHA, exact phase path sets and per-path two-variant placeholder proof;
11. commit only the task/parent evidence projection. This evidence commit is not `I0_SOURCE_HEAD`; the already frozen A0 commit remains the source for every later control/expected replay.
12. run the task-local coordination-set parser and require the task meta, PRD, design and this implementation plan to expose the same six literal candidate coordination paths and count `6`; freeze parser bytes/SHA before I1.

### Exit gate

- task status `in_progress`;
- exact one implementation child pointer;
- no technical file change;
- E3 count zero;
- clean/staged-empty.

## I1 — EOL policy and Rust test-only repair

### RED capture

Use only E-drive output:

```powershell
$env:CARGO_TARGET_DIR='E:\desktop\brilliant_ideas\brilliant_guitar\.tmp\rkp2-eol-portability\cargo-target-1971'
$env:TEMP='E:\desktop\brilliant_ideas\brilliant_guitar\.tmp\rkp2-eol-portability\temp'
$env:TMP=$env:TEMP
& 'C:\Users\ATOM\.cargo\bin\cargo.exe' +1.97.1 test --workspace --all-targets --locked
```

The RED transcript must contain exactly the four known non-ignored source-shape failures. Any additional failure stops the task and returns to planning.

### Technical edits

1. Add exactly seven path-specific `text eol=lf` rules to `.gitattributes`.
2. Apply the I0-frozen `I0_EXPECTED_PATCH.diff` verbatim. It updates only the five source-inspection expressions listed in `design.md` to inspect an in-memory LF-normalized string; all pre-existing tokens other than the exact normalization binding/expression remain equal.
3. The frozen patch adds exactly one test named `source_shape_normalization_is_lf_crlf_invariant` inside the `indices.rs` test module. It normalizes LF/CRLF forms of a representative `Rkp2StoreMetrics` declaration and executes the same declaration extraction without running or unignoring the large scale test.
4. Do not modify S6.2 worker, worker-test, wrapper, fixture or Workspace Law semantics.
5. Run the exact Rust lexical verifier in `design.md` section 5.3: unique marker, matched closing brace, whitespace-only suffix, raw production-prefix equality, both old/new hunk ranges inside the six named functions, and exact base reconstruction after removing the six permitted edits.
6. Record the verifier source/SHA and its five synthetic self-test results for later evidence freeze.

### Focused GREEN

Run the exact four previously failing tests by full test name, then run the small LF/CRLF parity test. All must pass. Verify the large scale test run count remains zero.

### I1 commit

Commit only the four technical allowlist files:

```text
test(rkp-2): make tracked-byte source checks EOL portable
```

The commit must be a single-parent child of I0 and leave the worktree clean.

## I2 — Dual-checkout byte matrix

### Candidate setup

- Pin `I1_SOURCE_HEAD` and its tree.
- Remove any prior verification directories under the exact E-drive task root only after validating their resolved paths remain under `.tmp\rkp2-eol-portability`.
- Create two new `--no-local --no-checkout` clones.
- Checkout `I1_SOURCE_HEAD` once with `core.autocrlf=true` and once with `core.autocrlf=false`.

### Mechanical verifier

For each of the seven paths:

1. use a task-local Node verifier and read checkout files with `fs.readFileSync()` as `Buffer`;
2. record byte length and lowercase SHA-256;
3. invoke `git cat-file blob <candidate-head>:<path>` with Node `spawnSync(..., {encoding:null})`, require exit `0`, and retain stdout as `Buffer`;
4. require true-checkout bytes == false-checkout bytes == blob bytes;
5. require `git ls-files --eol` to report `i/lf`, `w/lf`, `attr/text eol=lf`;
6. require no CRLF byte pair remains;
7. require clean status in both clones.

The verifier must reject:

- a missing, duplicate or extra path;
- hash-only equality with unequal byte length;
- normalized text comparison instead of raw bytes;
- a pre-existing checkout directory;
- a dirty checkout;
- any path whose attribute is absent or wildcard-derived outside the seven exact rules.

PowerShell pipeline capture, `Get-Content`, decoded strings, `git show` captured as text, and newline-normalized comparisons are invalid verifier implementations.

### Native gate

From one clean verification checkout, with E-drive Cargo/TEMP roots:

```powershell
& 'C:\Users\ATOM\.cargo\bin\cargo.exe' +1.97.1 fmt --all -- --check
& 'C:\Users\ATOM\.cargo\bin\cargo.exe' +1.97.1 check --workspace --all-targets --locked
& 'C:\Users\ATOM\.cargo\bin\cargo.exe' +1.97.1 test --workspace --all-targets --locked
& 'C:\Users\ATOM\.cargo\bin\cargo.exe' +1.97.1 clippy --workspace --all-targets --locked -- -D warnings
& 'C:\Users\ATOM\.cargo\bin\cargo.exe' +1.88.0 check --workspace --all-targets --locked
```

Every command must exit 0. The existing large ignored test remains ignored.

### Exit gate

- fourteen checkout records and seven blob records complete;
- all raw bytes and hashes equal;
- Cargo gates green;
- both clones clean;
- implementation worktree clean;
- E3 count zero.

No commit is required if I2 only generates ignored transcripts.

## I3 — Repository regression and candidate freeze

### Regression gates

1. `python .\.trellis\scripts\task.py validate 09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite`
2. `python .\.trellis\scripts\task.py validate 08-24-rkp-2-indexed-live-score-store-load-encode-parity`
3. `python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation`
4. parse every changed JSON and every JSONL row;
5. require unique/existing JSONL paths;
6. require balanced Markdown fences;
7. `git diff --check`;
8. `npm run typecheck`;
9. `npm run build`;
10. rerun the exact focused and full Node commands captured in I0 with the same Node executable/version, compiled focused-test bytes/SHA and capture-script SHA;
11. create a new detached control checkout of `I0_SOURCE_HEAD`, recapture its four signatures and require exact equality with the frozen I0 control records;
12. create a new detached expected-transition checkout of `I0_SOURCE_HEAD`, reapply the frozen `I0_EXPECTED_PATCH.diff` plus exact coordination projection, recapture its signatures and require exact equality with `EXPECTED_I3_SIGNATURES`;
13. capture the candidate signatures independently: the Part Owner signature must equal both I0 and expected-transition records; the other three must equal only their corresponding pre-I1 `EXPECTED_I3_SIGNATURES`; no candidate signature may be copied into its own expected record;
14. require the exact `3 + 1` cause classification, outer `ERR_TEST_FAILURE`/`testCodeFailure` wrapper, one inner `AssertionError` cause, exit/count/title tuple and Node-version invariants to remain true in all applicable lanes;
15. recompute the 80-file manifest independently and require exact equality with I0;
16. verify the technical diff is exactly four files and run the I0-frozen coordination-set parser again; task meta, PRD, design, implement and actual final coordination diff must all equal the same six literal paths with count `6`; run the section 5.3 lexical/reconstruction proof and the exact seven-rule `.gitattributes` diff proof so unreachable post-failure assertions cannot hide an unbounded technical edit;
17. verify no `src/**`, Cargo manifests/lock, package manifests/lock, tsconfig, toolchain, public export, fixture content, worker semantics, wrapper semantics or old S6.2 branch change;
18. verify E3 execution count zero and no S6.2 evidence artifact exists on this branch.

### Evidence and lifecycle files

After all gates pass, update only:

- `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json`;
- `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md`;
- `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md`;
- `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md`;
- `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json`;
- `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json`.

This six-path coordination set is exact. RKP-2 parent handoff/review files and `rust-runtime-transition.md` remain unchanged in the implementation candidate; any durable spec or lifecycle projection outside this set is a later accepted-closeout task.

The evidence commit must contain no technical file. Suggested subject:

```text
docs(rkp-2): freeze EOL portability prerequisite evidence
```

### Candidate state

- `implementation_candidate_ready=true`;
- `current_phase=ready_for_dedicated_independent_implementation_review`;
- task remains `in_progress`;
- parent S6.2 remains not started/not completed on the authority line;
- no acceptance/archive/integration flag changes;
- worktree clean and staged empty.

## Independent implementation review

Use a new dedicated read-only task. The auditor must verify:

1. planning/A0/I1/evidence ancestry and single-parent boundaries;
2. exact four-file technical allowlist;
3. exact seven attribute rules and no wildcard;
4. five source checks retain their original negative assertions;
5. the three Rust blobs pass unique terminal-module boundary, whitespace-only suffix, six-function hunk containment and exact reconstruction to base;
6. dual fresh-checkout construction and cleanup;
7. fourteen checkout plus seven blob records and raw-byte equality;
8. Cargo 1.97.1/MSRV gates;
9. Node `isolation: "none"` title-level event capture, outer wrapper/one-level inner-cause contract, exact Node executable/version and capture-script hash;
10. independently rebuilt control and expected-transition lanes, candidate-only comparison against pre-I1 expected signatures, exact `3 + 1` cause classification and manifest equality;
11. task meta, PRD, design, implement and actual candidate coordination sets are the same six literal paths; no task-directory prefix or glob is accepted;
12. E3 zero and S6.2 provenance P1 still owned by the successor plan;
13. lifecycle authorization boundaries and clean state.

Only P0/P1/P2=`0/0/0` permits an owner acceptance decision. The audit does not itself authorize acceptance, archive or integration.

## Post-pass lifecycle

If the user explicitly authorizes closeout after a clean implementation audit:

1. record acceptance in this task and both parent projections;
2. archive this task natively;
3. create an integration candidate against `codex/rkp-2-indexed-live-score-store-implementation`;
4. independently audit the exact integration commit;
5. integrate only after that audit passes;
6. create a new S6.2 planning task from the exact integration HEAD;
7. keep TypeScript default and all later gates false.

## Stop conditions

Stop immediately and return to planning if:

- a file outside the technical allowlist is required to fix EOL behavior;
- a product Rust line must change;
- `.gitattributes` needs a wildcard or repository-wide normalization;
- either fresh checkout is dirty or hash-inconsistent;
- any Cargo gate other than the four known pre-fix failures appears;
- Node baseline gains a new failure/title/count drift or capture does not expose one title-level event with the fixed outer-wrapper/inner-cause shape;
- the fresh control lane drifts from I0, the rebuilt expected lane drifts from its pre-I1 record, the Part Owner signature changes, or any of the other three candidate signatures differs from its predeclared expected transition;
- the Rust lexical verifier finds a non-whitespace suffix, a hunk outside the six named functions, or reconstruction inequality;
- the large test or S6.2 E3 runs;
- C: receives Cargo/test output;
- acceptance, archive, integration, S6.2, S6.3, qualification, cutover, RKP-3 or push would be required.

## Rollback points

- **R0**: planning base `55cb575c...`.
- **R1**: audited planning HEAD before activation.
- **R2**: I0 activation commit before technical changes.
- **R3**: I1 technical commit before evidence/lifecycle changes.

Rollback uses a new revert commit at the appropriate boundary; no `reset --hard`, force push or mutation of the diagnostic S6.2 worktree is part of this task.
