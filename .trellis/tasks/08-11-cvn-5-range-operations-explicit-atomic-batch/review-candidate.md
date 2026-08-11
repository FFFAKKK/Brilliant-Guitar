# CVN-5 Review Record

## Status

`IMPLEMENTATION ACCEPTED / ARCHIVE PENDING / FINAL P0/P1/P2=0/0/0`

This file retains the planning and implementation review history. The reviewed implementation candidate is accepted; archive remains the next lifecycle action.

The initial independent review returned P0/P1/P2=`0/1/2`. This bounded repair changes only the closed implementation/test ownership, the hostile-input reflection wording and the live CVN scheduling snapshot. It has now been migrated without production changes onto the accepted/archived CVN-6 baseline.

## Reviewer question

Do the three bounded repairs fully close the initial P1/P2 findings without changing the CVN-FC-080..102 behavior, accepted CVN-6/CVN-2 contracts or post-Core boundaries?

## Required verdict format

- verdict: `PASS` or `RETURN FOR BOUNDED PLANNING REPAIR`;
- counts: P0/P1/P2;
- each finding: exact file/line, violated authority, user impact and narrow repair;
- review remains read-only.

## Directed review points

1. `reports/strict-codec.ts` is included as the unique stable-failure structural-decoder owner in the production allowlist and Stage 1.
2. The six known existing test/projection paths are enumerated; CVN-5 compile assertions have one named owner and there is no wildcard edit authority.
3. The implementation-base rescan gate returns every newly affected path to planning review.
4. Proxy `get`/getter/iterator/coercion/user methods remain zero-invocation while accepted primordial reflection traps are described accurately and contained.
5. The roadmap snapshot, scheduling decision and bottom status consistently identify CVN-6 as accepted/archived, no active implementation child, and CVN-5 as the sole planning child.
6. CVN-6 acceptance/archive ancestry and the implementation-base audit are present; CVN-5 task start and production authorization remain false.
7. Exact three command IDs, final 28 descriptors and zero runtime/SDK/ABI drift remain unchanged.
8. Range/batch behavior, failure priority, caps, history/replay/event ownership and post-Core exclusions have no semantic delta.

## Local self-audit

Post-repair residual P0/P1/P2=`0/0/0`, pending targeted independent confirmation. Validation evidence is recorded in `research/planning-candidate-self-audit.md` and the final execution report.

## Independent targeted rereview ? 2026-08-11

- Verdict: `PASS`.
- P0/P1/P2: `0/0/0`.
- Initial bounded repair, accepted-CVN-6 ancestry/status synchronization, live implementation-base allowlist, exact command/export/ABI/cap contracts and zero production/test/build dependency deltas all passed.
- Independent gates reproduced: Trellis `28/31`, parent `3/3`, product `0/0`, post-Core `15/16`, archived CVN-6 `22/23`; typecheck/build/full `383/383`; GD-0 Layer A `7` fences and zero diagnostics; Layer B pass; root runtime `51`, SDK `8/34`, Core baseline `25`; `git diff --check` pass.
- Reviewer changed, staged and committed zero files.
- Next gate: record this result, then obtain separate user implementation authorization before `task.py start`.

## Implementation-base allowlist amendment — targeted rereview pending

The first implementation full-suite run passed all new functional CVN-5 suites
but found nine expected additive-surface failures. Five are already owned by the
accepted test matrix. The remaining failures prove four additional existing
projection/count owners are required:

- `test/core-kernel/command-spine-characterization.test.ts`;
- `test/core-kernel/fixtures/cvn-1-characterization.ts`;
- `test/core-kernel/core-kernel-integration.test.ts`;
- `test/core-kernel/registry-gateway.test.ts`.

The proposed edits are limited to explicit CVN-5 historical projection coverage
and exact `31 -> 34` Registry contribution counts. The accepted CVN-1 golden JSON,
its SHA-256, `core-only-regression.test.ts`, production behavior, runtime exports
and CVN-2/CVN-6 contracts remain unchanged. These four files stay unmodified
until the existing independent reviewer returns a targeted planning verdict.

### First amendment review result and bounded repair

- Verdict: `RETURN FOR BOUNDED PLANNING REPAIR`.
- P0/P1/P2: `0/0/1`.
- The reviewer confirmed the four paths are necessary and minimal, and proved
  that projecting only the exact three CVN-5 IDs restores the accepted CVN-1
  golden text and SHA-256 byte-for-byte.
- The sole P2 was documentation authority drift: `design.md` and
  `implementation-base-audit.md` still described a six-path list.
- The bounded repair now synchronizes both documents to the exact ten-path
  closed list. The four new paths remain unmodified pending targeted rereview.

### Final amendment rereview — 2026-08-11

- Verdict: `PASS`.
- P0/P1/P2: `0/0/0`.
- The exact ten-path authority, dated supersession, narrow four-path purposes,
  historical golden protection and zero new production ownership are aligned.
- The four amendment paths may now receive only the reviewed projection/count
  edits; implementation technical review remains a later separate gate.

## Integrated failure-union amendment — targeted rereview pending

The full implementation/typecheck pass exposed one missing production type
owner: `src/core-kernel/registry/integrated-contracts.ts`. The proposed edit is
the minimum representation of CVN5-R051 for an integrated batch whose single
outer wrapper contains an existing module contribution/resource failure. It
adds no failure code beyond the already planned batch wrapper, no second wrapper
level and no CVN-2/CVN-6 assembly, catalog, availability, gateway, callback,
runtime-export or persistence change.

Required narrow verdict:

- confirm this one path and exact union purpose are necessary and sufficient;
- confirm the protected Registry boundary remains closed outside that type-only
  delta;
- report P0/P1/P2 and keep the review read-only.

The implementation candidate remains uncommitted and final technical review is
still a separate later gate.

### Integrated failure-union amendment result — 2026-08-11

- Verdict: `PASS`.
- P0/P1/P2: `0/0/0`.
- The reviewer confirmed the single type owner is necessary and minimal because
  `IntegratedCommandBus` publicly owns module contribution/resource failures
  while `CommandFailureLeaf` excludes recursive wrappers.
- The exact delta is one type-only import, one existing-leaf union and one
  depth-one wrapper member. All other Registry, Module SDK, gateway,
  availability, runtime-export and persistence boundaries remain closed.
- This result activates only that type purpose and is not final implementation
  acceptance.

## Independent implementation review candidate — 2026-08-11

### Status

`READY FOR READ-ONLY INDEPENDENT IMPLEMENTATION REVIEW`

The uncommitted candidate implements only CVN5-R001..R063 on accepted/archived
CVN-6 commit `d521a618e42c01077e8545d1c87e9b36e14d4bdb`:

- exactly three additive Core commands and 28 Core descriptors;
- canonical range selection using only accepted primitive effects;
- one-candidate Core/module batch execution with one final semantic/module
  pipeline, one adoption, one history entry and one aggregate Core event;
- depth-one child failure attribution, exact capture/effect/affected budgets,
  rejection atomicity, history, undo/redo, replay and gateway behavior;
- no runtime-root addition, Module SDK ABI change, new effect kind, persisted
  format, dynamic module lifecycle or post-Core implementation.

### Decisive coverage

- range reverse endpoints, all three discriminants, missing/owner failures,
  exact affected order, final semantic rejection and transpose no-op/failure;
- batch `0/1/100/101`, sparse/accessor/Proxy/cycle, depth `64/65`, properties
  `1048576/1048577`, effects and affected `131072/131073`;
- Core-only, integrated Core-only, module-only and mixed execution, including a
  module child observing the candidate changed by an earlier Core child;
- one wrapper at the lowest child, final failures top-level, unavailable and
  incompatible availability before reflection, callback ordering/counts;
- effective cancellation commits, all-no-op preserves redo, rejection preserves
  document/version/history/dirty/events, undo/redo avoid callbacks, replay
  reroutes children and gateway reuses `command:execute`.

### Candidate gates

- Typecheck: pass.
- Build: pass.
- Initial operator full-test report: `431/431`, later shown non-reproducible
  because one deleted source suite remained as stale ignored JavaScript under
  `dist/`; the independent clean-source reproduction was `427/427`.
- Trellis: CVN-5 `28/31`, Core VNext parent `3/3`, product parent `0/0`,
  post-Core roadmap `15/16`.
- `git diff --check`: pass.
- Existing protected production paths: zero delta outside the independently
  reviewed integrated failure-union exception.
- Archived CVN-6 and post-Core roadmap: zero delta.
- CVN-1 golden SHA-256:
  `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`.
- CVN-3 surface SHA-256:
  `3AC8819BCDCB1E0D69DDDBB00DBCB53D4BB0AFD6B004B4E278E02A1FD22EACA4`.
- Staging, commit, acceptance and archive: not performed.

### Required verdict

Review the live candidate and return `PASS` or `RETURN FOR REPAIR` with
P0/P1/P2 counts and exact evidence. Keep the review read-only. A PASS satisfies
the technical review gate only; submission, acceptance and archive remain later
operator actions.

## Independent implementation review round 1 — 2026-08-11

- Verdict: `RETURN FOR REPAIR`.
- P0/P1/P2: `0/2/3`.
- P1: integrated same-value module requests were recorded as effective effects,
  so an all-no-op batch could commit and clear redo.
- P1: Part-measure and Voice-event owner comparison could mask a missing end
  endpoint with `command.range-owner-mismatch`.
- P2: Core-only batch classification occurred after version/history capacity.
- P2: batch history omitted private effective child boundaries and sources.
- P2: the reported full-test count included one stale ignored generated suite.
- Reviewer changed, staged and committed zero files.

## Bounded implementation repair candidate — 2026-08-11

The live uncommitted repair is limited to the five independently reported
issues:

1. module requests compare each requested pitch or ExtensionBlock change with
   the immediately current candidate; zero-effect children are omitted, while
   a real change followed by a restore still records an effective sequence;
2. both complete range endpoints are resolved first, with duplicate shape
   failures before missing endpoints and missing endpoints before owner checks;
3. Core batch classification is computed once before version/history capacity
   and passed into the existing adoption owner without a second call;
4. history stores detached, deeply frozen effective child segments with child
   index, Core/module source and forward/inverse/affected boundaries; undo/redo
   continue to use aggregate effects without rerunning child preparation;
5. the single stale `dist/test/core-kernel/range-operations.test.js` artifact
   was removed before rebuilding, producing a reproducible source-derived test
   count.

Repair verification:

- Typecheck: pass.
- Build: pass.
- Focused repair suites: `29/29`, zero failures.
- Full source-derived test suite: `432/432`, zero failures.
- Added regressions cover missing Part/Voice/Event endpoint precedence,
  same-value module redo preservation, effective module change/restore, mixed
  all-no-op behavior, classification-before-capacity, and frozen detached Core
  segment boundaries.
- Staging, commit, acceptance and archive: not performed.

Status: `READY FOR READ-ONLY INDEPENDENT IMPLEMENTATION REREVIEW`.

## Independent implementation rereview round 1 — 2026-08-11

- Verdict: `RETURN FOR REPAIR`.
- P0/P1/P2: `0/1/0`.
- Four repairs passed: integrated effective/no-op distinction,
  classification-before-capacity, private history segments and reproducible
  clean-source test count.
- The range repair still compared different existing owners before proving the
  referenced measure/event existed. An existing Part with a missing measure and
  an existing Voice with a missing event therefore still produced
  `command.range-owner-mismatch` instead of endpoint-not-found.
- Reviewer changed, staged and committed zero files.

## Second bounded range-priority repair — 2026-08-11

The resolver now constructs both complete points before comparing owners:

- Part-measure point: unique Part, unique global Measure and unique matching
  PartMeasureContent;
- Voice-event point: unique Voice, unique Event and proof that the Event belongs
  to that Voice;
- cross-endpoint priority remains duplicate → `command.invalid-range`, missing
  → `command.range-endpoint-not-found`, then owner mismatch.

Two direct regressions now cover an existing different Part plus missing
Measure, and an existing different Voice plus missing Event. The existing
different-owner success-of-resolution assertion remains unchanged.

Post-repair typecheck/build pass and the two range suites pass `9/9`. Full and
structural gates are rerun before the second targeted rereview. Staging, commit,
acceptance and archive remain untouched.

## Independent implementation rereview round 2 — 2026-08-11

- Verdict: `PASS`.
- P0/P1/P2: `0/0/0`.
- The prior range P1 is closed: both complete Part-measure and Voice-event
  points resolve before owner comparison, and the required duplicate → missing
  → owner priority is preserved.
- Independent public reproductions returned endpoint-not-found for both
  existing-other-owner plus missing-child cases, while two complete different
  owners still returned owner-mismatch.
- Independent gates: typecheck/build pass, range `9/9`, clean-source full
  `432/432`, Trellis `28/31`, and `git diff --check` pass.
- Reviewer confirmed the shared HEAD, tracked/untracked candidate fingerprints,
  empty staging and `task.status=in_progress` were unchanged; no file was
  edited, staged, committed, accepted or archived by the reviewer.

Technical implementation review is complete. The task intentionally remains
`in_progress`; commit, acceptance and archive are separate operator actions.

## Reviewed implementation candidate commit — 2026-08-11

- Commit: `f329ec10bc77c530282db3a6f47dbd6b6112859e`.
- Message: `feat(core-kernel): add range operations and atomic batch`.
- Scope: 39 reviewed implementation, test and bounded planning-amendment paths;
  `5063` insertions and `74` deletions.
- The commit was created only after the final independent implementation
  rereview returned P0/P1/P2=`0/0/0` and the source-derived full suite passed
  `432/432`.
- This record checks the verified technical acceptance criteria but does not
  change `task.status=in_progress`; formal acceptance, archive, journal and push
  remain separate actions.

## Acceptance record — 2026-08-11

- Accepted implementation source: `f329ec10bc77c530282db3a6f47dbd6b6112859e`.
- Lifecycle metadata repair: `10e5242`.
- Final independent implementation rereview: `PASS`, P0/P1/P2=`0/0/0`.
- Planner reproduction: focused CVN-5 `49/49`, clean-source full `432/432`, typecheck/build pass.
- Structural gates: Trellis, strict JSON/JSONL and duplicate-key scan, GD-0 compile fences, export counts, allowlist, protected paths and diff check pass.
- Acceptance is recorded while `task.status` remains `in_progress`; parent/spec synchronization and task archive follow as distinct actions.
- CVN-7 stays planning-gated until the archive commit is present in its ancestry.
