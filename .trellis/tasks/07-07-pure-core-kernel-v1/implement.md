# Pure Core Kernel V1 Implementation Plan

## Status

- Phase: staged execution; K1-1 through K1-3 are accepted/archived. The K1-4 implementation candidate completes all six approved tasks and acceptance repairs, passes 125/125 tests, and awaits independent acceptance.
- K1-1 was formally accepted at baseline `30894e2`; its model and validation contracts remain frozen.
- This parent plan no longer defines K1-1 or K1-2 executable details; their independent child artifacts and active Core specs are authoritative.
- K1-3 implementation followed its approved independent PRD/design/implement set and was accepted at `7369eeac60fecea66c2c9164c04439625c2d78b0` with 102/102 tests passing. K1-4 execution authority is its approved independent task; K1-5 and later blocks still require their own plan refresh.

## Global Rules for Every Implementation Round

- State the large kernel feature being implemented.
- State why the feature exists.
- List all subfeatures and their purpose before editing files.
- Keep changes inside the Core Kernel boundary.
- Explain every added or modified file at the end of the round.
- Run at least `npm run typecheck` and the relevant tests; run full `npm test` before claiming a chunk is complete.
- Do not weaken validation to make tests pass.
- Do not add UI, Tauri, VexFlow, Web Audio, PDF/PNG, zip/file IO, network, or plugin runtime dependencies.

## Chunk K1-0: Boundary and Harness

Purpose: keep the repository's execution boundary honest before real kernel code grows.

Subfeatures:

- Test harness check: ensure `npm run typecheck` and `npm test` remain the core validation commands.
- Boundary metadata check: keep `PURE_CORE_KERNEL_V1_SCOPE` as a visible guardrail.
- Forbidden dependency check: future tests should fail if kernel imports forbidden domains.

Expected files:

- `src/core-kernel/index.ts`
- `test/core-kernel/smoke.test.ts`
- optional future boundary test file if needed

Validation:

```powershell
npm run typecheck
npm test
```

Rollback point: revert only boundary/harness changes.

## Chunk K1-1: Score Model, Schema, Validation

Purpose: implement the score truth model that every later command, snapshot, event, registry, report, and migration path depends on.

Authoritative execution is `.trellis/tasks/archive/2026-07/07-13-k1-1-core-foundation/implement.md` Step 1–9. It replaces the unpublished tick/slot draft with exact Fraction/NoteValue, general Part/Staff/Voice/Event schema, WrittenPitch plus transposition, ExtensionBlock, strict codec, semantic validation, ScoreFeatureProfile, test-only fixtures, and public-boundary checks.

Expected files:

- `src/core-kernel/domain/*`
- `src/core-kernel/validation/*`
- `src/core-kernel/fixtures/*`
- `test/core-kernel/*`
- `src/core-kernel/index.ts`

Validation:

```powershell
npm run typecheck
npm test
```

Rollback point: revert only the Core foundation child changes; later blocks remain independently revertible.

## Chunk K1-2: Commands, Transactions, History, Replay

Purpose: make semantic commands the only write path and establish undo/redo correctness.

Subfeatures:

- Strict public entry: `CommandBus.submit(unknown)` decodes versioned semantic envelopes, stable entity-ID targets, and Voice event anchors; patch/JSON path/splice/script inputs are rejected.
- Closed static catalog: exactly six built-ins — set metadata, set WrittenPitch, set NoteValue, insert Notes Event, insert Rest Event, and remove Event. K1-2 has no registry bridge or dynamic registration.
- Atomic typed mutation: internal forward/inverse mutations run on an isolated candidate before semantic validation and one-time commit.
- Semantic/profile split: semantic-invalid rejects; semantic-valid/profile-unsupported commits with complete classification.
- Version/history: committed submit/undo/redo increments `documentVersion` once; one command creates one fine-grained HistoryEntry; no-op/rejected operations preserve version/history/redo.
- Undo/redo: one entry moves atomically, revalidates semantic/profile state, and converts unexpected exceptions to `history.invariant-violation` without state change.
- Deterministic replay: the same initial document and command sequence use the live submit path and produce deeply equal results.
- Runtime policy hardening: the default K1 ScoreFeatureProfile is deeply frozen, and hostile huge sparse arrays reject before declared-length traversal.
- Extension/ownership preservation: caller mutation and unknown ExtensionBlocks cannot alter or be lost from runtime/history/replay state.
- Explicit exclusions: create score, measure add/remove, delete/transpose range, full address/range, dirty state/events, Guitar commands, Registry/Capability, UI, and IO remain later work.

Expected files:

- `src/core-kernel/commands/*`
- `src/core-kernel/profiles/score-feature-profile.ts`
- `test/core-kernel/command-system.test.ts`
- `test/core-kernel/command-internals.test.ts`
- updates to `src/core-kernel/index.ts`

Validation:

```powershell
npm run typecheck
npm test
```

Rollback point: revert command/history/profile-hardening files and tests; keep frozen K1-1 schema/codec/validation intact.

## Chunk K1-3: Address, Snapshot, Selectors, Events

Purpose: provide safe read APIs and post-commit notification without exposing mutable state.

Subfeatures:

- Address/range: reuse seven stable entity targets and add only hierarchical global Measure, Part Measure, and Voice Event inclusive ranges.
- Atomic read: `CommandBus.read()` returns deeply frozen versioned snapshot, history depths, and dirty without a mutable document channel.
- Selectors: exactly metadata, entity, ownership, range, history, and dirty.
- Checkpoint: `markPersisted(documentId + documentVersion)` maps async save completion to the exact history state.
- Events: exactly document-committed plus dirty-state-changed, with deterministic sequence/version/cause/affected targets.
- Isolation: registration-order subscriber snapshot, per-handler synchronous-throw and asynchronous-rejection boundary, idempotent unsubscribe, synchronous write/checkpoint reentrancy rejection, and pre-commit sequence-overflow rejection.
- Event/read payload boundary: no mutable document, internal delta/history/cache/index, clock/random ID, React, VexFlow, Web Audio, Tauri, file-system, Guitar, Registry, or report object.
- Authoritative task: `.trellis/tasks/archive/2026-07/07-15-k1-3-address-snapshots-selectors-events/`; this parent summary is not executable by itself.

Expected files:

- `src/core-kernel/read/*`
- `src/core-kernel/events/*`
- `src/core-kernel/session/*`
- `src/core-kernel/domain/address.ts`
- `test/core-kernel/address-range.test.ts`
- `test/core-kernel/read-system.test.ts`
- `test/core-kernel/dirty-checkpoint.test.ts`
- `test/core-kernel/event-system.test.ts`

Validation:

```powershell
npm run typecheck
npm test
```

Rollback point: revert read/event files and tests; keep K1-1 and K1-2 intact.

## Chunk K1-4: Registry and Capability

> **IMPLEMENTATION CANDIDATE COMPLETE / ACCEPTANCE PENDING.** Tasks 1–6 were executed only from `.trellis/tasks/07-16-k1-4-registry-capability-startup-registration/implement.md` on `codex/k1-4-registry-capability-startup-registration`.

Purpose: make extension points explicit and enforce permission boundaries without adding real third-party plugin runtime.

Subfeatures:

- Atomic startup: strict unknown decode, compiled binding lookup, isolated validation, and all-or-nothing frozen ready Registry.
- Contribution kinds: exactly existing six commands and six selectors; no arbitrary handler or speculative kind.
- Module identity and capability: independent dimensions, seven exact non-implying capabilities, manifest-bound trusted official builtin/internal modules only.
- Gateway: authorize then delegate submit/undo/redo/read/select/subscribe to accepted K1-2/K1-3 APIs with result parity.
- Summary: deterministic, deeply frozen, detached, minimal and privacy-safe.
- Failure: closed K1-4 startup/access unions, total exception boundaries, zero prior-state mutation on reject/internal error.
- Negative boundary: no Registry mutation/version/event, module attribution in history/events, third-party runtime, validator/technique/migration/format/template/Guitar/K1-5 contribution.

Expected files:

- `src/core-kernel/registry/*`
- `test/core-kernel/registry/*`
- possible integration updates to commands, validation, read selectors

Validation:

```powershell
npm run typecheck
npm test
```

Rollback point: revert registry/capability files and tests; keep prior chunks intact.

## Chunk K1-5: Errors, Diagnostics, Reports, Migration Shell

Purpose: standardize failures, validation location, report shells, and schema migration behavior.

Subfeatures:

- Kernel errors: stable code, severity, messageKey, structured details.
- Diagnostics: preserve the existing closed K1-1 decode/semantic/profile codes and extend targeting only through an approved compatibility update.
- Validation report: preserve concrete validation diagnostic codes.
- Migration report: define current version pass-through, future version safe failure, old version hook shape.
- Import/export report shells: define structure only; no real format implementation.
- Recovery report shell: define structure only.
- Privacy boundary: no score text, access tokens, API keys, private absolute paths, third-party secrets, or plugin source code in default details.
- Module exception conversion: convert thrown module errors into `module-error` diagnostic/report issue.

Expected files:

- `src/core-kernel/reports/*`
- `src/core-kernel/validation/diagnostics.ts`
- `test/core-kernel/reports/*`
- integration updates to validation, registry, events, commands

Validation:

```powershell
npm run typecheck
npm test
```

Rollback point: revert report/migration files and tests; preserve stable diagnostics needed by earlier chunks or revert as one coordinated batch.

## Chunk K1-6: Final Integration Gate

Purpose: prove the pieces form a usable Pure Core Kernel V1 rather than isolated utilities.

Subfeatures:

- Full fixture path: a general 4-measure score validates, serializes, snapshots, and participates in command flows; GuitarExtension is added only through its separately approved fixture.
- Command path: insert note, set WrittenPitch/NoteValue, undo/redo, and prove unknown extension preservation.
- Read path: snapshot and selectors reflect committed state and cannot mutate kernel state.
- Event path: post-commit facts correlate by document version and cause with accepted submit/undo/redo/checkpoint transitions.
- Registry path: only contribution kinds justified and approved by K1-4 are registered; technique registration is not assumed.
- Error/report path: failure cases return stable codes and privacy-safe details.
- Unsupported boundary path: semantic-valid future schema features are reported by ScoreFeatureProfile rather than corrupted; truly invalid data fails decode/semantic validation.
- Dependency boundary path: no forbidden runtime dependency enters kernel.

Validation:

```powershell
npm run typecheck
npm test
```

Completion gate:

- all tests pass
- no unrelated dirty files
- user gets a per-file change summary
- run `trellis-check` before final completion
- review whether `.trellis/spec/` needs updates before commit

## Current Execution Recommendation

K1-3 is accepted and archived at `7369eeac60fecea66c2c9164c04439625c2d78b0`. The K1-4 implementation candidate and acceptance repairs are complete on its dedicated branch with 125/125 tests passing. The next action is independent K1-4 acceptance; do not start Guitar Domain commands, K1-5, or UI integration from this parent plan.
