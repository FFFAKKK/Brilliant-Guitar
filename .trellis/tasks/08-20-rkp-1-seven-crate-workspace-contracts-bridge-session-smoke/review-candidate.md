# RKP-1 CVN-7 Historical Boundary Planning Repair Candidate

## Required verdict

Current status: `PLANNING REREVIEW REQUIRED`.

An independent read-only planning auditor must return either `PASS`, P0/P1/P2=`0/0/0`, or a bounded planning return with exact file/line, severity and violated authority. Do not issue an implementation verdict, modify the test, resume Stage E, accept/archive, push, change the default runtime, create RKP-2 or run official qualification.

## Candidate boundary

- Planning authority HEAD: `89115daedc623c0d35386a4a433cc7fd95215223` (independent planning PASS `0/0/0`).
- Implementation branch: `codex/rkp-1-seven-crate-workspace-contracts-bridge-session-smoke`.
- Bounded repair branch: `codex/rkp-1-cvn7-historical-boundary-planning-repair`.
- Planning repair base: `669364128cd4402a478f247393908ff170112794`.
- Planning rereview range: `669364128cd4402a478f247393908ff170112794..HEAD`.
- Lifecycle activation: `84918e1e293b26554fbff9f161c6222510f378b9`.
- Stages A-D: `6b64616690ddf9e11e71cf4caeb1b4be5df74b8d`, `632ebcda54adba07c106984c16999cb84bc9bc2c`, `f5ca93c77e800465b65b947172fca1c9f8ee650f`, `8ae5b7158ea45cfc4c47902ff8a17ce5c949678c`.
- Stage E gate record is `669364128cd4402a478f247393908ff170112794`, subject `test(rust): expose RKP-1 regression-gate conflict`.
- Expected lifecycle: child `in_progress`; original planning review passed; bounded planning rereview pending; implementation paused/candidate not ready; implementation review pending; parent names only RKP-1 as active implementation child.

## Exact bounded planning finding

`test/core-kernel/cvn-7-qualification-boundary.test.ts` currently supplies only `38afdc3fd508dc67f7aa446fd323837a5d550b70` to `git diff`, creating an open upper bound to the working tree. The repaired future-safe invariant is the immutable closed interval ending at final CVN-7 input/head `b21540fa3636e6c8e827ff24c2099f4ff331285d`. The two commits must exist, base ancestry must pass, both revisions must be explicit, and the diff over `src`, `package-lock.json`, `tsconfig.json` must be empty without using `HEAD` or working-tree/index state.

## Mandatory planning rereview focus

1. Confirm the repair changes only the 12 docs/task paths frozen in `research/cvn7-historical-boundary-repair.md`; production and tests are zero delta relative to `6693641`.
2. Confirm both frozen commits exist, base is an ancestor of final head, and the current closed-range protected diff is empty.
3. Confirm the proposed implementation allowlist is exactly the original 39 plus only `test/core-kernel/cvn-7-qualification-boundary.test.ts`; the already-allowed workspace-law test keeps `89115da...` as the full implementation-diff base, uses the accepted repair commit only as matrix source, and is the only direct regression companion. Every other existing test remains protected.
4. Confirm the future assertion cannot use `HEAD`, omit the upper revision, or observe current index/working-tree state.
5. Confirm CVN-7 evidence/result/qualification/budgets and RKP-1 production/public/default-runtime/contracts remain unchanged.
6. Confirm lifecycle remains paused `in_progress` with start/production authorization preserved, candidate not ready, planning rereview pending, no acceptance/archive/push/RKP-2+/qualification.
7. Reproduce Trellis/JSON/JSONL/path/unique hierarchy, Markdown, allowlist, `git diff --check`, zero code/test delta and clean/staged-empty checks. Do not require Rust/Node/full-suite reruns for this docs-only planning candidate.

## Preserved later implementation audit focus

1. After planning PASS and the two-test repair, prove the complete implementation diff from `89115da...` is a literal subset of the repaired 40 paths and that package files, tsconfig files, existing public indexes/other tests and unrelated authority bodies have zero delta.
2. Prove exactly seven crates, the frozen direct graph/pins/features/toolchain/MSRV/panic policy, six non-Node unsafe forbids and Node `cdylib`/Node-API v8.
3. Review DTO ownership and strict codec behavior: exact create/read bytes, closed 22-code/key failure union, caps, hostile input, eight-stage precedence, detached immutable results and no raw error leakage.
4. Review `boundary.rs` as the only unsafe owner: fixed tag; result/fresh-key/reserve preflight; wrap -> tag -> final insert; four-state ownership; status-before-out remove rollback; unknown-pointer non-touch; matching-generation finalizer; validate-before-unwrap/table; owner env/thread, reentrant and non-blocking busy/poison precedence; panic hook scope.
5. Reproduce the Windows MSVC debug `.dll -> .node` literal copy, `process.dlopen` and `require` exact-two-export probes and clean-clone native/TS smoke. Do not infer a non-Windows claim.
6. After planning PASS and implementation, re-run Rust `1.97.1` workspace check/test/clippy/fmt, MSRV `1.88.0` check, TypeScript typecheck/build, focused CVN-7/RKP-1 tests, full `542/542`, workspace-law, RKP-0 `28/51/8/34/9`/schema/default-runtime gates, Windows Node gates, Trellis/JSON/JSONL/hierarchy and clean status.
7. Confirm all explicit exclusions remain absent: indexed store, commands/transactions/history/events, incremental validation, providers/WASM, instruments, Product Host/Tauri/public plugins, default cutover, RKP-2+ and official qualification.

## Non-authoritative local evidence

`research/implementation-evidence.md` preserves the implementation commands/results and pre-repair `541/542`; `research/cvn7-historical-boundary-repair.md` records the bounded planning contract and local docs-only self-audit. Neither is an independent review verdict.
