# Implementation Plan — Core Rust Runtime Performance Remediation

## Global operating rule

Only one implementation child may be active. Each child is planned, independently reviewed, implemented by an operator, independently audited, accepted and archived before the planner creates the next child.

## Stage 0 — RKP-0 Authority Contract and Oracle Freeze

**Entry:** this parent planning candidate passes independent review.

**Deliver:** the exact failed-measurement ledger, transition authority, behavior oracle schema/corpus, complexity counters, performance Qualification V2 contract and durable RKP stage map. Production `src/**` remains unchanged.

**Exit:** RKP-0 implementation review passes P0/P1/P2=`0/0/0`; deterministic oracle regeneration and the full TypeScript baseline pass; task is accepted/archived.

**Rollback:** revert the RKP-0 docs/test-only commit; `b21540fa` remains the unchanged runtime baseline.

## Stage 1 — Rust workspace, contract crate and Node-API smoke

Create only after RKP-0 archive. Pin the Rust toolchain, create the four-crate workspace, encode/decode the accepted DTOs, and prove one native session create/read smoke path. TypeScript remains default.

## Stage 2 — Indexed entity store

Create only after RKP-1 archive. Implement strict ScoreDocument import/export, typed generational handles, ID/ownership/time indices and deterministic round-trip. No command cutover.

## Stage 3 — Transaction overlay and ChangeSet engine

Create only after RKP-2 archive. Port ordered effects, atomic batch adoption, inverse derivation, rejection zero delta and complexity counters. TypeScript remains default.

## Stage 4 — History, snapshots, events and replay

Create only after RKP-3 archive. Implement vector+cursor history, undo/redo, checkpoints, cached projections, dirty state, event sequence and semantic replay parity.

## Stage 5 — Incremental validation and Rust Extension SDK

Create only after RKP-4 archive. Implement dependency closures, full-validation parity checks, profile/compatibility and versioned source-built provider traits.

## Stage 6 — Official module migration

Create only after RKP-5 archive. Port the accepted official-module behavior and both CVN-6 synthetic modules to Rust providers, retaining deterministic assembly, caps, migration and failure semantics.

## Stage 7 — Complete differential gate

Create only after RKP-6 archive. Run all existing tests and the frozen oracle against both engines, add seeded long-sequence differential tests, and meet the 60 FPS/scale gates with TypeScript still default.

## Stage 8 — Production default cutover

Create only after RKP-7 archive. Switch the application facade to Rust in one isolated commit, retain no runtime selector, and run complete compatibility/resource/performance regression.

## Stage 9 — Qualification V2 and oracle cleanup

Create only after RKP-8 archive. Run one fresh official qualification, complete independent review, then remove the executable legacy TypeScript transaction engine and differential runner in a separate commit while retaining the golden corpus. Keep `src/core-kernel/module-sdk/index.ts`, its exact 8/34 export/ABI tests and compatibility fixtures; changing that surface requires a separate deprecation plan.

## Parent planning validation

```powershell
python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation
python .\.trellis\scripts\task.py validate 08-15-rkp-0-authority-contract-oracle-freeze
python .\.trellis\scripts\task.py validate 07-29-core-vnext-product-ready-extensible-kernel-completion
python .\.trellis\scripts\task.py validate 06-29-commercial-guitar-tablature-product
python .\.trellis\scripts\task.py validate 08-11-post-core-official-plugin-product-roadmap
git diff --check
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
```

Also verify JSON/JSONL parse, unique parent/child references, `status=planning`, authorization flags false, and zero relative delta under production/test/build-config paths.

## RKP-0 active-child projection — 2026-08-15

Only `08-15-rkp-0-authority-contract-oracle-freeze` is active. Its implementation candidate is docs/test-only authority work pending an independent implementation audit; the coordination parent remains `planning`, its task start and production authorization remain false, and no successor child may be created from this update.
