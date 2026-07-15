# K1-2 Commands / Transactions / History

## Status

- Phase: implementation repair after the first independent acceptance review.
- Baseline: K1-1 formal code baseline `30894e2`; implementation starts from the current approved branch HEAD.
- Scope owner: Pure Core Kernel V1 command, transaction, version, history, undo/redo, and deterministic replay mechanisms only.
- Gate: K1-2 remains `in_progress`; K1-3 must not start until the repaired branch passes independent re-acceptance.

## Goal

Provide the only public Core write path for `brilliant-score-1`: strictly decoded semantic commands executed as atomic transactions with deterministic versioning, fine-grained history, undo/redo, and command replay. Every path must preserve K1-1 semantic validation, feature-profile classification, stable identity, and unknown ExtensionBlock data.

## Requirements

- **K1-2-REQ-001 — Semantic command-only writes:** Core exposes semantic commands and never exposes patch, JSON path, splice, script, mutable document replacement, or array-index addressing.
- **K1-2-REQ-002 — Stable entity targets:** targets use document/measure/part/staff/voice/event/note IDs. Insertions use `voiceId + SequenceAnchor`; an `after-event` anchor must resolve exactly once inside that Voice.
- **K1-2-REQ-003 — Strict unknown boundary:** `CommandBus.submit(input: unknown)` strictly rejects malformed envelopes, unsupported versions, unknown IDs, extra fields, target mismatches, malformed unions, and malformed payloads.
- **K1-2-REQ-004 — Closed built-in catalog:** K1-2 contains exactly six Core command definitions and no dynamic registration, unregistration, capability, trust, or plugin lifecycle API.
- **K1-2-REQ-005 — Caller-owned stable IDs:** inserted Event and Note IDs are supplied in the command payload. Core uses no wall clock, randomness, array location, tick, or slot to invent identity.
- **K1-2-REQ-006 — Atomic transaction:** handlers produce typed internal forward/inverse mutations. Forward mutation is applied to an isolated candidate, then semantic validation runs, and only a valid candidate commits.
- **K1-2-REQ-007 — Semantic/profile distinction:** semantic-invalid candidates are rejected with their original `semantic.*` diagnostics. Semantic-valid/profile-unsupported candidates commit and return the complete `ScoreSupportResult` classification.
- **K1-2-REQ-008 — No-op contract:** setting metadata, written pitch, or note value to the current deep-equal value returns `no-op`; version, history, and redo remain unchanged.
- **K1-2-REQ-009 — Version ownership:** a new bus starts at `documentVersion = 0`. Each successful submit, undo, and redo increments it exactly once. Rejected/no-op operations do not increment it. Overflow rejects atomically.
- **K1-2-REQ-010 — Fine-grained history:** one committed command creates one internal `HistoryEntry`; no-op and rejected commands create none. Entries contain the cloned command, deterministic sequence, and typed forward/inverse mutations, never timestamps or document snapshots.
- **K1-2-REQ-011 — Undo/redo invariants:** undo applies one inverse mutation; redo applies one forward mutation. Both operate on isolated candidates, rerun semantic validation/profile classification, and commit atomically.
- **K1-2-REQ-012 — Redo invalidation:** a new committed command after undo clears redo. Rejected and no-op submissions do not clear redo.
- **K1-2-REQ-013 — Deterministic replay:** `replayCoreCommands` uses the same decoder, target resolution, transaction, validation, and profile path as live submit. It replays command envelopes, not mutations or a submit/undo/redo session log.
- **K1-2-REQ-014 — Detached ownership:** bus initialization clones and validates its document; accepted envelopes and payloads are cloned before storage; replay returns a detached final document. Caller mutation cannot alter active state or history.
- **K1-2-REQ-015 — Extension preservation:** unknown score-owned and part-owned ExtensionBlock payloads and all untargeted subtrees remain deeply equal through commit, rejection, undo, redo, and replay.
- **K1-2-REQ-016 — Privacy-safe failures:** failures contain stable codes and structured diagnostics/details only; they never include raw exceptions, source text, file paths, stack traces, or internal mutations.
- **K1-2-REQ-017 — Public boundary:** public exports include command contracts, results, `CommandBus`, and replay only. Internal mutations, history entries, live mutable state, patch APIs, K1-3 snapshots/selectors/events, and K1-4 registry/capability remain unexported.
- **K1-2-REQ-018 — Immutable default support policy:** the exported default K1 ScoreFeatureProfile and every nested constraint, meter, and allowed-value array are frozen at runtime so external code cannot change live/replay classification.
- **K1-2-REQ-019 — Total history exception boundary:** unexpected undo/redo application, validation, or support-classification exceptions return the original state with `history.invariant-violation`; raw exceptions never escape.
- **K1-2-REQ-020 — Sparse-array resource bound:** strict array decoding reads the own `length` data descriptor and actual own keys first; an impossible dense-key count rejects before any traversal proportional to the declared length.

## Built-in Command Set

1. `core.document.set-metadata`
2. `core.note.set-written-pitch`
3. `core.event.set-note-value`
4. `core.voice.insert-notes-event`
5. `core.voice.insert-rest-event`
6. `core.event.remove`

Creating documents, adding/removing measures, delete-range, transpose-range, and Guitar commands are not part of K1-2.

## Stable Result Rules

Every result contains `documentVersion`, `undoDepth`, and `redoDepth`.

- `committed` also contains the post-commit `support` classification.
- `no-op` contains the unchanged current-document `support` classification.
- `rejected` contains one stable `CommandFailure`.

Stable failure coverage includes invalid envelope/payload/version, unknown command ID, target mismatch/not found, anchor missing/wrong owner, semantic validation, version overflow, internal handler/mutation failure, empty undo/redo, and history invariant failure.

## Acceptance Criteria

- [ ] Six strict command contracts compile and reject unknown/extra/malformed input before mutation.
- [ ] document/note/event/voice command targets resolve by stable ID; measure/part/staff target resolution is covered internally for the shared target language.
- [ ] Anchor lookup rejects missing, duplicate, and wrong-Voice event ownership without changing state.
- [ ] Each command has committed/rejected coverage; three replace commands have no-op coverage; exact forward/inverse behavior is verified.
- [ ] A semantic-valid two-note chord insertion commits and returns `unsupported.chord`.
- [ ] Semantic-invalid candidates, handler/internal failures, and version overflow preserve document, version, undo depth, and redo depth.
- [ ] One committed command creates one history entry; rejected/no-op operations create none and do not clear redo.
- [ ] Multi-step undo/redo, empty stacks, redo invalidation, and failed/no-op redo preservation pass.
- [ ] Forward/inverse round trips are deeply equal and every committed undo/redo result passes semantic validation.
- [ ] Deep unknown extensions survive successful, failed, undo, redo, and replay paths.
- [ ] Mutating initialization objects or submitted payloads after the call cannot affect bus state/history.
- [ ] Repeated replay returns deeply equal final documents, version sequences, and result classifications without clock/random dependencies.
- [ ] Public export tests prove absence of mutation/history/patch/mutable-document/K1-3/K1-4 APIs.
- [ ] The default K1 Profile is deeply frozen; attempted tampering cannot change replay support classification.
- [ ] Unexpected undo/redo failures never throw, preserve exact state, and return `history.invariant-violation`.
- [ ] A maximum-length sparse array rejects without reading `length` through an access hook or iterating declared holes.
- [ ] `npm run typecheck`, `npm run build`, `npm test`, and `git diff --check` pass in an environment that permits Node test subprocesses.

## Out of Scope

- Full `ScorePoint` / `ScoreRange`, cross-Voice or cross-Measure range operations.
- Immutable snapshots, selectors, dirty state, post-commit events, or event reentrancy.
- Registry/capability/module identity/dynamic commands/plugin lifecycle.
- General K1-5 operation report framework beyond the closed K1-2 failure/result contract.
- Guitar tuning, string/fret, technique payload interpretation, or Guitar commands.
- UI, rendering, playback, physical `.bgp` IO, autosave, crash recovery, collaboration, history merging, or persisted cross-session history.

## Stop Conditions

Stop and re-plan if implementation requires changing the frozen K1-1 ScoreDocument schema, codec, semantic/profile validation meaning, diagnostic identifiers, extension envelope, or Pure Core boundary.
