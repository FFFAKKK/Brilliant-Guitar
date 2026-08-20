# Core Rust Runtime Performance Remediation

> **Current architecture authority:** This parent consumes accepted Architecture Reset V2 at `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/design.md` (`e81c739b...`, audit `01a01da3...`, PASS, 34/34). The authority-sync candidate is `.trellis/tasks/08-20-brilliant-guitar-architecture-reset-v2-authority-sync`; RKP-1 remains uncreated until that sync is independently audited and accepted.

## Goal

Replace the current TypeScript transaction implementation with a staged Rust runtime that preserves accepted Core behavior while removing the full-document work that made the frozen CVN-7 stress workload infeasible. The migration must remain reversible at every accepted stage and must keep exactly one implementation child active.

## Background

- Planning base: `b21540fa3636e6c8e827ff24c2099f4ff331285d`.
- The latest official CVN-7 input completed 410 of 411 worker results and timed out in `stress-submit` after the frozen three-hour liveness limit. It produced no publishable partial evidence and remains `EVIDENCE_INVALID`, not a qualification pass or a Core performance verdict.
- The live TypeScript implementation performs nested document scans in `commands/target-resolver.ts`, clones the full document in `commands/effects.ts`, copies growing history arrays in `commands/runtime.ts`, and rebuilds detached full-document/module validation views in `commands/integrated-runtime.ts`.
- The accepted V2 authority separates Core Platform, Product Host and Product Extension Host. This task changes the Core runtime language and internal state model, not the Product ApplicationAssembly, Product Extension Host or public-plugin sequence.

## Requirements

### RUST-R001 — Preserve accepted application contracts

The migration shall preserve `brilliant-score-1`, all 28 Core command IDs, the accepted application runtime surface, command results, failures, issue/fact ordering, snapshots, events, registry behavior, migration behavior, undo/redo/replay semantics, resource caps and rejection zero-delta guarantees. Internal implementation shape may change completely.

### RUST-R002 — Rust owns the live transaction runtime

The accepted end state shall have one `brilliant-kernel-runtime` owner for live entity state, indices, transaction overlay, forward/inverse ChangeSets, history cursor, dirty state, replay and incremental validation, and one `brilliant-kernel-session` owner for use cases, 28 handlers, the ExtensionTransactionGateway and `KernelSessionComposition`. The released product shall have one runtime engine rather than a permanent TypeScript/Rust selector.

### RUST-R003 — Stable identity, runtime handle and musical location remain separate

- persisted `EntityId` remains stable across save/load and migration;
- a typed generational runtime handle provides session-local indexed access and stale-reference rejection;
- musical time/location provides ordered and range lookup;
- runtime handles never enter `brilliant-score-1`, public events or plugin contracts.

Exact entity lookup shall be average O(1). Ordered time queries shall be O(log n + k).

### RUST-R004 — Local edits avoid full-document work

One local edit shall resolve through indices, stage only affected records in a transaction overlay, validate the affected closure and commit once. The ordinary edit path shall record zero full-document scans, zero full-document clones, zero full semantic validations and zero full snapshot materializations.

### RUST-R005 — History uses a reversible change chain

History shall use one append-oriented vector plus a cursor, ordered forward/inverse ChangeSets and bounded in-memory checkpoints. Physical journal files and crash recovery remain owned by the later Persistence module.

### RUST-R006 — Incremental validation remains provably equivalent

Every incremental validator shall declare its dependency scope. Test/debug comparison shall prove that incremental diagnostics equal the accepted full validator. Unknown change classes fall back to full validation until assigned an accepted dependency closure.

### RUST-R007 — Extension Protocol and product extension surfaces remain distinct

- `brilliant-extension-protocol` owns the shared versioned Instrument Plugin and contribution protocol; Guitar, Piano, Bass and third-party Instrument Plugins are equal protocol consumers;
- no Guitar Domain or official Instrument Plugin receives a Rust privileged provider API;
- public functional plugins use a future TypeScript Extension SDK;
- visual contributions and public functional plugins enter through the Product Extension Host;
- all writes remain semantic commands, and mutable runtime storage stays private.

The accepted CVN-2 callback API becomes migration-oracle input; it is not the future public third-party plugin SDK. Its exact eight runtime names, thirty-four type names and nine contribution ABI fields remain a protected compatibility surface after RKP-9 until a separately accepted deprecation task. RKP-8 removes it from the Product ApplicationAssembly rather than deleting or renaming it. The authoritative three-surface disposition is `.trellis/tasks/archive/2026-08/08-15-rkp-0-authority-contract-oracle-freeze/research/sdk-surface-migration-matrix.md`.

### RUST-R008 — One implementation child at a time

The ordered stages are RKP-0 through RKP-9. Only RKP-0 is created by this planning candidate. RKP-1 must consume the accepted V2 authority and may be created only after this authority sync passes independent audit/acceptance and the current predecessor gate is satisfied. A later child may be created only after the current child passes independent implementation review and is accepted/archived.

### RUST-R009 — Responsibilities are separated

- planner: task/branch/worktree creation, planning artifacts, authority pointers, review routing and dependency state;
- operator: implementation of one accepted child allowlist;
- independent auditor: read-only planning or implementation verdict in a separate session;
- bounded repair returns to the same owning stage; later stages remain inactive.

### RUST-R010 — 60 FPS Core performance target

On the frozen Windows x64 reference environment, release-build end-to-end measurements including the TypeScript/native boundary shall meet:

| Operation | Blocking target |
|---|---:|
| representative submit/undo/redo | p95 <= 8 ms, p99 <= 16 ms |
| one edit on the 102,400-Event fixture | p95 <= 16 ms, p99 <= 33 ms |
| cached selector/read | p95 <= 1 ms |
| batch-100 | p95 <= 100 ms |
| replay-100 | p95 <= 500 ms |
| one complete stress 10,000 submit sequence | <= 180 s |
| one complete stress 10,000 replay sequence | <= 180 s |
| representative peak RSS | <= 1 GiB |
| stress peak RSS | <= 2 GiB |

Performance budgets are qualification gates. Process-liveness timeouts remain evidence-validity guards and are calibrated separately. Qualification V2 uses twenty fresh-process measured samples after five fresh-process warmups for representative, 102,400-Event, cached, batch-100 and replay-100 operations. Nearest-rank percentile index is `ceil(p * n) - 1`, therefore P95=`sorted[18]` and P99=`sorted[19]` for `n=20`; non-finite/non-positive values invalidate evidence. Stress targets use one complete deterministic sequence per operation. The exact timed region, RSS sampling and liveness precedence are frozen by RKP-0 and may not be selected later by RKP-7.

## Stage Map

| Stage | Deliverable | Created now |
|---|---|---:|
| RKP-0 | authority, failure ledger, oracle and performance-contract freeze | yes |
| RKP-1 | seven-crate Rust workspace, contracts and Node-API smoke, consuming V2 | no |
| RKP-2 | indexed Rust entity store | no |
| RKP-3 | transaction overlay and ChangeSet engine | no |
| RKP-4 | history, snapshots, events and replay | no |
| RKP-5 | incremental validation, Extension Protocol and deterministic preparation | no |
| RKP-6 | Kernel Session composition, official/synthetic protocol consumers and migration | no |
| RKP-7 | complete TypeScript/Rust behavioral differential gate | no |
| RKP-8 | one-commit production default cutover | no |
| RKP-9 | Qualification V2 and executable TypeScript transaction-oracle cleanup; CVN-2 SDK surface retained | no |

## Out of Scope

- Guitar Domain behavior, Persistence implementation, Layout, Renderer, Playback and Export;
- Product Host, Desktop Shell, Workbench, Editor Session and Product ApplicationAssembly;
- public Extension Host implementation, plugin discovery and installation;
- dynamic native libraries, WASM plugin ABI and hot reload;
- a new `.bgp` physical format or file-backed history;
- CVN-7 evidence publication before the Rust remediation sequence reaches its qualification gate.

## Acceptance Criteria

- [ ] `RUST-AC001`: the parent and RKP-0 tasks are complete planning artifacts; future implementation children remain uncreated.
- [ ] `RUST-AC002`: the task and all children remain `planning`, with `task_start_run=false` and `production_implementation_authorized=false`.
- [ ] `RUST-AC003`: planning defines exact stage ownership, entry/exit gates and rollback points so an operator does not choose the stage sequence.
- [ ] `RUST-AC004`: application compatibility, the CVN-2 migration exception and the Rust/TypeScript/React extension split are explicit.
- [ ] `RUST-AC005`: the performance and complexity gates are measurable and distinguish latency budgets from worker liveness.
- [ ] `RUST-AC006`: relative to `b21540fa`, `src/**`, `test/**`, `package*.json`, `tsconfig.json`, Cargo files and post-Core roadmap files have zero planning-candidate delta.
- [ ] `RUST-AC007`: Trellis, JSON/JSONL, parent-child uniqueness, diff check, typecheck, build and the current 531-test baseline pass.
- [ ] `RUST-AC008`: an independent planning auditor returns P0/P1/P2=`0/0/0` before RKP-0 is handed to an operator.
- [ ] `RUST-AC009`: the exact 64-row scenario matrix, exact CVN-2 SDK names, strict Qualification V2 percentile method and closed RKP-0 path allowlist leave no fixture/method/SDK disposition choice to a later operator.
