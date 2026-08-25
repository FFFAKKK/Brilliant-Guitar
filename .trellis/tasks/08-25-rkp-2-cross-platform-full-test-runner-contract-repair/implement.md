# Implementation Plan — RKP-2 Cross-platform Full Test Runner Contract Repair

## 0. Planning stop gate

This candidate is docs/test-governance planning only. Do not edit `package.json`, create runner/test source, run `task.py start`, authorize RKP-2 Stage 6, accept/archive/push, create RKP-3, switch the default runtime or run qualification.

Entry to implementation requires dedicated independent planning PASS P0/P1/P2=`0/0/0` on the exact planning HEAD and a later explicit user authorization.

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

1. Add the focused test first for shuffled/nested/spaces/Unicode/deep files, non-tests, missing/file/empty roots, symbolic/junction entries, duplicates/aliases and immutable detached results.
2. Implement root preflight, non-following traversal, regular-file filter, `/` normalization, explicit code-unit sort, duplicate rejection and dynamic selection.
3. Implement `full-test-manifest-v1` count/hash/header from the frozen array.
4. Prove an added fixture changes manifest without editing a count constant.

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
3. Connect the stable built-in reporter and await flush/completion.
4. Track exact top-level file outcomes; fail test failure, cancellation, duplicate/unknown/missing outcome, runner/stream/reporter error or manifest mismatch.
5. Use `require.main === module`; importing the CommonJS module must not execute the suite.
6. Replace only the package `test` script. Confirm `package-lock.json` byte-delta is empty.

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

1. Run the focused and full runner on Node 20.20.2 and 24.15.0 using the same compiled source and literal manifest.
2. Add/execute a partial-discovery fake that reports a strict subset; it must fail despite an otherwise successful runner.
3. Independently enumerate the current compiled tree and compare the set, count and hash to the printed manifest.
4. Extend RKP-2 workspace-law only to freeze accepted child ownership/integration and exact runner/package paths. Do not duplicate traversal implementation.
5. Preserve the RKP-2 21-path technical matrix, existing JSONL successor contract and public inventories.

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
3. Recompute the five RKP-2 content hashes after accepted integration projection; keep both RKP-2 JSONLs unchanged.
4. Set child candidate readiness true only after gates; implementation review remains pending.
5. Keep RKP-2 Stage 6 not started/authorized.

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

Revert Stage 4 to remove evidence/status/projection only. Do not accept/archive or resume Stage 6.

## 6. Independent review, acceptance and integration

A dedicated read-only implementation review receives the exact activation-through-evidence range and cross-version evidence. Owner acceptance/archive follows only after P0/P1/P2=`0/0/0` and separate authorization.

Integration must produce a reviewable RKP-2 prerequisite base containing both accepted child and current RKP-2 history. It updates no Stage 1–5 product code, preserves TypeScript default and leaves Stage 6 unauthorized until a later explicit user message.
