# CVN-5 Implementation Plan

## 0. Execution gate

This file is an operator plan, not active implementation authority.

Before any source/test edit, all of the following must be true:

1. CVN-6 has passed independent implementation review with P0/P1/P2=`0/0/0`;
2. CVN-6 acceptance and archive commits are both ancestors of the CVN-5 implementation branch;
3. this CVN-5 planning candidate has passed independent planning review;
4. any bounded planning repairs are committed and re-reviewed;
5. the user separately authorizes implementation;
6. `task.py start 08-11-cvn-5-range-operations-explicit-atomic-batch` is run only after those gates;
7. the rebased worktree is clean and accepted CVN-6 typecheck/build/full tests pass.

If any condition is false, keep status `planning` and perform documentation-only repair or dependency waiting.

## 1. Baseline preparation

### Inputs

- accepted/archived CVN-2, CVN-3 and CVN-4;
- accepted/archived CVN-6;
- accepted active Core Kernel specs;
- this task's accepted PRD/design/file matrix;
- post-Core roadmap only as an exclusion fence.

### Actions

1. create a fresh implementation worktree from the CVN-6 archive line;
2. verify CVN-2/CVN-3/CVN-4/CVN-6 acceptance and archive commits are ancestors;
3. compare accepted CVN-6 public exports, failures, assembly construction, effect ownership and file layout with this planning candidate;
4. record any delta in `research/implementation-base-audit.md`;
5. stop for planning repair if a public contract, stage order, cap, file owner or test owner changed.

### Exit gate

- clean implementation base;
- all dependency ancestry checks pass;
- application runtime `51`, SDK `8/34`, Core commands `25` before CVN-5;
- accepted CVN-6 focused and full regression pass.

### Rollback

Delete only the unstarted implementation worktree; preserve this planning branch and dependency branches.

## 2. Stage 1 — Public types, failures, descriptor allowlists

### Files

- `src/core-kernel/index.ts`
- `src/core-kernel/commands/contracts.ts`
- `src/core-kernel/commands/catalog.ts`
- `src/core-kernel/registry/builtins.ts`
- `src/core-kernel/reports/adapters.ts` only for existing report projection of new stable codes

### Work

1. add the three payload interfaces;
2. close the batch/range failure union without adding runtime error classes;
3. add exactly three document-target descriptors;
4. export only the required types;
5. add real compile assertions for payload exactness, failure wrapper non-recursion and catalog IDs;
6. assert application runtime remains `51`, Module SDK `8/34`, CVN-2 ABI nine fields.

### Tests

- `cvn-5-public-contracts.test.ts`
- compile assertions in `integrated-public-contracts.compile.ts`
- accepted GD-0 Layer A/Layer B compile checks

### Exit gate

No runtime export delta; exact 28 Core IDs/descriptors; no protected-path diff.

### Rollback

Revert only Stage 1 commit; accepted 25-command runtime remains green.

## 3. Stage 2 — Private range resolver and parity

### Files

- new `src/core-kernel/commands/range-command-adapters.ts`
- new `src/core-kernel/commands/range-selection.ts`
- `src/core-kernel/commands/strict-codec.ts`

### Work

1. capture the exact three-kind `ScoreRange` without mutating public domain types;
2. resolve and normalize endpoints against an immutable candidate;
3. implement canonical measure/Part/Voice/event/note traversal;
4. return detached selections and stable addresses;
5. compare private write-side selection with accepted public `selectScoreRange` results over forward/reverse and missing/owner-mismatch fixtures.

### Tests

- range-selection cases in `range-delete.test.ts` and `range-transpose-written-pitch.test.ts`;
- existing `address-range.test.ts` unchanged.

### Exit gate

All discriminants and reverse-order cases match the accepted read selector; no read/persisted source edit.

### Rollback

Remove the two new private files and strict-codec additions; no catalog wiring exists yet.

## 4. Stage 3 — Range delete

### Files

- `src/core-kernel/commands/range-command-adapters.ts`
- `src/core-kernel/commands/core-command-adapters.ts`
- `src/core-kernel/commands/execution-assembly.ts`
- `src/core-kernel/commands/effects.ts` only for reusable aggregation helpers, never a new effect kind

### Work

1. register the delete preparer;
2. expand global measure ranges to `remove-measure-bundle`;
3. expand Part-measure and Voice-event ranges to ordered `remove-event` effects;
4. preserve empty Part-measure selection as no-op;
5. build affected facts from primitive effect facts with stable full-tuple deduplication;
6. rely on final semantic validation for `semantic.measure-required`.

### Tests

- `range-delete.test.ts` including all three range kinds, reverse endpoints, first/last/all measures, empty voices, multiple Parts/Voices, exact failures and rejection equality.

### Exit gate

One command uses only accepted effects; no partial mutation; affected ordering exact.

### Rollback

Remove delete adapter wiring; retain Stage 2 resolver for later transpose or revert both commits together.

## 5. Stage 4 — Range transpose

### Files

- `src/core-kernel/commands/range-command-adapters.ts`
- `src/core-kernel/commands/core-command-adapters.ts`
- `src/core-kernel/commands/execution-assembly.ts`

### Work

1. decode accepted `Transposition` exactly;
2. visit selected non-rest notes in canonical order;
3. call accepted `transposeWrittenPitch` once per visited note until first failure;
4. adapt successful value to accepted WrittenPitch without changing domain signature;
5. emit only `replace-written-pitch` effects;
6. implement zero-transposition/zero-note no-op;
7. map the first failure to exact note address and accepted reason allowlist.

### Tests

- `range-transpose-written-pitch.test.ts` across all range kinds, rests, accidentals, boundary pitch failures, first-failure order, no-op, state equality and no extension-data drift.

### Exit gate

Pitch contracts and sounding descriptors unchanged; whole command atomic.

### Rollback

Remove transpose adapter wiring; delete no accepted pitch/domain code.

## 6. Stage 5 — Batch strict capture, routing and wrapper

### Files

- new `src/core-kernel/commands/batch-runtime.ts`
- `src/core-kernel/commands/strict-codec.ts`
- `src/core-kernel/commands/contracts.ts`
- `src/core-kernel/commands/runtime.ts`
- accepted CVN-6 `src/core-kernel/commands/integrated-runtime.ts`

### Work

1. capture exact outer payload and dense child array;
2. enforce 0/1/100/101 before child semantic traversal;
3. enforce one global depth/property budget;
4. sequentially route each raw child through the current assembly;
5. reject nested batch before nested payload decode;
6. wrap only child-local failures with zero-based index;
7. prevent wrapper recursion at type, decoder and runtime construction layers;
8. prove unavailable/incompatible preflight calls zero capture/handlers/callbacks.

### Tests

- `batch-input-and-failure-attribution.test.ts`
- relevant hostile cases in `batch-hostile-input-resource.test.ts`

### Exit gate

Outer versus child failure matrix exact; lowest child index wins; no getter/coercion/iterator calls.

### Rollback

Remove batch descriptor wiring and private coordinator file; range commands remain independently usable.

## 7. Stage 6 — One candidate, effects, caps and final pipeline

### Files

- `src/core-kernel/commands/batch-runtime.ts`
- `src/core-kernel/commands/execution-assembly.ts`
- `src/core-kernel/commands/effects.ts`
- `src/core-kernel/commands/runtime.ts`
- `src/core-kernel/commands/integrated-runtime.ts`
- `src/core-kernel/events/facts.ts`

### Work

1. clone once and apply child effects sequentially;
2. resolve later child targets against the evolving candidate;
3. permit intermediate semantic invalidity;
4. derive inverse before each effect and store global reverse order;
5. track effective child segments and cumulative effect/affected caps;
6. run final Core semantic, compatibility, validators, profile, classifiers and facts once;
7. retain accepted CVN-6 callback ordering/caps/exception isolation;
8. implement all-no-op versus effective-cancellation commit distinction.

### Tests

- `batch-core-atomicity.test.ts`
- `batch-integrated-modules.test.ts`
- cap boundaries in `batch-hostile-input-resource.test.ts`

### Exit gate

Core-only/Core+module/mixed fixtures prove one candidate and one final callback pass; exact-limit cases pass and +1 cases reject at the owning stage.

### Rollback

Revert Stage 6; Stage 5 may remain behind an unwired/private path until the next attempt, or revert Stage 5 and 6 together.

## 8. Stage 7 — Session, history, undo/redo, events and gateway

### Files

- `src/core-kernel/commands/command-bus.ts`
- `src/core-kernel/session/runtime.ts`
- `src/core-kernel/events/facts.ts`
- `src/core-kernel/events/runtime.ts`

### Work

1. submit one adoption request for an effective batch;
2. store frozen outer envelope and private effective segments/effects/inverses, no snapshots;
3. increment version/history once and emit one outer committed event plus optional dirty event;
4. keep event identity Core/batch even for mixed children;
5. implement undo/redo from stored effects, child preparer count zero, final pipeline once;
6. retain gateway `command:execute` and subscriber exception isolation;
7. prove rejection preserves every observable session field and event sequence.

### Tests

- `batch-history-replay-events.test.ts`
- gateway cases in `batch-core-atomicity.test.ts` and `batch-integrated-modules.test.ts`

### Exit gate

Exact one version/history/event; undo/redo outer identity; no child event and no new capability.

### Rollback

Revert session/event/gateway integration commit; coordinator remains unreachable from public construction until restored.

## 9. Stage 8 — Core and integrated replay

### Files

- `src/core-kernel/commands/replay.ts`
- `src/core-kernel/commands/batch-runtime.ts`
- `src/core-kernel/commands/integrated-runtime.ts`

### Work

1. route batch envelopes through the existing replay owner;
2. support Core children in `replayCoreCommands`;
3. support Core/module/mixed children in accepted `replayKernelCommands`;
4. reroute semantics rather than using stored history effects;
5. preserve outer replay index and inner batch child index;
6. test a different authentic assembly with both compatible success and deterministic route/availability failure.

### Tests

- replay matrix in `batch-history-replay-events.test.ts`.

### Exit gate

Live and replay final documents/events/facts match for the same compatible assembly; no persisted assembly handle.

### Rollback

Revert replay integration only; live batch remains behind accepted session behavior.

## 10. Stage 9 — Hostile input, resource, privacy and boundary regression

### Files

- production edits only when a reproduced defect falls inside the existing allowlist;
- test files from the fixed matrix.

### Work and tests

1. accessor, Proxy, sparse, cyclic, invalid prototype, extra-field, mutable-alias and Promise-like callback cases;
2. batch child limits `0/1/100/101`;
3. effects and affected addresses `131072/131073`;
4. accepted CVN-6 facts/issues cap regressions in batch final pass;
5. Core-only/integrated and cross-assembly mismatch regression;
6. failure privacy allowlists and no recursive wrapper;
7. application/SDK export and CVN-2 ABI/catalog assertions;
8. forbidden imports and protected-path zero diff;
9. full state-equality assertions on every rejection stage.

### Exit gate

Focused suite, typecheck, build, full suite and all structural checks green. Any fix outside the allowlist returns to planning review.

### Rollback

Revert only the bounded defect commit; do not broaden production ownership to make a test pass.

## 11. Stage 10 — Documentation, independent review and acceptance handoff

### Documentation

1. replace labeled CVN-5 planning projections in active specs with accepted behavior only after technical review;
2. record implementation commits and focused/full counts;
3. update parent status without changing CVN-7 or post-Core ownership;
4. write `implementation-review-candidate.md` with exact diff/test evidence;
5. request independent technical review.

### Review gate

- P0/P1/P2=`0/0/0`;
- source/test allowlist exact;
- dependency and planning/implementation commits are ancestors;
- no untracked or staged unrelated files;
- full validation rerun after the final source/test commit.

### Later acceptance

Acceptance and archive require separate user direction. Only after both are recorded may the parent expose CVN-7 as dependency-satisfied.

### Rollback

If review returns findings, keep the task `in_progress`, create only bounded implementation repair commits and request targeted rereview. Do not accept or archive a failing candidate.

## 12. Required verification commands

The operator adapts commit placeholders to the accepted CVN-6 line:

```powershell
git merge-base --is-ancestor <CVN6_ACCEPTANCE_COMMIT> HEAD
git merge-base --is-ancestor <CVN6_ARCHIVE_COMMIT> HEAD

python .\.trellis\scripts\task.py validate 08-11-cvn-5-range-operations-explicit-atomic-batch
python .\.trellis\scripts\task.py validate 07-29-core-vnext-product-ready-extensible-kernel-completion
python .\.trellis\scripts\task.py validate 06-29-commercial-guitar-tablature-product
python .\.trellis\scripts\task.py validate 08-11-post-core-official-plugin-product-roadmap

git diff --check
npm run typecheck
npm run build
npm test
```

Additional scripted gates must parse JSON/JSONL, verify unique existing context paths, assert parent child reference count one, compare runtime/type export allowlists, compare exact Core descriptor IDs, run GD-0 compile layers, check forbidden dependencies and ensure every changed production/test file is in the accepted matrix.
