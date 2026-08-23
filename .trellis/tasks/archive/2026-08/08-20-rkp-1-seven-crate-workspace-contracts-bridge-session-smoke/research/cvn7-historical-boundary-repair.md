# RKP-1 CVN-7 Historical Boundary Planning Repair

## Finding and repair entry

Implementation candidate `669364128cd4402a478f247393908ff170112794` is clean and reproducible except for one full-regression failure. The test `CVN7 qualification remains a zero-production-drift test-only boundary` invokes `git diff --name-only` with base `38afdc3fd508dc67f7aa446fd323837a5d550b70` and no upper revision. Git therefore compares the historical CVN-7 base to the current working tree and rejects RKP-1's already reviewed `src/core-kernel/native/rust-kernel-smoke.ts`.

The pre-repair result remains exactly `541/542`. It is not relabeled as passing evidence.

## Frozen closed interval

| Role | Exact commit |
|---|---|
| CVN-7 production baseline | `38afdc3fd508dc67f7aa446fd323837a5d550b70` |
| final CVN-7 input/head | `b21540fa3636e6c8e827ff24c2099f4ff331285d` |

Planning verification proves both commits exist and the base is an ancestor of the final head. The future test must repeat those checks and then require empty output from exactly:

```text
git diff --name-only 38afdc3fd508dc67f7aa446fd323837a5d550b70 b21540fa3636e6c8e827ff24c2099f4ff331285d -- src package-lock.json tsconfig.json
```

No `HEAD`, omitted upper revision, branch-derived revision, index comparison or working-tree comparison is permitted in this assertion. The range proves only CVN-7's own historical zero-production-drift fact.

## Future two-test implementation with one allowlist addition

After independent planning rereview PASS and explicit user authorization to resume:

- modify newly authorized `test/core-kernel/cvn-7-qualification-boundary.test.ts`;
- preserve the literal base and add the literal final-head constant;
- add commit-object existence and ancestry assertions;
- provide both commits to the existing production-drift diff;
- also update already-authorized `test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.ts` to preserve `89115daedc623c0d35386a4a433cc7fd95215223` as the full implementation-diff base, pin the accepted repaired-planning commit separately as the matrix source, require 40 paths, prove exact 39+1 membership and include the CVN-7 test in the runtime change set;
- leave every other assertion and all production files unchanged.

The original implementation allowlist contains 39 literal paths, including the workspace-law test. This repair adds exactly the existing CVN-7 test path and nothing else, so the repaired implementation allowlist contains exactly 40 paths. Two tests change later, but only one path is newly authorized.

## Non-effects

This repair does not change CVN-7 evidence, `EVIDENCE_INVALID`/measurement-incomplete status, qualification or official-run authorization, sampling/RSS/timeout/performance budgets, or any historical input. It does not change RKP-1 crates, source, DTOs, `StableFailureV1`, Node exports/unsafe ownership, TypeScript default, public `28/51/8/34/9`, schema, implementation commits or pre-repair test evidence.

The planning turn does not modify the target test or production files, rerun `task.py start`, resume implementation, accept/archive, push, create RKP-2+, or run qualification.

## Docs-only planning-repair allowlist

Only these 12 paths may differ from `669364128cd4402a478f247393908ff170112794` in the planning candidate:

```text
.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/prd.md
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/design.md
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/implement.md
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/task.json
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/operator-handoff.md
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/review-candidate.md
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/implement.jsonl
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/check.jsonl
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/research/file-test-and-rollback-matrix.md
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/research/implementation-evidence.md
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/research/cvn7-historical-boundary-repair.md
```

## Planning self-audit

| Gate | Required result | Candidate result |
|---|---|---|
| exact repair base/branch | `669364128cd4402a478f247393908ff170112794`; isolated repair branch | pass: exact base and `codex/rkp-1-cvn7-historical-boundary-planning-repair` |
| frozen commits/ancestry | both commits exist; base ancestor of final head | pass: both commit objects exist and `merge-base --is-ancestor` succeeds |
| historical protected diff | closed interval is empty for `src`, `package-lock.json`, `tsconfig.json` | pass: exact two-revision diff has zero paths |
| Trellis/JSON/JSONL | child and parent valid; paths unique/existing | pass: child `11/12`, parent `18/19`; JSON/JSONL parse and unique/existing path checks pass |
| docs-only allowlist | exactly the 12 paths above | pass: exact set equality; original implementation allowlist `39`, repaired allowlist `40`, sole addition is the CVN-7 test |
| production/test delta | zero relative to `6693641` | pass: `src`, `test`, Cargo/crates, package and tsconfig path delta is empty |
| diff/clean | `git diff --check`; final clean and staged empty | pass: diff/fence/Mermaid checks pass; the single-commit parent/range, clean worktree and staged-empty state were rechecked after commit |

Independent planning rereview remains required even after every local gate passes.
