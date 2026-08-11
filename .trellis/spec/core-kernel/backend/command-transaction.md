# Command, Transaction, History, and Replay

> **Authoritative K1-2 contract (2026-07-15):** this guide defines the executable
> Pure Core write boundary over the frozen `brilliant-score-1` model.

## Scenario: K1-2 Semantic Command Runtime

### 1. Scope / Trigger

Apply this contract to every Core ScoreDocument write, transaction, version change, history transition, undo/redo, or deterministic command replay.

K1-2 does not own full ScorePoint/ScoreRange, dirty state, snapshots/selectors, post-commit events, general reports, Registry/Capability, Guitar commands, UI, playback, or physical IO.

### 2. Signatures

```typescript
type ScoreEntityTarget =
  | { readonly kind: "document"; readonly documentId: string }
  | { readonly kind: "measure"; readonly measureId: string }
  | { readonly kind: "part"; readonly partId: string }
  | { readonly kind: "staff"; readonly staffId: string }
  | { readonly kind: "voice"; readonly voiceId: string }
  | { readonly kind: "event"; readonly eventId: string }
  | { readonly kind: "note"; readonly noteId: string }

type SequenceAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-event"; readonly eventId: string }

CommandBus.create(initialDocument: ScoreDocument): CommandBusCreationResult
CommandBus.submit(input: unknown): CommandResult
CommandBus.undo(): CommandResult
CommandBus.redo(): CommandResult

replayCoreCommands(
  initialDocument: ScoreDocument,
  acceptedCommands: readonly unknown[],
): ReplayCoreCommandsResult
```

Every envelope has exactly `commandVersion: 1`, `commandId`, `target`, and `payload`. The deeply frozen built-in catalog contains only:

- `core.document.set-metadata`
- `core.note.set-written-pitch`
- `core.event.set-note-value`
- `core.voice.insert-notes-event`
- `core.voice.insert-rest-event`
- `core.event.remove`

Every CommandResult contains status, documentVersion, undoDepth, and redoDepth. Committed/no-op results contain ScoreSupportResult; rejected results contain one closed CommandFailure.

### 3. Contracts

- `submit(unknown)` is the only K1-2 write entry. Public patch, JSON path, field replacement, splice, script, and mutable whole-document replacement are forbidden.
- Targets use stable IDs, never tick, slot, collection index, or persisted offset. Insertions use one Voice plus start/after-event; after-event must belong uniquely to that Voice.
- Inserted Event/Note IDs are caller supplied. Core never derives identity from time, randomness, position, tick, or array index.
- The command catalog is static. Dynamic register/unregister and externally supplied handlers belong to later Registry/Capability work.
- Initialization clones and semantically validates its document. Strict command decode constructs detached plain values and retains no caller references.
- Unknown decode must not execute getters, input array methods, iterators, or coercion hooks. Read own data descriptors, reject extra/sparse/accessor properties, and copy accepted arrays into new plain arrays. For arrays, read the own `length` data descriptor and actual own keys first; if `ownKeys.length !== length + 1`, reject before traversing declared indexes.
- Handlers prepare internal typed forward/inverse mutations only: metadata, WrittenPitch, NoteValue, or one Voice/anchor Event insert/remove. Mutations are neither public nor a persistence/replay format.
- Forward/inverse application creates an isolated candidate. Semantic validation runs before atomic state replacement; profile classification runs only for the valid candidate/current document.
- Semantic-invalid candidates reject with original `semantic.*` diagnostics. Semantic-valid/profile-unsupported candidates commit with complete unsupported classification.
- The exported default K1 ScoreFeatureProfile is deeply frozen at runtime, including nested constraints, meters/meter entries, and NoteValue allowed-value arrays. External code cannot change live or replay classification policy.
- Deep-equal replacement is no-op: no version/history/redo change.
- Runtime version starts at 0. Each committed submit/undo/redo increments once; rejection/no-op does not. Unsafe-integer overflow rejects atomically.
- One committed submit creates one internal HistoryEntry containing deterministic sequence, detached command, and detached forward/inverse mutations. No timestamps, random IDs, dirty/event state, or document snapshots.
- Undo/redo apply one inverse/forward mutation to an isolated candidate, rerun semantic/profile validation, and atomically move one entry. Their complete application/validation/classification paths have a final exception boundary; unexpected failures preserve the original state and return `history.invariant-violation`. A new committed submit clears redo; rejection/no-op preserves it.
- Replay feeds envelopes through the live submit transition, stops at rejection, and never accepts mutations, active state, snapshots, or a submit/undo/redo log.
- Unknown ExtensionBlock payloads and every untargeted subtree remain deeply equal across commit, rejection, undo, redo, and replay.
- Unexpected errors collapse to stable privacy-safe failures with no exception text, source, file path, stack, raw input, or mutation data.

### 4. Validation & Error Matrix

| Condition | Required result | State effect |
|---|---|---|
| malformed/extra/accessor/sparse envelope or payload | `command.invalid-envelope` | none |
| safe-integer version other than 1 | `command.unsupported-version` | none |
| unknown command ID | `command.unknown-id` | none |
| target kind mismatch / missing target | `command.target-mismatch` / `command.target-not-found` | none |
| anchor missing / belongs to another Voice | `command.anchor-not-found` / `command.anchor-wrong-owner` | none |
| candidate semantic-invalid | `command.semantic-invalid` + original diagnostics | none |
| candidate semantic-valid/profile-unsupported | committed + full unsupported result | version +1, one history entry |
| replacement equals current value | no-op + current support | none |
| version overflow / unexpected internal error | stable overflow/internal failure | none |
| empty undo/redo / corrupt history transition | stable history failure | none |

### 5. Good / Base / Bad Cases

- Good: set one Note WrittenPitch by noteId, commit one history entry, then undo/redo with one version increment each.
- Base: insert a semantic-valid two-Note Event and commit with `unsupported.chord`.
- Base: replay the same initial document and command sequence twice and obtain deep-equal documents, versions, and classifications.
- Bad: accept `startTick`, `/parts/0/...`, array-index targeting, public patch, or a payload with extra fields.
- Bad: execute an anchor getter or an input array's overridden `map`/iterator while deciding to reject malformed input.
- Bad: reject legal profile-unsupported data as corrupt, expose an internal mutation, or retain a caller-owned payload reference.

### 6. Tests Required

- Assert six valid commands plus wrong version, unknown ID, extra fields, wrong target, malformed unions, sparse arrays, non-finite values, accessors, poisoned array methods, and patch-like input.
- Assert a maximum-length sparse array rejects from descriptor/own-key cardinality before declared-index traversal.
- Assert all seven entity target kinds resolve internally; missing/duplicate targets and missing/duplicate/wrong-owner anchors never choose the first array match.
- Assert committed/no-op/rejected replacement behavior, exact insert/remove mutations, semantic-invalid rollback, and `unsupported.chord` commit.
- Assert handler/application exception privacy, version overflow, and history invariant failure preserve the exact state object and stack depths.
- Assert one entry per commit, deterministic history sequences, no snapshots/timestamps, multi-step undo/redo, empty stacks, and redo invalidation/preservation.
- Assert forward/inverse round trips, undo/redo semantic revalidation, caller-alias isolation, deterministic replay, and deep ExtensionBlock preservation on every path.
- Assert the default Profile is deeply frozen, tampering attempts cannot change replay classification, and unexpected undo/redo exceptions never escape or mutate state.
- Assert public exports omit catalog, codec, resolver, mutation, runtime state/history, mutable document getters, patch APIs, and K1-3/K1-4 APIs.
- Run `npm run typecheck`, `npm run build`, `npm test`, and `git diff --check`.

### 7. Wrong vs Correct

```typescript
// Wrong: executes a method owned by untrusted input before rejecting extras.
const keys = inputArray.map((_, index) => String(index))

// Correct: inspect own data descriptors, reject extras/accessors, then copy.
const descriptor = Object.getOwnPropertyDescriptor(inputArray, String(index))
if (descriptor === undefined || !("value" in descriptor)) return invalid
decoded.push(descriptor.value)
```

```typescript
// Wrong: leaks storage shape and an unstable address.
submit({ op: "replace", path: "/parts/0/measureContents/0" })

// Correct: versioned semantic command with stable identity.
submit({
  commandVersion: 1,
  commandId: "core.note.set-written-pitch",
  target: { kind: "note", noteId },
  payload: { writtenPitch },
})
```

## CVN-3 Review Candidate: Measure Lifecycle Commands (2026-08-04)

> Source/test candidate: `d9500f5a8ac285071586ba8eda380370eafd022f`.
> The candidate preserves the preceding K1-2 six-command compatibility
> contract and is awaiting independent CVN3-AC028 review. It is not an
> acceptance record and it does not introduce a persisted schema change.

### 1. Scope / Trigger

Apply this additive contract when a trusted Core Host or an authorized Registry
gateway needs to insert, remove, move, or change the definition of a Measure.
The static catalog grows from the six K1-2 commands to ten fixed commands;
there is no command registration, whole-document replacement, generic patch,
or index-addressed write path. The first six commands keep their legacy input
boundary; only the four commands below use bounded strict input capture.

### 2. Signatures

```typescript
type MeasureAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-measure"; readonly measureId: string };

type InsertMeasureCommand = {
  readonly commandVersion: 1;
  readonly commandId: "core.measure.insert";
  readonly target: { readonly kind: "document"; readonly documentId: string };
  readonly payload: {
    readonly anchor: MeasureAnchor;
    readonly definition: MeasureDefinition;
    readonly contents: readonly [
      { readonly partId: string; readonly voices: readonly [Voice, ...Voice[]] },
      ...{ readonly partId: string; readonly voices: readonly [Voice, ...Voice[]] }[],
    ];
  };
};

type RemoveMeasureCommand = {
  readonly commandVersion: 1;
  readonly commandId: "core.measure.remove";
  readonly target: { readonly kind: "measure"; readonly measureId: string };
  readonly payload: Record<string, never>;
};

type MoveMeasureCommand = {
  readonly commandVersion: 1;
  readonly commandId: "core.measure.move";
  readonly target: { readonly kind: "measure"; readonly measureId: string };
  readonly payload: { readonly anchor: MeasureAnchor };
};

type SetMeasureDefinitionCommand = {
  readonly commandVersion: 1;
  readonly commandId: "core.measure.set-definition";
  readonly target: { readonly kind: "measure"; readonly measureId: string };
  readonly payload: {
    readonly meter: Meter;
    readonly pickup:
      | { readonly kind: "none" }
      | { readonly kind: "duration"; readonly duration: Fraction };
  };
};
```

The fixed additive order is `core.measure.insert`, `core.measure.remove`,
`core.measure.move`, then `core.measure.set-definition` after the original
six catalog entries. `CommandBus.submit`, undo/redo, and replay retain their
existing signatures and result union.

### 3. Contracts

- `core.measure.insert` targets the current document and supplies one non-empty
  Voice collection for every existing Part exactly once. Valid caller-shuffled
  Part entries are normalized to current Part order; the supplied definition
  ID is the new content `measureId`.
- `core.measure.remove` targets one existing Measure and removes its definition
  plus the corresponding content/Voice/Event/Note aggregate from every Part.
  Its inverse records predecessor anchors so undo restores the original global
  and per-Part positions exactly.
- `core.measure.move` resolves target before self-reference and anchor. Start,
  forward, and backward moves synchronize every Part list to the global
  Measure order; if a valid pre-state had shuffled Part lists, a changed move
  normalizes them and its inverse restores the prior exact order.
- `core.measure.set-definition` replaces only `meter` and the explicit pickup
  union. Full equality, including pickup presence, is no-op; semantic-valid
  profile-unsupported definitions commit with `unsupported` support.
- Each handler prepares detached private effect sets. Effect application clones
  one candidate, derives reverse effects in reverse order, semantically
  validates before state adoption, and preserves unknown ExtensionBlocks.
- The four input routes capture before decode using exact depth `64` and
  property count `1,048,576` limits. Accepted envelopes are detached/frozen;
  no caller mutation, getter, Proxy `get`, input method, iterator, coercion,
  or `toJSON` call may influence the result.
- Live submit, authorized gateway submit, undo/redo, replay, dirty/checkpoint,
  and committed event behavior all use the same existing transaction spine.

### 4. Validation & Error Matrix

| Condition | Stable result | State effect |
| --- | --- | --- |
| malformed/extra/hostile envelope or payload | `command.invalid-envelope` | none |
| capture depth `65` / properties `1,048,577` | `command.resource-limit-exceeded` with exact limit facts | none |
| wrong target kind | `command.target-mismatch` | none |
| missing document/Measure/Part/anchor | `command.target-not-found` / `command.anchor-not-found` | none |
| move target used as `after-measure` anchor | `command.anchor-self-reference` | none |
| duplicate/missing Part coverage, duplicate IDs, broken Staff or sequence | `command.semantic-invalid` plus original diagnostics | none |
| remove last Measure | `command.semantic-invalid` plus `semantic.measure-required` | none |
| semantic-valid K1-profile mismatch | committed with full `unsupported` support | version +1 and one history entry |
| aligned requested move or unchanged definition | no-op | no version/history/redo/event change |

Target/anchor resolution is performed before final semantic candidate
validation. Every rejection retains deep pre-state equality, history,
checkpoint/dirty status, and event sequence.

### 5. Good / Base / Bad Cases

- Good: insert a new Measure with every Part represented once; all Part lists
  become synchronized and the emitted affected addresses include the created
  Measure aggregate in canonical order.
- Base: move the first Measure after a later one, then undo/redo/replay; global
  and every Part order change to the same sequence while aggregate values stay
  equal.
- Base: replace a supported 4/4 definition with legal 2/2 or a pickup; commit
  succeeds with an `unsupported` support result when appropriate.
- Bad: remove the only Measure, insert duplicate Part coverage, point a Voice
  at another/missing Staff, or submit an `after-measure` self-anchor.
- Bad: expose a Measure bundle effect, accept `/parts/0` or array-index target,
  or let a public callback determine clone/application behavior.

### 6. Tests Required

- `cvn-3-measure-insert-remove.test.ts` must cover shuffled insert,
  coverage/reference/sequence/ID rejection equality, aggregate removal,
  final-Measure rejection, exact inverse, undo/redo/replay, events, and
  extension/caller-mutation preservation.
- `cvn-3-measure-move-definition.test.ts` must cover start/forward/backward
  movement, no-op, pre-shuffled normalization/undo, self/missing anchors,
  pickup add/remove, semantic rollback, profile classification, and history.
- `cvn-3-transaction-integration.test.ts` must cover all four IDs independently
  through strict resource capture, root Proxy totality, direct/gateway parity,
  capability denial, caller alias isolation, extensions, and
  checkpoint/dirty/redo clearing.
- `command-internals.test.ts`, `command-spine-characterization.test.ts`,
  Registry/report adapter tests, public-surface tests, and the full suite must
  prove exact effects, 49/10/10 public counts, legacy trace preservation,
  allowlisted issue facts, and no private leakage.

### 7. Wrong vs Correct

```typescript
// Wrong: unstable structural replacement bypasses coverage and history facts.
submit({ op: "replace", path: "/parts/0/measureContents", value: next });

// Correct: stable Measure identity plus a closed insertion anchor.
submit({
  commandVersion: 1,
  commandId: "core.measure.move",
  target: { kind: "measure", measureId },
  payload: { anchor: { kind: "after-measure", measureId: anchorMeasureId } },
});
```

## CVN-5 Range and Batch Planning Projection (Not Active)

After accepted/archived CVN-6 and separate activation, CVN-5 adds `core.range.delete`, `core.range.transpose-written-pitch` and `core.transaction.batch`. Range commands reuse the existing three-kind `ScoreRange` and existing `remove-measure-bundle`, `remove-event` and `replace-written-pitch` effects.

Batch accepts a dense tuple of 1..100 raw semantic child envelopes from one current frozen assembly. Outer validation owns exact shape/count/global capture budgets; nested-batch detection is child-local during route and uses the lowest zero-based `failedCommandIndex`. Children route/prepare/apply sequentially on one isolated candidate; intermediate whole-document invalidity is permitted; Core semantic validation, CVN-6 compatibility/validators, Core profile/classifiers and the public assessment run once for the final candidate. An effective batch has one adoption/version/history/event; all-no-op has zero state delta; every rejection preserves the complete session state. The exact candidate contract remains owned by the CVN-5 task until independent planning acceptance.
