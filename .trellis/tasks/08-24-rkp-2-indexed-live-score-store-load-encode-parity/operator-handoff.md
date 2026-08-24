# Operator Handoff — RKP-2

## Current status

`STAGE 1 IMPLEMENTATION READY — ACTIVATION COMMIT 0 ONLY`.

- Branch: `codex/rkp-2-indexed-live-score-store-implementation`.
- Worktree: `.worktrees/rkp-2-indexed-live-score-store-implementation`.
- Planning base: `063b332dd48c05796fb3450a8004f42ff2148b20`.
- Task: `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity`.
- Approved planning head: `625054ec78e6410e0fb6034ab0c8f60bbf110d08`.
- Approved planning-state head: `53646c92b81bc3ac160ec5d72b0d3f80c97b7eb0`.
- Accepted repair closeout first parent: `b5d63006a4c286bad01fdb56112b9a6741f648b0`.
- Clean unified implementation base: `df40aef391440ae64ad3e266419579bee5887a1f`.
- Independent planning review: P0/P1/P2=`0/0/0` in dedicated task `01a01e48-1934-77b0-821e-a8026cd9e5f7`.
- State: `in_progress`, `task_start_run=true`, `production_implementation_authorized=true`, `user_implementation_authorization=true`, `implementation_candidate_ready=false`.
- Authorization in this turn stops after Activation Commit 0; Stage 1 production/test work has not started.
- TypeScript is the default runtime.

## What this plan delivers

RKP-2 replaces the Rust smoke whole-document holder with an indexed, session-private `LiveScoreStore`, then proves deterministic DTO export. It adds no command mutation and performs no runtime cutover.

Frozen choices:

- exact `slotmap=1.1.1`, Runtime-only, no serde/unstable feature;
- seven typed generational record keys;
- explicit order topology;
- HashMap private lookup with no iteration-derived output;
- exact Fraction sorted-Vec Voice time index;
- Foundation validation-scratch pre-count/reserve followed by independent Runtime store pre-count/reserve/build/local-check/publish;
- workspace-internal Foundation/Runtime capacity failures map to existing `bridge.internal`; the public failure union remains 22;
- full index rebuild and encode/decode/encode parity remain verification paths rather than per-open production work;
- exact 22 stable failures and two Node exports;
- six reversible implementation stages after activation.

## Activation gate resolution

The RKP-1 post-archive repair is independently accepted and archived. Its audited implementation remains `267a63bc6ff35b49842fb713c34f4099c8829e18`; lifecycle closeout reaches `b5d63006a4c286bad01fdb56112b9a6741f648b0`. The non-fast-forward unified base `df40aef391440ae64ad3e266419579bee5887a1f` has exact parents `b5d63006...` and `53646c92...`, preserves both ancestries, and contains no new production/test/Cargo/package/tsconfig changes relative to the repair closeout.

The initial RKP-2 planning review of `6a349b6...` returned `0/5/1`; `f4ed2bc...` returned `0/1/0`; `135af27...` returned `0/0/1`; the final exact `625054e...` rereview passed `0/0/0`. The approved plan is now active, but no implementation stage beyond Commit 0 has begun.

The parent was resolved field by field: RKP-0, RKP-1, the post-archive repair and RKP-2 each remain referenced exactly once. RKP-2 is now the sole current/active implementation child.

## Next operator action

Start Stage 1 only in a later authorized continuation and follow `implement.md` exactly. The activation baseline already passed Rust `40/40`, fmt/check/clippy/MSRV, Windows dual-loader and exact-two-export probes, Node bridge `9/9`, workspace-law `6/6`, TypeScript typecheck/build and full `546` discovery with `545` pass, one expected GC skip and zero failures. Stop after every stage gate. A new file/dependency/public shape outside the approved matrix returns to planning review.

## Audit and closeout

The operator stops at an implementation candidate. A dedicated read-only auditor reports P0/P1/P2. Acceptance/archive and later RKP-3 planning are separate owner decisions. Push, default cutover and official qualification remain outside RKP-2.
