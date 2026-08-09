# GD-0 Guitar Domain / Core Transaction Integration Contract

> **Status:** USER PLAN APPROVED / DOCUMENTATION REVIEW CANDIDATE / INDEPENDENT ACCEPTANCE PENDING
> **Planning base:** `064dc2bffe26022bc58f0690986b09a0c6a257aa`
> **Parent:** `.trellis/tasks/06-29-commercial-guitar-tablature-product/`
> **Created:** 2026-07-28

## Goal

Define the smallest additive Core V1.1 contract that lets official Guitar Domain commands participate in the existing Core transaction pipeline. A Guitar command must be able to update Core-owned notation and Part-owned Guitar data atomically while preserving the single document version, history, undo/redo, replay, dirty-state, event, validation, support-classification, and failure semantics already accepted for Pure Core Kernel V1.

GD-0 is a contract and architecture gate. It does not implement Guitar techniques, user interface, playback, physical file I/O, rendering, or a second command/history runtime.

## Context

- Pure Core Kernel V1 is closed. The independent qualification task was accepted and archived on 2026-07-28 with 169/169 tests passing, 25 covered contract groups, zero coverage gaps, zero reproducible bugs, and one nonblocking P3 specification gap.
- At the original GD-0 planning baseline, the accepted P3 disposition assigned descriptor-first, no-getter, no-throw public `unknown` guards to a separate Core V1.1 prerequisite, and the accepted runtime still exposed six built-in commands with Core-only semantic validation.
- Core VNext subsequently accepted and archived CVN-0 (the former CK1.1-0 guard prerequisite), CVN-1 (the behavior-preserving command/transaction/Registry spine), CVN-3, CVN-4, and the extensibility reservation gate. Those accepted prerequisites preserve the six-command Core V1 compatibility surface and do not themselves accept or implement the GD-0 integrated public contract.
- The approved Core-first roadmap maps the former CK1.1-1 authoring/assembly work to CVN-2, the generic integrated validation/runtime/replay work to CVN-6, and cross-module batch work to CVN-5. Guitar-owned GD-1/GD-3/GD-4 planning resumes only after the Core VNext CVN-7 qualification gate; the former generic GD-2 label creates no duplicate Core implementation task.
- The product contract requires Guitar data to remain in a Part-owned `GuitarExtension`; Guitar fields must not be added to Core `Note`, `Event`, or score metadata.

## Locked Product Decisions (Approved 2026-07-28)

The following decisions are already approved and are not reopened by GD-0:

1. **One transaction owner.** Guitar commands reuse the existing Core `CommandBus`; there is one document version, one history, and one undo/redo/replay/dirty/event pipeline.
2. **Startup-frozen official contributions.** Domain command contributions are compiled and frozen during startup. GD-0 does not add runtime register/unregister, unload, arbitrary callbacks, or third-party code execution.
3. **Dependency direction.** Core has zero imports from Guitar Domain. The seam is domain-neutral and additive; Guitar depends on the public Core V1.1 contract.
4. **Atomic fingering edit.** Setting a string/fret placement atomically updates the Core `WrittenPitch` and the Part-owned `GuitarExtension` placement in one committed command and one history entry.
5. **No inferred fingering.** A generic Core pitch edit never guesses a string/fret placement. If an existing placement would become inconsistent, the command must be rejected rather than committing contradictory Core and Guitar state; callers use a Guitar command to replace or clear the placement.
6. **Tuning model.** Schema uses an ordered, variable-length tuning array, string 1 from highest pitch through string N at the lowest pitch. The initial product profile supports standard six-string guitar only.
7. **Fret model.** Schema accepts nonnegative safe integers. Product profiles impose instrument limits such as 22 or 24 frets.
8. **Initial techniques.** The first technique scope is slide, bend, and vibrato only.
9. **Public hostile-input guards.** Public `unknown` guards use descriptor-first, no-getter, no-throw behavior.
10. **One public write port.** Core and installed official domain commands use the existing `CommandBus.submit(unknown)` and `KernelModuleGateway.submit(unknown)` entry points. The startup-frozen contribution catalog performs deterministic decode and dispatch; the product does not expose a separate Guitar command facade.
11. **Modular result and error contract.** Core-only construction retains the accepted Core `CommandResult` surface. Integrated construction uses the same submit method through a typed modular result envelope containing Core support plus deterministically ordered module support/issues. Domain codes are namespaced and owned by their contribution rather than enumerated in Core. A domain-neutral object-oriented error base and derived module errors produce deeply frozen public issue data; error instances, stacks, and internal state remain behind the boundary.
12. **Complete installed-domain validation.** Core semantic validation runs first for every changed candidate. Once Core is valid, every installed domain semantic validator runs in frozen catalog order and all returned semantic issues are collected. Core and all domain support classifiers run only after semantic validity is established. The same catalog and ordering apply to initialization, submit, undo, redo, and replay; no-op classifies the unchanged valid state without changing history or version.
13. **One committed fact per transaction.** Integrated submit/undo/redo publishes exactly one domain-neutral `core.document.committed` event for each committed transaction, followed only by the existing dirty-state event when dirty state changes. The committed event carries a namespaced command identity and the canonical union of Core/domain affected `ScoreAddress` facts. Core-only event contracts retain their accepted shape; integrated sessions use the additive modular event type.
14. **Known missing/incompatible-domain degradation.** Each known official extension requirement declares an exact, finite set of supported `ExtensionBlock.schemaVersion` values. A matching block whose required contribution is absent, or whose schema version is not exactly supported, opens in a detached, lossless read-only mode. Integrated reads expose the complete canonical write-availability and validation-completeness facts. If unavailable and incompatible facts coexist, submit, undo, redo, and each attempted replay command deterministically use the incompatible failure code while returning the full mixed fact list. Compatibility is resolved per block. For every applicable validation pass, an installed contribution with zero compatible blocks receives zero validator and classifier calls; one with at least one compatible block receives exactly one validator call over the canonical-owner-ordered filtered view. It receives exactly one classifier call over that same view only when all validators succeed and classification begins; semantic issues, throws, or contract violations produce zero classifier calls. An incompatible/future block reaches none of its handlers. Decode, encode, snapshot, selection, inspection, and opaque payload preservation remain available. Truly unknown opaque extensions retain the accepted Core V1 preservation behavior. No domain payload is stripped, guessed, downgraded, or implicitly migrated.

## Microkernel Product Principle

Brilliant Guitar is a microkernel-style modular application, not a monolithic score editor with Guitar cases embedded in Core.

- The kernel owns stable mechanisms: document state, transaction isolation, versioning, history, undo/redo, replay, checkpoints, dirty state, event sequencing, privacy-safe failure boundaries, and immutable contribution assembly.
- Domain modules own policy and semantics: Guitar command schemas, Guitar target/ownership rules, GuitarExtension interpretation, Guitar validation, Guitar support classification, and Guitar affected-entity facts.
- The composition root assembles trusted official modules into an immutable catalog before a session is created. Runtime mutation of the catalog is outside GD-0.
- Modules communicate only through versioned public contracts and detached data. They do not reach into another module's private state or Core's private history/effects.
- Adding another future notation domain should reuse the same domain-neutral seam rather than adding another switch statement, command bus, history stack, or domain import to Core.

## In Scope

GD-0 must define requirements and stable public contracts for:

- startup assembly of an immutable official domain command catalog;
- strict, deterministic dispatch of Core and installed Guitar command envelopes;
- domain-neutral command IDs and contribution ownership without a Core-to-Guitar dependency;
- atomic multi-effect transactions that can update Core-owned and extension-owned state in one history entry;
- deterministic forward/inverse effects sufficient for submit, undo, redo, and replay without whole-document history snapshots or public patch APIs;
- candidate validation that runs frozen Core semantic rules followed by every installed, schema-compatible domain validator before commit and publicly distinguishes complete from incomplete domain validation;
- separation of semantic invalidity from product-profile unsupported classification;
- stable, privacy-safe domain failures, diagnostics, support results, and reports;
- affected-entity derivation and post-commit events for installed domain commands;
- checkpoint, dirty-state, no-op, version-overflow, event-sequence, and handler-rejection behavior consistent with accepted Core V1 contracts;
- preservation of unknown and non-target extension subtrees across success, failure, undo, redo, persistence round-trip, and replay;
- exact-version compatibility behavior when a persisted document contains a known Guitar extension whose required contribution is absent or schema-incompatible;
- the exact accepted/future Core VNext prerequisite and regression surface required before CVN-2/CVN-6/CVN-5, CVN-7 qualification, and later Guitar-owned GD-1/GD-3/GD-4 work.

## Required Behavioral Contracts

### Atomicity

- One accepted Guitar command produces at most one committed transaction and exactly one history entry.
- All Core and Guitar effects commit together or none commit.
- Rejected and no-op commands leave document state, document version, history, redo depth, dirty state, checkpoint state, and event sequence unchanged.
- Undo and redo apply the complete inverse/forward effect set atomically and rerun all validation required by that entry.

### Determinism

- IDs, effect ordering, result classification, events, and replay must not depend on wall clock, randomness, object identity, mutable global profiles, property getters, or runtime registration order.
- Live submit and replay use the same immutable contribution catalog and the same decode, target, ownership, transaction, validation, and classification pipeline.
- Replay returns detached state and cannot replace the state of a live `CommandBus` wholesale.

### Ownership and Preservation

- Core notation remains Core-owned; Guitar-specific tuning, placement, and technique payloads remain under the owning Part's Guitar extension.
- A placement references a stable Core `noteId`; target resolution must prove the note belongs to the Part that owns the Guitar extension.
- A command may mutate only its declared targets. All unrelated Core subtrees, unrelated known extensions, and unknown extension blocks remain deeply equal.
- The integration seam must not expose mutable documents, internal history entries, internal effects, JSON Patch, JSON path, splice/index addressing, or whole-document replacement.

### Failure and Support Semantics

- Envelope, version, target, ownership, payload, contribution, internal-effect, validation, history, and replay failures are stable, typed, privacy-safe results; raw exceptions, source paths, internal effect data, and stack traces never cross the public boundary.
- Unexpected contribution exceptions or Promise-like returns from synchronous transaction hooks are isolated and converted to a stable failure while preserving the complete pre-call state.
- Domain-semantic invalidity is a hard rejection.
- Domain-semantic validity with product-profile unsupported content may commit and must return the complete unsupported classification.
- Missing or schema-incompatible required validators yield `validationAvailability.status: "incomplete"` with stable sorted facts. A Core-only validation report must never be presented as complete domain-semantic validity for that integrated document. Initial construction/explicit validation, changed candidates, undo, redo, and applicable replay passes use the same exact-count rule: zero compatible blocks means validator/classifier `0/0`; one or more compatible blocks means exactly one validator call, then exactly one classifier call only if every validator succeeds and classification begins. Semantic issues, throws, or contract violations mean classifier `0`. Read-only submit/undo/redo/first replay write stops at availability preflight with zero operation-phase validator/classifier/write-handler calls; excluded blocks reach no handler.
- Public inputs are decoded from `unknown` without executing getters or Proxy traps where the contract promises hostile-input safety.

### Compatibility

- Existing six Core commands retain their accepted public behavior and result classifications.
- Existing Core documents and replay sequences remain valid without installing Guitar Domain.
- A document containing an unknown, unavailable, schema-incompatible, or future-version domain extension remains decodable and round-trippable as opaque data under the established extension-preservation contract. Known unavailable/incompatible requirements additionally force lossless read-only mode and incomplete validation.
- No Core V1 accepted contract may be silently weakened. Any unavoidable incompatible change stops GD-0 and requires a separately approved migration plan.

## Out of Scope

- Implementing `GuitarExtension`, its codec, migration, validators, or profile (GD-1).
- Implementing the Core V1.1 seam in production code (CVN-2/CVN-6/CVN-5 under the current ownership map).
- Implementing slide, bend, vibrato, or other Guitar commands (GD-3).
- Seven-string, bass, alternate-tuning product profiles, chord diagrams, rhythm slashes, percussion notation, and Guitar Pro compatibility.
- UI/editor gestures, rendering/layout, playback/audio, collaboration, physical file I/O, autosave, and plugin marketplace behavior.
- Dynamic third-party contribution registration, hot reload/unload, remote handlers, scripting, or a generic public extension mutation API.

## Planning Deliverables

- `prd.md`: user-approved plan requirements, boundaries, decisions, and acceptance criteria for the documentation review candidate.
- `research/current-core-constraints.md`: evidence-backed inventory of the accepted Core contracts that GD-0 must extend.
- `design.md`: the chosen public submission/result contracts, contribution model, transaction/effect model, validation order, history/replay/events integration, compatibility rules, and alternatives rejected.
- `implement.md`: ordered implementation split and gates for the subsequent Core V1.1 and Guitar Domain tasks; GD-0 itself does not authorize production implementation.

## Acceptance Criteria

- [x] All product/API decisions have explicit user-approved resolutions and rejected alternatives are recorded.
- [x] `prd.md`, `design.md`, `implement.md`, and the research inventory agree on scope and terminology.
- [x] The design proves how one Guitar command atomically changes `WrittenPitch` and Part-owned Guitar data in one history entry.
- [x] The design proves Core retains zero Guitar imports and that startup contributions are immutable and deterministic.
- [x] Submit, no-op, reject, undo, redo, replay, checkpoint, dirty, event, support, diagnostic, overflow, and unexpected-failure paths each have defined state invariants.
- [x] Existing six Core commands and Core-only documents retain compatible behavior.
- [x] Unknown extensions plus unavailable, incompatible, and future-schema known-domain documents have an explicit exact-version preservation/compatibility contract.
- [x] Integrated write and validation availability expose stable public discriminants/facts, and incomplete domain validation cannot be represented as complete.
- [x] The minimum integrated factory, bus/gateway result, read-availability, and replay signatures/discriminants are fixed rather than illustrative.
- [x] Mixed unavailable/incompatible states have one deterministic failure-code priority and return the complete canonical fact list for submit, undo, redo, and replay.
- [x] Mixed compatible/incompatible blocks for one contribution use a filtered block-scoped validation/classification view, with zero incompatible-block handler calls and lossless payload preservation.
- [x] Compatible-block count and validator outcome determine exact `validate`/`classify` call counts for every applicable pass, including explicit zero-call failure and read-only-preflight branches.
- [x] The task-local two-layer gate compiles authoritative Markdown public-contract fences with a syntax/name-resolution-only prelude, then separately compiles drift assertions against the real accepted Core root for gateway discriminants, the Registry instance method, all typed selectors, shared bus methods, checkpoint results, and event subscription results.
- [x] The P3 hostile-input guard prerequisite is satisfied by accepted CVN-0 with focused regression evidence and remains mandatory for every later decoder.
- [x] The test plan covers atomic dual-owner mutation, rollback, deterministic replay, event ordering, validation failure, support classification, contribution absence, and extension preservation.
- [x] Core V1.1 seam work, official module SDK, GuitarExtension foundation, Guitar commands, and Guitar integration gate are split into independently reviewable tasks with clear ordering.
- [x] The accepted Core-first ownership map is synchronized without changing the six GD-0 public-contract fences: CK1.1-0 → CVN-0, CK1.1-1 → CVN-2, generic GD-2 foundation/runtime/batch → CVN-1/CVN-6/CVN-5, and Guitar-owned GD-1/GD-3/GD-4 → post-CVN-7 replanning.
- [x] Trellis task validation and `git diff --check` pass.
- [x] The user reviewed and approved the final three planning documents on 2026-07-28 before task activation or production-code work.

## Gate

The user approved the GD-0 plan on 2026-07-28. The present repository state is only **USER PLAN APPROVED / DOCUMENTATION REVIEW CANDIDATE / INDEPENDENT ACCEPTANCE PENDING**. This reconciliation pass synchronizes the accepted Core VNext ownership map and stops for independent review. It records no accepted GD-0 baseline, performs no archive, and does not create or activate CVN-2, CVN-5, CVN-6, CVN-7, GD-1, GD-3, GD-4, or a replacement generic GD-2 task. A later governance action may record acceptance and archive only after the independent review passes; production `src/**`/`test/**` work remains separately gated.
