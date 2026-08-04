# CVN-1 Behavior-Preserving Command / Transaction / Registry Spine Refactor

> **Lifecycle:** USER APPROVED 2026-08-04 / TASK ACTIVATED / OPERATOR HANDOFF READY.
> **Branch:** `codex/cvn-1-command-transaction-registry-spine`.
> **Base:** accepted and archived CVN-0 branch `codex/cvn-0-public-unknown-guard-consistency`, planning HEAD `a8c7404cc34649aaa2c6ebfe8d93e46daf87dbf5`.
> **Owned parent contracts:** `CVN-FC-011` and `CVN-FC-040`.

## 1. Goal and User Value

Refactor the private Core command, transaction, history, replay and Registry execution spine so every current and later semantic command can use one deterministic transaction owner, while preserving the complete observable behavior of the existing six Core V1 commands.

This gate creates no new user-facing feature. Its product value is structural:

- later Measure, Part, Staff, Voice, range, batch and official-module commands gain one reusable execution path instead of expanding the current closed switches;
- one ordered effect-set engine supplies atomic multi-effect preparation, Core-derived inverse effects and one candidate clone per semantic transaction;
- live submit, undo/redo, replay, events and Registry dispatch remain attached to one state/history owner;
- the accepted Core V1 API, persisted documents and deterministic behavior remain a stable compatibility base for every later Core VNext child.

## 2. Authority and Decision Order

When documents differ, the operator follows this order:

1. `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/feature-contract-matrix.md`, specifically CVN-FC-010, CVN-FC-011 and CVN-FC-040;
2. this task's `prd.md`, `design.md` and `implement.md`;
3. accepted Core specifications under `.trellis/spec/core-kernel/backend/`;
4. the accepted Core V1 public tests and the CVN-1 baseline characterization trace;
5. parent research files as explanatory evidence only.

GD-0 remains an active documentation candidate rather than an accepted dependency. CVN-1 may use it only to check future compatibility direction. CVN-1 does not copy GD-0 public factories, module failure unions, SDK declarations, compatibility rules or integrated-session behavior into production.

## 3. Confirmed Live Baseline

- CVN-0 final independent re-review passed on 2026-08-04; acceptance is recorded in `cc9beee`, archive in `6cec36b`, and the clean planning HEAD is `a8c7404`.
- The accepted CVN-0 record reports 19 focused tests, 42 related regression tests, 188 full tests and 48 Core root runtime exports.
- The current public command catalog contains exactly six IDs, all at `commandVersion: 1`.
- `CommandBus` owns one `KernelSessionState`; submit, undo and redo enter through `src/core-kernel/session/runtime.ts`.
- `src/core-kernel/commands/runtime.ts` directly binds the Core decoder, closed mutation switch, Core semantic validator and Core feature classifier.
- `HistoryEntry` currently stores one `CoreCommandEnvelope`, one forward `CoreMutation` and one inverse `CoreMutation`.
- `applyCoreMutation()` clones the complete document for each applied mutation. A future multi-effect transaction would therefore clone repeatedly if this structure were extended directly.
- `src/core-kernel/registry/runtime.ts` currently combines Registry construction, compiled contribution validation, summary construction, gateway authorization and dispatch in one file.
- The accepted default Registry manifest contains two compiled entries: six commands and six selectors. Ready-state registration, replacement, reload and Registry change events are absent.
- The public root allowlist is fixed by `test/core-kernel/public-api-boundary.test.ts`; private catalog, codec, mutation, history, session, Registry builder and assembly objects are excluded.

Historical test counts are evidence, not a substitute for the operator's fresh activation baseline. Before production edits, the operator records a clean HEAD/status and runs the characterization-only baseline stage in `implement.md`.

## 4. Fixed Six-Command Compatibility Matrix

| Command ID | Exact target | Exact payload | Effective change | Existing no-op rule | Representative rejection that must remain atomic |
|---|---|---|---|---|---|
| `core.document.set-metadata` | `{ kind: "document"; documentId }` | `{ metadata: ScoreMetadata }` | replace metadata | deep-equal metadata | missing document / malformed metadata |
| `core.note.set-written-pitch` | `{ kind: "note"; noteId }` | `{ writtenPitch: WrittenPitch }` | replace WrittenPitch | deep-equal pitch | missing note / malformed pitch |
| `core.event.set-note-value` | `{ kind: "event"; eventId }` | `{ noteValue: NoteValue }` | replace duration | deep-equal NoteValue | missing event / semantic-invalid duration |
| `core.voice.insert-notes-event` | `{ kind: "voice"; voiceId }` | `{ anchor; event }` | insert one notes event | none | missing/wrong-owner anchor, duplicate IDs or semantic-invalid notes |
| `core.voice.insert-rest-event` | `{ kind: "voice"; voiceId }` | `{ anchor; event }` | insert one rest event | none | missing/wrong-owner anchor or semantic-invalid sequence |
| `core.event.remove` | `{ kind: "event"; eventId }` | `{}` | remove one event | none | missing/duplicate event identity or semantic-invalid resulting sequence |

Structural commands do not gain invented no-op semantics in this gate. All target, payload, failure-priority and anchor behavior remains the accepted V1 behavior.

## 5. Requirements

### CVN1-R001 — Characterization before refactor

Before any `src/**` edit, add and commit one deterministic, machine-readable Core V1 characterization fixture. It must capture:

- the exact six-command catalog and 48-entry runtime export allowlist;
- submit results for valid change, applicable no-op and representative reject paths;
- documentVersion, undoDepth, redoDepth, history state, dirty state and checkpoint behavior after every operation;
- committed event count, order, cause, commandId and affected-entity order;
- multi-step undo/redo, redo preservation/invalidation and empty-history failures;
- deterministic replay success, no-op and stop-at-first-rejection behavior;
- support status and ordered diagnostics;
- deep preservation of unknown ExtensionBlock data;
- default Registry summary, contribution order, gateway-authorized command parity and capability-denial atomicity.

The expected trace is generated and committed from the clean CVN-0-derived baseline. Regenerating it after production refactoring requires a documented compatibility finding and planner review.

### CVN1-R002 — Zero public behavior growth

- Keep the six IDs, version, target and payload unions exactly as listed in section 4.
- Keep `CommandBus.create()`, `submit()`, `undo()`, `redo()`, `read()`, `markPersisted()`, `subscribe()` and `replayCoreCommands()` signatures and result discriminants unchanged.
- Keep the Core root runtime export allowlist at exactly 48 entries.
- Keep `brilliant-score-1`, score JSON, addresses/ranges, reports and migration outputs unchanged.
- Add no public assembly, effect, accepted-command, history, Registry builder or registration API.

### CVN1-R003 — Private frozen default execution assembly

Create one package-private default assembly containing exactly the six Core V1 command definitions plus the existing Core semantic validator and Core feature classifier.

The assembly must:

- be constructed once from statically imported Core definitions;
- reject duplicate command IDs or target mismatches during private construction;
- expose no mutable collection or ready-state mutation method;
- contain the fixed private Core source identity `moduleId: "core.commands"`, `contributionId: "core.commands.v1"`;
- be used by both direct Core submit/replay and the Core Registry command contribution view;
- remain absent from `src/core-kernel/index.ts`.

### CVN1-R004 — Separate routing, decoding and preparation

The generic coordinator owns state transitions only. Command-specific adapters own strict payload decoding, target interpretation, no-op detection and forward effect requests.

The accepted V1 failure priority remains:

1. exact outer envelope shape;
2. safe-integer commandVersion;
3. supported version;
4. string commandId;
5. catalog lookup;
6. target kind decoding;
7. target-kind match;
8. exact target decoding;
9. exact command payload decoding;
10. target/anchor resolution and preparation.

No adapter receives mutable runtime state, history, subscribers, Registry state or an unrestricted document mutation callback.

### CVN1-R005 — Ordered nonempty effect-set engine

Replace the single forward/inverse mutation contract with a package-private ordered nonempty effect set.

- The five V1 effect kinds remain metadata replacement, WrittenPitch replacement, NoteValue replacement, event insertion and event removal.
- A changed preparation returns at least one forward effect; no-op returns no effects.
- The engine clones the current `ScoreDocument` once, then applies every effect to that isolated candidate in declared order.
- Before each forward effect, the engine reads the current candidate and derives its inverse.
- Stored inverse effects are reversed so undo restores the transaction in correct dependency order.
- Effects and inverse effects are detached from caller input and remain private.
- Generic JSON Patch, JSON path, whole-document replacement, arbitrary callback mutation and caller-supplied inverse effects remain excluded.

### CVN1-R006 — Preserve transaction and history state rules

The implementation must preserve CVN-FC-011 exactly:

| Result | documentVersion | undo stack | redo stack | dirty/checkpoint | committed event |
|---|---:|---|---|---|---:|
| committed submit | +1 after overflow preflight | push exactly one entry | clear | existing identity rules | exactly one committed event, plus existing dirty transition event when applicable |
| committed undo | +1 | move one entry to redo | push one | existing identity rules | exactly one committed event, plus existing dirty transition event when applicable |
| committed redo | +1 | restore one entry | pop one | existing identity rules | exactly one committed event, plus existing dirty transition event when applicable |
| no-op | unchanged | unchanged | unchanged | unchanged | 0 |
| rejected | unchanged | unchanged | unchanged | unchanged | 0 |

Private history entries contain deterministic sequence, accepted command, nonempty forward set, reversed nonempty inverse set and canonical affected addresses. They contain no document snapshots, timestamps, random IDs, Registry handles, callbacks or public effect data.

### CVN1-R007 — Frozen Core validation/classification pipeline

- Changed submit, undo and redo run Core semantic validation against the complete isolated candidate before adoption.
- Core feature classification runs only after semantic success.
- No-op returns classification for the unchanged document without changing state.
- The default pipeline is frozen and contains no module callback in CVN-1.
- Semantic diagnostics, support status, diagnostic order and exception privacy remain deeply equal to the baseline trace.

### CVN1-R008 — One live and replay coordinator

`CommandBus` and `replayCoreCommands()` must bind the same default assembly and the same submit transition implementation. Replay continues to accept raw semantic envelopes only, stops at the first rejection and returns detached results/documents. Stored effects, accepted commands, history entries, assembly handles and undo/redo logs remain invalid replay inputs.

### CVN1-R009 — Event, read and checkpoint parity

Move canonical affected-address facts into the private prepared/history operation so event generation no longer depends on a Core-only mutation switch. Preserve the accepted order:

- scalar replacements: command target only;
- notes/rest insert: voice, event, then notes in payload order;
- event removal: event, owning voice, then removed notes in payload order.

Undo and redo reuse the history entry's canonical affected addresses. Public event shape/order, event sequence preflight, dirty transitions, snapshot/read behavior and checkpoint identity remain unchanged.

### CVN1-R010 — Split Registry responsibilities without changing Registry behavior

Internally separate:

1. strict manifest decoding/normalization;
2. compiled Core contribution validation;
3. immutable Registry/assembly state and summary construction;
4. gateway authorization and dispatch;
5. public factory orchestration.

The default manifest, two entry IDs, six command summaries, six selector summaries, sorting, failure priority, capability requirements and public classes/results remain unchanged. The existing `command:register` and `selector:register` capabilities retain their startup-manifest meaning; they do not create ready-state registration methods.

### CVN1-R011 — Hostile-input and resource compatibility

- Preserve the CVN-0 descriptor-first, no-getter, no-throw behavior on every existing public unknown boundary touched by the refactor.
- Preserve current V1 accepted input sizes. CVN-FC-010 depth/property caps apply to later VNext entrypoints and are not retrofitted as new V1 rejections here.
- Capability denial continues to occur before command mutation and before unnecessary command decoding where the accepted Registry contract requires it.
- Caller mutation after submit does not alter history, undo, redo or replay.

### CVN1-R012 — Privacy, dependency and surface constraints

- Unexpected submit failures collapse to the existing `command.internal-error`; unexpected undo/redo failures collapse to `history.invariant-violation`.
- Event integration failures preserve the original state and existing failure mapping.
- Registry failures expose only accepted stable data and no handler, assembly, effect, raw input, stack or source path.
- Core keeps zero dependency on Guitar, UI, rendering, playback, physical file IO, plugin runtime or network code.
- Existing public tests may be strengthened; deletion or weakening of a pre-existing compatibility assertion requires a recorded finding and planner review.

### CVN1-R013 — Independently reviewable delivery

- Production implementation begins only after the user reviews all planning artifacts and the planner runs `task.py start`.
- Characterization lands before refactor code.
- Each implementation stage keeps the characterization and focused tests green.
- Superseded private single-mutation execution paths are removed only after the new path has full parity.
- CVN-1 receives an independent technical review and archive before CVN-2 or CVN-3 is considered dependency-satisfied.

## 6. Explicit Out of Scope

- Any of the 22 new VNext command IDs.
- `createScoreDocument(unknown)`.
- Official-module SDK or `kernel.domain-commands.v1` public contribution contracts.
- Writable integrated module sessions, compatibility/degraded-read behavior or module migration.
- Runtime register/unregister/replace/reload, Registry version counters or Registry-changed events.
- Guitar schema, fingering, technique, UI, rendering, playback or file formats.
- Range transforms, explicit batch commands or new resource-limit failure members.
- Persisted schema changes, public deprecations or API renaming.
- Performance qualification at the 25,600/102,400-event tiers; CVN-7 owns those release gates. CVN-1 still records obvious regressions discovered by its focused comparisons.

## 7. Acceptance Criteria

- [ ] **CVN1-AC001 / R001:** A test-only baseline commit, created before production edits, contains the deterministic characterization collector and checked-in expected trace from `a8c7404`; later production commits do not regenerate the expected trace.
- [ ] **CVN1-AC002 / R002:** Runtime root exports are deeply equal to the accepted sorted 48-name allowlist; `CoreCommandEnvelope`, `CommandFailure`, `CommandResult` and replay result compile-time contracts remain source-compatible.
- [ ] **CVN1-AC003 / R002-R004:** The catalog contains exactly the six CVN-FC-040 IDs, target kinds and payload contracts; no VNext command or public construction overload appears.
- [ ] **CVN1-AC004 / R004/R011:** Malformed, extra, accessor, sparse-array, Proxy/meta-operation, wrong-version, unknown-ID and target-mismatch inputs preserve the accepted failure priority and never escape an exception.
- [ ] **CVN1-AC005 / R003:** One frozen package-private default assembly owns exactly six unique definitions and the Core validation/classification pipeline; no assembly/catalog mutation handle reaches public results or exports.
- [ ] **CVN1-AC006 / R005:** A private two-effect test proves declared-order forward application, one candidate root clone, inverse derivation from the evolving candidate and reverse-order undo; empty/corrupt effect sets reject before adoption.
- [ ] **CVN1-AC007 / R006:** Committed/no-op/rejected submit traces preserve documentVersion, stack depths, redo rules, support and state identity exactly; every semantic transaction owns exactly one private history entry with no snapshot/timestamp/random/handler data.
- [ ] **CVN1-AC008 / R006/R007:** Undo and redo each move one entry, increment once, revalidate/reclassify, preserve overflow/invariant failure atomicity and reproduce the baseline document/support trace.
- [ ] **CVN1-AC009 / R007:** Core semantic validation precedes Core classification for every changed path; no-op classification and semantic/support diagnostic ordering remain deeply equal to the baseline.
- [ ] **CVN1-AC010 / R008:** Direct live submit and replay use the same default assembly/coordinator and produce deeply equal per-command status/version/support and final encoded documents across repeated fresh runs.
- [ ] **CVN1-AC011 / R009:** Committed and dirty events preserve exact count, sequence, cause, commandId and affected-entity order for all six commands plus undo/redo; subscriber throw, Promise rejection and reentrant writes preserve accepted isolation.
- [ ] **CVN1-AC012 / R009:** Read snapshots, history selector, dirty selector and markPersisted behavior remain deeply equal before/after refactor, including return-to-clean identity through undo/redo.
- [ ] **CVN1-AC013 / R005/R011:** Unknown score- and Part-owned ExtensionBlock payloads remain deeply equal through every changed, no-op, rejected, undo, redo and replay path; caller-owned inputs are detached.
- [ ] **CVN1-AC014 / R010:** Default Registry creation, summary ordering/deep freeze, 6+6 contribution count, gateway authorization, all six selectors, command parity, capability denial and stable startup/access failures match the baseline trace.
- [ ] **CVN1-AC015 / R010/R012:** Ready Registry and gateway objects expose no register/unregister/replace/reload/seal/version/change-event API, and the root exports no Registry builder, normalized state, compiled entry table or assembly.
- [ ] **CVN1-AC016 / R012:** Public failure/result/event/report serialization contains no stack, absolute path, raw Error, raw command payload, accepted envelope, effect set, history entry, handler or Registry/assembly handle.
- [ ] **CVN1-AC017 / all:** `npm run typecheck`, `npm run build`, all focused commands listed in `implement.md`, full `npm test`, `git diff --check`, public API boundary, forbidden dependency boundary and `task.py validate` pass from a clean review candidate.
- [ ] **CVN1-AC018 / R013:** Independent review reports no reproducible P0/P1/P2 compatibility or architecture finding, verifies protected-path diffs and trace equality, and records the accepted commit before archive.

## 8. Planning Completion and Activation Gate

Planning review passed on 2026-08-04. The planner ran `python ./.trellis/scripts/task.py start 08-04-cvn-1-command-transaction-registry-spine`; task status is `in_progress` and the operator handoff is active. The first operator action is to commit the approved planning artifacts as an isolated planning commit and restore a clean tree before Stage 0/Stage 1 characterization work. Production work must follow `implement.md` in order.
