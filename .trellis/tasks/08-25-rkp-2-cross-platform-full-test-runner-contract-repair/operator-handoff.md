# Operator Handoff — RKP-2 Cross-platform Full Test Runner Contract Repair

## Current stop state

`BOUNDED PLANNING AMENDMENT REREVIEW REQUIRED — IMPLEMENTATION PAUSED AT STAGE 2`.

- amendment branch: `codex/rkp-2-runner-event-coverage-planning-repair`
- planning base: `eed4871a86191783d539b7d4097be3627e98e4a0`
- parent: `08-24-rkp-2-indexed-live-score-store-load-encode-parity`
- child status: `planning`
- `task_start_run=false`
- `production_implementation_authorized=false`
- accepted planning head: `cc82ba168ed45b8c3e0182ea8e1370b1474f1155`
- separate implementation evidence: activation `9da6ba6`, Stage 1 `912a68a`, clean paused Stage 2 `d366653788a42eb56cd5755a63b1e73700c67310`; implementation commits are outside amendment ancestry
- discarded diagnostic Stage 3 `610d20b` is not in a current parent chain
- event-coverage amendment independent planning rereview: pending
- RKP-2 Stage 5 complete; Stage 6 not started/authorized
- TypeScript remains default

Do not run `task.py start`, modify package/test production paths, accept/archive/push, create RKP-3, run qualification or resume Stage 6 from this candidate.

## Root-cause handoff

The old package command relies on a quoted wildcard. Node 24 has produced both complete 77-file/557-test discovery and a 29-file/261-test exit-zero partial discovery; Node 20.20.2 rejects the literal wildcard. The complete literal current-tree run is 557 discovered / 556 pass / 1 expected GC skip / 0 fail. Package and lock files are unchanged across `df40aef..eed4871a`, so this is an inherited runner-method defect, not Stage 5 product drift.

## Frozen implementation decision

Use one test-infrastructure module to enumerate literal `.test.js` files, freeze/hash `full-test-manifest-v1`, then invoke stable `node:test` with the exact absolute file array. The Node 20-compatible production options are only `files` and `concurrency`; repository CWD and default separate-process isolation are verified semantics, not later-version-only options.

Only common `test:pass`/`test:fail` structured events determine truth. Any fail at any nesting immediately fails. Success consumes only pass `data.file`, which must be a non-empty absolute manifest member. Duplicate passes are expected; the idempotent seen-file set must equal both the enumerator manifest and exact `run()` array after normal end. `data.name` and `data.nesting` are opaque/diagnostic only. Missing/non-string/relative/unknown `data.file`, partial coverage, interrupted, abort/premature close/no end, stream/reporter flush errors and manifest mismatches are nonzero. Reporter text, `test:complete` and `details.type` remain forbidden.

Node 20.20.2 and 24.15.0 produced identical raw/fast/slow structured sets for the same TEMP two-file fixture and real 78-file Stage-2 tree. Empty-file pass uses equal absolute `file`/`name`; internal pass/fail uses manifest `file` plus title `name`. The real tree produced 567 pass/1 governance fail, covered all 78 files by `data.file`, and emitted no unique per-file terminal rows. These are diagnostic snapshots only.

Every regular candidate has a BigInt `lstat` physical identity `(dev,ino)`. Missing/zero identity, normalized duplicate or hard-link alias fails before `run()`. The future implementation must use a real `linkSync` fixture with zero runner calls and must not skip an environment unable to create it.

Content commit P carries the corrected contract; following anchor A pins P, freezes `eed4871a..P` as exact 20 paths and defines future `P..candidate` as 4 technical plus 11 lifecycle paths. Only A is the amendment audit object. Stage 4 remains only a pre-review candidate, with RKP-2 still at 21 technical and 22 coordination paths. The accepted 13-archive/23-coordination projection is unchanged.

## Review handoff

Send the exact docs-only candidate to the dedicated planning auditor. Focus on:

1. Node 20.20.2/24.15.0 compatibility without unsupported option leakage;
2. symlink/junction non-following traversal and explicit code-unit ordering;
3. Node 20/24 raw/fast/slow fixtures and the event-type-plus-pass-`data.file` coverage normalizer, including duplicate-pass success, partial/malformed/unknown coverage and synchronous listener race;
4. BigInt `(dev,ino)` identity and real hard-link rejection before `run()`;
5. non-tautological manifest-versus-actual-runner/pass-seen equality and normal-end/reporter-flush propagation;
6. literal future allowlist and package-lock/product zero-delta;
7. exact real 20-path planning range, 4+11 candidate projection, and 22-active/23-archived mutually exclusive authority sets;
8. exact 13-path archive including implementation evidence, phase-specific rollback and explicit integration gate;
9. lifecycle truth: planning/pending/no start/no Stage 6.

Implementation remains paused at `d366653` until exact anchor A passes planning rereview and is explicitly integrated. Stage 3 and Stage 6 are not authorized.
