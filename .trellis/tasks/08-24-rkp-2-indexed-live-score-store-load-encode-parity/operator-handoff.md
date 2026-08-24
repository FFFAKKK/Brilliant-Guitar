# Operator Handoff — RKP-2

## Current status

`PLANNING CANDIDATE — INDEPENDENT REVIEW PENDING`.

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
- atomic pre-count/reserve/build/rebuild/export/publish;
- exact 22 stable failures and two Node exports;
- six reversible implementation stages after activation.

## Pre-activation blocker

The sibling RKP-1 post-archive repair planning head `f7fecdcf...` passed targeted planning review, while its implementation/acceptance/archive remain pending. The operator first completes that repair through its own audit and archive. Then create the RKP-2 implementation branch from the repaired accepted head and incorporate this approved planning commit.

Do not copy one parent `task.json` over the other. Preserve the child-set union and set RKP-2 as the only active child only during authorized activation.

## First operator action after later authorization

Follow `implement.md` Section 1 exactly. Record the final base, prove ancestry/full green baseline/clean state, then create the activation commit. Stop after every stage gate. A new file/dependency/public shape returns to planning review.

## Audit and closeout

The operator stops at an implementation candidate. A dedicated read-only auditor reports P0/P1/P2. Acceptance/archive and later RKP-3 planning are separate owner decisions. Push, default cutover and official qualification remain outside RKP-2.
