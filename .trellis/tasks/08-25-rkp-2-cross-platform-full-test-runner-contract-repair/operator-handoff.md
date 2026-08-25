# Operator Handoff — RKP-2 Cross-platform Full Test Runner Contract Repair

## Current implementation state

`BOUNDED WORKSPACE-LAW ORACLE REPAIR ACTIVE — CANDIDATE NOT READY`.

- implementation branch: `codex/rkp-2-cross-platform-full-test-runner-contract-repair`
- planning base: `eed4871a86191783d539b7d4097be3627e98e4a0`
- parent: `08-24-rkp-2-indexed-live-score-store-load-encode-parity`
- accepted planning head: `cc82ba168ed45b8c3e0182ea8e1370b1474f1155`
- event-coverage content P: `44832ad01d136368c1b61203e9207ca4a521241f`
- independently accepted event-coverage anchor A: `c69d7b76175e2b818f4d276504a39b741e6e1975`, PASS P0/P1/P2=`0/0/0`, auditor `01a01e48-1934-77b0-821e-a8026cd9e5f7`
- implementation evidence preserved: activation `9da6ba6`, Stage 1 `912a68a`, clean Stage 2 `d366653788a42eb56cd5755a63b1e73700c67310`
- bounded amendment merge: `b4906ac64a44cc735de7b923818817300d5c70fd`
- event-coverage correction: `b20016882c16906db350feade4811821d55dad93`
- hostile/version/range proof: `ce9598eca3ad4df30854b8cc9383f4034e2e55a3`
- discarded diagnostic Stage 3 `610d20b` remains outside the current parent chain
- first implementation review of exact `15c84a1929d1365ebf466088e896fd5309a4fa57`: RETURN, P0/P1/P2=`0/1/1`; first-observed structured-failure precedence and direct fail-closed branch evidence are the only repair scope
- bounded implementation repair: state `04364ecaf6f329bd2a4d3671a75bac7b15d23c49`; first-failure precedence `f77549ef429dd2611d7f6144c164511599da9129`; fail-closed evidence `139f1271b651af0c1b70e151ba9604ef154442d7`
- targeted implementation rereview of exact `6dac686d7f7dcaa447330209c6da04e414b7615c`: RETURN, P0/P1/P2=`0/1/0`; production runner and prior P2 evidence are accepted, and only the workspace-law oracle's first-observed signal ordering is reopened
- child status: `in_progress`
- `task_start_run=true`
- `production_implementation_authorized=true`
- `user_implementation_authorization=true` for this repair only
- first independent planning audit of `c43a34e7d02a57cfd90de506cf97787ff5571a9e`: RETURN, P0/P1/P2=`0/3/0`
- targeted independent planning rereview of `cc82ba168ed45b8c3e0182ea8e1370b1474f1155`: PASS, P0/P1/P2=`0/0/0`, auditor `01a01e48-1934-77b0-821e-a8026cd9e5f7`
- RKP-2 Stage 5 complete; Stage 6 not started/authorized
- TypeScript remains default

Implement only the accepted four-stage repair contract. Do not accept/archive/integrate/push, create RKP-3, run qualification or resume Stage 6 from this child.

## Root-cause handoff

The old package command relies on a quoted wildcard. Node 24 has produced both complete 77-file/557-test discovery and a 29-file/261-test exit-zero partial discovery; Node 20.20.2 rejects the literal wildcard. The complete literal current-tree run is 557 discovered / 556 pass / 1 expected GC skip / 0 fail. Package and lock files are unchanged across `df40aef..eed4871a`, so this is an inherited runner-method defect, not Stage 5 product drift.

## Frozen implementation decision

Use one test-infrastructure module to enumerate literal `.test.js` files, freeze/hash `full-test-manifest-v1`, then invoke stable `node:test` with the exact absolute file array. The Node 20-compatible production options are only `files` and `concurrency`; repository CWD and default separate-process isolation are verified semantics, not later-version-only options.

Only common `test:pass`/`test:fail` structured events determine truth. Any fail at any nesting immediately fails. Success consumes only pass `data.file`, which must be a non-empty absolute manifest member. Duplicate passes are expected; the idempotent seen-file set must equal both the enumerator manifest and exact `run()` array after normal end. `data.name` and `data.nesting` are opaque/diagnostic only. Missing/non-string/relative/unknown `data.file`, partial coverage, interrupted, abort/premature close/no end, stream/reporter flush errors and manifest mismatches are nonzero. Reporter text, `test:complete` and `details.type` remain forbidden.

Node 20.20.2 and 24.15.0 produced identical raw/fast/slow structured sets for the same TEMP two-file fixture and real 78-file Stage-2 tree. Empty-file pass uses equal absolute `file`/`name`; internal pass/fail uses manifest `file` plus title `name`. The real tree produced 567 pass/1 governance fail, covered all 78 files by `data.file`, and emitted no unique per-file terminal rows. These are diagnostic snapshots only.

Every regular candidate has a BigInt `lstat` physical identity `(dev,ino)`. Missing/zero identity, normalized duplicate or hard-link alias fails before `run()`. The future implementation must use a real `linkSync` fixture with zero runner calls and must not skip an environment unable to create it.

Content commit P is exactly `44832ad01d136368c1b61203e9207ca4a521241f`; accepted anchor A `c69d7b76175e2b818f4d276504a39b741e6e1975` pins P, freezes `eed4871a..P` as exact 20 paths and defines `P..candidate` as 4 technical plus 11 lifecycle paths. A has been explicitly merged into the preserved Stage 2 implementation line. Stage 4 remains only a pre-review candidate, with RKP-2 still at 21 technical and 22 coordination paths. The accepted 13-archive/23-coordination projection is unchanged.

## Implementation handoff

Execute the four reversible implementation stages, then send the exact candidate to a dedicated implementation auditor. Focus on:

1. Node 20.20.2/24.15.0 compatibility without unsupported option leakage;
2. symlink/junction non-following traversal and explicit code-unit ordering;
3. Node 20/24 raw/fast/slow fixtures and the event-type-plus-pass-`data.file` coverage normalizer, including duplicate-pass success, partial/malformed/unknown coverage and synchronous listener race;
4. BigInt `(dev,ino)` identity and real hard-link rejection before `run()`;
5. non-tautological manifest-versus-actual-runner/pass-seen equality and normal-end/reporter-flush propagation;
6. literal future allowlist and package-lock/product zero-delta;
7. exact real 20-path planning range, 4+11 candidate projection, and 22-active/23-archived mutually exclusive authority sets;
8. exact 13-path archive including implementation evidence, phase-specific rollback and explicit integration gate;
9. lifecycle truth: in progress, implementation review pending, no Stage 6.

The child remains authorized only for the bounded workspace-law oracle repair. Candidate readiness is false until the ordered-signal oracle, bidirectional fixtures and all gates close. Production runner, package entry and focused runner test must remain byte-identical to `6dac686d`; no PASS is claimed. Keep `610d20b` excluded. Acceptance, archive, closeout, integration into RKP-2 and Stage 6 remain unauthorized.

## Candidate gate evidence

- Node 20.20.2 and 24.15.0 run the same 78-file manifest `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`; each reports 576 tests, 575 pass, 1 expected skip, 0 fail.
- Focused runner plus workspace-law passes 26/26 on both Node versions; runner-focused is 19/19 and directly covers combined observer/reporter precedence, root/entry/repository pre-run failures, and reporter factory/sink/transform failures.
- A `core.autocrlf=false` detached checkout of `ce9598e` contains LF source and passes Rust workspace 70/70, fmt, check, Clippy `-D warnings` and MSRV 1.88.
- `P..candidate` is mechanically constrained to four technical plus eleven active lifecycle paths. The child is candidate-ready; targeted implementation rereview is pending.
