# Operator Handoff — RKP-4

## Current verdict

Planning candidate only. No production source, test, specification, dependency,
runtime default or remote state has been changed. Do not run `task.py start`
without a new explicit owner approval naming private RKP-4 implementation.

## Exact workspace

```text
worktree: .worktrees/rkp-4-history-snapshots-events-replay-planning
branch: codex/rkp-4-history-snapshots-events-replay-planning
planning base: 46a684c78551d118f75b4864a8ed6ec5d3de77c3
planning content: eef310f804a60ce5aff509c35ca6950a791506c4
predecessor technical source: 3ca82f1fcf68070e6c775d0848839864dbc87c71
predecessor archive compatibility: 560fd89d32026cdc41c3cf0df65285e99e015456
default runtime: TypeScript
```

## First action after approval

1. verify candidate HEAD and clean status;
2. reread `prd.md`, `design.md`, `implement.md` and this handoff;
3. run Trellis context and `task.py start` exactly once;
4. record the user's authorization as C0 and assert no competing active child;
5. begin C1 with behavioral RED contract/state tests.

Do not start by editing Runtime. The C1 DTO, invariant and boundary tests define
the safe state-transition envelope needed by later code.

## Decisions not to reopen casually

- one `Vec<HistoryEntryV1> + cursor`, never two public stacks;
- history sequence is the non-reused content identity;
- append-only version-to-identity vector supports delayed saves;
- latest-only operational checkpoint, separate from `markPersisted`;
- checkpoint thresholds exactly 512 entries or 33,554,432 ChangeSet bytes;
- Rust sequences data-only events; TypeScript owns callbacks/reentrancy guard;
- cache-aware read uses caller known revision and never assumes JS cache;
- exactly two new private Node exports, five total;
- replay uses semantic envelopes and a fresh session;
- RKP-4 does not claim RKP-5 validation/support or RKP-7 qualification.

## Stop and return to planning if

- RKP-3 `ChangeSetV1` cannot be retained/applied without cloning a full
  document or exposing private operations across FFI;
- an expected undo/redo failure remains possible after live adoption begins;
- direct selectors require a whole-document export for non-document requests;
- the five-export design cannot preserve predecessor handle/boundary laws;
- bridge/snapshot limits require an observable compatibility reduction;
- implementation needs a dependency, schema, public export, frozen-oracle,
  default-runtime or non-allowlisted production change;
- RKP-5 validation behavior is required to make a claimed RKP-4 test pass.

## Later closeout

A green implementation candidate receives one bounded review. A technical
`0/0/0` review permits only a separate owner acceptance/archive question. RKP-5
cannot begin before native RKP-4 archive.
