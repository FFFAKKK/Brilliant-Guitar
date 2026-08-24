# RKP-1 Repair and RKP-2 Entry Gate

## Two sibling planning lines

RKP-2 was created from clean parent projection `063b332dd48c05796fb3450a8004f42ff2148b20`. The RKP-1 post-archive repair was planned independently from the same base. The branches deliberately remain separate during planning so neither unreviewed plan becomes the other's production baseline.

- RKP-2 branch: `codex/rkp-2-indexed-live-score-store-load-encode-parity`.
- RKP-2 worktree: `.worktrees/rkp-2-indexed-live-score-store-load-encode-parity`.
- Repair branch: `codex/rkp-1-post-archive-contract-repair`.
- Repair planning head: `f7fecdcf7f2194b978ff2841b7913b670a2f7f8f`.
- Repair targeted planning verdict received in dedicated auditor task: PASS P0/P1/P2=`0/0/0`.
- Repair production implementation/acceptance/archive: pending.

## Why planning proceeds

The repair corrects a historical workspace test and lifecycle projections. It does not change LiveScoreStore requirements, DTO semantics, Rust crates or RKP-2 container/index decisions. Planning can therefore close independently.

## Why activation waits

RKP-2 implementation will add Cargo/Runtime/test paths and would amplify the known future-HEAD coupling in the existing RKP-1 workspace-law test. Activation therefore requires the repair first, along with a clean fully green baseline.

## Required integration sequence

1. Implement the repair on its own accepted plan.
2. Run separate implementation audit.
3. Accept/archive the repair.
4. Create a new RKP-2 implementation branch from the repaired accepted HEAD.
5. Incorporate the independently approved RKP-2 planning commit.
6. Resolve Rust-parent `children` as the set union: archived RKP-0, archived RKP-1, archived repair, active RKP-2 exactly once each.
7. Set current planning/implementation child to RKP-2 only after activation.
8. Rerun Trellis, Rust, Node and TypeScript entry gates.
9. Record exact final implementation base before `task.py start`.

## Merge conflict rule

The active Rust parent `task.json` is touched by both planning lines. A textual last-writer choice is invalid. Merge resolution must preserve:

- all archived RKP-1 facts;
- the repair child and accepted repair evidence;
- the RKP-2 child and its planning review evidence;
- TypeScript default;
- one active implementation child maximum;
- RKP-2 implementation authorization false until explicit activation.

The parent `implement.md` and stage map from RKP-2 are retained unless the repair acceptance creates a direct factual correction; such correction is documented in the activation commit.

## Entry proof

The activation report must include:

```text
REPAIR_ACCEPTED_HEAD=COMMIT_HASH_SLOT
REPAIR_ARCHIVE_PATH=TASK_PATH_SLOT
RKP2_APPROVED_PLANNING_HEAD=COMMIT_HASH_SLOT
RKP2_IMPLEMENTATION_BASE=COMMIT_HASH_SLOT
```

It must also show both required ancestors, unique child references, full green focused/full tests and clean/staged-empty status.
