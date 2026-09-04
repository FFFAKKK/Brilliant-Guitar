# Implementation Plan — Core Rust Runtime Performance Remediation

> **Authority:** consume accepted Architecture Reset V2 and the authority-sync result before creating RKP-1. The V2 target is exactly seven crates; this parent remains planning-only.

## Global operating rule

Only one implementation child may be active. Each child is planned, independently reviewed, implemented by an operator, independently audited, accepted and archived before the planner creates the next child.

## Stage 0 — RKP-0 Authority Contract and Oracle Freeze

**Entry:** this parent planning candidate passes independent review.

**Deliver:** the exact failed-measurement ledger, transition authority, behavior oracle schema/corpus, complexity counters, performance Qualification V2 contract and durable RKP stage map. Production `src/**` remains unchanged.

**Exit:** RKP-0 implementation review passes P0/P1/P2=`0/0/0`; deterministic oracle regeneration and the full TypeScript baseline pass; task is accepted/archived.

**Rollback:** revert the RKP-0 docs/test-only commit; `b21540fa` remains the unchanged runtime baseline.

## Stage 1 — Seven-crate Rust workspace, contracts and Node-API smoke

Create only after RKP-0 archive and independent authority-sync acceptance. Pin the Rust toolchain, create exactly `brilliant-core-types`, `brilliant-score-foundation`, `brilliant-extension-protocol`, `brilliant-kernel-contracts`, `brilliant-kernel-runtime`, `brilliant-kernel-session` and `brilliant-kernel-node`, encode/decode the accepted DTOs, and prove one native session create/read smoke path. TypeScript remains default.

## Stage 2 — Indexed entity store

Create only after RKP-1 archive. Implement strict ScoreDocument import/export, typed generational handles, ID/ownership/time indices and deterministic round-trip. No command cutover.

## Stage 3 — Transaction overlay and ChangeSet engine

Create only after RKP-2 archive. Port ordered effects, atomic batch adoption, inverse derivation, rejection zero delta and complexity counters. TypeScript remains default.

## Stage 4 — History, snapshots, events and replay

Create only after RKP-3 archive. Implement vector+cursor history, undo/redo, checkpoints, cached projections, dirty state, event sequence and semantic replay parity.

## Stage 5 — Incremental validation and Extension Protocol

Create only after RKP-4 archive. Implement dependency closures, full-validation parity checks, profile/compatibility and the versioned `brilliant-extension-protocol` request/descriptor/validation/WASM preparation contracts. No privileged Guitar provider is introduced.

## Stage 6 — Kernel Session composition and equal protocol consumers

Create only after RKP-5 archive. Implement the `brilliant-kernel-session` composition root, gateway, catalog/inventory/migration behavior and both synthetic Instrument Plugin consumers, retaining deterministic assembly, caps, migration and failure semantics. Guitar/Piano/Bass/third-party consumers use the same protocol; no Guitar privileged path is added.

## Stage 7 — Complete differential gate

Create only after RKP-6 archive. Run all existing tests and the frozen oracle against both engines, add seeded long-sequence differential tests, and meet the 60 FPS/scale gates with TypeScript still default.

## Stage 8 — Production default cutover

Create only after RKP-7 archive. Switch the application facade to Rust in one isolated commit, retain no runtime selector, and run complete compatibility/resource/performance regression.

## Stage 9 — Qualification V2 and oracle cleanup

Create only after RKP-8 archive. Run one fresh official qualification, complete independent review, then remove the executable legacy TypeScript transaction engine and differential runner in a separate commit while retaining the golden corpus. Keep `src/core-kernel/module-sdk/index.ts`, its exact 8/34 export/ABI tests and compatibility fixtures; changing that surface requires a separate deprecation plan.

## Parent planning validation

```powershell
python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation
python .\.trellis\scripts\task.py validate .trellis/tasks/archive/2026-08/08-15-rkp-0-authority-contract-oracle-freeze
python .\.trellis\scripts\task.py validate 07-29-core-vnext-product-ready-extensible-kernel-completion
python .\.trellis\scripts\task.py validate 06-29-commercial-guitar-tablature-product
python .\.trellis\scripts\task.py validate 08-11-post-core-official-plugin-product-roadmap
git diff --check
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
```

Also verify JSON/JSONL parse, unique parent/child references, `status=planning`, authorization flags false, V2 authority-sync acceptance before RKP-1 creation, exact seven-crate wording, and zero relative delta under production/test/build-config paths.

## RKP-0 acceptance/archive projection — 2026-08-15

`08-15-rkp-0-authority-contract-oracle-freeze` is accepted and archived at `.trellis/tasks/archive/2026-08/08-15-rkp-0-authority-contract-oracle-freeze/` after the independent implementation review passed `P0/P1/P2=0/0/0` for `9bc53901a0e205a99865b21c56dc80ff1112f3a7`. Evidence records typecheck/build, RKP-0 `15/15`, CVN-7 `84/84`, full `531/531`, and fresh-checkout fixture hashes; no official qualification ran. The coordination parent remains `planning`, `task_start_run=false`, `production_implementation_authorized=false`, and active implementation child `none`. RKP-1 through RKP-9 remain absent until a separate planning/review/authorization decision.

## RKP-2 planning projection — 2026-08-24

RKP-1 is accepted/archived and RKP-2 now has a formal docs-only planning candidate at `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/`. Its planning base is `063b332dd48c05796fb3450a8004f42ff2148b20`; task status remains `planning`, `task_start_run=false`, `production_implementation_authorized=false`, and there is no active implementation child.

The sibling RKP-1 post-archive workspace/authority repair planning candidate `f7fecdcf7f2194b978ff2841b7913b670a2f7f8f` received targeted planning PASS, while its implementation, independent implementation audit, acceptance and archive remain the RKP-2 activation gate. RKP-2 planning review can close independently. The later implementation branch must start from a green accepted repair base, incorporate the approved RKP-2 planning commit, and merge the parent child set rather than replacing either sibling projection.

RKP-2 owns only indexed `LiveScoreStore`, strict atomic load, deterministic index rebuild and exact encode parity. TypeScript remains default. RKP-3 command/transaction work stays absent until RKP-2 implementation passes independent audit and is accepted/archived.

RKP-2 technical planning passed dedicated independent review at exact head `625054ec78e6410e0fb6034ab0c8f60bbf110d08` with P0/P1/P2=`0/0/0`. Planning approval does not activate implementation: the sibling post-archive repair must first be implemented, independently audited, accepted and archived; a new integrated green base must preserve both parent-child projections; user implementation authorization remains a separate final gate.

## RKP-3 activation projection — 2026-09-04

RKP-2 is accepted and archived, and its clean integrated implementation head is
`6d0956c970f4414cb61e0f3d7148672a6e635032`. The parent has exactly one current
implementation child:
`.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/`.

RKP-3 planning is frozen at exact commit
`78660bb63e249f7bbfec848b9b19e16d7dc55c25`. The user replied `继续` to the
explicit RKP-3 implementation-activation question, authorizing only C0 through
C9 implementation and candidate freeze for the private Rust
transaction overlay, stable ordered forward/inverse ChangeSet, complete
store/index CommitPlan, exact 28 Core handlers, atomic batch, rejection zero
delta, and a stage-only native submit evidence seam. It adds no third-party
dependency and leaves TypeScript as default.

The child is now `status=in_progress`, `task_start_run=true`, and
`production_implementation_authorized=true`; C0 is complete and C1 strict
contracts/checked revision is next. Planning self-audit remains
P0/P1/P2=`0/0/0`. RKP-4, qualification, cutover, acceptance/archive, and push
remain false and require separate gates.
