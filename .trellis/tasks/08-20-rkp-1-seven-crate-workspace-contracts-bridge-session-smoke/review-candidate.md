# RKP-1 Stage E Blocked Review Record

## Required verdict

Current status: `BOUNDED PLANNING REPAIR REQUIRED BEFORE IMPLEMENTATION REVIEW`.

Do not issue an implementation verdict yet. A bounded planning repair must first reconcile the mandatory private adapter with the historical CVN-7 zero-production-drift assertion, then receive independent planning rereview. Local self-checks cannot widen the 39-path allowlist. Do not accept/archive, push, change the default runtime, create RKP-2 or run official qualification.

## Candidate boundary

- Planning authority HEAD: `89115daedc623c0d35386a4a433cc7fd95215223` (independent planning PASS `0/0/0`).
- Implementation branch: `codex/rkp-1-seven-crate-workspace-contracts-bridge-session-smoke`.
- Review range: `89115daedc623c0d35386a4a433cc7fd95215223..HEAD`.
- Lifecycle activation: `84918e1e293b26554fbff9f161c6222510f378b9`.
- Stages A-D: `6b64616690ddf9e11e71cf4caeb1b4be5df74b8d`, `632ebcda54adba07c106984c16999cb84bc9bc2c`, `f5ca93c77e800465b65b947172fca1c9f8ee650f`, `8ae5b7158ea45cfc4c47902ff8a17ce5c949678c`.
- Stage E gate record is HEAD with subject `test(rust): expose RKP-1 regression-gate conflict`.
- Expected lifecycle: child `in_progress`; planning review passed; implementation review pending; parent names only RKP-1 as active implementation child.

## Exact bounded planning finding

`test/core-kernel/cvn-7-qualification-boundary.test.ts` freezes a historical CVN-7 qualification boundary by asserting no `src/**` delta from `38afdc3...`. The accepted RKP-1 `design.md`, `implement.md` and file matrix require `src/core-kernel/native/rust-kernel-smoke.ts`. The existing CVN-7 test is explicitly outside the implementation allowlist and all existing tests are zero-delta. A repair must decide the exact future-safe invariant and add only the minimal reviewed path; implementation must not guess it.

## Preserved later implementation audit focus

1. Prove the diff is a literal subset of the 39 audited paths and that package files, tsconfig files, existing public indexes/tests and unrelated authority bodies have zero delta.
2. Prove exactly seven crates, the frozen direct graph/pins/features/toolchain/MSRV/panic policy, six non-Node unsafe forbids and Node `cdylib`/Node-API v8.
3. Review DTO ownership and strict codec behavior: exact create/read bytes, closed 22-code/key failure union, caps, hostile input, eight-stage precedence, detached immutable results and no raw error leakage.
4. Review `boundary.rs` as the only unsafe owner: fixed tag; result/fresh-key/reserve preflight; wrap -> tag -> final insert; four-state ownership; status-before-out remove rollback; unknown-pointer non-touch; matching-generation finalizer; validate-before-unwrap/table; owner env/thread, reentrant and non-blocking busy/poison precedence; panic hook scope.
5. Reproduce the Windows MSVC debug `.dll -> .node` literal copy, `process.dlopen` and `require` exact-two-export probes and clean-clone native/TS smoke. Do not infer a non-Windows claim.
6. After planning repair, re-run Rust `1.97.1` workspace check/test/clippy/fmt, MSRV `1.88.0` check, TypeScript typecheck/build/full regression, workspace-law, RKP-0 `28/51/8/34/9`/schema/default-runtime gates, Trellis/JSON/JSONL/hierarchy and clean status.
7. Confirm all explicit exclusions remain absent: indexed store, commands/transactions/history/events, incremental validation, providers/WASM, instruments, Product Host/Tauri/public plugins, default cutover, RKP-2+ and official qualification.

## Non-authoritative local evidence

`research/implementation-evidence.md` records commands, stage hashes, clean-clone details and gate results for reproduction. It is not an independent review verdict.
