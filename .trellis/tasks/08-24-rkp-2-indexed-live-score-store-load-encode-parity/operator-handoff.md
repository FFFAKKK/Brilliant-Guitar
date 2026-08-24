# Operator Handoff — RKP-2

## Current status

`BOUNDED PLANNING REPAIR — TARGETED INDEPENDENT REREVIEW PENDING`.

- Branch: `codex/rkp-2-indexed-live-score-store-load-encode-parity`.
- Worktree: `.worktrees/rkp-2-indexed-live-score-store-load-encode-parity`.
- Planning base: `063b332dd48c05796fb3450a8004f42ff2148b20`.
- Task: `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity`.
- State: `planning`, `task_start_run=false`, `production_implementation_authorized=false`.
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

## Pre-activation blocker

The sibling RKP-1 post-archive repair planning head `f7fecdcf...` passed targeted planning review, while its implementation/acceptance/archive remain pending. The operator first completes that repair through its own audit and archive. Then create the RKP-2 implementation branch from the repaired accepted head and incorporate this approved planning commit.

The initial RKP-2 planning review of `6a349b6...` returned P0/P1/P2=`0/5/1`. The first targeted rereview of `f4ed2bc...` returned `0/1/0` because Foundation capacity failure lacked an internal-to-wire mapping. That direct regression is now closed in planning and still requires a dedicated targeted rereview returning `0/0/0`. Until then this document is not an implementation handoff.

Do not copy one parent `task.json` over the other. Preserve the child-set union and set RKP-2 as the only active child only during authorized activation.

## First operator action after later authorization

Follow `implement.md` Section 1 exactly. Record the final base, prove ancestry/full green baseline/clean state, then create the activation commit. Stop after every stage gate. A new file/dependency/public shape returns to planning review.

## Audit and closeout

The operator stops at an implementation candidate. A dedicated read-only auditor reports P0/P1/P2. Acceptance/archive and later RKP-3 planning are separate owner decisions. Push, default cutover and official qualification remain outside RKP-2.
