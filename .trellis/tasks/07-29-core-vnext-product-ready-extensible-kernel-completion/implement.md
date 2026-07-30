# Core VNext Product-Ready Extensible Kernel Implementation Plan

## 1. Execution Status

`PLANNING / DETAILED CONTRACT REVIEW CANDIDATE / CVN-0 IMPLEMENTATION CANDIDATE PENDING INDEPENDENT ACCEPTANCE / OTHER CHILDREN INACTIVE`.

This parent task coordinates independently verifiable children. It does not batch all production changes into one implementation branch. Each child must receive its own PRD/design/implement review, `task.py start`, independent technical audit and archive decision.

After final user approval, the parent may enter `in_progress` only as the coordination tracker. That lifecycle change does not authorize source changes. Create only the next dependency-satisfied child, finish its planning, present it for review, and run that child's `task.py start` only after explicit approval.

## 2. Entry Baselines

- Core V1 close baseline: `d92a7586536ac8757c318ae6f75aabd8698f85ac`.
- Current planning branch HEAD at assessment: `8c26fc29a4a103c400497b7c1f1fbfdbee2fca0c`.
- GD-0: documentation review candidate; independent acceptance pending.
- Core accepted regression evidence: 8/8 K1-6 focused and 169/169 full tests.
- Production-code drift from Core close baseline to the planning HEAD: none in `src/**`, `test/**`, `package.json`, or `tsconfig.json`.

Every child records a fresh activation baseline and may not substitute these historical hashes for its own live verification.

## 3. Parent Planning Closeout

- [x] Run the final PRD convergence pass.
- [x] Review `design.md` against active Core specs and GD-0 candidate contracts.
- [x] Freeze parent-level feature behavior in `feature-contract-matrix.md`: 28-command catalog, factory, payloads, anchors, failure priority, caps, fixtures and decisive tests.
- [x] Synchronize task metadata, related files, task map and lifecycle wording; use `documentation-sync-matrix.md` for the post-approval GD-0/roadmap pass.
- [x] Re-run `python ./.trellis/scripts/task.py validate 07-29-core-vnext-product-ready-extensible-kernel-completion` after the detailed-contract pass.
- [x] Re-run Markdown contract/path/count checks and `git diff --check` after the detailed-contract pass.
- [x] Present all four parent contract artifacts and a concise decision summary to the user.
- [x] Receive explicit approval to create the first planning child; `07-30-cvn-0-public-unknown-guard-consistency` was created on 2026-07-30.
- [x] Obtain explicit review approval before running `task.py start` for CVN-0; creation alone does not activate implementation.

## 4. Child Gate Map

Dependency graph:

```text
CVN-0 -> CVN-1 -> CVN-2 -> CVN-6
              \-> CVN-3 -> CVN-4
CVN-2 + CVN-3 + CVN-4 + CVN-6 -> CVN-5
CVN-0 .. CVN-6 -> CVN-7
```

Numeric labels organize scope; the arrows above are the actual execution dependencies.

### CVN-0 — Public Unknown-Guard Consistency

**Purpose:** close the accepted qualification P3 without inventing a new general-purpose subsystem.

**Dependencies:** accepted Core V1 only.

**Scope:**

- public `isJsonValue`, `isWrittenPitch`, `isTransposition` and any directly shared private predicate helper；
- descriptor-first/no-getter/no-throw tests for hostile object, Proxy, accessor and sparse-array cases；
- stable boolean classification; K1-5 error/report contracts remain separate；
- establish the strict inspection primitives consumed by later VNext decoders; depth/property budget counters land with those new decoder gates and do not add a V1 predicate size rejection。

**Created child:** `.trellis/tasks/07-30-cvn-0-public-unknown-guard-consistency/`, status `planning`, branch `codex/cvn-0-public-unknown-guard-consistency`, activation HEAD `8c26fc29a4a103c400497b7c1f1fbfdbee2fca0c`.

**Protected:** command/history/event/Registry behavior and public export list except an explicitly approved private helper layout.

**Exit:** focused hostile-input tests plus full Core regression pass and independent acceptance.

### CVN-1 — Behavior-Preserving Command/Transaction/Registry Spine Refactor

**Purpose:** establish the internal execution catalog/effect-set architecture with zero new user-visible behavior.

**Dependencies:** CVN-0 accepted; GD-0 contract either independently accepted or explicitly treated only as non-authoritative research input.

**Before code:**

- capture machine-readable characterization trace for all six commands across submit/no-op/reject/undo/redo/replay；
- capture documentVersion/history depths/checkpoint/dirty/events/results/support and unknown-extension facts；
- freeze public exports and Core-only Registry/Gateway summaries。

**Implementation sequence:**

1. Add private default Core execution assembly and adapter definitions for the existing six commands.
2. Separate command-specific decode/prepare from transaction coordination.
3. Introduce private ordered nonempty effect sets and clone-once candidate application.
4. Generalize private history entries and inverse derivation while preserving public results.
5. Bind Core validation/classification through the default frozen pipeline.
6. Route live submit and Core replay through the same internal assembly.
7. Split Registry manifest normalization, compiled binding validation, assembly state and gateway dispatch internally.
8. Remove superseded private single-mutation paths only after characterization parity.

**Protected:** persisted schema; all Core V1 public signatures/discriminants; read/snapshot/checkpoint/event/report/migration behavior.

**Exit:** before/after trace deep equality, full test suite, no new root export and independent technical acceptance.

### CVN-2 — Official Module SDK and Frozen Contribution Assembly

**Purpose:** expose the minimum versioned authoring contract for statically compiled official modules and construct one immutable integrated assembly.

**Dependencies:** CVN-1 accepted; GD-0 independently accepted.

**Scope:**

- descriptor/binding contracts and safe builders；
- command decoder/prepare handler restricted context；
- allowed effect requests and affected-address facts；
- module error base to data-only issue conversion boundary；
- namespace/schema compatibility declarations；
- all-or-nothing detached catalog compilation, private assembly identity and frozen public summary；
- frozen ready state with no lifecycle mutation API。

**Fixed limits:** CVN-FC-010/111: 64 modules, 256 contribution entries, 4,096 commands, 4,096 effects, 1,024 namespaces, 256 supported versions per requirement, and deterministic exact-boundary/boundary+1 startup tests.

**Protected:** no writable integrated bus/gateway/replay session is exposed in this gate; stateful binding belongs to CVN-6.

**Exit:** two synthetic official modules prove deterministic catalog order, descriptor/binding parity, capability and namespace isolation, bounded effect-request decoding, deep freeze and all-or-nothing construction. No Guitar dependency is used.

### CVN-3 — Document Factory and Measure Lifecycle

**Purpose:** supply deterministic score initialization and complete measure structure editing.

**Dependencies:** CVN-1 accepted. This gate remains Core-only; cross-module integration is verified by later dependent gates.

**Scope:**

- CVN-FC-020/021 strict `createScoreDocument(unknown)` pure factory with one explicit initial measure and exact result failures；
- `core.measure.insert` with exact per-Part contents；
- `core.measure.remove` ownership aggregate；
- `core.measure.move` synchronized global/per-Part order；
- `core.measure.set-definition` with explicit `pickup: none | duration`；
- atomic update of measureDefinitions and every Part's measureContents；
- caller-supplied IDs, exact inverse, unknown-extension preservation and semantic/profile separation。

**Exit:** CVN-FC-140/142 cases are green for factory and all four exact IDs; catalog target/payload allowlist, full history/replay/event parity and no whole-document replacement API are proven.

### CVN-4 — Part / Staff / Voice Lifecycle

**Purpose:** complete generic hierarchy editing on the accepted score schema.

**Dependencies:** CVN-3 accepted; CVN-1 accepted.

**Fixed command set:**

- Part: `core.part.insert/remove/move/set-name/set-instrument`；
- Staff: `core.staff.insert/remove/move/set-definition`；
- Voice: `core.voice.insert/remove/move/set-default-staff/set-sequence-start`；
- Event: `core.event.set-staff-assignment`。

**Fixed behavior:** CVN-FC-030/031 and CVN-FC-060–070 own exact payloads, anchors, no-op and deletion rules. Part removal includes Part-owned extensions; Voice removal includes owned events/notes; Staff removal returns `command.reference-conflict` while any Voice/Event staff reference remains. Reassignment uses the two explicit commands or batch; remove commands have no generic cascade/reassign flag.

**Exit:** each entity lifecycle has committed/no-op/rejected/undo/redo/replay coverage, exact inverse data and deterministic diagnostics. Dedicated fixtures prove Measure/Part/Voice ownership cascade, unknown extension restoration, Staff cross-reference rejection and last-required-entity semantic rejection.

### CVN-5 — Range Transformations and Explicit Atomic Batch

**Purpose:** add safe multi-entity editing through existing stable ranges and the single submit port.

**Dependencies:** CVN-2, CVN-3, CVN-4 and CVN-6 accepted.

**Scope:**

- `core.range.delete` with the three exact CVN-FC-081 range effects；
- `core.range.transpose-written-pitch` with CVN-FC-080/082 traversal and first-failing-note attribution；
- `core.transaction.batch` through `submit(unknown)` with child count `1..100`；
- ordered Core and official-module children from the same frozen assembly；
- nested-batch indexed rejection；input depth `64`；input properties `1,048,576`；effects/affected addresses `131,072`；
- child decode/route/target/prepare/effect failure index；top-level final semantic/domain failure；
- one candidate/validation/commit/version/history/event for the whole batch；
- child-order then Core/module-catalog-order assessment aggregation；
- unknown/current-assembly-incompatible child IDs, external catalog handles, child/effect limit and intermediate failure atomic rejection；
- sequential child preparation against one candidate, all-no-op normalization and one final validation/classification pass。

**Exit:** every CVN-FC-141 case, including 0/1/100/101, index 0/50/99, intermediate-invalid/final-valid, final-invalid-without-index and exact resource boundaries, proves atomicity, deterministic replay, reverse inverse order, redo invalidation and failure-state preservation.

### CVN-6 — Domain Validation / Profile / Diagnostics / Schema Migration Integration

**Purpose:** finish module data lifecycle beyond command execution.

**Dependencies:** CVN-2 and CVN-1 accepted. CVN-3/4 may proceed in parallel and later provide structural regression fixtures; CVN-5 waits for this gate.

**Scope:**

- exact per-block schema compatibility；
- integrated factory plus assembly-bound existing bus/gateway/replay construction；
- complete/incomplete validation availability；
- Core-first then frozen module validator/classifier order；
- module issue/report mapping；
- detached deterministic official-extension migration pipeline；
- lossless read-only degradation and unknown opaque extension preservation。

**Fixed contracts:** import the accepted GD-0 public-contract fences without renaming; enforce CVN-FC-110–122 callback isolation, exact compatibility, issue/fact caps, same-assembly identity and write-preflight priority.

**Exit:** two synthetic modules prove one atomic multi-effect transaction through the existing bus/history/replay/event owner, integrated factory/gateway/replay binding, missing/incompatible/future/mixed block matrices, migration round-trip, validator/classifier call-count rules, deterministic module assessments and privacy-safe failures.

### CVN-7 — Core VNext Compatibility, Reliability and Scale Gate

**Purpose:** close the product-ready extensible kernel only after every mechanism is integrated.

**Dependencies:** CVN-0 through CVN-6 all independently accepted and archived.

**Matrix:**

- Core-only V1 characterization unchanged；
- complete document/measure/Part/Staff/Voice/range/batch flow；
- two synthetic official modules in one atomic transaction；
- live/replay/undo/redo/checkpoint/dirty/event equality；
- codec/migration and unknown-extension preservation；
- hostile inputs and exception isolation；
- small and medium deterministic fixtures；
- release-blocking 200-Measure/8-Part/exactly-2-Voice/exactly-8-Event fixture: 25,600 Events, 12,800 Notes, exactly two synthetic official modules and exactly 2,000 committed history entries；
- reference-Windows P95 budgets: single-target submit/undo/redo `<= 100 ms`, read/snapshot `<= 50 ms`, 100-child batch `<= 300 ms`, 100-command replay `<= 2 s`, representative create/decode/semantic/compatibility `<= 1 s`；
- 400-Measure/16-Part/2-Voice/8-Event stress fixture: 102,400 Events and exactly 10,000 submitted/replayed envelopes, blocking on deterministic equality and peak RSS `<= 2.0 GiB` while latency remains trend-only；
- benchmark evidence uses CVN-FC-133: five warm-ups, twenty fresh-state samples, nearest-rank sample-19 P95, exact environment/build hash, median/P95 and peak heap/RSS；
- portable candidate/accepted-baseline same-machine median and P95 ratios both `<= 1.20`；
- exact reference environment is Node v24.15.0, win32 x64, NT 10.0.26200.0, i9-13900HX/32 logical CPUs/39.7 GiB, clean production build；
- public API and forbidden dependency boundaries；
- clean reproducible build and independent audit。

**Exit:** fixed acceptance baseline, active Core/product spec synchronization including the missing planned `SPEC-010-product-quality.md` or its explicitly approved replacement authority, parent acceptance and archive. Guitar Domain remains a separate consumer gate.

## 5. Required Validation per Production Child

Minimum commands, adjusted only where a child has an approved narrower test command:

```powershell
npm run typecheck
npm run build
npm test
git diff --check
python ./.trellis/scripts/task.py validate <child-task>
```

Also run:

- focused tests for the child's changed contracts；
- `test/core-kernel/public-api-boundary.test.ts`；
- `test/core-kernel/forbidden-dependency-boundary.test.ts`；
- characterization trace comparison for CVN-1 and every later command-pipeline change；
- protected-path diff inspection against the child's activation baseline。
- contract trace check proving every owned CVN-FC row has at least one decisive test and no changed ID/target/payload/cap；
- exact catalog count/allowlist checks: six V1 IDs plus twenty-two VNext IDs after CVN-5。

Windows `spawn EPERM` is recorded as an environment failure and the same narrow command is rerun through an approved execution path; it is not treated as a product pass or product defect without a completed rerun.

## 6. Commit and Review Discipline

- Keep characterization, internal refactor, additive capability and documentation synchronization in reviewable commits.
- A child may touch several internal files, but it owns one semantic purpose only.
- Refactor commits do not also introduce new public feature behavior.
- New capability commits do not opportunistically redesign frozen V1 contracts.
- Each child requires an independent audit before its successor's dependency is considered satisfied.

## 7. Rollback Points

- **CVN-0:** revert predicate/helper changes; no data migration.
- **CVN-1:** revert the child branch to its activation baseline; persisted schema and public APIs remain unchanged.
- **CVN-2:** remove integrated factories/catalog bindings; Core-only default assembly remains.
- **CVN-3–5:** remove the additive command definitions/effects and their exports; existing documents remain valid.
- **CVN-6:** remove module validation/migration contributions; unknown extension preservation remains available through Core V1.
- **CVN-7:** qualification adds no product behavior; failed qualification returns findings to the owning child.

## 8. Stop Conditions

Stop the active child and return to planning if any of the following occurs:

- a persisted `brilliant-score-1` field must change；
- Core needs to import Guitar or another concrete domain；
- a second bus/history/replay/event owner appears；
- a public patch/mutable-document path is proposed；
- ready-state registration, unload, replacement or hot plug is introduced；
- Core-only V1 behavior cannot remain compatible；
- a child needs to modify a protected subsystem without an explicit invariant and new acceptance matrix。
- an old CK1.1/GD-2 label would create a duplicate generic Core seam instead of mapping to CVN-D011。
- implementation would change any CVN-FC command ID/target/payload, anchor, cascade, range, batch attribution, failure priority, resource cap, fixture or budget without renewed parent review。

## 9. Parent Completion Checklist

- [ ] All child task dependencies are explicitly written in child artifacts.
- [ ] CVN-0 through CVN-7 have independent acceptance records.
- [ ] Core V1 compatibility matrix is fully green.
- [ ] Core VNext scale/reliability gate is independently accepted.
- [ ] Active Core specs and product roadmap reflect the fixed VNext baseline.
- [ ] GD-0/CK1.1/GD-2 legacy labels map to CVN-0/1/2/5/6 without duplicate implementation ownership.
- [ ] CVN-FC-001–143 have a complete requirement → gate → test → evidence trace with no unresolved placeholder.
- [ ] Final catalog/export evidence reports exactly 28 Core command IDs: six preserved V1 plus twenty-two additive VNext.
- [ ] Parent PRD acceptance criteria are all evidenced.
- [ ] User approves final Core VNext closure before archive.
