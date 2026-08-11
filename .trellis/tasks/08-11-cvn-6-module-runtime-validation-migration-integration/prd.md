# CVN-6 Module Runtime, Validation and Migration Integration

## Goal

Bind the accepted and archived CVN-2 `KernelIntegratedCatalog` to the existing CVN-1 CommandBus, Registry gateway, replay, session, history, dirty-state and event owners. Complete the official-module V1 runtime lifecycle for deterministic command execution, exact schema compatibility, complete/incomplete validation availability, module diagnostics, profile classification and detached extension migration without creating a second transaction owner or absorbing post-Core product work.

## Planning Authority and Current State

- Planning branch: `codex/cvn-6-unified-planning-base`.
- Planning worktree: `.worktrees/cvn-6-unified-planning-base`.
- Unified planning base: `050af1eed067300f2e2fb0339eff6f2430e43b36`.
- Required ancestors:
  - accepted/archived CVN-2 line: `302dafe451bd4e10f4978d3076e367473b2fa3ae`;
  - post-Core official-plugin/product roadmap: `c68fcc648051b51b73fda3e5bda6eb9e33298f39`.
- Primary contracts: `CVN-FC-112`, `CVN-FC-120`, `CVN-FC-121`, `CVN-FC-122`.
- Accepted dependencies: CVN-1, CVN-2, Extensibility Reservation and GD-0.
- CVN-3 and final CVN-4 provide accepted structural regression fixtures only.
- Current lifecycle state is `planning`; `task_start_run=false`; `production_implementation_authorized=false`.

## Requirements

### CVN6-R001 — Core-only compatibility

Existing Core-only `CommandBus.create`, `createKernelRegistry(manifest)`, Core gateway overloads, `replayCoreCommands`, `KernelEvent`, `CommandResult`, migration entry, snapshot, checkpoint and report behavior retain their accepted signatures, discriminants, ordering and failure precedence. The current application root runtime-export baseline is 49.

### CVN6-R002 — Frozen CVN-2 input

CVN-2 remains the sole owner of `CVN-FC-110/111`. CVN-6 consumes its immutable catalog, private catalog state accessor, nine-field `CompiledDomainCommandContributionV1` ABI and accepted callbacks. The SDK export allowlist remains exactly 8 runtime exports and 34 type exports. CVN-6 adds no registration field, second contribution entry or ready-state lifecycle API.

### CVN6-R003 — One assembly-bound runtime

Integrated Registry, CommandBus, module gateway and replay derive the same process-local private `assemblyIdentity` from one authentic `KernelIntegratedCatalog`. A different authentic assembly, Core-only/integrated mode mismatch or structurally forged handle is rejected deterministically before a gateway or writable session becomes observable.

### CVN6-R004 — Restricted module authority

Module callbacks receive detached and deeply frozen Core read data plus only the exact-compatible blocks owned by their contribution. Command preparation produces bounded forward-effect requests through the accepted restricted effect surface. Callbacks receive no mutable document, bus, Registry state, session state, history, subscriber list, clock, randomness, path, platform API or internal effect object.

### CVN6-R005 — Effect ownership and inverse authority

The first module-to-Core request is only Core-owned `WrittenPitch` replacement. A module-owned effect may replace or remove only an `ExtensionBlock` whose namespace and score/Part owner are declared by that same contribution. Effects are applied in request order to one isolated candidate. Core or the accepted owned-effect definition derives each inverse from the candidate value at that step; history stores inverses in reverse order. Module-supplied inverse, generic JSON patch/path and whole-document replacement remain outside the V1 contract.

### CVN6-R006 — Ten-stage changed-candidate pipeline

After the shared write-availability preflight, a writable submit executes exactly:

1. strict route, version, target, payload and ownership decoding;
2. ordered forward-effect preparation and bound checks;
3. clone-once application to one isolated candidate with inverse derivation;
4. Core semantic validation;
5. compatibility and availability recomputation;
6. exact-compatible module validators in frozen catalog order;
7. Core feature profile;
8. module classifiers in frozen catalog order;
9. canonical assessments, issues, facts, affected addresses and event facts;
10. one adoption through the existing CVN-1 session/history/dirty/event owner.

### CVN6-R007 — Compatibility and availability

Compatibility is exact per persisted block and never uses ranges, latest-version guessing or implicit migration:

- known block + exact supported version + contribution present: fully participates;
- known block + exact supported version + contribution absent: `required-contribution-unavailable`, lossless read-only and validation incomplete;
- known block + future/unlisted version: `required-contribution-incompatible`, lossless read-only and validation incomplete;
- mixed unavailable/incompatible facts: the write failure code is incompatible and the result carries the complete mixed canonical facts;
- unknown undeclared opaque block: Core V1 lossless preservation remains writable and makes no installed-domain validation claim.

Submit, undo, redo and each replay write share the same cached availability preflight before command decoding or empty-history resolution. Empty replay is the only zero-write replay path and may succeed unchanged.

### CVN6-R008 — Validator, classifier and diagnostic behavior

- A contribution with zero compatible blocks receives validator/classifier calls `0/0`.
- A contribution with one or more compatible blocks receives one validator call over the canonical filtered view and, after all validators succeed, one classifier call over that identical view.
- Semantic issues continue through later applicable validators for deterministic aggregation; all classifiers remain at zero.
- A thrown value, Promise-like return or malformed callback result stops later callbacks and maps to the owning contribution's stable contract/internal failure.
- Classifier `unsupported` is an assessment and may commit; classifier contract/internal failure rejects atomically.
- No-op still completes semantic validation and classification but changes no document, version, history, dirty state or event sequence.

### CVN6-R009 — Existing owner for submit, undo, redo, replay and events

Integrated execution reuses the existing CVN-1 runtime and state owner. Undo/redo apply stored inverse/forward effects to an isolated candidate and rerun semantic, compatibility, validation, profile, classification and fact stages without re-running command preparers. Integrated replay re-routes semantic envelopes through the same assembly and pipeline. A committed operation produces one committed event plus the optional existing dirty-state event; subscriber failures remain isolated.

### CVN6-R010 — Public integration closures

CVN-6 freezes four additive public closures detailed in `design.md`:

1. `createKernelRegistry(catalog)` integrated overload;
2. `KernelCommandIdentity` and `IntegratedKernelEvent`;
3. integrated resource failures for effects, affected addresses, compatibility facts and module issues, including construction overflow;
4. `migrateKernelExtension(input, request, catalog)` with a versioned detached request/result contract.

The application root gains exactly two runtime names: `replayKernelCommands` and `migrateKernelExtension`, moving the expected runtime export count from 49 to 51. Runtime error-class exports remain unchanged.

### CVN6-R011 — Detached extension migration

Migration targets exactly one namespace+owner ExtensionBlock and reuses one accepted CVN-2 module effect definition. It is descriptor-first, deterministic and pure-data. An already-target-version block returns `not-required` with decoder/transformer calls `0/0`. A source-version match invokes payload decoder and transformer exactly once; only a replace result with the requested target version is accepted. The result passes strict codec, encode/decode round-trip, Core semantic validation and applicable exact-compatible module validation. All non-target Core and extension data remain deeply equal. Active bus, ready assembly, history and event state remain unchanged. Existing `migrateScoreDocument()` remains exact.

### CVN6-R012 — Limits, privacy and deterministic order

Inclusive limits are:

| Item | Limit |
|---|---:|
| effects per integrated transaction | 131,072 |
| canonical affected addresses | 131,072 |
| compatibility facts | 131,072 |
| issues returned by one callback | 1,024 |
| aggregate module issues per transaction/construction | 4,096 |

The 1,025th callback issue is a contribution contract violation. The 4,097th aggregate issue is `command.resource-limit-exceeded` with `limitKind: "module-issues"`. The 131,073rd compatibility fact uses `limitKind: "compatibility-facts"`. Public failures and events expose only allowlisted codes, module/contribution identities, canonical addresses, limits, facts and frozen diagnostics; raw payloads, handlers, private identities, thrown values, stacks and local paths remain private.

Canonical fact order is namespace; owner kind (`score` before `part`); part ID; extension schema version; module ID; contribution ID; reason (`incompatible` before `unavailable`). Deduplication uses the complete public tuple.

### CVN6-R013 — Neutral end-to-end evidence

Tests use two neutral synthetic official modules, one score-owned and one Part-owned. Each module contributes its own command producing ordered WrittenPitch plus owned ExtensionBlock effects. Both are installed together to prove catalog-order validation/classification/fact behavior, while each submit remains owned by one contribution. Cross-module batch composition belongs to CVN-5.

## Acceptance Criteria

- [ ] CVN6-AC001: both required commits are ancestors of the implementation baseline and all four accepted dependencies are recorded.
- [ ] CVN6-AC002: Core-only factory, Registry, bus, gateway, replay, event, report and migration characterization remains deep-equal to the accepted baseline.
- [ ] CVN6-AC003: CVN-2 ABI remains nine fields, SDK exports remain `8/34`, catalog construction behavior remains accepted and CVN-2 tests stay green.
- [ ] CVN6-AC004: integrated Registry, bus, gateway and replay from catalog A share one private identity; A/B, Core/integrated and forged pairings reject with exact failures before session/gateway exposure.
- [ ] CVN6-AC005: module callbacks receive only detached owner-scoped views and the restricted forward-effect surface.
- [ ] CVN6-AC006: WrittenPitch and owned score/Part ExtensionBlock effects apply atomically to one candidate; inverse order and rollback are exact at every failure stage.
- [ ] CVN6-AC007: the ten-stage pipeline, failure priority and one CVN-1 adoption owner are directly asserted.
- [ ] CVN6-AC008: compatible, unavailable, incompatible, future, unknown and mixed matrices produce exact write/validation availability and canonical facts.
- [ ] CVN6-AC009: callback matrices prove `0/0`, `1/1`, `1/0`, read-only `0/0/0`, deterministic semantic issue aggregation and exception isolation.
- [ ] CVN6-AC010: submit/no-op/reject/undo/redo/replay preserve the specified document/version/history/checkpoint/dirty/event invariants.
- [ ] CVN6-AC011: two synthetic modules prove atomic multi-effect execution, frozen ordering, one history entry/version/event and live/replay result parity without batch semantics.
- [ ] CVN6-AC012: integrated events carry exact command source identity while Core `KernelEvent` remains exact.
- [ ] CVN6-AC013: detached migration covers migrated/not-required/rejected, owner and version mismatch, target absence, callback failure, round-trip and non-target deep equality with zero live-state effect.
- [ ] CVN6-AC014: exact limit and limit+1 tests cover issues, aggregate issues, facts, effects and affected addresses.
- [ ] CVN6-AC015: hostile accessor/Proxy/sparse/cyclic/invalid-prototype/extra-field/alias inputs return stable data-only failures.
- [ ] CVN6-AC016: application runtime exports are exactly baseline plus `replayKernelCommands` and `migrateKernelExtension`; public type and SDK allowlists match the frozen design.
- [ ] CVN6-AC017: GD-0 Layer A/Layer B plus a real-Core CVN-6 compile fence pass.
- [ ] CVN6-AC018: implementation changes remain inside the exact source/test allowlists; Guitar, product-service, host, persistence and public-plugin dependencies are absent.
- [ ] CVN6-AC019: typecheck, build, focused tests, full suite, Trellis validation, diff check and protected-path checks pass from a clean candidate.
- [ ] CVN6-AC020: independent planning review and later independent implementation review each report P0/P1/P2=`0/0/0` before their respective activation/acceptance transitions.

## Scope Exclusions

- CVN-5 range/batch work and `batch-children` resource attribution.
- CVN-7 compatibility/reliability/scale qualification.
- Guitar Domain schema, technique, placement or command implementation.
- Persistence, Layout, Renderer, Playback, Export and physical `.bgp` IO.
- Desktop Shell, Workbench, Editor Session and post-Core Application Assembly.
- Public Extension Host and general visual/functional plugin platform.
- Dynamic discovery, install, unload, replace, hot reload and ready-assembly mutation.
- New persisted schema or file format, autosave, file rollback and crash recovery.

## Product Boundary

CVN-6's private kernel assembly identity is the frozen catalog identity consumed inside one Core session. The post-Core `Application Assembly` is a Product Host responsibility owned by the future Workbench/Editor Session child. The two terms are not interchangeable. CVN-6 accepts a supplied official catalog and never assembles Guitar, service or host providers.
