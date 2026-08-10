# Core VNext Durable Roadmap and Stage Plan

> **Purpose:** durable context-recovery entry for CVN-0 through CVN-7.
> **Snapshot date:** 2026-08-09.
> **Current active coordination gate at this snapshot:** none. The Extensibility Reservation Gate is accepted and archived; no CVN production child is active.
> **Status authority:** live child and parent `task.json` files override the snapshot status table below.
> **Behavior authority:** `feature-contract-matrix.md` overrides this summary for exact public contracts, command payloads, failure priority, limits, fixtures and budgets.

## 1. Context-Recovery Reading Order

After context compression or in a new planning session, read in this order:

1. parent `task.json` for live child and status pointers;
2. this file for the dependency graph, stage boundaries and handoff rules;
3. `feature-contract-matrix.md` for binding observable contracts;
4. parent `prd.md`, `design.md` and `implement.md` for product intent, architecture and gate discipline;
5. the current child `task.json`, `prd.md`, `design.md`, `implement.md` and research evidence;
6. every file in the current child's `implement.jsonl` or `check.jsonl`, according to the activity;
7. accepted child archives for historical evidence only.

Conflict resolution:

1. accepted live Core behavior and active Core specs;
2. parent `feature-contract-matrix.md`;
3. owning child PRD and design, provided they do not change a parent contract;
4. parent design and implementation plan;
5. this recovery roadmap;
6. historical archives and planning snapshots.

This file coordinates and restores context. It does not activate implementation and does not make planned behavior part of the accepted Core baseline.

## 2. Fixed Core VNext Completion Definition

Core VNext closes only when all of the following are independently accepted:

- the six accepted Core V1 commands remain behavior-compatible;
- exactly twenty-two additive Core VNext commands are delivered;
- the final Core command catalog contains exactly twenty-eight command IDs;
- `createScoreDocument(unknown)` provides deterministic pure document creation;
- official module contributions are compiled into a startup-frozen assembly;
- one state/transaction/history/replay/event owner serves Core and integrated official modules;
- validation and classification run Core-first, then frozen module-catalog order;
- compatibility, migration, hostile-input, deterministic replay, reliability and scale gates pass.

The following architecture decisions stay fixed across every child:

- stability-first startup-frozen microkernel;
- one public `submit(unknown)` command entrance;
- one candidate and one final adoption per semantic transaction;
- one version/history/event result for a committed transaction;
- replay consumes original semantic envelopes rather than stored effects;
- `brilliant-score-1` remains the persisted schema for this roadmap;
- Core does not import Guitar or another concrete product/domain package;
- runtime register, unregister, replace, reload and hot plug are absent;
- generic JSON patch, generic mutable document access and whole-document replacement are absent;
- caller-supplied IDs remain exact strings without trimming, folding or auto-renaming;
- new unknown-data entrances use descriptor-first inspection, depth limit `64` and property limit `1,048,576`;
- unknown extension blocks remain losslessly preserved unless an owning accepted contribution explicitly changes them.

## 3. Dependency Graph

```text
accepted Core V1
    -> CVN-0
        -> CVN-1
            -> CVN-3 -----------------------------------------> CVN-4

accepted Extensibility Reservation Gate + independently accepted GD-0 + accepted CVN-1
    -> CVN-2
        -> CVN-6

CVN-2 + CVN-3 + CVN-4 + CVN-6
    -> CVN-5

CVN-0 + CVN-1 + CVN-2 + CVN-3 + CVN-4 + CVN-5 + CVN-6
    -> CVN-7
    -> resume Guitar-owned roadmap planning
    -> optional post-CVN-7 extension gates when product evidence justifies them
```

The graph is dependency-based rather than numeric-order-based. CVN-2 and CVN-3 are sibling tracks after CVN-1. CVN-2 eligibility depended on independent GD-0 acceptance and acceptance of the documentation-only Extensibility Reservation Gate; both are now satisfied on the unified planning line. CVN-3 is Core-only and proceeded without GD-0. Final repaired CVN-4 follows CVN-3 and is accepted. CVN-6 follows accepted CVN-2 and consumes the accepted reservation charter without implementing its post-V1 gates. CVN-5 joins the two tracks. CVN-7 closes the finite Core VNext system; later extension gates remain separate product decisions rather than hidden VNext completion work.

## 4. Live Status Snapshot

| Stage | Snapshot status | Decisive current fact | Next state transition |
|---|---|---|---|
| CVN-0 | completed and archived | final independent re-review passed; 19 focused and 188 full tests recorded | retained as accepted prerequisite |
| CVN-1 | completed and archived | final narrow re-review passed; 19 command-internals and 193 full tests recorded | retained as accepted transaction-spine base |
| Extensibility Reservation Gate | completed and archived | candidate `7c4e852`, acceptance `253d19e`, archive `a4d8cee`; one narrow P2 repaired; final P0/P1/P2=`0/0/0`; task AC `25/25` | retained as accepted GD-0/CVN-2 evolution prerequisite |
| CVN-2 | initial planning review returned for bounded repair; status `planning` | candidate `8757097` retained the correct ownership, nine-field ABI and zero-production-delta boundaries, but strict TypeScript review found P0/P1/P2=`0/2/1`: heterogeneous generic command/effect definitions collapse at the `unknown` arrays, the decoder invocation value is unspecified, and error-base generics are not tied to constructor data | repair those three SDK type/call-shape defects, then perform a fresh independent re-review; no `task.py start` yet |
| CVN-3 | completed and archived | independent review passed at `d9500f5` with P0/P1/P2 = `0/0/0`; 22 lifecycle and 233 full tests reproduced; acceptance commit `3691d93` | retained as accepted factory and Measure-lifecycle prerequisite |
| CVN-4 | completed and archived | final local re-review passed at `b0272e2` with P0/P1/P2 = `0/0/0`; focused `92/92`, full `315/315`; acceptance `7f33e7d` | retained as accepted hierarchy-lifecycle prerequisite |
| CVN-5 | parent-planned; child not created | waits for accepted CVN-2, CVN-3, CVN-4 and CVN-6 | detailed planning after all four dependencies are accepted |
| CVN-6 | parent-planned; child not created | waits for accepted CVN-2 and CVN-1 | detailed planning after CVN-2 acceptance |
| CVN-7 | parent-planned; child not created | waits for independently accepted and archived CVN-0 through CVN-6 | final qualification task |

Snapshot evidence:

- CVN-0 final source commit: `c7ffd49`; acceptance `cc9beee`; archive `6cec36b`.
- CVN-1 final source commits: `f7c0064` and `1016d05`; acceptance `8362086`; archive `4bdc405`.
- CVN-1 immutable expected trace SHA-256: `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`.
- CVN-3 activation baseline: `d936d58195803ef938214948b21e89fe67939090`.
- CVN-3 accepted source/test commit: `d9500f5a8ac285071586ba8eda380370eafd022f`; independent review passed with P0/P1/P2 = `0/0/0`; acceptance commit `3691d93`.
- CVN-4 final accepted source/test commit: `b0272e2eabd0d222baea12cbaae3e08f9f61bfdd`; local input-validation and rejection-rollback re-review passed with P0/P1/P2 = `0/0/0`; acceptance commit `7f33e7d`.
- Extensibility Reservation Gate planning commit: `6298d4b`; activation baseline `783f69c`; charter `7c4e852`; acceptance `253d19e`; archive `a4d8cee`; final P0/P1/P2=`0/0/0` after one narrow P2 repair.
- GD-0 accepted documentation/architecture contract: candidate `451627e`; acceptance `a2b9009`; archive `4580164`; archived-path synchronization `ade7526`; runtime implementation remains separately gated.
- CVN-2 unified planning base: merge `706802c` with parents `ebd8075` and `7ad1ff1`; planning candidate `73fe18a` passed six-commit ancestry, six Trellis validations, typecheck, build, full `315/315`, CVN-4 source/test equality and zero planning production delta. Detailed planning artifacts are recorded at `2941725`; verification metadata is recorded at `8757097`. The initial independent planning review of `8757097` returned P0/P1/P2=`0/2/1` for bounded SDK type/call-shape repair. The child remains `planning`, owns only `CVN-FC-110/111`, and has not run `task.py start`.

## 5. Exact Command Inventory

### 5.1 Preserved Core V1 commands: six

| Gate | Command ID | Target |
|---|---|---|
| V1 preserved by CVN-1 | `core.document.set-metadata` | document |
| V1 preserved by CVN-1 | `core.note.set-written-pitch` | note |
| V1 preserved by CVN-1 | `core.event.set-note-value` | event |
| V1 preserved by CVN-1 | `core.voice.insert-notes-event` | voice |
| V1 preserved by CVN-1 | `core.voice.insert-rest-event` | voice |
| V1 preserved by CVN-1 | `core.event.remove` | event |

### 5.2 Additive Core VNext commands: twenty-two

| Gate | Command ID | Target |
|---|---|---|
| CVN-3 | `core.measure.insert` | document |
| CVN-3 | `core.measure.remove` | measure |
| CVN-3 | `core.measure.move` | measure |
| CVN-3 | `core.measure.set-definition` | measure |
| CVN-4 | `core.part.insert` | document |
| CVN-4 | `core.part.remove` | part |
| CVN-4 | `core.part.move` | part |
| CVN-4 | `core.part.set-name` | part |
| CVN-4 | `core.part.set-instrument` | part |
| CVN-4 | `core.staff.insert` | part |
| CVN-4 | `core.staff.remove` | staff |
| CVN-4 | `core.staff.move` | staff |
| CVN-4 | `core.staff.set-definition` | staff |
| CVN-4 | `core.voice.insert` | part |
| CVN-4 | `core.voice.remove` | voice |
| CVN-4 | `core.voice.move` | voice |
| CVN-4 | `core.voice.set-default-staff` | voice |
| CVN-4 | `core.voice.set-sequence-start` | voice |
| CVN-4 | `core.event.set-staff-assignment` | event |
| CVN-5 | `core.range.delete` | document |
| CVN-5 | `core.range.transpose-written-pitch` | document |
| CVN-5 | `core.transaction.batch` | document |

CVN-2 and CVN-6 add official-module infrastructure rather than fixed Core command IDs. Official contributions may supply namespaced commands through the frozen contribution contract; those commands do not change the exact twenty-eight-ID Core catalog.

## 6. CVN-0: Public Unknown-Guard Consistency

### Ownership, purpose and dependency

- Primary contract owner: `CVN-FC-010`.
- Purpose: make public and shared predicate inspection stable for hostile unknown data without inventing a new subsystem.
- Dependency: accepted Core V1.

### Fixed scope

- descriptor-first inspection for `isJsonValue`, `isWrittenPitch`, `isTransposition` and directly shared helpers;
- no getter, coercion hook, iterator or `toJSON` invocation;
- stable boolean behavior for accessor, Proxy, hostile object and sparse-array inputs;
- later strict decoders reuse these inspection principles;
- V1 predicates do not gain a new document-size rejection.

### Protected behavior

- command, history, event and Registry behavior;
- accepted public export list except an explicitly reviewed helper arrangement;
- K1-5 error/report contracts.

### Required evidence and exit

- focused hostile-input tests;
- full Core regression;
- public behavior verification;
- independent technical review and archive.

### Product benefit and current result

Every later decoder receives a side-effect-free inspection foundation. Untrusted objects cannot execute application code merely because Core validates them. CVN-0 is accepted and archived; later children consume it as a prerequisite.

## 7. CVN-1: Command, Transaction and Registry Spine

### Ownership, purpose and dependency

- Primary contract owners: `CVN-FC-011` and `CVN-FC-040`.
- Purpose: replace command-specific internal mutation paths with one reusable catalog/effect/transaction spine while keeping all six V1 commands observably unchanged.
- Dependency: accepted CVN-0.

### Fixed implementation sequence

1. capture a machine-readable trace for submit, no-op, rejection, undo, redo and replay across all six commands;
2. add a private default Core execution assembly and command adapters;
3. separate command decode/prepare from transaction coordination;
4. introduce ordered nonempty effect sets and clone-once candidate application;
5. generalize history entries and inverse derivation;
6. bind Core validation/classification through the frozen default pipeline;
7. route live submit and replay through the same internal assembly;
8. separate Registry manifest normalization, binding validation, assembly state and gateway dispatch;
9. remove superseded private paths only after trace parity.

### State rules preserved for every later command

- committed: version `+1`, one undo entry, redo cleared, dirty/checkpoint updated, one committed event;
- no-op: state, version, history, dirty/checkpoint and events unchanged;
- rejected: state, version, history, dirty/checkpoint and events unchanged;
- undo/redo: move one semantic history entry and produce one version increment and one committed event;
- replay: reroute the original semantic envelope through the current compatible assembly.

### Product benefit and current result

All later editing features share one atomic transaction owner. The product avoids separate undo/replay/event implementations for Measure, Part, official modules and batch operations. CVN-1 is accepted and archived; CVN-3 builds directly on it.

## 8. CVN-2: Official Module SDK and Frozen Assembly

### Ownership, purpose and dependencies

- Primary contract owners: `CVN-FC-110` and `CVN-FC-111`.
- Purpose: expose the minimum versioned authoring contract for statically compiled official modules and compile one detached immutable contribution catalog.
- Dependencies: accepted CVN-1, independently accepted GD-0, and an independently accepted/archived Extensibility Reservation Gate.

### Required SDK and composition contracts

- additive registration entry: `kernel.domain-commands.v1`;
- minimum SDK ABI: `CompiledDomainCommandContributionV1`;
- exact ABI fields: `apiVersion`, `moduleId`, `contributionId`, `extensionNamespaces`, `extensionRequirements`, `commands`, `validate`, `classify`, `effects`;
- manifest selects data descriptors only;
- callable bindings come from composition-root static imports rather than manifest, document, extension payload or network data;
- accepted identity profile is `origin: "official"`, `runtime: "builtin" | "internal-module"`, `trust: "system-trusted"`, with complete required capabilities.

### All-or-nothing assembly checks

Assembly construction validates in fixed order:

1. strict manifest, descriptor and API version;
2. module, contribution and registration identity parity;
3. origin, runtime, trust and capability;
4. unique module ID, contribution ID, command ID, effect kind and extension namespace;
5. command namespace, target kind and descriptor/handler parity;
6. requirement identity and exact supported schema-version list;
7. effect namespace and owner allowlist;
8. synchronous return, deep freeze and absence of ready-state mutation APIs.

Any construction failure produces zero active integrated session. No partially accepted catalog escapes.

### Fixed contribution limits

| Resource | Inclusive maximum |
|---|---:|
| modules | 64 |
| contribution entries | 256 |
| total command descriptors | 4,096 |
| total effect definitions | 4,096 |
| owned extension namespaces | 1,024 |
| supported versions per requirement | 256 |
| issues returned by one callback | 1,024 |
| aggregate module issues per transaction | 4,096 |
| canonical compatibility facts | 131,072 |

### Child planning and implementation stages

1. independently accept GD-0 and the Extensibility Reservation Gate, or return the affected contract to planning;
2. create a dedicated CVN-2 task and branch from the accepted CVN-1-compatible line;
3. copy only `CVN-FC-110/111` into the child trace table;
4. freeze the exact public SDK export allowlist and private catalog boundary;
5. define strict decoder, builder, failure, privacy and deep-freeze tests;
6. define two synthetic official-module fixtures with collisions, incompatibility and exact-boundary cases;
7. add versioned data contracts and safe builders;
8. add strict manifest/contribution decoding and detached deterministic catalog compilation;
9. enforce identity, namespace, capability and descriptor/binding parity;
10. enforce limits, data-only failure privacy and deep freeze;
11. prove absence of ready-state mutation APIs;
12. run full Core compatibility tests and independent review.

Current checkpoint: stages 1-3 are complete at planning base `706802c`. Stages 4-6 belong to detailed planning; stages 7-12 remain inactive until planning review and explicit execution approval.

### Explicit exclusions

- writable integrated bus, gateway or replay session;
- runtime module discovery, installation, unloading, replacement or hot reload;
- manifest-supplied functions;
- arbitrary mutation callback or generic patch;
- Guitar-specific rules or dependencies.

### Exit and product benefit

Two synthetic official modules must prove deterministic catalog order, descriptor/binding parity, capability and namespace isolation, bounded effect requests, deep freeze and all-or-nothing construction. This gives official domain packages a stable authoring seam without making Core domain-specific or history dependent on a mutable plugin catalog.

## 9. CVN-3: Document Factory and Measure Lifecycle

### Ownership, purpose and dependency

- Primary contract owners: `CVN-FC-020/021`, `CVN-FC-030/031` and `CVN-FC-050–053`.
- Consumed contracts: `CVN-FC-010/011`, additive catalog rules, failure rules and factory/structure acceptance matrices.
- Purpose: deterministic score initialization and complete Measure-level structural editing.
- Dependency: accepted CVN-1 only.

### Fixed capability

- pure `createScoreDocument(unknown)` factory;
- one explicit initial Measure and one or more explicit initial Parts;
- caller-supplied document, Part, Staff, Voice and Measure IDs;
- `core.measure.insert` with exact contents for every Part;
- `core.measure.remove` with complete owned Voice/Event/Note aggregate;
- `core.measure.move` with synchronized global and per-Part order;
- `core.measure.set-definition` with meter and explicit `pickup: none | duration`;
- atomic synchronization of `measureDefinitions` and every Part's `measureContents`;
- exact inverse, history, undo, redo, replay and committed-event behavior;
- unknown-extension preservation and semantic-valid versus product-supported separation.

### Active child authority

- child task: `08-04-cvn-3-document-factory-measure-lifecycle`;
- branch: `codex/cvn-3-document-factory-measure-lifecycle`;
- activation HEAD: `d936d58195803ef938214948b21e89fe67939090`;
- detailed execution order: child `implement.md` Stage 0 through Stage 11.

### Fixed exclusions

- official-module SDK/runtime;
- Part, Staff, Voice and Event lifecycle commands owned by CVN-4;
- range and batch commands owned by CVN-5;
- whole-document replacement and schema migration;
- Guitar, UI, rendering, playback and file IO behavior.

### Exit and product benefit

Factory matrices and all four commands must pass committed, no-op, rejected, undo, redo and replay cases. Public runtime exports become exactly `49`; built-in Core commands and Registry descriptors become exactly `10`; the six V1 traces remain unchanged. Application/UI layers then gain New Score, Add/Delete/Reorder Measure and Change Meter/Pickup without direct `ScoreDocument` mutation.

## 10. CVN-4: Part, Staff, Voice and Event Lifecycle

### Ownership, purpose and dependencies

- Primary contract owners: `CVN-FC-060–070`.
- Purpose: complete generic hierarchy editing on the accepted score schema.
- Dependencies: accepted CVN-3 and accepted CVN-1.

Conditional detailed planning is preserved in:

- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/research/cvn-4-part-staff-voice-preplanning.md`
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/research/cvn-4-current-hierarchy-evidence.md`

These files freeze the proposed payload types, title keys, private effects, owner/anchor algorithms, affected-address order, file/test surfaces, twenty requirements and thirty-five acceptance criteria. They do not create or activate the formal child before CVN-3 acceptance.

### Fixed command set: fifteen

Part:

- `core.part.insert`
- `core.part.remove`
- `core.part.move`
- `core.part.set-name`
- `core.part.set-instrument`

Staff:

- `core.staff.insert`
- `core.staff.remove`
- `core.staff.move`
- `core.staff.set-definition`

Voice:

- `core.voice.insert`
- `core.voice.remove`
- `core.voice.move`
- `core.voice.set-default-staff`
- `core.voice.set-sequence-start`

Event:

- `core.event.set-staff-assignment`

### Fixed behavior

- Part insertion supplies a complete Part and stable anchor;
- Part removal includes Part-owned extension blocks;
- Voice insertion is scoped by Part and Measure and carries a complete Voice;
- Voice removal includes owned Events and Notes;
- Staff removal returns `command.reference-conflict` while a Voice or Event references it;
- reassignment uses explicit commands or later batch composition;
- remove commands do not gain a generic cascade/reassign flag;
- removal of the last structurally required entity is rejected by final semantics;
- every accepted operation stores exact inverse data and preserves unknown extensions.

### Future child planning stages

1. create the child only after CVN-3 acceptance and explicit user direction;
2. copy `CVN-FC-060–070` into the child trace table;
3. freeze anchor, payload, ownership, reference-conflict and last-entity cases;
4. define Measure/Part/Voice ownership fixtures and shuffled-order regression inputs;
5. define exact affected addresses and event ordering for all fifteen commands;
6. define exact public catalog/export count changes;
7. complete PRD, design, implementation stages and validation commands;
8. receive separate activation approval.

### Exit and product benefit

Every command needs committed, no-op, rejected, undo, redo and replay evidence. Fixtures prove ownership cascade, exact restoration, cross-reference rejection and last-required-entity rejection. The product gains complete generic Part, Staff and Voice hierarchy editing without bypassing Core transactions.

## 11. CVN-5: Range Operations and Explicit Atomic Batch

### Ownership, purpose and dependencies

- Primary contract owners: `CVN-FC-080–102`.
- Purpose: safe multi-entity transformations through the single submit port and one semantic transaction result.
- Dependencies: accepted CVN-2, CVN-3, CVN-4 and CVN-6.

### Fixed command set

- `core.range.delete`
- `core.range.transpose-written-pitch`
- `core.transaction.batch`

### Range and batch behavior

- range traversal is stable and deterministic;
- range delete uses the three exact `CVN-FC-081` effect categories;
- transposition reports the first failing Note in deterministic order;
- batch enters through existing `submit(unknown)`;
- child count is exactly `1..100`;
- Core and official-module children come from the same frozen assembly;
- nested batch is rejected with child attribution;
- children prepare sequentially against one isolated candidate;
- intermediate invalidity may be repaired by later children;
- one final semantic validation/classification pass decides the candidate;
- commit produces one adoption, version increase, history entry and event;
- inverse effects are stored in reverse application order;
- all-no-op children normalize to a top-level no-op;
- any failure leaves live state untouched;
- replay reroutes original child envelopes through the compatible assembly.

### Fixed limits and failure attribution

- child envelopes: maximum `100`;
- input depth: maximum `64`;
- inspected own properties: maximum `1,048,576`;
- expanded effects and affected addresses: maximum `131,072`;
- child decode, route, target, prepare and effect failures include child index;
- final Core/module semantic failure remains top-level because intermediate invalidity is valid batch behavior.

### Future child planning stages

1. verify all four accepted dependencies;
2. freeze ScoreRange traversal and affected-address ordering;
3. freeze envelope, limits, failure priority and index attribution;
4. define 0/1/100/101 and index 0/50/99 fixtures;
5. define intermediate-invalid/final-valid and final-invalid-without-index fixtures;
6. prove mixed Core/official-module batch behavior;
7. prove single history/replay/event ownership and full failure rollback;
8. receive separate execution approval.

### Exit and product benefit

Every `CVN-FC-141` case must pass, including exact boundaries, atomic rejection, deterministic replay, inverse order and redo invalidation. Editors then gain range deletion, bulk transposition and compound actions as one undoable transaction.

## 12. CVN-6: Module Runtime, Validation and Migration Integration

### Ownership, purpose and dependencies

- Primary contract owners: `CVN-FC-112` and `CVN-FC-120–122`.
- Purpose: bind an accepted CVN-2 catalog to the existing Core bus, gateway and replay owner, then complete validation, profile, diagnostics, compatibility and migration.
- Dependencies: accepted CVN-2 and accepted CVN-1; the accepted Extensibility Reservation charter is a binding evolution input inherited through CVN-2.

### Fixed runtime authority

- Core-only default assembly remains available;
- integrated Registry, bus, gateway and replay share one private assembly identity;
- cross-assembly or Core-only/integrated mismatch rejects deterministically;
- handlers receive detached read views and restricted builders;
- handlers request forward effects only;
- inverse effects are derived by Core or accepted owned effect definitions;
- first module-to-Core effect scope is WrittenPitch replacement;
- module-owned effects replace/remove declared ExtensionBlocks for allowed score/Part owners.

### Pipeline order

1. strict input and route;
2. prepare ordered effects;
3. apply to one isolated candidate;
4. Core semantic validation first;
5. extension compatibility and contribution availability;
6. module validators in frozen catalog order;
7. Core support classification;
8. module classifiers in frozen catalog order;
9. deterministic data-only issue/fact mapping;
10. commit through the existing CVN-1 owner.

### Compatibility and migration behavior

- known block + exact version + contribution present: full participation;
- known block + exact version + contribution absent: `required-contribution-unavailable`, lossless read-only;
- known block + unlisted/future version: `required-contribution-incompatible`, lossless read-only;
- unknown opaque extension: preserve losslessly without unrelated callbacks;
- mixed blocks: deterministic per-block availability and no partial write admission;
- migration is detached, deterministic and owner-scoped;
- migration does not mutate an active bus or ready assembly.

### Future child planning stages

1. consume accepted CVN-2 without redesigning it;
2. import accepted GD-0 public-contract fences without renaming;
3. define integrated construction and assembly-identity tests;
4. define validator availability and call-count matrices;
5. define compatible, missing, future and mixed extension fixtures;
6. define issue/fact caps and callback exception isolation;
7. define migration round-trip and degraded-read evidence;
8. run one cross-module transaction through submit/history/replay/event;
9. receive separate activation approval.

### Exit and product benefit

Two synthetic modules must prove atomic multi-effect execution, integrated construction, compatibility matrices, migration round-trip, call order/counts and privacy-safe failures. Official feature modules then participate in the same reliable engine while unsupported extension data remains readable and lossless.

## 13. CVN-7: Compatibility, Reliability and Scale Gate

### Ownership, purpose and dependencies

- Primary contract owners: `CVN-FC-130–143`.
- Purpose: close Core VNext only after all mechanisms are integrated and independently accepted.
- Dependencies: accepted and archived CVN-0 through CVN-6.

### Required compatibility matrix

- unchanged Core-only V1 characterization;
- complete factory, Measure, Part, Staff, Voice, Event, range and batch flows;
- two synthetic official contributions in one atomic transaction;
- live/replay/undo/redo/checkpoint/dirty/event equality;
- codec, compatibility, migration and unknown-extension preservation;
- hostile inputs and callback exception isolation;
- exact public API and forbidden-dependency boundaries;
- clean reproducible production build and independent audit.

### Representative release-blocking fixture

- 200 Measures, 8 Parts, 2 Voices and 8 Events at the fixed levels;
- exactly 25,600 Events and 12,800 Notes;
- exactly two synthetic official contributions;
- exactly 2,000 committed history entries.

Reference Windows P95 budgets:

- submit, undo and redo: `<= 100 ms`;
- read and snapshot: `<= 50 ms`;
- 100-child batch: `<= 300 ms`;
- 100-command replay: `<= 2 s`;
- representative create/decode/semantic/compatibility pass: `<= 1 s`.

### Deterministic stress fixture

- 400 Measures, 16 Parts, 2 Voices and 8 Events at the fixed levels;
- exactly 102,400 Events;
- exactly 10,000 submitted/replayed envelopes;
- deterministic equality is blocking;
- peak RSS `<= 2.0 GiB`;
- stress latency is trend evidence.

### Benchmark method

- five warm-ups and twenty fresh-state samples;
- nearest-rank sample-19 P95;
- exact environment and build hash;
- median, P95, peak heap and peak RSS;
- candidate/baseline median and P95 ratios both `<= 1.20` on the same machine;
- reference environment: Node `v24.15.0`, `win32 x64`, NT `10.0.26200.0`, i9-13900HX, 32 logical CPUs, 39.7 GiB RAM, clean production build.

### Future child planning and exit

1. verify CVN-0 through CVN-6 are accepted and archived;
2. freeze the accepted source/build baseline;
3. assemble the complete deterministic matrix;
4. construct fixtures with exact count assertions;
5. record environment, build hash and sampling method;
6. run public API, forbidden dependency, full test, replay and migration gates;
7. independently audit evidence and product-quality documentation;
8. synchronize active specs after accepted behavior exists;
9. obtain final user closure approval.

Final evidence must prove the exact 28-command catalog, complete FC traceability, compatibility and budgets. The kernel then becomes a measurable product foundation rather than a collection of individually passing features.

## 14. Post-CVN-7 Future Extension Gate Index

These entries are versioned reservation targets, not Core VNext completion work and not current runtime claims. Create one dedicated parent-reviewed child only when a concrete product scenario, owner, resource budget and compatibility fixture exist.

| Future gate | Required owner and lane | Entry evidence | Permanent boundary |
|---|---|---|---|
| Module operation expansion | Core transaction owner; new registration/API version | a module scenario cannot be expressed as a bounded CVN-5 batch without losing semantic ownership | typed Core operations only; one expansion level; one candidate/commit/history/event; no module child routing |
| Domain Selector contribution | Core read gateway plus owning domain; new selector entry/API | repeated domain read use cases need a shared deterministic projection | detached, deeply frozen, bounded data only; no write, subscription owner or cache truth |
| Extension schema/owner evolution | Score schema owner plus domain migration owner; new Score schema | measured scale/lifecycle evidence shows score/Part aggregation is insufficient | explicit pure-data migration, lossless old-file handling and rollback; `brilliant-score-1` stays unchanged |
| Assembly generation and Module Package Host | Product composition Host; versioned package/Host contract | install/update/disable lifecycle becomes a product requirement | build a new frozen generation for new Sessions; no ready Assembly mutation or active-Session handler swap |
| External adapters | owning Renderer/Playback/Import/Export/Analysis/UI service; per-adapter contract | a product service needs reusable module-aware read/write integration | Snapshot/Selector reads and Command/Gateway writes; no platform state, IO handle, clock, layout or cache in Core truth |

Each future child must restate owner, version, capability, data direction, failure, compatibility, migration, Session lifecycle, resource caps, fixtures, decisive tests, rollout and rollback. A request for generic patch, mutable document, whole-document replacement, second transaction owner or ready-state registration remains outside every future gate.

## 15. Cross-Stage Stop Conditions

Return the active child to planning review when evidence requires any of the following:

- changing a persisted `brilliant-score-1` field or meaning;
- importing Guitar or another concrete domain into Core;
- adding a second bus, state, history, replay or event owner;
- exposing mutable document state, generic patch or whole-document replacement;
- adding ready-state registration, unloading, replacement or hot plug;
- changing an accepted V1 command's observable behavior;
- changing a parent-owned command ID, target, payload, anchor, cascade, range rule, batch attribution, failure priority, cap, fixture or budget;
- touching a protected subsystem without an explicit invariant and new acceptance matrix;
- creating a duplicate generic Core seam under an obsolete CK1.1 or GD-2 label.

## 16. Child Creation, Activation and Completion Protocol

Every not-yet-created stage follows this lifecycle:

1. verify every dependency against live task/archive evidence;
2. select only a dependency-satisfied child with explicit user planning direction;
3. create a dedicated Trellis task and `codex/` branch;
4. record base branch and exact planning HEAD;
5. create PRD, design, implementation plan, research evidence, `implement.jsonl` and `check.jsonl`;
6. copy owned parent FC rows into a trace table without changing them;
7. specify scope, exclusions, file surfaces, algorithms, failures, limits, fixtures, tests, rollback and stop conditions;
8. validate JSON/JSONL, Markdown fences, paths, contract counts and planning-only Git boundaries;
9. present functions, benefits, tradeoffs and execution consequences;
10. run `task.py start` only after explicit execution approval;
11. operator executes from Stage 0 and records fresh evidence;
12. independent reviewer audits the final diff and decisive tests;
13. planner records acceptance only after reproducible evidence passes;
14. archive the child and synchronize parent status/dependencies;
15. select the next dependency-satisfied child after the acceptance record is stable.

Creation alone does not authorize source changes. Parent planning status does not authorize a child. One child acceptance does not implicitly activate its successor.

## 17. Current Scheduling Decisions

1. CVN-3 and final repaired CVN-4 are independently accepted and archived; no CVN implementation child is active.
2. The documentation-only Extensibility Reservation Gate is accepted and archived and does not reopen CVN-4.
3. GD-0 and the reservation gate are accepted; CVN-2 now has one unified planning child at `706802c`, remains `planning`, and owns only `CVN-FC-110/111`.
4. CVN-4 remains the accepted Part/Staff/Voice/Event lifecycle prerequisite; no successor was implicitly activated by its acceptance.
5. CVN-6 follows accepted CVN-2 and consumes the accepted reservation charter while keeping post-V1 ports deferred.
6. CVN-5 waits for accepted CVN-2, CVN-3, CVN-4 and CVN-6.
7. CVN-7 waits for accepted and archived CVN-0 through CVN-6.
8. Guitar-owned planning resumes only after CVN-7 closes the generic Core seam.
9. Operation expansion, Domain Selectors, schema/owner evolution, Module Package Host and external adapters enter only through separate post-CVN-7 gates when concrete product evidence exists.

## 18. Durable File Index

Parent authorities:

- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/task.json`
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/prd.md`
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/design.md`
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/implement.md`
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/feature-contract-matrix.md`
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/documentation-sync-matrix.md`
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/research/cvn-roadmap-and-stage-plan.md`
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/research/cvn-4-part-staff-voice-preplanning.md`
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/research/cvn-4-current-hierarchy-evidence.md`

Accepted children:

- `.trellis/tasks/archive/2026-08/07-30-cvn-0-public-unknown-guard-consistency/`
- `.trellis/tasks/archive/2026-08/08-04-cvn-1-command-transaction-registry-spine/`
- `.trellis/tasks/archive/2026-08/08-04-cvn-3-document-factory-measure-lifecycle/`
- `.trellis/tasks/archive/2026-08/08-04-cvn-4-part-staff-voice-lifecycle/`

Accepted coordination gates:

- `.trellis/tasks/archive/2026-08/08-09-core-vnext-extensibility-reservation-review/`

Current planning child:

- `.trellis/tasks/08-10-cvn-2-official-module-sdk-frozen-assembly/`

Active coordination gate at this snapshot: CVN-2 bounded planning repair followed by independent re-review. Active CVN implementation child: none. The initial review returned P0/P1/P2=`0/2/1`; implementation activation still requires a repaired `0/0/0` planning result and an explicit user decision.

GD-0 dependency authority:

- `.trellis/tasks/archive/2026-08/07-28-gd-0-guitar-domain-core-transaction-contract/task.json`
- `.trellis/tasks/archive/2026-08/07-28-gd-0-guitar-domain-core-transaction-contract/design.md`
- `.trellis/spec/core-kernel/backend/domain-transaction-integration.md`

## 19. Maintenance Rules

Update this file when a child or reservation gate is created, activated, accepted or archived; when a dependency changes through parent review; when an exact command allocation, FC owner, limit, fixture or budget changes; when a reserved port is adopted into a version lane; or when the active-child pointer materially changes.

For a status-only update:

1. update parent and child `task.json` first;
2. update the status snapshot and scheduling decisions here;
3. retain historical commit/test evidence instead of replacing it with an unverified claim;
4. validate parent and active-child context manifests;
5. run `git diff --check` and confirm no planning update touched `src/**` or `test/**`.

For a contract change, update `feature-contract-matrix.md` first, perform parent review, then synchronize this file and affected child plans. A future reservation becoming an implementation target must also update CVN-D012/CVN-R012/CVN-AC018 and create its own accepted version-lane contract. This roadmap never silently changes an owning FC contract.
