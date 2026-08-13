# Core VNext Product-Ready Extensible Kernel Implementation Plan

## 1. Execution Status

`PLANNING COORDINATION / CVN-0 THROUGH CVN-6, EXTENSIBILITY RESERVATION AND GD-0 ACCEPTED AND ARCHIVED / CVN-7 IN PROGRESS; THIRD INPUT 330d893 REACHED BASELINE BATCH-100 WARMUP AND ENDED EVIDENCE_INVALID ON A CVN-7 EVENT-ASSERTION DEFECT / NO PARTIAL EVIDENCE / BOUNDED ASSERTION REPAIR IMPLEMENTED / TARGETED INDEPENDENT REREVIEW PENDING / CVN-7 AND PARENT ACCEPTANCE/ARCHIVE STILL OPEN`.

This parent task coordinates independently verifiable children. It does not batch all production changes into one implementation branch. Each child must receive its own PRD/design/implement review, `task.py start`, independent technical audit and archive decision.

After final user approval, the parent may enter `in_progress` only as the coordination tracker. That lifecycle change does not authorize source changes. Create only the next dependency-satisfied child, finish its planning, present it for review, and run that child's `task.py start` only after explicit approval.

## 2. Entry Baselines

- Core V1 close baseline: `d92a7586536ac8757c318ae6f75aabd8698f85ac`.
- Unified CVN-6 planning baseline: `050af1eed067300f2e2fb0339eff6f2430e43b36`, containing accepted/archived CVN-2 and the post-Core roadmap as separate ancestors.
- GD-0, the Extensibility Reservation, CVN-2 and CVN-6 are accepted and archived. CVN-5 candidate `f329ec1` passed final independent implementation rereview with `0/0/0`; focused `49/49`, full `432/432`, typecheck/build and structural gates were reproduced, acceptance is `b2ad0bc`, and archive is `198c71a`.
- Core V1 accepted regression evidence: 8/8 K1-6 focused and 169/169 full tests.
- CVN-0 accepted evidence: 19 focused, 42 related regression and 188 full tests; final independent re-review passed on 2026-08-04.
- CVN-1 accepted evidence: 19/19 command-internals and 193/193 full tests; immutable characterization SHA-256 `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`; final narrow independent re-review passed on 2026-08-04.
- Accepted Core VNext drift through CVN-4 comprises CVN-0 hostile-input guards, CVN-1 private spine, CVN-3 factory/Measure lifecycle and CVN-4 Part/Staff/Voice/Event lifecycle. The current catalog has 25 commands, the six V1 characterization fixture remains at SHA-256 `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`, and normalized-HEAD typecheck/build/full tests pass 312/312.

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
- [x] Accept and archive CVN-0 after final independent re-review; acceptance commit `cc9beee`, archive commit `6cec36b`.
- [x] Receive user direction to continue to the next planning gate and create CVN-1 on 2026-08-04.
- [x] Accept and archive CVN-1 after final narrow independent re-review; transaction commit `f7c0064`, Registry commit `1016d05`, acceptance commit `8362086`, archive commit `4bdc405`.
- [x] Select CVN-3 as the next dependency-satisfied child because CVN-1 is accepted while CVN-2 still additionally depends on GD-0 independent acceptance.
- [x] Create `08-04-cvn-3-document-factory-measure-lifecycle` and branch `codex/cvn-3-document-factory-measure-lifecycle` on 2026-08-04.
- [x] Complete the CVN-3 PRD/design/implementation/research/context-manifest planning package before activating production implementation.
- [x] Receive explicit user review approval and run `task.py start` for CVN-3 on 2026-08-04; task status is `in_progress` and operator handoff is authorized.
- [x] Add the durable CVN dependency and stage recovery plan at `research/cvn-roadmap-and-stage-plan.md`, register it in parent/CVN-3 context, and define its maintenance protocol.
- [x] Complete conditional CVN-4 preplanning and live hierarchy evidence without creating/activating the formal child; CVN-3 independent acceptance remains the formal creation gate.
- [x] Independently accept CVN-3 at `d9500f5` with P0/P1/P2 = `0/0/0`, record acceptance commit `3691d93`, archive the child, and mark the CVN-4 dependency satisfied.
- [x] Independently accept and archive CVN-4 after its narrow P2 repair; source/test candidate `788594e`, acceptance `1bb19b0`, archive `13039d0`, full tests 312/312.
- [x] Independently accept and archive the Core VNext extensibility reservation gate; acceptance `253d19e`, archive `a4d8cee`.
- [x] Synchronize the GD-0/Core VNext/product ownership map so legacy CK1.1/GD-2 labels create no duplicate implementation path while all public-contract fences remain unchanged.

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

**Archived child:** `.trellis/tasks/archive/2026-08/07-30-cvn-0-public-unknown-guard-consistency/`, status `completed`, branch `codex/cvn-0-public-unknown-guard-consistency`, activation HEAD `8c26fc29a4a103c400497b7c1f1fbfdbee2fca0c`, final independent re-review passed 2026-08-04.

**Protected:** command/history/event/Registry behavior and public export list except an explicitly approved private helper layout.

**Exit:** focused hostile-input tests plus full Core regression pass and independent acceptance.

### CVN-1 — Behavior-Preserving Command/Transaction/Registry Spine Refactor

**Purpose:** establish the internal execution catalog/effect-set architecture with zero new user-visible behavior.

**Dependencies:** CVN-0 accepted; GD-0 contract either independently accepted or explicitly treated only as non-authoritative research input.

**Archived child:** `.trellis/tasks/archive/2026-08/08-04-cvn-1-command-transaction-registry-spine/`, status `completed`, branch `codex/cvn-1-command-transaction-registry-spine`, base `codex/cvn-0-public-unknown-guard-consistency`, activation HEAD `a8c7404cc34649aaa2c6ebfe8d93e46daf87dbf5`. The final source commits are `f7c0064` and `1016d05`; acceptance was recorded by `8362086` and archived by `4bdc405`. The final narrow independent re-review found no reproducible P0/P1/P2. GD-0 remains explicitly non-authoritative research input.

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

**Result:** exit criteria passed and the child is archived; no subsequent child is activated by this record.

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

**Archived child:** `.trellis/tasks/archive/2026-08/08-11-cvn-5-range-operations-explicit-atomic-batch/`; status `completed`, implementation candidate `f329ec1`, acceptance `b2ad0bc`, archive `198c71a`, final independent rereview P0/P1/P2=`0/0/0`.

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
- child index orders preparation/effects/affected facts/failure attribution; the final assessment runs once, Core first then frozen module catalog order, with no per-child validator/classifier reruns；
- unknown/current-assembly-incompatible child IDs, external catalog handles, child/effect limit and intermediate failure atomic rejection；
- sequential child preparation against one candidate, all-no-op normalization and one final validation/classification pass。

**Exit:** every CVN-FC-141 case, including 0/1/100/101, index 0/50/99, intermediate-invalid/final-valid, final-invalid-without-index and exact resource boundaries, proves atomicity, deterministic replay, reverse inverse order, redo invalidation and failure-state preservation.

**Accepted evidence:** focused CVN-5 `49/49`, clean-source full regression `432/432`, typecheck/build, GD-0 compile fences, exact root/SDK/catalog counts, strict JSON/JSONL, implementation allowlist, protected paths and diff checks pass. Acceptance record: `b2ad0bc`; archive: `198c71a`. CVN-7 planning is dependency-satisfied.

**Formal planning closures:** outer Stage 3 validates exact batch shape/density/count/global capture budgets only; nested-batch detection occurs per child at route so the lowest index wins. Child index orders route/preparation/effects/affected facts/failure attribution, while the final public assessment is built once from the final candidate: Core first, then frozen module catalog order. There are no per-child validator/classifier reruns.

### CVN-6 — Module Runtime, Validation and Migration Integration

**Archived child:** `.trellis/tasks/archive/2026-08/08-11-cvn-6-module-runtime-validation-migration-integration/`; source `8da50f9`, acceptance `160674d`, archive `a0c1d6a`, final independent implementation review P0/P1/P2=`0/0/0`.

**Purpose:** bind the accepted CVN-2 catalog plus a CVN-6-owned data-only known-requirement inventory to the existing CVN-1 bus/gateway/replay/session owner and complete validation, profile, diagnostics, compatibility and detached migration.

**Dependencies:** CVN-1 accepted; CVN-2 accepted/archived; Extensibility Reservation and GD-0 accepted/archived. CVN-3/4 provide accepted structural regression fixtures only. CVN-5 consumed this accepted/archived CVN-6 line.

**Scope:**

- exact per-block schema compatibility；
- catalog-only and explicit-inventory integrated Registry/bus/gateway/replay construction；
- complete/incomplete validation availability；
- Core-first then frozen module validator/classifier order；
- module issue/report mapping；
- detached deterministic official-extension migration pipeline；
- lossless read-only degradation and unknown opaque extension preservation。

**Fixed contracts:** own only `CVN-FC-112/120/121/122`; consume the accepted GD-0 public-contract fences and frozen CVN-2 nine-field ABI; enforce strict inventory codec/parity/caps, callback isolation, exact compatibility, catalog+inventory assembly identity and write-preflight priority. The application-facing known-requirement inventory plus explicit integrated Registry/bus/replay overloads, modular event type, invalid-inventory/construction-resource failures and detached migration entry are the bounded public closures recorded by the child. The CVN-2 compiler/catalog, nine-field ABI and SDK `8/34` exports remain exact.

**Exit:** two synthetic modules prove one atomic multi-effect transaction through the existing bus/history/replay/event owner, integrated factory/gateway/replay binding, public-path unavailable/incompatible/future/unknown/mixed block matrices, migration round-trip, validator/classifier call-count rules, deterministic module assessments and privacy-safe failures.

### CVN-7 — Core VNext Compatibility, Reliability and Scale Gate

**Formal child:** `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/`; status `in_progress`, qualification base `38afdc3fd508dc67f7aa446fd323837a5d550b70`, task start and qualification implementation authorization true. Inputs `7e3b7e6` and `e510ed1` ended before worker startup; input `330d893` reached the baseline `batch-100` warmup worker and failed because CVN-7 expected the wrong committed-event name. Independent root-cause review classified the third failure as a harness assertion defect, P0/P1/P2=`0/1/0`, with Core/CVN-5 unchanged. A bounded assertion repair is implemented and awaits targeted rereview; only its later clean reviewed HEAD may be passed equally as candidate and harness commit for a fresh full run. All attempts have `partial_evidence=false`; measurement completion, acceptance and archive remain false.

**Purpose:** close the product-ready extensible kernel only after every mechanism is integrated.

**Dependencies:** CVN-0 through CVN-6 all independently accepted and archived.

**Primary contracts:** exact existing rows `CVN-FC-130..134` and `CVN-FC-140..143`. IDs `CVN-FC-135..139` are unallocated and add no implicit scope. CVN-7 consumes all 44 actual parent FC rows as qualification evidence without changing their primary ownership.

**Production boundary:** default `src/**` delta is zero. Qualification may add new test fixtures, test-only runners, evidence, two npm scripts and final specification/status synchronization. Any behavior defect returns to the named owning gate through an independent bounded repair task.

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
- **CVN-2:** remove the official SDK and detached catalog additions; Core-only default assembly remains.
- **CVN-3–5:** remove the additive command definitions/effects and their exports; existing documents remain valid.
- **CVN-6:** remove catalog-bound integrated runtime and detached migration additions; Core-only construction and unknown-extension preservation remain available.
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
- [x] GD-0/CK1.1/GD-2 legacy labels map to CVN-0/1/2/5/6 without duplicate implementation ownership.
- [ ] CVN-FC-001–143 have a complete requirement → gate → test → evidence trace with no unresolved placeholder.
- [ ] Final catalog/export evidence reports exactly 28 Core command IDs: six preserved V1 plus twenty-two additive VNext.
- [ ] Parent PRD acceptance criteria are all evidenced.
- [ ] User approves final Core VNext closure before archive.
