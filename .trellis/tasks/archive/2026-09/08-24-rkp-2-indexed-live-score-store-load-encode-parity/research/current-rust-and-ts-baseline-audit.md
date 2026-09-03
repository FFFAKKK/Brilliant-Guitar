# Current Rust and TypeScript Baseline Audit

## Repository state at planning base

- Branch base: `063b332dd48c05796fb3450a8004f42ff2148b20`.
- RKP-1 audited production: `94387b339b5e4d9ce6b7f97597a1b56edd051f01`.
- RKP-1 archived task: `.trellis/tasks/archive/2026-08/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/`.
- Seven crates exist: Core Types, Score Foundation, Extension Protocol, Kernel Contracts, Kernel Runtime, Kernel Session and Kernel Node.
- Rust toolchain contract: 1.97.1; MSRV 1.88.0; Edition 2024; resolver 3.
- Rust runtime is non-default and exposes only the private native create/read smoke through exactly two Node free functions.

## Current Rust representation

`brilliant-score-foundation` owns a strict `ScoreDocumentV1` DTO and canonical JSON serializer. Its validator already checks a useful structural subset, but it omits document ID from global uniqueness and does not yet cover the complete TypeScript semantic set.

`brilliant-kernel-runtime::SmokeRuntime` stores a complete `ScoreDocumentV1` plus revision zero. Every read clones that complete DTO. `brilliant-kernel-session` wraps it and performs only API/schema checks before creation. There is no indexed record store, typed generational key, ownership/time/extension/reference index or rebuild parity path.

## Current TypeScript truth

The TypeScript model preserves:

- document/measure/part/staff/voice/event/note stable IDs;
- Event-owned duration and Voice-sequence-derived start;
- score/Part ExtensionBlock owners;
- strict semantic validation and canonical issue order;
- 28 Core commands, current snapshot/history/event semantics and TypeScript default execution.

The write target resolver still walks nested arrays. The read subsystem has a snapshot entity index, but the write engine does not consume it. Whole-document clone and repeated full semantic work remain the measured hot-path problem that RKP-3/RKP-5 address after RKP-2 supplies correct storage primitives.

## Frozen compatibility facts

- persisted schema: `brilliant-score-1`;
- application runtime exports: 51;
- Module SDK: 8 runtime / 34 type exports;
- contribution ABI: 9 fields;
- Core commands: 28;
- native stable failures: 22;
- private Node runtime exports: 2;
- bridge caps: 64 MiB request/response, depth 64, properties 1,048,576, JavaScript safe integer domain.

RKP-2 changes none of these counts or shapes.

## Fixture/evidence inventory

- RKP-0 oracle authority and 64-row corpus are archived under `.trellis/tasks/archive/2026-08/08-15-rkp-0-authority-contract-oracle-freeze/`.
- Native/TypeScript bridge tests live under `test/core-kernel/rust-migration/`.
- Representative and stress score generators live in `test/core-kernel/fixtures/cvn-7-qualification-score.ts`.
- Stress scale is 102,400 Events / 51,200 Notes. It is diagnostic for RKP-2 load/export linearity; it is not an RKP-2 product latency budget.

## Current baseline caveat

After native RKP-1 archive, the existing `rkp-1-workspace-contracts` test reproduces two known failures: a long-worktree Git path and a path that native archive moved. A dedicated post-archive repair planning line exists at `f7fecdcf...` and has received targeted planning PASS, but implementation/acceptance/archive are pending.

Therefore:

- RKP-2 docs planning is valid on `063b332d`;
- this planning line may reproduce the known focused failure and records it without claiming green;
- RKP-2 production activation requires the accepted repair and a fully green final implementation baseline.

## Required architectural correction

RKP-2 removes only the live whole-DTO holder. It does not port commands or claim edit performance. Its proof is:

```text
strict valid DTO
→ atomic indexed LiveScoreStore
→ deterministic rebuilt indices
→ detached equal DTO
→ canonical byte parity
```

That proof is the stable substrate required before TransactionOverlay/ChangeSet work begins in RKP-3.
