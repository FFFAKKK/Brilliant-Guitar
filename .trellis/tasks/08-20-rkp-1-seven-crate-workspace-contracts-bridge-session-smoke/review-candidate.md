# RKP-1 Targeted Independent Planning Rereview Candidate

## Required verdict

Current status: `TARGETED PLANNING REREVIEW REQUIRED`.

Return either:

```text
PASS
P0/P1/P2 = 0/0/0
```

or a bounded planning return with exact file/line, severity and violated authority. Initial `b619f240...` returned P0/P1/P2=`0/3/1`, first r1 `922da5e...` returned `0/2/0`, and second amended candidate `9741abfee76d009dbea985192e5dfb162e16902a` returned `0/1/0`. This rereview is limited to the remaining status-dependent `napi_remove_wrap` ownership-state repair and its direct regressions; every previously passed contract is regression-only. The prior P2 is not claimed closed or silently accepted. Do not edit the candidate, run `task.py start`, implement Rust, accept/archive, push or advance the parent lifecycle.

## Candidate boundary

- Exact ancestor/base: `463c8514a61a61a39c8a5d2736261ae9e82b0fba`.
- Branch: `codex/rkp-1-seven-crate-workspace-contracts-bridge-smoke-planning-r1`.
- Expected graph: lifecycle-header-only `7174c5ac50655ae0cb8807e21c7045a0c1b6d15e` is a direct child of exact base `463c851...`; amended HEAD is the unique RKP-1 planning direct child of `7174c5a...`; original `b619f240...` remains the untouched sibling of `7174c5a...`.
- Expected diff: two lifecycle headers, this RKP-1 task directory, and only the Rust parent `task.json` current-child/gate projection.
- Expected production/test/build/Cargo/crates delta: zero.
- Expected lifecycle: child and parent planning, both task-start false, production false, RKP-1 planning review pending, implementation child null, RKP-2–RKP-9 absent.

## Mandatory audit focus

1. Prove the objective graph only: `7174c5a...` is a direct child of `463c851...`; amended HEAD is the unique RKP-1 planning direct child of `7174c5a...`; preserved `b619f240...` is an untouched sibling of `7174c5a...`. Do not require `7174c5a...` to be the sole child of the base.
2. Remaining P1: prove the guard has exactly `PreWrapOwned -> WrappedFinalizerOwns -> RemovedGuardOwns -> Released`; `napi_wrap` failure leaves one guard release, while success immediately makes the finalizer sole token releaser. Prove complete result, fresh key and `try_reserve(1)` capacity preflight occur before wrap and tag-success insertion is the last infallible action.
3. Prove `napi_remove_wrap` status is checked before its out pointer: `napi_ok` cancels finalization and transfers expected-token release to the guard even on mismatched/null return, permitting only one address comparison and no unknown-pointer dereference/free; non-`napi_ok` leaves finalizer ownership/table absent, with zero out-pointer read/compare/dereference/free and zero guard token release. Finalizer must remove only matching allocation+generation and drop token/envelope once. Fault injection must prove canonical `bridge.internal`, unpublished session/result, the exact counter table in `design.md`, zero observable delta, no hang/double-free/leak/status-pointer exposure.
4. Direct regressions from the prior three-P1 repair: verify exact Windows `cdylib` build/load/clean-clone law, all 22 failure variants/wrappers/eight-stage precedence/no-leak, and owner environment/thread/reentrant/`try_lock`/zero-delta rules remain exact.
5. Broader direct regressions: prove exactly seven crates/acyclic graph; Node-API v8/toolchain/MSRV/pins/features/panic policy; one byte decoder; full DTO only at create/read; TypeScript default; no RKP-2+ scope; exact allowlist; five revertible stages.
6. Re-run Trellis child/parent/V2/sync, JSON/JSONL/related-path/unique-hierarchy, Markdown/Mermaid/fences, `git diff --check`, typecheck/build/full `531/531`, objective ancestry and exact zero protected delta on a clean candidate.

## Local self-audit is non-authoritative

The evidence in `research/planning-candidate-self-audit.md` is a reproducibility aid only. It cannot satisfy this independent review or change `independent_planning_review` from `pending`.
