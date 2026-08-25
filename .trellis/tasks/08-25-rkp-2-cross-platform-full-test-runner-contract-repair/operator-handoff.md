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
- first independent planning audit of `c43a34e7d02a57cfd90de506cf97787ff5571a9e`: RETURN, P0/P1/P2=`0/3/0`; bounded repair applied, targeted rereview pending
- RKP-2 Stage 5 complete; Stage 6 not started/authorized
- TypeScript remains default

Do not run `task.py start`, modify package/test production paths, accept/archive/push, create RKP-3, run qualification or resume Stage 6 from this candidate.

## Root-cause handoff

The old package command relies on a quoted wildcard. Node 24 has produced both complete 77-file/557-test discovery and a 29-file/261-test exit-zero partial discovery; Node 20.20.2 rejects the literal wildcard. The complete literal current-tree run is 557 discovered / 556 pass / 1 expected GC skip / 0 fail. Package and lock files are unchanged across `df40aef..eed4871a`, so this is an inherited runner-method defect, not Stage 5 product drift.

## Frozen implementation decision

Use one test-infrastructure module to enumerate literal `.test.js` files, freeze/hash `full-test-manifest-v1`, then invoke stable `node:test` with the exact absolute file array. The Node 20-compatible production options are only `files` and `concurrency`; repository CWD and default separate-process isolation are verified semantics, not later-version-only options.

Only common `test:pass`/`test:fail` structured events determine outcomes. Any fail at any nesting fails; nesting-zero file outcomes must normalize `data.file`/`data.name` to exactly one manifest member. Unknown/duplicate/missing/interrupted outcomes, abort/premature close/no end, stream/reporter flush errors and manifest mismatches are nonzero. Reporter text, `test:complete` and `details.type` are forbidden truth sources.

Every regular candidate has a BigInt `lstat` physical identity `(dev,ino)`. Missing/zero identity, normalized duplicate or hard-link alias fails before `run()`. The future implementation must use a real `linkSync` fixture with zero runner calls and must not skip an environment unable to create it.

Stage 4 is only a pre-review candidate: exact child technical 4 plus active lifecycle 11, with RKP-2 still at 21 technical and 22 coordination paths. Only after implementation PASS may native archive create the exact 13 archived paths and replace the 12 active paths, yielding coordination 23; explicit RKP-2 integration then creates a new Stage 6 prerequisite, still without Stage 6 authorization.

## Review handoff

Send the exact docs-only candidate to the dedicated planning auditor. Focus on:

1. Node 20.20.2/24.15.0 compatibility without unsupported option leakage;
2. symlink/junction non-following traversal and explicit code-unit ordering;
3. Node 20/24 event fixtures and the `test:pass`/`test:fail`-only normalizer, including synchronous listener race and wrong-field negatives;
4. BigInt `(dev,ino)` identity and real hard-link rejection before `run()`;
5. non-tautological manifest-versus-actual-runner/file-outcome completeness and normal-end/reporter-flush propagation;
6. literal future allowlist and package-lock/product zero-delta;
7. exact real 20-path planning range, 4+11 candidate projection, and 22-active/23-archived mutually exclusive authority sets;
8. exact 13-path archive including implementation evidence, phase-specific rollback and explicit integration gate;
9. lifecycle truth: planning/pending/no start/no Stage 6.

Implementation begins only after exact planning PASS and later user authorization.
