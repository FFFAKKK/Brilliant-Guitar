# Implementation Plan — RKP-2 Cross-platform Full Test Runner Contract Repair

## 0. Planning stop gate

This candidate is docs/test-governance planning only. Do not edit `package.json`, create runner/test source, run `task.py start`, authorize RKP-2 Stage 6, accept/archive/push, create RKP-3, switch the default runtime or run qualification.

The implementation line is paused at clean Stage 2 `d366653788a42eb56cd5755a63b1e73700c67310`. Entry to Stage 3 requires dedicated independent planning PASS P0/P1/P2=`0/0/0` on exact amendment anchor A, explicit integration of A into that paused line, and a later explicit user authorization. Content commit P alone is not an implementation base.

## 1. Stage 0 — activation

### Preconditions

1. Exact planning candidate is independently accepted.
2. Branch/worktree is clean and based on the accepted planning commit.
3. RKP-2 Stage 5 remains complete; Stage 6 remains not started/authorized.
4. Parent references this child exactly once as the blocking planning child.

### Action and ownership

Run native `task.py start` only after authorization. Change only child `task.json`, handoff/review and RKP-2/Rust-parent lifecycle projections. Record `status=in_progress`, start/production authorization true for this child only, candidate readiness false and review pending.

### Commit and rollback

`chore(rkp-2): activate full test runner contract repair`

Revert Stage 0 to the independently accepted planning commit. No package/test file exists yet.

## 2. Stage 1 — deterministic enumeration and RED/GREEN contract

### Files

```text
test/test-infrastructure/run-compiled-tests.ts
test/test-infrastructure/run-compiled-tests.test.ts
```

### Actions

1. Add the focused test first for shuffled/nested/spaces/Unicode/deep files, non-tests, missing/file/empty roots, symbolic/junction entries, normalized duplicates, physical aliases and immutable detached results.
2. Implement root preflight, non-following traversal, regular-file filter, `/` normalization, explicit code-unit sort, normalized duplicate rejection and dynamic selection.
3. For each candidate use `lstat(path,{bigint:true})`, require a regular file and usable nonzero BigInt `(dev,ino)`, and reject a repeated tuple as `runner.physical-alias` before any runner call. A real `linkSync` test must fail rather than skip when hard links cannot be created.
4. Implement `full-test-manifest-v1` count/hash/header from the frozen array.
5. Prove an added fixture changes manifest without editing a count constant.

### Gate

```powershell
npm.cmd run build
node --test dist/test/test-infrastructure/run-compiled-tests.test.js
```

### Commit and rollback

`test(rkp-2): freeze deterministic compiled test discovery`

Revert Stage 1 to remove only runner skeleton/focused tests; package script is still unchanged.

## 3. Stage 2 — programmatic execution and package entry

### Files

```text
package.json
test/test-infrastructure/run-compiled-tests.ts
test/test-infrastructure/run-compiled-tests.test.ts
```

### Actions

1. Add the injectable semantic request and actual `run()` options capture.
2. Verify repo CWD, supported Node version and process-isolation default, then call `run({ files: absoluteFiles, concurrency: true })`.
3. Immediately after `run()` returns, synchronously attach an independent structured observer and the stable built-in reporter pipeline. The reporter is display-only.
4. Normalize only `test:pass`/`test:fail` using event type plus `data.file`. Any fail at any nesting immediately selects `runner.test-failed`. Every pass requires a non-empty absolute manifest-member `data.file`; missing/non-string/relative selects `runner.outcome-path-missing`, and an absolute non-member selects `runner.outcome-unknown`. Add passes to an idempotent `seenManifestFiles` set. Do not consume `data.name`, `data.nesting`, `test:complete`, `details.type` or reporter text for truth.
5. Prove the frozen enumerator manifest, exact absolute files array passed to `run()` and final pass-seen set independently and exactly equal. Duplicate passes are allowed; partial coverage selects `runner.outcome-missing`. Remove `runner.outcome-path-mismatch` and `runner.outcome-duplicate` from the future error union and tests. Treat any available `test:interrupted`, stream error/abort/premature close/missing normal end, reporter sink/pipeline/flush failure or manifest mismatch as nonzero. Exit zero requires normal end, exact three-way equality, no fail/interrupted and reporter flush success.
6. Add injected earliest-post-return emission/close races so listener attachment cannot regress.
7. Use `require.main === module`; importing the CommonJS module must not execute the suite.
8. Replace only the package `test` script. Confirm `package-lock.json` byte-delta is empty.

### Focused gate

```powershell
npm.cmd run typecheck
npm.cmd run build
node --test dist/test/test-infrastructure/run-compiled-tests.test.js
npm.cmd test
```

Repeat the package command through PowerShell and `cmd.exe /d /s /c npm.cmd test`.

### Commit and rollback

`test(rkp-2): run complete compiled suite from explicit manifest`

Revert Stage 2 to restore the old package entry while leaving the Stage 1 enumerator isolated and unused.

## 4. Stage 3 — cross-version and partial-discovery proof

### Files

```text
test/test-infrastructure/run-compiled-tests.test.ts
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
```

### Actions

1. Run the focused and full runner on Node 20.20.2 and 24.15.0 using the same compiled source and literal manifest; capture raw/fast/slow characterization fixtures for `test:pass`/`test:fail` and prove the only truth-consumed fields are event type and `data.file`.
2. Add/execute a partial-discovery fake that reports a strict subset; it must fail despite an otherwise successful runner.
3. Independently enumerate the current compiled tree and compare the set, count and hash to the printed manifest.
4. Exercise any-nesting failure, interrupted, missing/non-string/relative/unknown `data.file`, duplicate-pass success, opaque name/nesting/details, partial seen set, premature close and reporter failure on both the normalizer seam and real-version fixtures.
5. Extend RKP-2 workspace-law only to freeze the child candidate's exact four technical plus eleven active lifecycle paths. Do not duplicate production traversal implementation.
6. Preserve the RKP-2 21-path technical matrix, current 22-path coordination matrix, existing JSONL successor contract and public inventories.

### Gate

Run focused Node 20/24, PowerShell/cmd/npm paths, RKP-2 and RKP-1 workspace laws, typecheck/build and the real dynamic full suite. Record actual file count, test discovered/pass/expected-skip/fail and manifest hash; do not write them as permanent constants.

### Commit and rollback

`test(rkp-2): prove cross-platform full runner completeness`

Revert Stage 3 to remove only cross-version/integration proof. Stage 2 runner remains usable but the child cannot be accepted.

## 5. Stage 4 — evidence and review candidate

### Files

```text
.trellis/tasks/08-25-rkp-2-cross-platform-full-test-runner-contract-repair/task.json
.trellis/tasks/08-25-rkp-2-cross-platform-full-test-runner-contract-repair/operator-handoff.md
.trellis/tasks/08-25-rkp-2-cross-platform-full-test-runner-contract-repair/review-candidate.md
.trellis/tasks/08-25-rkp-2-cross-platform-full-test-runner-contract-repair/research/implementation-evidence.md
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/design.md
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/implement.md
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/research/file-test-and-rollback-matrix.md
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md
.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json
```

### Actions

1. Run every complete gate below at the exact clean implementation candidate.
2. Record actual cross-version manifests/totals and protected deltas.
3. Prove the immutable planning interval `eed4871a..P` is exactly twenty paths and the implementation candidate interval `P..candidate` is exactly four child technical plus eleven active lifecycle/authority paths, with ownership sets independently asserted and their changed-path union deduplicated. P is pinned by exact anchor A; mutable `HEAD` is forbidden.
4. Keep the current RKP-2 twenty-one technical and twenty-two coordination paths frozen. Do not recompute post-archive hashes and keep both RKP-2 JSONLs unchanged.
5. Set child candidate readiness true only after gates; implementation review remains pending.
6. Mark only `READY FOR INDEPENDENT IMPLEMENTATION REVIEW`. Do not accept, archive, integrate or claim Stage 6 readiness.

### Complete gate

```powershell
node --version
npm.cmd run typecheck
npm.cmd run build
node --test dist/test/test-infrastructure/run-compiled-tests.test.js
npm.cmd test
cmd.exe /d /s /c npm.cmd test

cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 check --workspace --all-targets --locked
cargo +1.97.1 test --workspace --all-targets --locked
cargo +1.97.1 clippy --workspace --all-targets --locked -- -D warnings
cargo +1.88.0 check --workspace --all-targets --locked

python .\.trellis\scripts\task.py validate 08-25-rkp-2-cross-platform-full-test-runner-contract-repair
python .\.trellis\scripts\task.py validate 08-24-rkp-2-indexed-live-score-store-load-encode-parity
python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation
git diff --check
git status --short --branch
```

Also run existing Node bridge `9/9`, RKP-1 workspace-law `6/6`, RKP-2 workspace-law, JSON/JSONL parse/existence/uniqueness, exact parent-child references and literal allowlist/protected-delta checks. Repeat focused/full gates with Node 20.20.2 and 24.15.0.

### Commit and rollback

`docs(rkp-2): freeze full test runner repair evidence`

Revert Stage 4 to the exact independently accepted amendment anchor A to remove the entire unaccepted implementation candidate. Do not accept/archive or resume Stage 6.

## 6. Independent review

A dedicated read-only implementation review receives the exact accepted-planning-through-evidence range and cross-version evidence. A non-PASS returns to a bounded implementation repair. No archive, post-archive hash, integration or Stage 6 projection exists before exact P0/P1/P2=`0/0/0` and later owner closeout authorization.

## 7. Post-PASS owner closeout, archive and integration

Execute only after implementation PASS and explicit owner authorization, in this order:

1. Record the exact audited candidate and PASS/acceptance in docs-only lifecycle state.
2. Run Trellis native archive into `.trellis/tasks/archive/2026-08/08-25-rkp-2-cross-platform-full-test-runner-contract-repair/`.
3. Verify the exact thirteen archived artifacts: eight root task artifacts, four planning research files and `research/implementation-evidence.md`.
4. In one bounded closeout candidate, replace all twelve active-child coordination paths with all thirteen archived successor paths, so RKP-2 coordination becomes historical ten plus archived thirteen = twenty-three. Mechanically reject active/archive dual authority and missing implementation evidence.
5. Pin exact accepted implementation/archive commits, update range projections, recompute the five LF hashes and prove the RKP-2 JSONLs remain unchanged.
6. Run the complete gates and create a reversible closeout/integration commit.
7. Consume that accepted descendant on the original RKP-2 implementation branch only through an explicit fast-forward/merge gate. The resulting HEAD is the new Stage 6 prerequisite, but Stage 6 remains unauthorized.

Rollback is phase-specific: the pre-review candidate returns to accepted planning HEAD; archive/closeout is jointly reverted to restore the active planning child; integration returns to `eed4871a86191783d539b7d4097be3627e98e4a0`. No rollback may leave both active and archived authority visible.
