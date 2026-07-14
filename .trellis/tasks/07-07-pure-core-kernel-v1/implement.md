# Pure Core Kernel V1 Implementation Plan

## Status

- Phase: staged execution.
- K1-1 replanning was approved on 2026-07-13 and the implementation child `07-13-k1-1-core-foundation` is now in review.
- This parent plan no longer defines K1-1 fields; the child artifacts and stable Core specs are authoritative.
- K1-2 and later chunks remain blocked on K1-1 review and require separate plan refresh before start.

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

Authoritative execution is `.trellis/tasks/07-13-k1-1-core-foundation/implement.md` Step 1–9. It replaces the unpublished tick/slot draft with exact Fraction/NoteValue, general Part/Staff/Voice/Event schema, WrittenPitch plus transposition, ExtensionBlock, strict codec, semantic validation, ScoreFeatureProfile, test-only fixtures, and public-boundary checks.

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

Rollback point: revert only the Core foundation child changes; Guitar Domain and K1-2 are not started.

## Chunk K1-2: Commands, Transactions, History, Replay

Purpose: make semantic commands the only write path and establish undo/redo correctness.

Subfeatures:

- Command contracts: refresh `CommandEnvelope`, `CommandDefinition`, `CommandBus`, `CommandSource`, and `CommandTarget` against measure/part/staff/voice/event/note IDs.
- Command registry bridge: commands are registered, not hardcoded as ad hoc functions.
- Payload validation: invalid payloads fail before mutation.
- Internal delta: internal-only mutation record for commit/rollback/history.
- Transaction isolation: failed command leaves document, dirty state, events, undo stack, and redo stack unchanged.
- Fine-grained history: one successful undoable command creates one `HistoryEntry`.
- Undo/redo: move one history entry at a time.
- Replay: deterministic command sequence from same starting state.
- Core semantic commands: create score, metadata, ensure measures, insert note/rest, set WrittenPitch, set NoteValue, delete range, undo, redo. Guitar tuning/string/fret/technique commands belong to Guitar Domain and require its approved extension schema.
- Extension preservation: every mutation, rollback, undo, redo, and replay must preserve unknown ExtensionBlocks it does not own.
- Patch rejection: patch/JSON path/script-like commands are not public write APIs.

Expected files:

- `src/core-kernel/commands/*`
- `src/core-kernel/domain/address.ts`
- `test/core-kernel/commands/*`
- updates to `src/core-kernel/index.ts`

Validation:

```powershell
npm run typecheck
npm test
```

Rollback point: revert command/history files and tests; keep K1-1 intact.

## Chunk K1-3: Address, Snapshot, Selectors, Events

Purpose: provide safe read APIs and post-commit notification without exposing mutable state.

Subfeatures:

- Address/range model: define semantic address, point, range, and entity lookup.
- Snapshot API: return immutable `DocumentSnapshot` with versions and metadata.
- Deep-readonly runtime behavior: external mutation attempts must not affect kernel state.
- Selectors: metadata, full score, serializable score, measure range, entity lookup, diagnostics, history state, dirty state, registry summary.
- Event envelope: stable event id, sequence, source, document version, command/request correlation.
- Event bus: subscribe/publish with handler isolation.
- Event generation: successful command, undo, redo, document load, diagnostics, dirty state, history, registry, migration.
- Reentrancy guard: event handlers cannot synchronously submit commands through the current dispatch stack.
- Event payload boundary: no full mutable document, internal delta, React, VexFlow, Web Audio, Tauri, file-system object.

Expected files:

- `src/core-kernel/read/*`
- `src/core-kernel/events/*`
- `src/core-kernel/domain/address.ts`
- `test/core-kernel/read/*`
- `test/core-kernel/events/*`

Validation:

```powershell
npm run typecheck
npm test
```

Rollback point: revert read/event files and tests; keep K1-1 and K1-2 intact.

## Chunk K1-4: Registry and Capability

Purpose: make extension points explicit and enforce permission boundaries without adding real third-party plugin runtime.

Subfeatures:

- Registry core: register contribution descriptors and internal handlers.
- Contribution kinds: decide from proven K1-2/K1-3 consumers; command, selector, validator, migration, descriptors, or templates are candidates rather than a pre-approved fixed list.
- Module identity: model origin, runtime, trust level, API version, capabilities independently.
- Capability checks: registration permission and execution permission are separate.
- Startup manifest: accept only static `builtin/internal-module` registrations in V1.
- Core module registration: bind app-shipped internal registrations.
- Registry summary: expose read-only metadata only.
- Negative behavior: duplicate ID, unknown kind, unsupported runtime, API version mismatch, capability denied.
- Negative boundary: do not restore the retired Core test-technique registry; Guitar Domain data does not become executable merely because it is stored in an ExtensionBlock.

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
- Event path: transaction result events match event bus events.
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

## First Implementation Recommendation

Start with `K1-1: Score Model, Schema, Validation`.

Reason:

- It is the root contract.
- It removes ambiguity before command design.
- It prevents legacy guitar-specific command vocabulary such as `setFret` / `setString` from leaking into core.
- It gives every later chunk a real fixture and validator to work against.

Do not start `K1-2` until K1-1 review is approved, the documentation closure is accepted, and a refreshed K1-2 task/spec is approved.
