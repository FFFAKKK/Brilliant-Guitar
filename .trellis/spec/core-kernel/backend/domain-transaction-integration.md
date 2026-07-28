# Core V1.1 Domain Transaction Integration Contract

> **Status:** GD-0 documentation contract approved on 2026-07-28; production implementation is not active.
> **Authority:** `.trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/`
> **Compatibility base:** Pure Core Kernel V1 accepted at `d92a7586536ac8757c318ae6f75aabd8698f85ac`.

## Scope

This specification defines the additive, domain-neutral seam through which trusted official notation domains may join the existing Core transaction pipeline. It does not implement Guitar data, Guitar commands, third-party plugins, runtime registration, UI, rendering, playback, or physical file I/O.

Core-only construction and all accepted K1-1 through K1-6 behavior remain unchanged. The integrated product path is implemented only by separately approved Core V1.1 and Guitar Domain tasks.

## Fixed Decisions

1. **One write port:** Core and installed official-domain commands use `CommandBus.submit(unknown)` and `KernelModuleGateway.submit(unknown)`.
2. **Modular results:** integrated construction adds a typed, data-only result envelope containing the accepted Core result plus deterministically ordered module assessments/issues. Core does not enumerate domain-owned codes.
3. **Complete validation:** Core semantics run first; every installed domain validator then runs in frozen catalog order. Support classification starts only after the complete candidate is semantically valid.
4. **One committed fact:** each committed submit/undo/redo publishes exactly one domain-neutral `core.document.committed`, followed only by the existing dirty event when dirty changes.
5. **Lossless missing-domain mode:** a known official extension whose compatibility declaration requires an unavailable contribution opens as a detached, lossless read-only integrated session. Unknown opaque extensions retain Core V1 preservation behavior and do not automatically block writes.

## Dependency and Ownership Boundary

```text
Product composition root
  -> Core V1.1 integrated construction
      -> frozen official contribution catalog
          -> official domain modules

Official domain module -> public Core data / official module SDK
Core Kernel            -> zero imports from Guitar Domain
```

- `ScoreDocument` remains the only document truth.
- Core owns notation, transaction isolation, document version, history, undo/redo, replay, checkpoint/dirty state, event sequencing, and contribution assembly.
- A domain owns its extension schema, strict decoder, semantic validator, support classifier, command payloads, effect payloads, diagnostics, and affected-address facts.
- Guitar tuning, string/fret placement, and techniques remain in a Part-owned `GuitarExtension`; no Guitar field is added to Core `Note`, `Event`, metadata, or history contracts.
- No module receives a mutable document, active bus, internal history/effect, registry internals, subscriber list, clock, randomness, filesystem, network, or platform API through this ABI.

## Construction and Catalog

- `CommandBus.create(initialDocument)` and `replayCoreCommands()` retain their accepted Core V1 types and behavior.
- An additive integrated constructor binds one existing bus implementation to one immutable compiled assembly. It is not a second bus, state store, history stack, replay owner, or event system.
- The product composition root supplies statically linked official compiled entries beside a strict startup manifest. The manifest contains data only and never carries functions, paths, URLs, scripts, or dynamic imports.
- The additive registration entry is `kernel.domain-commands.v1`. It reuses approved command/read/event capabilities and adds explicit namespace ownership; it does not create a generic document-mutation capability.
- Catalog construction is all-or-nothing and validates identities, API versions, trust/runtime, capabilities, descriptor/binding parity, command IDs, effect kinds, namespace ownership, profiles, and compatibility declarations.
- The successful catalog and every nested public data object are detached and deeply frozen. Ready catalogs have no register, unregister, replace, version, or change-event API.
- Integrated registry, gateway, bus, and replay must share one private assembly identity. Cross-assembly or Core-only/integrated pairing rejects before exposing a session.

## Submission and Transaction Pipeline

For live submit and integrated replay, routing and execution are identical:

1. Read the top-level command identity from exact own enumerable data descriptors.
2. Resolve exactly one frozen command definition by namespaced ID and version.
3. Strictly decode, detach, and freeze the complete target and payload.
4. Resolve stable targets and prove ownership.
5. Prepare a nonempty private effect set and affected `ScoreAddress` facts.
6. Derive fine-grained inverse effects from the current isolated candidate.
7. Apply every effect to one isolated candidate; any failure discards it.
8. Detect no-op before changing visible state.
9. Run Core semantics, all installed domain semantics, Core profile, then all domain profiles.
10. Validate/canonicalize event facts and reserve event sequences.
11. Adopt document, version, history, dirty/read state, and event state once.
12. Publish one committed event and the optional dirty event; subscriber failures remain isolated.

Rejected and no-op operations leave document state, version, history, redo depth, checkpoint/dirty identity, write availability, and event sequence unchanged. Unsupported profile results may commit; semantic invalidity never commits.

## Private Effect and History Boundary

- The existing private single mutation becomes a private nonempty effect set only inside the integrated implementation.
- Existing Core commands remain one-effect transactions and retain their public behavior.
- The first domain-to-Core request surface is limited to the Core-owned `WrittenPitch` replacement required by Guitar placement.
- Module effects may replace only an extension namespace and owner declared by their compiled contribution. They are strict, versioned internal data—not JSON Patch, JSON path, splice, callback, or whole-document replacement.
- One semantic command creates one history entry with its frozen semantic command, command/contribution identity, fine-grained forward and reverse-ordered inverse effects, and frozen affected-address facts.
- History stores no whole-document snapshot, timestamp, random ID, mutable handler, raw error, path, registry object, or public patch.
- Undo and redo apply the complete inverse/forward set to an isolated candidate and rerun the full validation/classification/fact pipeline before moving history entries.

## Results, Issues, and Failures

- Core-only results and codes remain unchanged.
- Integrated results add deterministically ordered module assessments. Order is Core first, then module catalog order, then validator-return order.
- Domain codes are namespace-qualified and owned by the contribution; they are not added to the closed Core V1 `KernelIssueCode` union.
- Stable mechanism failures cover required contribution unavailable, domain semantic invalidity, contribution contract violation, internal contribution failure, and assembly mismatch.
- Public results contain deeply frozen allowlisted data only. Error instances, stacks, handler identity, internal effects, document payloads, tokens, and local paths never cross the boundary.
- The official module authoring SDK is a separately reviewed entry point. Its narrow error base converts domain errors to frozen issue data; application-facing Core exports no error classes or internal builders.

## Read, Replay, and Compatibility

- Integrated reads add a frozen write-availability value: `writable` or `read-only` with sorted, deduplicated missing namespace/module/contribution facts.
- Read-only sessions retain decode, encode, snapshot, selection, inspection, checkpoint bookkeeping, and exact opaque payload preservation. Submit, undo, and redo reject before processing.
- Truly unknown ExtensionBlocks remain writable under accepted Core V1 semantics unless an immutable known compatibility declaration says that a contribution is required.
- Integrated replay consumes semantic command envelopes only and uses the same frozen assembly and execution pipeline as live submit. It returns detached results and final document; internal effects, undo/redo logs, events, and history snapshots are not replay input.
- Unknown and non-target extension subtrees remain deeply equal through success, rejection, no-op, undo, redo, replay, missing-domain degradation, and codec round-trip.

## Event Contract

- Core-only event types and shapes remain unchanged.
- Integrated sessions use an additive modular event type while preserving the event names and ordering accepted by K1-3.
- The committed fact carries a namespaced command identity and the canonical, deduplicated union of Core/domain affected `ScoreAddress` facts.
- Submit and redo use forward facts; undo uses the same stable entity identities with cause `undo`.
- Event construction and sequence reservation remain pre-commit atomic. Synchronous throws and asynchronous subscriber rejection cannot roll back a commit or stop later subscribers.

## Hostile Input and Determinism

- Every public `unknown` guard/decoder used by the seam is descriptor-first, no-getter, and no-throw.
- Accessors, hostile Proxies, invalid prototypes, extra fields, sparse arrays, cycles, Promise-like synchronous hooks, and mutable caller aliases reject with stable data-only failures.
- IDs, effect order, validation order, classification, events, results, and replay never depend on wall clock, randomness, object identity, object enumeration, registration timing, or mutable global profiles.
- The accepted guard behavior is implemented first by CK1.1-0; the module SDK follows in CK1.1-1. This document does not authorize either implementation.

## Downstream Gates

Implementation order is fixed and independently reviewed:

1. CK1.1-0 hostile-input guard prerequisite.
2. CK1.1-1 official module-SDK contract foundation.
3. GD-1 GuitarExtension foundation and validation/profile, without commands.
4. GD-2 generic Core V1.1 domain-command seam, using a neutral synthetic test contribution.
5. GD-3 Guitar semantic commands for placement, slide, bend, and vibrato.
6. GD-4 Core/Guitar integration and compatibility gate.

Any requirement for a Core-to-Guitar import, second transaction/history/event owner, public patch API, runtime registration/unload, whole-document history snapshot, persisted Core schema change, or UI/render/playback/physical-I/O behavior stops the active downstream task and returns it to planning.
