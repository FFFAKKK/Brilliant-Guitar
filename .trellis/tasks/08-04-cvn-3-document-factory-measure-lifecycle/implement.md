# CVN-3 Implementation and Verification Plan

## 1. Execution status

**Current state:** active; user execution approved on 2026-08-04; `task.py start` completed; operator may begin Stage 0.
**Implementer:** a later operator working from this task.
**Planner boundary:** task/branch/artifact preparation and later acceptance bookkeeping only.

## 2. Activation preconditions

- [x] User approves `prd.md`, `design.md` and this execution plan.
- [x] Planner runs `python ./.trellis/scripts/task.py start 08-04-cvn-3-document-factory-measure-lifecycle`.
- [x] `task.py current` points to this child and `task.json.status` is `in_progress`.
- [x] Active branch is `codex/cvn-3-document-factory-measure-lifecycle`.
- [x] Base/PR target is `codex/cvn-1-command-transaction-registry-spine`.
- [x] Activation HEAD is recorded and equals the reviewed planning tip `d936d58195803ef938214948b21e89fe67939090`.
- [x] Working tree contains only reviewed planning artifacts before operator edits.
- [x] CVN-1 archive and final independent verdict are present.
- [x] Both context manifests contain real entries and `task.py validate` passes.
- [x] Operator read PRD -> design -> this plan -> every context-manifest entry in that order.

No production edit starts before all activation checks are recorded under this section.

### Stage 0 evidence — 2026-08-04

- Activation source baseline: `d936d58195803ef938214948b21e89fe67939090`; reviewed planning/activation commit: `e9737947b372a2608d5779ed3d6ca90c2b82e4ca` on `codex/cvn-3-document-factory-measure-lifecycle`.
- Fresh checks passed: `npm.cmd run typecheck`, build, `command-spine-characterization` `1/1`, `command-internals` `19/19`, and full `npm.cmd test` `193/193`.
- Immutable CVN-1 fixture SHA-256 remains `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`.
- CVN-3 context validation and `git diff --check` passed; the planning commit left the worktree clean before Stage 1.

## 3. Owned and protected surfaces

### 3.1 Expected production edit surface

- `src/core-kernel/codec/strict-input-capture.ts` (new)
- `src/core-kernel/codec/score-component-codec.ts` (new)
- `src/core-kernel/codec/decode-score-document.ts`
- `src/core-kernel/factory/contracts.ts` (new)
- `src/core-kernel/factory/strict-codec.ts` (new)
- `src/core-kernel/factory/create-score-document.ts` (new)
- `src/core-kernel/commands/catalog.ts`
- `src/core-kernel/commands/contracts.ts`
- `src/core-kernel/commands/strict-codec.ts`
- `src/core-kernel/commands/core-command-adapters.ts`
- `src/core-kernel/commands/measure-command-adapters.ts` (new)
- `src/core-kernel/commands/target-resolver.ts`
- `src/core-kernel/commands/effects.ts`
- `src/core-kernel/commands/execution-assembly.ts`
- `src/core-kernel/registry/builtins.ts`
- `src/core-kernel/reports/strict-codec.ts`
- `src/core-kernel/reports/adapters.ts`
- `src/core-kernel/index.ts`

### 3.2 Expected test/fixture edit surface

- six CVN-3 focused test files named in `design.md`
- `test/core-kernel/fixtures/cvn-3-score.ts` (new)
- `test/core-kernel/fixtures/cvn-3-surface.expected.json` (new)
- `test/core-kernel/fixtures/cvn-1-characterization.ts` (projection only)
- `test/core-kernel/command-spine-characterization.test.ts`
- `test/core-kernel/command-internals.test.ts`
- `test/core-kernel/registry-contracts.test.ts`
- existing report/public-surface/forbidden-dependency tests where their closed allowlists grow

### 3.3 Expected documentation edit surface after implementation

- this task's `prd.md`, `design.md`, `implement.md`, `task.json` and research/evidence additions
- parent task progress metadata/implementation checklist
- accepted active Core specs only after final behavior is independently reviewed
- no historical archived task content is rewritten

### 3.4 Protected surfaces

- package dependencies, `package.json` and `tsconfig.json` unless a separately reviewed build defect is proven
- persisted `ScoreDocument` field names/schema version
- original `test/core-kernel/fixtures/cvn-1-characterization.expected.json`
- original six command IDs/payload meanings
- Guitar/product/UI/render/playback/import/export/platform directories
- GD-0 task/spec candidate
- unrelated dirty files/worktrees

Any unexpected file outside the expected surface is listed and justified before commit; otherwise it is reverted narrowly.

## 4. Ordered delivery stages

### Stage 0 — Fresh activation evidence

Record, without changing production code:

```powershell
python ./.trellis/scripts/task.py current --source
git branch --show-current
git rev-parse HEAD
git status --short --branch
git log -12 --oneline
python ./.trellis/scripts/task.py validate 08-04-cvn-3-document-factory-measure-lifecycle
```

Then run baseline verification:

```powershell
npm run typecheck
npm run build
node --test "dist/test/core-kernel/command-spine-characterization.test.js"
node --test "dist/test/core-kernel/command-internals.test.js"
npm test
```

Record exact counts and the projected trace hash before Stage 1. A baseline failure stops feature work until classified against the recorded CVN-1 acceptance evidence.

### Stage 1 — Preserve the CVN-1 trace under additive growth

Goal: make the prior trace explicitly project its frozen V1 surface before adding CVN-3 behavior.

- [x] Add test-only constants for the original 48 runtime names and six command IDs.
- [x] Project runtime exports/catalog/Registry command descriptors exactly as `design.md` section 15 states.
- [x] Leave all six-command document/result/history/replay/event values unprojected.
- [x] Keep `cvn-1-characterization.expected.json` byte-identical.
- [x] Prove projected trace equals expected JSON and accepted SHA-256.
- [x] Add an initially current-surface CVN-3 fixture capturing 48/6 before feature commits, then update it only in the additive feature commit.

Verification:

```powershell
npm run build
node --test "dist/test/core-kernel/command-spine-characterization.test.js"
git diff -- test/core-kernel/fixtures/cvn-1-characterization.expected.json
git diff --check
```

Required commit boundary: **test-only characterization/projection**. No `src/**` change in this commit.

### Stage 2 — Private strict capture and component-codec extraction

Goal: land reusable private infrastructure with zero new public feature behavior.

- [x] Add iterative `strict-input-capture.ts` with exact depth/property accounting.
- [x] Add hostile-input tests for plain/null records, cross-realm dense arrays, accessors, Proxies, symbols, sparse arrays, cycles, shared DAGs, poisoned methods and deep input.
- [x] Add exact `64/65` and `1,048,576/1,048,577` tests against the private capture result.
- [x] Extract the current component decode logic into `score-component-codec.ts`.
- [x] Keep public `decodeScoreDocument` result/diagnostic/round-trip behavior unchanged.
- [x] Verify no new symbol is exported from Core root.

Verification:

```powershell
npm run typecheck
npm run build
node --test "dist/test/core-kernel/cvn-3-strict-input.test.js"
node --test "dist/test/core-kernel/score-document-codec.test.js"
node --test "dist/test/core-kernel/migration.test.js"
node --test "dist/test/core-kernel/unknown-extension-roundtrip.test.js"
node --test "dist/test/core-kernel/public-unknown-guards.test.js"
node --test "dist/test/core-kernel/command-spine-characterization.test.js"
git diff --check
```

Required commit boundary: **private refactor only**. Public runtime count remains 48 and catalog remains six.

### Stage 3 — Deterministic document factory

Goal: add `createScoreDocument` without touching active bus state.

- [x] Add exact factory contracts and type exports.
- [x] Implement fixed field-order decoder and tuple-nonempty checks.
- [x] Construct exactly one initial Measure/content per Part.
- [x] Run Core semantic validation before profile classification.
- [x] Sort factory decode/semantic diagnostics by path/code.
- [x] Deep-freeze the complete created/rejected result.
- [x] Export only the factory function at runtime.
- [x] Add minimum, multi-Part, invalid shape, semantic invalid, profile unsupported, determinism, alias isolation, hostile input and resource tests.
- [x] Assert the factory does not create/reset a bus, Registry, history or event source.

Verification:

```powershell
npm run typecheck
npm run build
node --test "dist/test/core-kernel/cvn-3-document-factory.test.js"
node --test "dist/test/core-kernel/cvn-3-strict-input.test.js"
node --test "dist/test/core-kernel/public-api-boundary.test.js"
node --test "dist/test/core-kernel/forbidden-dependency-boundary.test.js"
```

Required commit boundary: **factory capability**. Expected runtime exports become 49; command catalog is still six until Stage 4 is complete.

### Stage 4 — Four-command catalog, contracts, Registry and failure plumbing

Goal: establish exact compile-time/runtime routing surface before behavior commits.

- [x] Append four catalog definitions in fixed order.
- [x] Add `MeasureAnchor`, payload/envelope types and staged failures.
- [x] Add `inputBoundary` to all ten adapters; six legacy/four bounded.
- [x] Make default execution assembly require ten exact definitions.
- [x] Add four Registry title keys and descriptor expectations.
- [x] Decode/map self-reference and resource-limit failures with exact privacy-safe details.
- [x] Add surface fixture asserting 49 exports, 10 catalog entries and 10 Registry command descriptors.
- [x] Keep the four adapters present but route them only when their complete prepare paths exist in the same commit; no placeholder handler may ship.

This stage may be committed together with Stage 5 if TypeScript exhaustiveness prevents a passing intermediate state.

Verification:

```powershell
npm run typecheck
npm run build
node --test "dist/test/core-kernel/cvn-3-public-surface.test.js"
node --test "dist/test/core-kernel/registry-contracts.test.js"
node --test "dist/test/core-kernel/kernel-failure-adapters.test.js"
node --test "dist/test/core-kernel/kernel-issues.test.js"
node --test "dist/test/core-kernel/kernel-reports.test.js"
node --test "dist/test/core-kernel/command-internals.test.js"
node --test "dist/test/core-kernel/command-spine-characterization.test.js"
```

### Stage 5 — Measure bundle effects and insert command

Goal: prove synchronized insertion and exact inverse on the accepted effect engine.

- [x] Add insert/remove/reorder private effect shapes needed for insert inverse.
- [x] Implement effect preflight, candidate mutation and inverse derivation.
- [x] Implement exact insert payload decode and Part coverage handling.
- [x] Canonicalize valid caller-shuffled entries to current Part order.
- [x] Generate content Measure IDs from definition ID.
- [x] Normalize Part Measure order when pre-state is shuffled.
- [x] Build canonical affected addresses.
- [x] Add valid/rejected/history/replay/event/extension/caller-mutation/hostile/resource tests.
- [x] Add internal forward-then-inverse and multi-effect reverse-order tests.

Verification:

```powershell
npm run typecheck
npm run build
node --test --test-name-pattern "insert" "dist/test/core-kernel/cvn-3-measure-insert-remove.test.js"
node --test --test-name-pattern "insert" "dist/test/core-kernel/cvn-3-transaction-integration.test.js"
node --test "dist/test/core-kernel/command-internals.test.js"
```

Required commit boundary: **insert + required private effects**, with no remove public behavior unless Stage 6 is included and tested.

### Stage 6 — Remove Measure aggregate

Goal: delete and restore the exact Measure-owned aggregate.

- [x] Implement remove adapter preparation.
- [x] Capture definition/content predecessor anchors before mutation.
- [x] Remove one content from every Part and preserve extensions.
- [x] Normalize remaining Part order when needed.
- [x] Prove last-Measure semantic rejection and total state equality.
- [x] Prove exact aggregate/order restoration across undo, redo and replay.
- [x] Verify affected order includes removed descendants.

Verification:

```powershell
npm run typecheck
npm run build
node --test --test-name-pattern "remove" "dist/test/core-kernel/cvn-3-measure-insert-remove.test.js"
node --test --test-name-pattern "remove" "dist/test/core-kernel/cvn-3-transaction-integration.test.js"
node --test "dist/test/core-kernel/command-internals.test.js"
```

Required commit boundary: **remove aggregate**.

### Stage 7 — Move Measure and shuffled-order exactness

Goal: synchronize global/per-Part order without changing aggregate values.

- [x] Add move bundle effect and per-list inverse anchors.
- [x] Implement target -> self-reference -> anchor resolution order.
- [x] Implement start/forward/backward/already-positioned behavior.
- [x] Normalize every Part to desired global order.
- [x] Add pre-shuffled valid fixture and prove undo restores it exactly.
- [x] Prove move values are deeply equal before/after apart from array order.
- [x] Prove redo/replay/event/affected-address behavior.

Verification:

```powershell
npm run typecheck
npm run build
node --test --test-name-pattern "move" "dist/test/core-kernel/cvn-3-measure-move-definition.test.js"
node --test --test-name-pattern "move" "dist/test/core-kernel/cvn-3-transaction-integration.test.js"
node --test "dist/test/core-kernel/command-internals.test.js"
```

Required commit boundary: **move + exact order inverse**.

### Stage 8 — Set Measure definition

Goal: change meter/pickup with exact no-op and semantic/profile separation.

- [x] Add replacement effect and inverse.
- [x] Implement exact pickup union decode.
- [x] Implement full equality including pickup presence.
- [x] Test meter change, pickup add/remove, exact no-op and target failures.
- [x] Test sequence-exceeds rejection across multiple Parts.
- [x] Test semantic-valid non-K1 meter/pickup commit as unsupported.
- [x] Prove undo/redo/replay/event/affected behavior.

Verification:

```powershell
npm run typecheck
npm run build
node --test --test-name-pattern "definition|pickup|meter" "dist/test/core-kernel/cvn-3-measure-move-definition.test.js"
node --test --test-name-pattern "definition" "dist/test/core-kernel/cvn-3-transaction-integration.test.js"
node --test "dist/test/core-kernel/command-internals.test.js"
```

Required commit boundary: **set-definition**.

### Stage 9 — Full cross-cutting CVN-FC-140/142 matrix

Goal: close every observable path, not only happy-path command behavior.

- [x] Complete one row per PRD acceptance criterion with test/file anchor.
- [x] Exercise direct bus and authorized/denied gateway for all four IDs.
- [x] Exercise checkpoint/dirty/redo preservation and redo clearing.
- [x] Exercise event counts, sequence order, affected addresses and subscriber isolation.
- [x] Exercise unknown extension preservation through factory/submit/reject/undo/redo/replay.
- [x] Exercise resource failures and Issue mapping.
- [x] Exercise caller mutation after submit/factory return.
- [x] Exercise full failure-state deep equality.
- [x] Re-run projected CVN-1 trace and exact additive surface fixture.
- [x] Scan root exports and private effect/history leakage.

Verification:

```powershell
npm run typecheck
npm run build
node --test "dist/test/core-kernel/cvn-3-*.test.js"
node --test "dist/test/core-kernel/command-spine-characterization.test.js"
node --test "dist/test/core-kernel/command-internals.test.js"
node --test "dist/test/core-kernel/registry-contracts.test.js"
node --test "dist/test/core-kernel/public-api-boundary.test.js"
node --test "dist/test/core-kernel/forbidden-dependency-boundary.test.js"
npm test
git diff --check
```

### Stage 10 — Documentation/spec synchronization candidate

Only after source/tests pass:

- [x] Record exact source/test commits and test counts in task metadata.
- [x] Update active Core specs with accepted behavior as a candidate diff, preserving Core V1 history.
- [x] Update parent CVN-3 progress and dependency fields.
- [x] Record the exact 49/10/10 surface and resource limits.
- [x] Record any private file-name substitution with contract-equivalence rationale.
- [x] Run Trellis validation and Markdown/code-fence/path scans.

This stage creates a review candidate, not acceptance.


### Stages 1-10 execution evidence ? 2026-08-04

- Review base: `d936d58195803ef938214948b21e89fe67939090`; source/test candidate:
  `d9500f5a8ac285071586ba8eda380370eafd022f`.
- Delivery commits: `b22f455` (projection), `a1bef39` (strict capture/shared
  codec), `a55ed2e` (factory), `585d352` (four Measure commands), and
  `d9500f5` (acceptance-matrix tests).
- Verified source/test gates: typecheck and build passed; lifecycle triad
  passed 22/22; plan section 5 focused matrix passed 71/71; full `npm.cmd test`
  passed 233/233; `git diff --check` passed for the source/test candidate.
- Compatibility evidence: projected CVN-1 expected SHA-256 remains
  `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`;
  exact additive surface is 49 runtime exports / 10 catalog commands / 10
  Registry command descriptors.
- Bounded capture evidence: depth `64/65` and property count
  `1,048,576/1,048,577` map to the exact factory/command resource failures;
  command Issue mapping retains only `limitKind`, `limit`, and `actual`.
- The full AC/parent-contract mapping and protected-surface rationale are in
  `review-candidate.md`. Stage 11 is deliberately not checked.

### Stage 11 — Independent final review

Reviewer receives base `d936d58195803ef938214948b21e89fe67939090`, candidate tip and this complete task directory.

Reviewer must:

- [x] compare the full diff, not only the latest commit;
- [x] map each parent CVN-FC row and each CVN3-AC row to evidence;
- [x] inspect strict capture for getter/Proxy/primordial/resource behavior;
- [x] inspect every private Measure effect and inverse for exactness;
- [x] audit pre-shuffled order normalization/undo;
- [x] audit last-Measure and sequence rejection state equality;
- [x] audit history/replay/event/dirty/checkpoint parity;
- [x] audit Registry/report/public allowlists and privacy;
- [x] audit projected CVN-1 trace without weakening old behavior assertions;
- [x] run focused and full commands independently;
- [x] record P0/P1/P2 findings or a pass verdict with exact candidate commit.

Independent verdict recorded on 2026-08-04: source/test commit
`d9500f5a8ac285071586ba8eda380370eafd022f` passed with P0/P1/P2 = `0/0/0`.
Typecheck, build, the lifecycle triad (`22/22`), full regression (`233/233`),
Trellis validation, candidate diff checking, and the immutable CVN-1 hash gate
all passed. CVN-4 becomes dependency-satisfied when this accepted child is
archived and the parent state is synchronized.

## 5. Focused verification commands

Run from `.worktrees/k1-6-core-kernel-integration-gate`.

```powershell
npm run typecheck
npm run build
node --test "dist/test/core-kernel/cvn-3-strict-input.test.js"
node --test "dist/test/core-kernel/cvn-3-document-factory.test.js"
node --test "dist/test/core-kernel/cvn-3-measure-insert-remove.test.js"
node --test "dist/test/core-kernel/cvn-3-measure-move-definition.test.js"
node --test "dist/test/core-kernel/cvn-3-transaction-integration.test.js"
node --test "dist/test/core-kernel/cvn-3-public-surface.test.js"
node --test "dist/test/core-kernel/command-spine-characterization.test.js"
node --test "dist/test/core-kernel/command-internals.test.js"
node --test "dist/test/core-kernel/registry-contracts.test.js"
node --test "dist/test/core-kernel/public-api-boundary.test.js"
node --test "dist/test/core-kernel/forbidden-dependency-boundary.test.js"
npm test
python ./.trellis/scripts/task.py validate 08-04-cvn-3-document-factory-measure-lifecycle
git diff --check
```

If an expected existing test filename differs, use `Get-ChildItem test/core-kernel -Filter *.test.ts` to select the actual file and record the corrected command; do not silently omit the test group.

## 6. Structural checks

### Exact catalog/export counts

```powershell
rg -n "core\.measure\.(insert|remove|move|set-definition)" src test
rg -n "createScoreDocument" src test
```

Tests, not manual counting alone, must assert:

- root runtime exports: 49;
- default command catalog: 10;
- Registry command descriptors: 10;
- new root runtime name: only `createScoreDocument`;
- new command IDs: exactly four.

### Forbidden shortcuts/dependencies

```powershell
rg -n "guitar|tablature|fret|stringNumber|React|Tauri|VexFlow|WebAudio|node:fs|from ['\"]fs['\"]" src/core-kernel
rg -n "replace-document|replaceDocument|json-path|JSONPath|applyPatch|patchDocument|mutableDocument|registerCommand|unregisterCommand|hot.?plug" src/core-kernel
rg -n "HistoryEntry|CoreEffect|applyCoreEffectSet|strict-input-capture|score-component-codec" src/core-kernel/index.ts
```

Every match is classified; permitted historical scope strings are not treated as production dependencies.

### Persisted schema protection

```powershell
git diff d936d58195803ef938214948b21e89fe67939090 -- src/core-kernel/domain/score-document.ts
rg -n "brilliant-score-" src test
```

Expected: no persisted model change and no schema version beyond `brilliant-score-1`.

### Historical fixture protection

```powershell
git diff --exit-code d936d58195803ef938214948b21e89fe67939090 -- test/core-kernel/fixtures/cvn-1-characterization.expected.json
```

## 7. Required assertion matrix

For **each** new command, tests must independently assert:

1. exact strict valid commit;
2. exact no-op where defined;
3. invalid envelope and every extra field level;
4. wrong target kind and missing target;
5. missing/self anchor where applicable;
6. reference/coverage/semantic failure;
7. exact encoded before/after;
8. exact undo;
9. exact redo;
10. deterministic replay equality;
11. checkpoint/dirty/redo-clear and preservation rules;
12. committed/dirty event counts and order;
13. exact affected-address order;
14. getter/Proxy/sparse/cycle totality;
15. caller-mutation isolation;
16. unknown extension preservation;
17. full pre/post equality for every rejection.

Factory independently asserts created/invalid-input/semantic-invalid/resource results and supported/unsupported classification.

## 8. Commit boundaries for the operator

Preferred sequence:

1. `test(core): preserve projected CVN-1 characterization`
2. `refactor(core): add bounded input capture and shared component codec`
3. `feat(core): add deterministic score document factory`
4. `feat(core): add Measure catalog and insert aggregate`
5. `feat(core): add Measure removal aggregate`
6. `feat(core): add synchronized Measure move`
7. `feat(core): add Measure definition update`
8. `test(core): close CVN-3 transaction and surface matrix`
9. `docs(core): record CVN-3 review candidate`

Rules:

- Each commit passes typecheck plus its focused tests.
- A refactor commit adds no public behavior.
- A feature commit has its contract tests in the same commit.
- A test-only commit does not rewrite expected data to hide a regression.
- Planning/archive/journal bookkeeping is not interleaved with source feature commits.

## 9. Failure handling and rollback points

- **Stage 1 regression:** revert only projection changes; historical expected JSON remains untouched.
- **Stage 2 decoder drift:** revert component extraction while retaining no production feature; re-plan a narrower shared-codec route.
- **Factory defect:** remove root export and `factory/` modules; no active document or migration is involved.
- **Insert/remove defect:** revert the owning adapter/effect commit; first six commands remain available.
- **Move/order defect:** remove move/reorder additions; do not relax exact undo tests.
- **Set-definition defect:** remove that adapter/effect union member; persisted schema remains valid.
- **Registry/report defect:** revert only additive allowlist/mapping changes together with the command that requires them.
- **Full-gate failure:** keep task active, record exact failing command/test and return to the earliest uncertain stage.

Avoid broad reset/cleanup. Preserve unrelated work and use narrow file/commit reverts after verifying absolute worktree paths.

## 10. Independent review evidence package

The final package contains:

- base and candidate full commit IDs;
- `git status --short --branch`;
- full changed-file list and diff statistics;
- CVN-FC -> CVN3-R -> CVN3-AC -> test mapping;
- focused commands and exact pass counts;
- full `npm test` count;
- projected CVN-1 SHA-256 and 49/10/10 additive counts;
- exact resource-boundary results;
- public export/Registry/report/forbidden-dependency scans;
- Trellis validation and `git diff --check` output;
- unresolved findings, if any, with severity and reproduction.

## 11. Completion sequence

After an independent pass verdict:

1. planner records accepted source/test commit and evidence counts in child `task.json`;
2. planner updates parent CVN-3 status and marks CVN-4 dependency satisfied;
3. planner synchronizes accepted active specs in a separate documentation commit;
4. planner records acceptance commit;
5. planner archives this task through Trellis;
6. planner records archive/journal bookkeeping separately;
7. next planning child is chosen from the live dependency graph, not numeric order alone.
