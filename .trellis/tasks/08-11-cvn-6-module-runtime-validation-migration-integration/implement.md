# CVN-6 Implementation Plan

## 1. Execution Status

`BOUNDED REPAIR CANDIDATE READY FOR TARGETED INDEPENDENT REREVIEW / TASK IN_PROGRESS / NO ACCEPTANCE OR ARCHIVE RECORDED`

Phases 1 through 9 have been implemented inside the reviewed allowlists. Phase
10 evidence is recorded in `review-candidate.md`; independent implementation
review returned five P1 findings. Their bounded repairs and regressions are now
implemented; targeted independent rereview remains the next gate before any
acceptance, commit, or archive action.

## 2. Entry Gate

Before any implementation activation, verify all of the following:

1. HEAD contains `302dafe451bd4e10f4978d3076e367473b2fa3ae` and `c68fcc648051b51b73fda3e5bda6eb9e33298f39` as ancestors.
2. CVN-1 and CVN-2 are accepted and archived.
3. Extensibility Reservation and GD-0 are accepted and archived.
4. CVN-3 and final CVN-4 accepted structural tests are present.
5. the targeted CVN-6 planning rereview closes the prior known-requirement-inventory P1 and reports P0/P1/P2=`0/0/0`.
6. Task status remains `planning` until a separate user implementation approval.
7. The implementation branch starts from the accepted planning candidate and is clean.
8. Public contract closure, source/test allowlists and protected post-Core boundary match `design.md` exactly.

## 3. Implementation Sequence

### Phase 1 — Public contracts and compile fences

**Inputs:** accepted GD-0 public types, current application root and CVN-2 exported catalog types.

**Work:**

- add all accepted integrated types, `KernelKnownRequirementInventoryV1`, its explicit runtime overloads and exact CVN-6 closures to their owning contracts;
- add only `replayKernelCommands` and `migrateKernelExtension` as new root runtime names;
- add real-Core positive and negative compile assertions for inventory/Registry/bus/replay overloads, event identity, inventory failure, resource failures and migration;
- freeze application runtime export count 51 and SDK export counts `8/34`.

**Exit:** typecheck passes; Core-only declaration probes remain exact; no implementation callback executes.

**Rollback:** revert only contract/export edits and compile assertions.

### Phase 2 — Private assembly binding and integrated Registry

**Inputs:** authentic CVN-2 catalog state, existing `ExtensionRuntimeRequirementV1` data shape and composition-root `KernelKnownRequirementInventoryV1` input.

**Work:**

- keep `compileOfficialModuleCatalogV1`, its nine-field contribution ABI, SDK `8/34` and unselected-entry behavior exact;
- add explicit inventory overloads only to integrated Registry, CommandBus and replay construction;
- strictly decode at most 1,024 dense requirement rows with at most 256 versions each, prove installed-requirement parity and normalize a frozen runtime inventory/index;
- combine authentic catalog identity and a collision-free canonical inventory key into one private runtime assembly identity without modifying CVN-2 catalog state;
- construct integrated Registry state from accepted Core registry state plus official module/command summaries;
- ensure inventory-only absent requirements create no Registry summary, gateway, command, effect or callback;
- bind integrated bus and gateway private state to the same identity;
- reject invalid inventory, structural forgery, catalog/inventory A/B identity mismatch and Core/integrated mode mismatch before publishing runtime objects.

**Exit:** CVN-2 catalog compilation is deep-equal; valid/invalid/duplicate/row-and-version-limit/parity inventory cases pass; same-runtime-assembly construction and the full catalog/inventory mismatch matrix pass; existing Core Registry tests remain deep-equal.

**Rollback:** remove only CVN-6 inventory overload/state paths; the accepted CVN-2 compiler/catalog and Core manifest construction remain exact.

### Phase 3 — Compatibility, availability and detached views

**Inputs:** persisted ExtensionBlocks, frozen CVN-6 runtime known-requirement inventory and installed CVN-2 contribution indexes.

**Work:**

- compute exact compatible/unavailable/incompatible/unknown block state from independent known-requirement and installed-contribution lookups;
- sort/deduplicate facts using the seven-key order from `design.md`;
- create detached, deeply frozen contribution views containing only exact-compatible owned blocks;
- populate `IntegratedKernelReadState` with write and validation availability;
- enforce compatibility-fact and initial module-issue limits before session publication.

**Exit:** explicit public runtime inputs construct compatible/unavailable/incompatible/future/unknown/mixed and mixed-owner fixtures with exact callback counts and payload preservation; no fixture writes catalog private state.

**Rollback:** integrated construction returns to pre-publication failure; Core-only read state stays unchanged.

### Phase 4 — Module route, decode, prepare and effect engine

**Inputs:** frozen command/effect/namespace indexes from CVN-2.

**Work:**

- route each envelope to exactly one Core or module definition;
- invoke accepted module decoder/preparer with detached inputs;
- enforce contribution-local command/effect/namespace authority;
- implement only WrittenPitch Core request and owned score/Part ExtensionBlock replace/remove;
- apply ordered effects to one isolated candidate and derive reverse-ordered inverses;
- enforce effect and affected-address limits.

**Exit:** each synthetic module performs WrittenPitch + owned block atomically; every effect-stage failure leaves complete state equal.

**Rollback:** disable integrated route selection while retaining CVN-2 catalog compile behavior.

### Phase 5 — Semantic, validation, profile, classification and facts

**Inputs:** one isolated changed/no-op candidate.

**Work:**

- run Core semantics before module validation;
- run exact-compatible validators in catalog order with deterministic semantic issue aggregation;
- run Core profile, then module classifiers;
- map callback throw, Promise-like and malformed results to exact contribution failures;
- build frozen assessments, facts and affected addresses under resource caps;
- preserve no-op assessment with zero visible state change.

**Exit:** `0/0`, `1/1`, `1/0`, read-only `0/0/0`, 1024/1025 and 4096/4097 cases pass.

**Rollback:** discard candidate and keep the pre-call state owner untouched.

### Phase 6 — Existing CVN-1 session, history and events

**Inputs:** accepted integrated candidate package and source identity.

**Work:**

- adopt document/version/history/redo/checkpoint/dirty/event state once through the CVN-1 owner;
- store frozen semantic envelope, command identity, effective forward effects, reverse inverse effects and canonical affected facts;
- implement integrated committed event identity while preserving Core event shape;
- make subscriber failure isolation identical to Core-only behavior;
- implement undo/redo availability preflight, stored-effect application and full post-effect validation pipeline.

**Exit:** submit/no-op/reject/undo/redo prove exact state transitions, one history entry/version/event and subscriber isolation.

**Rollback:** return the integrated adapter before adoption; Core-only owner remains intact.

### Phase 7 — Integrated gateway and replay

**Inputs:** same catalog+inventory runtime identity for Registry and integrated bus plus semantic command sequences.

**Work:**

- expose integrated gateway result methods while preserving summary/select/subscribe;
- implement catalog-only and explicit-inventory `replayKernelCommands` through an ephemeral integrated session;
- preflight every replay write, permit empty read-only replay and report exact failure index;
- reject catalog/inventory/mode mismatch before a gateway or replay session is exposed;
- prove live result/final-document/availability parity with replay.

**Exit:** same-assembly gateway/replay success, A/B mismatch, Core/integrated mismatch, forged objects and first-write rejection pass.

**Rollback:** retain Core gateway and `replayCoreCommands` unchanged.

### Phase 8 — Detached public extension migration

**Inputs:** unknown document, exact V1 request and authentic catalog.

**Work:**

- implement the fixed failure precedence and exact-shape request decoder;
- resolve one contribution/effect/namespace/owner block;
- implement target-version idempotence with callback counts `0/0`;
- invoke payload decoder/transformer once for a source match;
- accept only exact target-version replace;
- run codec round-trip, Core semantics and applicable exact-compatible validators;
- build frozen result/report while preserving every non-target subtree.

**Exit:** migrated/not-required/rejected, mismatch, callback failure, round-trip, deep-equality and zero-live-state tests pass.

**Rollback:** remove the additive entry/export; existing `migrateScoreDocument` remains exact.

### Phase 9 — Hostile input, resources, privacy and boundaries

**Inputs:** all public integrated entry points and callback boundaries.

**Work:**

- cover inventory and all other public inputs with accessors, Proxies, sparse arrays, cycles, invalid prototypes, extra fields and mutable aliases;
- cover inventory rows `1024/1025`, versions `256/257`, duplicate namespace, missing installed row and catalog parity conflict;
- cover callback throws, Promise-like results and malformed nested output;
- assert exact limits/boundary+1 and complete rejection state;
- scan failures, results and events for disallowed payloads, handlers, identities, errors, paths and stacks;
- run application/SDK export allowlists and forbidden Guitar/product/platform dependency scans.

**Exit:** every hostile case returns stable frozen data and the complete pre-call state is preserved.

**Rollback:** each hardening change is isolated to the owning public guard/adapter and its focused test.

### Phase 10 — Evidence and independent acceptance handoff

**Work:**

- run all focused matrices, GD-0 Layer A/Layer B, typecheck, build and full suite;
- capture source/test allowlist, protected-path and public-export results;
- write an implementation candidate report containing exact commits and counts;
- hand the clean candidate to an independent implementation reviewer;
- record acceptance/archive only after P0/P1/P2=`0/0/0` and explicit user closure.

**Exit:** accepted source/test commit, acceptance record and archive are independently attributable. CVN-5 remains inactive until this exit is complete.

## 4. Fixed Failure Priority

For one integrated write attempt:

1. cached availability, incompatible above unavailable;
2. invalid outer envelope;
3. unsupported command version;
4. unknown command ID;
5. target kind mismatch;
6. payload shape/input resource;
7. target/owner/anchor resolution;
8. prepare/effect contract and effect resources;
9. Core semantic invalidity;
10. module semantic invalidity/resources;
11. profile/classifier/fact contract and resources;
12. version/history/event capacity;
13. isolated internal error.

Migration uses the separate precedence in `design.md` section 9.

## 5. Test Matrix

| Area | Required cases |
|---|---|
| construction | Core-only exact; CVN-2 catalog exact; catalog-only integrated default; explicit inventory overloads; malformed/duplicate/1024/1025/256/257/parity inventory; authentic/forged catalog; catalog/inventory A/B identity; Core/integrated both directions |
| availability | public-path compatible; unavailable-only; incompatible-only; future; unknown opaque; unavailable+incompatible mixed; mixed-owner filtered view |
| callbacks | `0/0`; `1/1`; semantic `1/0`; read-only `0/0/0`; throw; Promise-like; malformed result |
| transaction | two effects; ordered inverse; intermediate failure; Core semantic failure; module semantic failure; no-op |
| state | submit; reject; undo; redo; redo invalidation; checkpoint; dirty; event sequence; subscriber failure |
| replay | empty; success; first/middle failure; read-only first write; live parity; catalog mismatch; inventory mismatch |
| migration | migrated; idempotent; request invalid; target missing; owner/effect mismatch; source/target mismatch; validation failure; deep equality |
| resources | inventory rows 1024/1025; versions 256/257; callback issues 1024/1025; aggregate 4096/4097; facts/effects/addresses 131072/131073 |
| hostile input | inventory and runtime accessor; Proxy; sparse; cyclic; invalid prototype; extra fields; caller/result aliases |
| boundaries | root runtime 51; SDK 8/34; no runtime error class; no Guitar/product/persistence dependency |

## 6. Planned Files

Production and test allowlists are exact in `design.md` sections 11 and 12 and duplicated as a machine-checkable planning matrix in `research/cvn6-file-and-test-ownership-matrix.md`. An additional path requires planning review before editing.

## 7. Validation Commands

Planning-candidate gates:

```powershell
git merge-base --is-ancestor 302dafe451bd4e10f4978d3076e367473b2fa3ae HEAD
git merge-base --is-ancestor c68fcc648051b51b73fda3e5bda6eb9e33298f39 HEAD

python ./.trellis/scripts/task.py validate 08-11-cvn-6-module-runtime-validation-migration-integration
python ./.trellis/scripts/task.py validate 07-29-core-vnext-product-ready-extensible-kernel-completion
python ./.trellis/scripts/task.py validate 06-29-commercial-guitar-tablature-product
python ./.trellis/scripts/task.py validate 08-11-post-core-official-plugin-product-roadmap

git diff --check
npm run typecheck
npm run build
npm test

git diff --name-only 050af1eed067300f2e2fb0339eff6f2430e43b36 -- src test package.json package-lock.json tsconfig.json
git diff --name-only a869528 -- src test package.json package-lock.json tsconfig.json
```

Additionally parse every JSON/JSONL file, prove every JSONL path exists exactly once, prove the parent child reference count is one, and verify the final planning commit changes only the planning allowlist.

Future implementation gates add the focused test files from `design.md`, GD-0 Layer A/Layer B, CVN-6 real-Core compile assertions, public export/forbidden dependency scans and an independent implementation review.

## 8. Planning Handoff

The current handoff ends at a clean docs-only commit with:

- task status `planning`;
- `task_start_run=false`;
- `production_implementation_authorized=false`;
- prior independent P1 bounded-repaired and targeted planning rereview pending;
- CVN-5 and CVN-7 dependency state unchanged;
- post-Core product roadmap and implementation state unchanged.

After a separate planning-review pass and user activation, the first operator action is to verify the accepted planning commit and then activate only this child. The parent coordination task is not the implementation target.
