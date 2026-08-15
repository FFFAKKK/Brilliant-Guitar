# Design — Core Rust Runtime Performance Remediation

## 1. Transition architecture

```text
React visual contributions
        |
TypeScript Extension Host / future public SDK
        |
TypeScript application compatibility facade
        |  small command/result DTOs only
Node-API adapter now / Tauri adapter later
        |
Rust KernelSession
  - contracts
  - indexed entity store
  - transaction overlay + ChangeSet
  - history/replay/events
  - incremental validation
  - frozen Rust extension assembly
```

The TypeScript facade preserves the accepted application entry points. It does not remain a second transaction owner. During RKP-1 through RKP-7, the legacy engine remains the product default and is used only as an offline behavioral oracle for the new engine. RKP-8 is the only default-engine switch. RKP-9 removes executable oracle code after qualification.

## 2. Rust crate boundaries

| Crate | Owns | Excludes |
|---|---|---|
| `brilliant-kernel-contracts` | Serde shapes for score, commands, results, errors, events, reports | runtime state, UI, file IO |
| `brilliant-kernel-runtime` | live store, indices, transactions, history, validation, replay | React, Tauri objects, physical IO |
| `brilliant-kernel-extension-sdk` | source-level manifest and provider traits | raw mutable store, runtime handles, dynamic loading |
| `brilliant-kernel-node` | native `KernelSession` handle and TS DTO conversion | business ownership, full-document command transfer |

The later Tauri host links the runtime crate directly. Node-API exists to preserve the current Node/TypeScript test and integration surface; it is not the public plugin runtime.

## 3. Runtime state model

The persisted ScoreDocument remains the canonical exchange representation. On load, Rust performs strict decode and builds a normalized live store:

- typed slot maps for Measure, Part, Staff, Voice, Event and Note;
- `EntityId -> RuntimeHandle` indices;
- parent/ownership secondary indices;
- per-Voice ordered musical-time indices;
- explicit sequence-order vectors so encode preserves accepted ordering;
- opaque ExtensionBlock payloads preserved losslessly.

`RuntimeHandle` includes slot and generation. Removal invalidates the old generation. Handles are process/session local and crate-private. Persisted ID and musical location therefore remain valid across compaction or reload while direct runtime access remains fast.

## 4. Transaction protocol

```text
strict decode
 -> route and indexed target resolution
 -> prepare typed forward ChangeSet
 -> stage affected records in TransactionOverlay
 -> Core affected-closure validation
 -> Rust provider validation/classification in frozen order
 -> atomic store/index adoption
 -> history cursor + dirty + event publication
```

The overlay copies affected records only. Rejection discards the overlay. On commit, inverse changes are derived from the pre-commit values and stored in reverse-safe order. Batch children share one overlay and become one revision/history/event unit.

No-op commands preserve current semantics: required semantic/module assessment still runs, while document version, history and commit event stay unchanged.

## 5. History and checkpoints

- one `Vec<HistoryEntry>` plus cursor;
- submit after undo truncates the tail;
- undo applies inverse changes in reverse order;
- redo applies forward changes in original order;
- preparers are skipped during undo/redo where the accepted contract uses stored effects;
- every 512 committed entries or 32 MiB accumulated ChangeSets, whichever occurs first, marks an in-memory checkpoint due;
- checkpoint work occurs after the interactive commit critical section;
- physical checkpoint files and crash recovery are Persistence responsibilities.

## 6. Validation dependency model

The affected closure starts at changed records and expands through owning Event, Voice, MeasureContent, Part and document-wide reference invariants. Each validator declares its required entity and reference scopes. Load, migration, unclassified changes and explicit parity checks use the full validator.

RKP-5 cannot accept an incremental validator until a test demonstrates equality with full validation for its owned change classes. Deterministic issue order remains the existing public order, never map iteration order.

## 7. Extension contracts

The Rust SDK exposes versioned source-level traits for manifest, command, effect, validator, classifier and migration providers. Providers receive read-only views and return typed data. Runtime handles and mutable storage are not SDK values. Provider assembly is constructed atomically and frozen for the ready session.

The existing CVN-2 TypeScript callback SDK remains a migration oracle and protected compatibility entry. Official providers move to Rust in RKP-6, RKP-8 removes TypeScript callbacks from the live Product Application Assembly, and RKP-9 may remove the legacy transaction engine/differential runner while retaining `src/core-kernel/module-sdk/index.ts`, its exact 8/34 exports and compile tests. Future public TypeScript plugins use the separate `@brilliant-guitar/extension-sdk` package through the Product Extension Host; React is optional for visual contributions. `../08-15-rkp-0-authority-contract-oracle-freeze/research/sdk-surface-migration-matrix.md` is the authoritative ownership/disposition table.

## 8. Rollout and rollback

- RKP-0 through RKP-7 leave TypeScript as the product default.
- Every stage is an independent task/branch/commit and can be reverted to the prior accepted stage.
- RKP-8 is a single default-engine cutover commit after complete behavioral and performance gates.
- Runtime dual-selection is not shipped.
- RKP-9 removes executable legacy transaction-engine/differential-oracle code in a separate revertible commit after Qualification V2. It does not implicitly delete or rename the accepted CVN-2 Module SDK surface.

## 9. Qualification relationship

The `b21540fa` official run is an invalid evidence input and a scalability diagnostic. RKP-0 records it; no partial results become qualification evidence. Qualification V2 retains the frozen representative/stress generators, seeds, counts and resource ceilings, adds the 60 FPS latency budgets and complexity counters, and freezes the public-call timed region plus nearest-rank P95/P99 algorithm. Liveness remains an evidence-validity guard, is calibrated independently by RKP-7, and takes precedence over any partial performance classification. Publication follows only one fresh complete run and independent technical review.
