# K1-6 Core Kernel Integration Gate

> **Status: AUDIT-REPAIR CANDIDATE / INDEPENDENT ACCEPTANCE PENDING（2026-07-22）.** Candidate `45398df4f0daf2134fcb142d2a74bac9511cf908` passes 8/8 focused and 169/169 full tests. K1-6 remains `in_progress`; it is not accepted or archived, Pure Core Kernel V1 is not formally closed, and Guitar Domain/product implementation remain unauthorized.

## Goal

Prove that the accepted K1-1 through K1-5 contracts operate as one deterministic, privacy-safe, regression-protected Pure Core Kernel V1. K1-6 is an integration and acceptance gate, not a feature-expansion block.

## Verified Inputs

- K1-1: `ScoreDocument`, exact musical values, strict codec, semantic/profile validation, diagnostics, and unknown `ExtensionBlock` preservation.
- K1-2: six semantic commands, atomic transactions, document versions, fine-grained history, undo/redo, and deterministic replay.
- K1-3: stable address/range, immutable snapshots, selectors, persisted checkpoints, dirty state, post-commit events, and handler isolation.
- K1-4: startup-only frozen Registry/Capability, approved command/selector contributions, gateways, and privacy-safe startup/access failures.
- K1-5: internal OO error families, public data-only `KernelIssue`/`KernelReport`, exhaustive adapters, validation reports, and detached current-schema migration.
- Repository evidence: the shared `test/core-kernel/fixtures/core-score.ts` fixture has one measure and remains unchanged; K1-6 therefore owns a separate four-measure fixture.
- Repository evidence: no accepted Guitar Domain implementation exists under `src/` or `test/`; Guitar Domain remains a future independent prerequisite and is excluded.

## Provisional Scope

- Build one canonical general four-measure score fixture that exercises the accepted schema without using retired tick/slot vocabulary.
- Prove one full successful flow across strict decode, semantic/profile validation, migration compatibility, Registry creation, CommandBus creation, command submit, snapshot/selectors, events, dirty checkpoint, undo/redo, replay, and issue/report projection.
- Prove representative atomic failure and unsupported flows without partial state, raw exception leakage, or nondeterministic output.
- Prove deep unknown extension preservation across codec, command/history, snapshot/read, migration, and replay paths.
- Prove public exports and runtime dependencies remain inside the accepted Pure Core Kernel boundary.
- Synchronize the active Core spec, parent roadmap, product REQ/SPEC status, and final acceptance evidence after independent review.

## Explicit Exclusions

- No new public runtime API, command, selector, event, report kind, Registry contribution kind, capability, schema version, or migration step unless an integration defect makes a contract change unavoidable and the work is replanned.
- No Guitar Domain fixture unless that independent domain has already been implemented and accepted before K1-6 implementation authorization.
- No physical `.bgp` packaging or file IO, Guitar Pro import, PDF/PNG export, UI, Tauri, rendering, layout, playback, network, Extension Host, or third-party plugin runtime.
- No retired tick/slot/RhythmSlot fixture, public patch API, mutable document access, clock, randomness, or generated identity.

## Requirements

- **K1-6-REQ-001 — Acceptance-only integration:** K1-6 must verify accepted K1-1 through K1-5 behavior and must not silently expand their public contracts.
- **K1-6-REQ-002 — Canonical fixture:** the integration fixture must be deterministic, semantic-valid, detached from callers, and include deep unknown extension payloads.
- **K1-6-REQ-003 — One trusted write path:** all score changes in the end-to-end flow must use the accepted semantic CommandBus or authorized K1-4 gateway; no alternate write path is allowed.
- **K1-6-REQ-004 — Read/write coherence:** snapshots, selectors, document versions, dirty state, history depth, and post-commit events must agree after submit, checkpoint, undo, and redo.
- **K1-6-REQ-005 — Replay coherence:** the accepted command sequence must replay to a deeply equal final document and the same deterministic version/result classifications.
- **K1-6-REQ-006 — Failure atomicity:** representative decode, semantic, command/history, read/checkpoint, event, Registry, report, and migration failures must preserve all relevant state and return stable privacy-safe data.
- **K1-6-REQ-007 — Unsupported separation:** semantic-valid but profile-unsupported score features must remain classifiable and must not be treated as corruption.
- **K1-6-REQ-008 — Compatibility preservation:** unknown extensions must remain deeply equal through every applicable integration path.
- **K1-6-REQ-009 — Boundary closure:** public API and dependency checks must prove that no UI, desktop, IO, rendering, audio, network, dynamic plugin, or internal mutation/history implementation leaks into Core.
- **K1-6-REQ-010 — Evidence and acceptance:** completion requires fresh static/build/full-test gates, deterministic repeat runs, active-document convergence, and a separate independent acceptance verdict.

## Acceptance Criteria

- [x] AC-K1-6-001: final PRD, design, and implementation plan were explicitly approved on 2026-07-21 before task start.
- [x] AC-K1-6-002: the canonical four-measure fixture passes strict decode, semantic validation, expected profile classification, encode/decode round-trip, and detached current-schema migration; successful deep mutation of caller-owned extension inputs cannot change decoded, parsed, or migrated outputs.
- [x] AC-K1-6-003: a representative authorized command sequence produces the expected documents, versions, history depths, snapshots, selectors, dirty transitions, and ordered events, including direct reads immediately after checkpoint and undo.
- [x] AC-K1-6-004: undo, redo, and replay converge on deeply equal documents while preserving deterministic results and unknown extensions.
- [x] AC-K1-6-005: representative invalid and unexpected-failure paths return closed failures/issues/reports, leak no raw exception or private data, and leave state unchanged; future schema rejection preserves the exact decode diagnostic code, path, details, and order.
- [x] AC-K1-6-006: semantic-valid unsupported features remain unsupported diagnostics rather than decode/semantic failures.
- [x] AC-K1-6-007: public export and forbidden dependency gates remain green with no new public contract unless separately approved.
- [x] AC-K1-6-008: Guitar Domain and all product/infrastructure exclusions remain absent unless their independent acceptance prerequisite is proven before implementation authorization.
- [x] AC-K1-6-009: `npm run typecheck`, `npm run build`, full `npm test`, deterministic integration repeats, `git diff --check`, and Trellis validation all pass in the approved environment.
- [x] AC-K1-6-010: active Core/parent/product documents record the final fixed baseline and no stale stage status; K1-6 is not marked accepted until a separate reviewer approves it.

## Approved Decisions

- [x] **DEC-K1-6-001 — Gate shape:** integration-test-and-documentation only; production code changes are permitted only as separately reviewed defect repairs.
- [x] **DEC-K1-6-002 — Fixture count:** one canonical four-measure fixture plus small focused negative clones; no large parallel fixture framework.
- [x] **DEC-K1-6-003 — Guitar prerequisite:** exclude Guitar Domain because no accepted implementation prerequisite exists; integrate it later through its own gate.
- [x] **DEC-K1-6-004 — Repeatability gate:** run the canonical end-to-end flow twice from fresh inputs and deeply compare the full observable trace.
- [x] **DEC-K1-6-005 — Defect handling:** stop and replan for any public-contract/schema change; private implementation defects require a focused repair plan and explicit implementation authorization.

## Notes

- This is a complex final gate and therefore requires `design.md` and `implement.md`; PRD-only planning is insufficient.
- Historical snapshots and archived K1-1 through K1-5 task records remain unchanged.
