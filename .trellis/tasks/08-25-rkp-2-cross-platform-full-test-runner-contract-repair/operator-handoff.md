# Operator Handoff — RKP-2 Cross-platform Full Test Runner Contract Repair

## Current stop state

`PLANNING REVIEW REQUIRED — IMPLEMENTATION NOT STARTED`.

- branch: `codex/rkp-2-cross-platform-full-test-runner-contract-repair`
- planning base: `eed4871a86191783d539b7d4097be3627e98e4a0`
- parent: `08-24-rkp-2-indexed-live-score-store-load-encode-parity`
- child status: `planning`
- `task_start_run=false`
- `production_implementation_authorized=false`
- `independent_planning_review=pending`
- RKP-2 Stage 5 complete; Stage 6 not started/authorized
- TypeScript remains default

Do not run `task.py start`, modify package/test production paths, accept/archive/push, create RKP-3, run qualification or resume Stage 6 from this candidate.

## Root-cause handoff

The old package command relies on a quoted wildcard. Node 24 has produced both complete 77-file/557-test discovery and a 29-file/261-test exit-zero partial discovery; Node 20.20.2 rejects the literal wildcard. The complete literal current-tree run is 557 discovered / 556 pass / 1 expected GC skip / 0 fail. Package and lock files are unchanged across `df40aef..eed4871a`, so this is an inherited runner-method defect, not Stage 5 product drift.

## Frozen implementation decision

Use one test-infrastructure module to enumerate literal `.test.js` files, freeze/hash `full-test-manifest-v1`, then invoke stable `node:test` with the exact absolute file array. The Node 20-compatible production options are only `files` and `concurrency`; repository CWD and default separate-process isolation are verified semantics, not later-version-only options.

All failures, cancellations, missing/duplicate/unknown file outcomes, stream/reporter errors and manifest mismatches are nonzero. No count constant, shell glob, third-party glob, environment hook, dependency, native export or product API is allowed.

## Review handoff

Send the exact docs-only candidate to the dedicated planning auditor. Focus on:

1. Node 20.20.2/24.15.0 compatibility without unsupported option leakage;
2. symlink/junction non-following traversal and explicit code-unit ordering;
3. non-tautological manifest-versus-actual-runner/file-outcome completeness;
4. stable reporter completion and failure/cancel/error propagation;
5. literal future allowlist and package-lock/product zero-delta;
6. the child as sole infrastructure owner and Stage 6 as consumer only;
7. exact 22-path RKP-2 coordination projection and five content hashes;
8. lifecycle truth: planning/pending/no start/no Stage 6.

Implementation begins only after exact planning PASS and later user authorization.
