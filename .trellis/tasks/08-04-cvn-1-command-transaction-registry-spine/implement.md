# CVN-1 Implementation and Verification Plan

## 1. Execution Status

`USER APPROVED 2026-08-04 / TASK STARTED / OPERATOR HANDOFF READY / CHARACTERIZATION FIRST`.

This file is the CVN-1 operator record. User approval and `task.py start` were recorded on 2026-08-04 at activation HEAD `a8c7404cc34649aaa2c6ebfe8d93e46daf87dbf5`; characterization and all implementation stages then completed on the isolated CVN-1 branch. The final narrow independent re-review passed on 2026-08-04, with only Trellis archive bookkeeping remaining.

## 2. Activation Preconditions

All items are mandatory before the first `src/**` edit:

- [x] User approves `prd.md`, `design.md` and this execution plan.
- [x] Planner runs `python ./.trellis/scripts/task.py start 08-04-cvn-1-command-transaction-registry-spine`.
- [x] `task.py current --source` points to this task and status is `in_progress`.
- [x] Branch is `codex/cvn-1-command-transaction-registry-spine`.
- [x] Base branch is `codex/cvn-0-public-unknown-guard-consistency`.
- [x] Working tree is clean and HEAD is recorded.
- [x] CVN-0 archive exists and its final independent re-review is passed.
- [x] GD-0 is treated only as non-authoritative research input unless its live task has separately reached accepted/archive status.
- [x] Trellis context manifests contain real spec/research entries and `task.py validate` passes.

Record activation facts in the task's `task.json.meta` and append a dated section to this file. Do not reuse historical HEAD/test output as a live activation result.

### Activation record — 2026-08-04

- Task activation was re-bound to this Codex session through `task.py start`; `task.py current --source` reports `08-04-cvn-1-command-transaction-registry-spine` with `status: in_progress`.
- Activation planning commit: `6d074ff84a13692ff1127ff16dd492c7c59c6246`; production merge-base: `a8c7404cc34649aaa2c6ebfe8d93e46daf87dbf5` on `codex/cvn-0-public-unknown-guard-consistency`.
- Host facts: Windows NT `10.0.26200.0`, Node `v24.15.0`, npm `11.12.1`, 32 logical processors.
- Fresh pre-characterization verification passed: `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd test` (188/188), `task.py validate`, and `git diff --check`.

## 3. Owned and Protected Files

### 3.1 Expected production edit surface

- `src/core-kernel/commands/catalog.ts`
- `src/core-kernel/commands/strict-codec.ts`
- `src/core-kernel/commands/execution-assembly.ts` (new)
- `src/core-kernel/commands/core-command-adapters.ts` (new)
- `src/core-kernel/commands/effects.ts` (new)
- `src/core-kernel/commands/mutations.ts` (retire after parity)
- `src/core-kernel/commands/runtime.ts`
- `src/core-kernel/commands/command-bus.ts`
- `src/core-kernel/commands/replay.ts`
- `src/core-kernel/session/runtime.ts`
- `src/core-kernel/events/facts.ts`
- `src/core-kernel/events/runtime.ts`
- `src/core-kernel/registry/strict-codec.ts` only when import/type movement is required; decoding behavior stays fixed
- `src/core-kernel/registry/assembly.ts` (new)
- `src/core-kernel/registry/gateway.ts` (new)
- `src/core-kernel/registry/runtime.ts`
- `src/core-kernel/registry/builtins.ts`
- `src/core-kernel/index.ts` only for source-compatible re-export routing; runtime export names remain identical

Any `src/**` path outside this list requires a written reason and planner review before editing.

### 3.2 Expected test/fixture surface

- `test/core-kernel/fixtures/cvn-1-characterization.ts` (new)
- `test/core-kernel/fixtures/cvn-1-characterization.expected.json` (new)
- `test/core-kernel/command-spine-characterization.test.ts` (new)
- `test/core-kernel/command-internals.test.ts`
- `test/core-kernel/command-system.test.ts`
- `test/core-kernel/event-system.test.ts`
- `test/core-kernel/dirty-checkpoint.test.ts`
- `test/core-kernel/read-system.test.ts`
- `test/core-kernel/registry-contracts.test.ts`
- `test/core-kernel/registry-gateway.test.ts`
- `test/core-kernel/core-kernel-integration.test.ts`
- `test/core-kernel/core-kernel-integration-boundaries.test.ts`
- `test/core-kernel/public-api-boundary.test.ts`
- `test/core-kernel/forbidden-dependency-boundary.test.ts`

Existing tests may receive imports or stronger assertions. Test removal, assertion weakening or expected-trace regeneration is a stop condition.

### 3.3 Protected surfaces

- all domain/codec persisted shapes;
- public contracts and failure unions;
- report and migration implementation;
- physical IO and application layers;
- product/Guitar behavior;
- parent feature catalog and later-child contracts.

## 4. Ordered Delivery Stages

### Stage 0 — Fresh activation evidence

1. Capture:

   ```powershell
   git status --short --branch
   git rev-parse HEAD
   git merge-base HEAD codex/cvn-0-public-unknown-guard-consistency
   python ./.trellis/scripts/task.py current --source
   python ./.trellis/scripts/task.py validate 08-04-cvn-1-command-transaction-registry-spine
   ```

2. Confirm the merge-base equals the accepted CVN-0-derived planning baseline or record the exact approved successor commit.
3. Record Node, npm, OS and CPU facts used by later evidence.
4. Run the existing suite before adding characterization:

   ```powershell
   npm run typecheck
   npm run build
   npm test
   git diff --check
   ```

5. Expected minimum baseline: all 188 previously accepted tests remain present and green. If live discovery reports a larger legitimate baseline, record that exact count and use it instead.

**Gate S0:** clean baseline, task active, no unexplained regression.

### Stage 1 — Characterization-only commit

This stage touches `test/**` and task evidence only. It precedes production edits.

1. Add `fixtures/cvn-1-characterization.ts` with the ten case IDs fixed in `design.md`.
2. Add `fixtures/cvn-1-characterization.expected.json` generated once from the activation HEAD.
3. Add `command-spine-characterization.test.ts` that collects the live public trace and deep-compares it with the JSON.
4. Trace exactly:
   - sorted 48 root exports;
   - six catalog IDs/target kinds;
   - operation result plus post-operation `read()` and new events;
   - checkpoint/dirty transitions;
   - replay result/final document;
   - unknown extension payloads;
   - Registry summary/gateway parity/denial.
5. Exclude private objects, absolute paths, timing, stacks and environment-specific values.
6. Run the new test twice in fresh processes and compare the generated trace bytes.
7. Commit this stage before any source refactor with planned message:

   `test(core): freeze CVN-1 V1 characterization`

**Gate S1:** test-only baseline commit exists; expected JSON is immutable for subsequent stages.

### Stage 1 record — 2026-08-04

- Added the required ten-case public characterization collector, immutable expected trace, and regression test without changing `src/**`.
- Two separate Node processes generated identical formatted trace bytes: SHA-256 `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`.
- The expected JSON is derived from the CVN-0 production baseline `a8c7404`; the only intervening commit `6d074ff` is task-planning documentation.
- Characterization test passed, then the full suite passed at 189/189 with `typecheck`, `build`, and `git diff --check` green. Subsequent production stages compare against this JSON and must not regenerate it.

### Stage 2 — Private default execution assembly and six adapters

1. Add `execution-assembly.ts` private contracts and all-or-nothing frozen construction.
2. Add `core-command-adapters.ts` containing exactly six definitions.
3. Split `strict-codec.ts` into outer route plus selected definition payload decode without changing failure order.
4. Fix default private source identity to `core.commands` / `core.commands.v1`.
5. Deep-freeze accepted envelopes and assembly data.
6. Keep current runtime using compatibility adapters until Stage 3 is green.
7. Add direct tests for:
   - exact six definitions and order;
   - duplicate/target mismatch construction rejection;
   - frozen arrays/records and no leaked mutable lookup;
   - accepted envelope detachment/deep freeze;
   - descriptor-first failure parity.

**Gate S2:** golden characterization, command internals/system and public API tests pass; no new root export.

### Stage 2 record — 2026-08-04

- Commit `6776cead1582d700ff7b617167b336aa8dce4f7f` added the frozen `core.commands` / `core.commands.v1` default execution assembly, its six adapter definitions, and assembly-routed detached command decoding.
- Direct adapter tests cover exact catalog order, source identity, frozen construction, duplicate/target-kind rejection, and detached deeply frozen accepted envelopes.
- The post-Stage-2 full suite passed at `191/191`; the immutable characterization JSON remained SHA-256 `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`.

### Stage 3 — Ordered effect-set engine

1. Add the five exact effect kinds in `effects.ts`.
2. Move no-op/target/anchor logic into Core adapters.
3. Make prepare return forward effects and canonical affected addresses only.
4. Implement one-root-clone candidate application and inverse derivation from the evolving candidate.
5. Reverse inverse order before history storage.
6. Add decisive internal cases:
   - two effects targeting different fields;
   - two sequential replacements targeting the same field;
   - insert followed by a dependent operation;
   - second-effect failure discards the full candidate;
   - empty/corrupt set fails before clone/adoption;
   - forward and inverse sets are detached/frozen.
7. Keep the old mutation execution path available only until Stage 4 parity.

**Gate S3:** clone-count, effect-order, inverse-order and atomic-failure assertions pass; golden trace unchanged.

### Stage 4 — Generic transaction and private history

1. Bind `CommandRuntimeState` to the default assembly privately.
2. Replace the old `HistoryEntry` with accepted command + forward/inverse nonempty sets + affected addresses.
3. Preserve nextHistorySequence allocation and content-state identity.
4. Route submit through definition prepare and effect application.
5. Route undo/redo through stored effect sets.
6. Preserve submit/history failure mapping and exact state-object identity on no-op/rejection where current tests assert it.
7. Remove obsolete mutation/history fields only after all current internal tests pass.

**Gate S4:** command-internals, command-system, dirty/checkpoint and read tests pass; golden trace unchanged.

### Stage 5 — Frozen validation pipeline and replay unification

1. Move Core semantic validator and feature classifier into the default assembly pipeline.
2. Preserve changed/no-op validation/classification order.
3. Retain package-private injection seams required by existing exception/overflow tests without exposing them publicly.
4. Make `CommandBus.create()` and `replayCoreCommands()` call the same assembly-bound runtime factory and submit transition.
5. Verify replay success, no-op, rejection index, detached result and repeated determinism.

**Gate S5:** command-system replay/profile tests and characterization replay cases pass with unchanged JSON.

### Stage 6 — Canonical affected facts and event integration

1. Store canonical affected addresses in changed preparation/history.
2. Change generic event publication to consume `commandId` + `affected` rather than switching on Core command/effect shape.
3. Preserve exact address order for scalar/insert/remove and for undo/redo.
4. Preserve event sequence reservation before atomic adoption.
5. Run subscriber isolation, async rejection and reentrant-write tests.

**Gate S6:** event-system, integration and golden event traces pass; no event field/order drift.

### Stage 7 — Registry responsibility split

1. Move normalized module/contribution validation, sorting, candidate and summary construction into `registry/assembly.ts`.
2. Move Registry/Gateway tokens, WeakMap state, authorization and delegation into `registry/gateway.ts`.
3. Keep `registry/runtime.ts` as the public factory/orchestration boundary and maintain compatible exports.
4. Bind built-in command contribution definitions to the same default six-definition authority.
5. Preserve gateway ordering: method capability before decode; valid command contribution/capability before mutation; malformed commands delegated to CommandBus failure semantics.
6. Preserve all startup/access failure data and summary order.
7. Confirm `KernelRegistry`/`KernelModuleGateway` class names, direct-construction rejection, `instanceof`, own keys and frozen behavior.

**Gate S7:** registry contracts/gateway, public API, forbidden dependencies and golden Registry trace pass.

### Stage 8 — Remove superseded private paths

1. Use `rg` to find every remaining import/call of the old one-mutation path.
2. Remove `commands/mutations.ts`, or reduce it to a justified private re-export with no executable duplicate.
3. Remove stale Core-only event derivation switches after the generic affected path is proven.
4. Confirm there is one submit coordinator, one effect applier, one history representation and one Registry construction path.
5. Run all focused and full checks.

**Gate S8:** no duplicate execution path; protected public behavior remains trace-equal.

### Stages 3–8 implementation checkpoint — 2026-08-04

- `effects.ts` now owns the one-root-clone ordered V1 effect-set application boundary. It derives inverses from the evolving candidate, reverses the inverse set, rejects an empty set before cloning, and never adopts a failed candidate.
- The six frozen Core adapters own target/no-op/anchor preparation plus canonical affected addresses. `CommandRuntimeState` is assembly-bound; its history stores one accepted command, frozen forward/inverse nonempty effect sets, and the canonical address facts used by submit/undo/redo event publication.
- Generic event publication now consumes those canonical facts without switching on Core commands or effects. `commands/mutations.ts` has been removed; source and executable tests have one effect applier and no legacy mutation consumer.
- `registry/assembly.ts` owns normalized module/contribution validation, ordering, candidate state, and summary construction. `registry/gateway.ts` owns construction tokens, WeakMap state, authorization, and delegation. `registry/runtime.ts` remains the public factory/orchestration boundary. Built-in command descriptors derive from `DEFAULT_CORE_EXECUTION_ASSEMBLY.definitions`.
- Current worktree evidence: typecheck/build pass; command/history/event/read/integration focus passed `64/64`; full `npm.cmd test` passed `193/193`; public export and forbidden-dependency checks passed; expected trace hash remains `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`.
- Independent-audit P2 repair: removed the injectable `cloneDocument` dependency from `applyCoreEffectSet()`. The engine now always owns `structuredClone(document)` internally; its two-effect failure regression counts exactly one root clone and proves the original input remains deeply unchanged after the later failure.
- Final status: the repaired candidate was committed and the requested narrow independent re-review passed. The task remains `in_progress` only until the Trellis archive flow records completion.

### Stage 9 — Final evidence and independent review candidate

1. Record final HEAD and diff against activation baseline.
2. Map every CVN1-R/AC item to a named test/evidence line.
3. Record exact test totals and focused command outputs.
4. Inspect every protected path diff.
5. Confirm the golden JSON has the same blob hash as Stage 1.
6. Set task lifecycle wording to `IMPLEMENTATION CANDIDATE / INDEPENDENT REVIEW PENDING`; keep status `in_progress`.
7. Hand to an independent reviewer with `check.jsonl` context.

**Gate S9:** reviewable candidate, clean commits, no completion/archive claim.

### Stage 9 pre-commit evidence — 2026-08-04

| Criterion | Operator evidence before independent review |
|---|---|
| AC001 | `b9d27c3` is the test-only characterization commit; the checked-in JSON remains SHA-256 `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`. |
| AC002–AC004 | `public-api-boundary`, `command-spine-characterization`, `command-internals`, and `command-system` retain the 48-export allowlist, six envelopes, strict decoder priority, and hostile-input behavior. |
| AC005 | `the private default execution assembly freezes the six compatible adapters` proves source identity, all six definitions, duplicate/target rejection, and caller-definition isolation. |
| AC006 | `ordered private effect sets clone once, derive reverse inverses, and stay atomic` covers distinct/same-target/dependent effects, reverse inversion, empty-before-clone, and failed-candidate isolation. The post-audit repair removes injectable cloning, counts the engine-owned root clone, and proves a later-effect failure leaves the input deeply unchanged. |
| AC007–AC010 | `command-internals`, `command-system`, and the immutable characterization trace cover one-entry history, no-op/reject identity, undo/redo, semantic-before-support behavior, and repeated live/replay parity. |
| AC011–AC012 | `event-system`, `dirty-checkpoint`, `read-system`, and both integration suites retain affected-address order, subscriber isolation, event reservation, snapshot, dirty, checkpoint, undo, and redo behavior. |
| AC013 | `deep unknown extensions survive commit, rejection, undo, and redo` plus characterization replay retain opaque extension data and caller detachment. |
| AC014–AC015 | `registry-contracts` and `registry-gateway` cover frozen 2-entry/6+6 Registry state, summary ordering, direct construction denial, gateway/capability ordering, all selectors, command parity, and no ready-state registration surface. |
| AC016 | Existing event/report/failure boundary suites and the public characterization exclude effect/history/assembly/handler/raw-error leakage. |
| AC017 | Current candidate passed `npm.cmd run typecheck`, `npm.cmd test` (`193/193`), focused suites (`64/64`), public API and forbidden-dependency tests, `git diff --check`, and `task.py validate`. |
| AC018 | The narrow independent re-review passed with no new P0/P1/P2. It verified zero `cloneDocument` / `CoreEffectSetDependencies` references, engine-owned cloning, empty-before-clone rejection, one root clone, and atomic caller isolation after a later effect failure. |

Protected source review found changes only in the planned command/session/event/Registry paths. `src/core-kernel/index.ts`, persisted codec/domain/model/report/migration paths, Guitar behavior, and the expected characterization JSON remain unchanged.

### Stage 10 — Final independent re-review acceptance — 2026-08-04

- Final production commits: `f7c0064420d0455fe84e5a2d550601c5bd724864` (ordered effect-set transaction spine) and `1016d053c9d322bb2258f1eef288895075c0c13d` (Registry responsibility split).
- The prior P2 is closed: `applyCoreEffectSet()` has no caller-provided cloner, owns the root `structuredClone(document)`, rejects an empty effect set before cloning, and leaves the original document deeply unchanged when a later effect fails.
- Fresh audit verification passed: typecheck, build, `command-internals` `19/19`, full `npm.cmd test` `193/193`, immutable trace SHA-256 `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`, Trellis validation, and `git diff --check`.
- Review verdict: no reproducible P0, P1, or P2; `CVN1-AC018` passes. The candidate retains the six-command, 48-root-export, persisted-schema, and Guitar-behavior boundaries.
- Closeout: acceptance documentation is committed before invoking the Trellis archive flow; that flow records the completed lifecycle state and moves the task directory.

## 5. Focused Verification Commands

Run after each relevant stage; do not wait for the final stage to discover a cross-layer regression.

```powershell
npm run typecheck
npm run build
node --test `
  dist/test/core-kernel/command-spine-characterization.test.js `
  dist/test/core-kernel/command-internals.test.js `
  dist/test/core-kernel/command-system.test.js
```

After event/session changes:

```powershell
npm run build
node --test `
  dist/test/core-kernel/event-system.test.js `
  dist/test/core-kernel/dirty-checkpoint.test.js `
  dist/test/core-kernel/read-system.test.js `
  dist/test/core-kernel/core-kernel-integration.test.js `
  dist/test/core-kernel/core-kernel-integration-boundaries.test.js
```

After Registry changes:

```powershell
npm run build
node --test `
  dist/test/core-kernel/registry-contracts.test.js `
  dist/test/core-kernel/registry-gateway.test.js `
  dist/test/core-kernel/public-api-boundary.test.js `
  dist/test/core-kernel/forbidden-dependency-boundary.test.js
```

Final candidate:

```powershell
npm run typecheck
npm run build
npm test
git diff --check
python ./.trellis/scripts/task.py validate 08-04-cvn-1-command-transaction-registry-spine
```

If a Windows runner reports `spawn EPERM`, rerun the same narrow command through the approved execution path and record both outputs. An incomplete run is environment evidence rather than a product result.

## 6. Structural Checks

Run and review, rather than treating zero matches mechanically:

```powershell
rg -n "registerCoreCommand|unregisterCoreCommand|replaceContribution|registryVersion|KernelRegistryChangedEvent" src/core-kernel
rg -n "CoreMutation|applyCoreMutation|prepareCommandMutation" src/core-kernel test/core-kernel
rg -n "structuredClone\(.*document|structuredClone\(document" src/core-kernel/commands
rg -n "execution-assembly|core-command-adapters|effects" src/core-kernel/index.ts
rg -n "guitar|react|tauri|vexflow|web-audio|node:fs|node:path" src/core-kernel
```

Expected interpretation:

- no ready-state registration API appears;
- old mutation names have no executable consumers at final candidate;
- candidate document cloning occurs once in the effect-set boundary, not once per effect;
- new private modules are absent from root index exports;
- no forbidden product/platform dependency enters Core.

## 7. Required Characterization Assertions

The operator must provide named tests for all items below; one broad snapshot assertion alone is insufficient.

| Area | Required decisive assertion |
|---|---|
| six commands | exact IDs/order/target kinds/payload decoding |
| state results | committed/no-op/rejected version and stack table |
| history | one entry per semantic transaction, deterministic sequence, no snapshots |
| effects | two-effect order, same-target evolving inverse, reversed inverse, one root clone |
| atomicity | second-effect/apply/semantic/classification/event failure preserves full original state |
| replay | same results/final document on two fresh runs; stop index on rejection |
| dirty/checkpoint | return-to-clean identity through undo/redo; no-op/reject unchanged |
| events | exact count/order/cause/commandId/affected addresses |
| isolation | caller mutation, subscriber throw/rejection and reentrant write |
| extensions | deep unknown payload preservation on every transition kind |
| Registry | exact 2 entries, 6+6 summaries, deep freeze, order independence and gateway parity |
| privacy | no stack/path/raw payload/effect/history/handler/assembly leakage |
| API | exact 48 runtime exports and private-module exclusion |

## 8. Commit Boundaries for the Operator

Keep implementation independently reviewable. Planned logical order:

1. `test(core): freeze CVN-1 V1 characterization`
2. `refactor(core): add private command execution assembly`
3. `refactor(core): adopt ordered effect-set transaction spine`
4. `refactor(core): unify history replay and event facts`
5. `refactor(core): split registry runtime responsibilities`
6. `docs(core): record CVN-1 implementation candidate`

Actual commits follow the Trellis Phase 3.4 confirmation flow. Do not mix unrelated product work, later VNext commands or Guitar changes into these commits.

## 9. Failure Handling and Rollback

| Failure | Immediate action | Rollback point |
|---|---|---|
| characterization differs before source edits | fix collector determinism; do not start refactor | activation HEAD |
| public result/state/event mismatch | stop the current stage and compare first divergent trace field | previous green stage commit |
| effect failure partially changes candidate/live state | repair effect boundary; add decisive atomicity case | Stage 2 assembly commit |
| replay differs from live | route replay back through shared submit transition | last green runtime commit |
| Registry summary/failure ordering changes | restore old orchestration behavior before continuing split | pre-Registry stage commit |
| root export grows | remove export and add forbidden assertion | previous green commit |
| later-gate contract appears necessary | document the dependency and return to planner | activation baseline |

No data migration or persisted rollback is needed; CVN-1 changes only private execution organization.

## 10. Independent Review Checklist

The independent reviewer verifies:

- activation baseline and immutable characterization blob;
- every requirement/acceptance mapping;
- exact six-command and 48-export boundaries;
- one assembly, one coordinator, one effect applier and one history owner;
- clone-once/inverse-order evidence;
- live/replay/event/dirty/checkpoint/Registry deep parity;
- failure privacy and hostile-input behavior;
- no later-gate or Guitar behavior;
- full tests and clean review state.

The first pass with a reproducible P0/P1/P2 finding returns the task for repair. Acceptance is recorded only after a fresh re-review of the repair candidate.

## 11. Completion Sequence

After independent acceptance:

1. Record accepted commit, exact test counts and review verdict in `task.json` and this file.
2. Confirm working tree clean and all work commits present.
3. Run `task.py finish` for the active session.
4. Archive CVN-1 through the Trellis archive flow.
5. Update the parent Core VNext task to mark CVN-1 accepted/archived.
6. Only then create dependency-satisfied CVN-2 and/or CVN-3 planning children.
