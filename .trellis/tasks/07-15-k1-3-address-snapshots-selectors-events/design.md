# K1-3 Address / Snapshots / Selectors / Events — Technical Design

## Status and Authority

- Status: planning complete candidate; not executable until user review.
- Base: accepted K1-2 implementation `b62a838` and active `brilliant-score-1` contracts.
- This design implements the approved requirements in `prd.md`; it does not reopen K1-1/K1-2 semantics.
- `.trellis/spec/core-kernel/backend/snapshot-events.md` is the compact active contract after this planning set is approved.

## Design Principles

1. `ScoreDocument` remains the only score truth.
2. `CommandBus` remains the only public owner of the mutable in-memory Core session.
3. Score writes remain `submit`, `undo`, and `redo`; `markPersisted` changes only the session clean checkpoint.
4. Every public read value is detached and deeply frozen.
5. Public facts use stable IDs and versions; internal indexes, mutations, history entries, and state identities never cross the boundary.
6. All counters and ordering are deterministic and wall-clock-free.
7. K1-3 stays thin: consumers query committed state rather than receiving a large family of specialized events or selectors.

## Architecture

```text
                    existing K1-2 write runtime
unknown command -> CommandBus -> isolated transition -> semantic validation
                         |                |
                         |                +-> rejected/no-op: no K1-3 state change
                         |
                         +-> committed candidate
                               -> preflight event capacity
                               -> accept command/runtime state once
                               -> update version-to-content-state map
                               -> invalidate current snapshot cache
                               -> dispatch document-committed
                               -> dispatch dirty-state-changed when toggled

CommandBus.read()
  -> cached or newly cloned/deep-frozen DocumentSnapshot
  -> atomic history depths + dirty boolean
  -> pure selectors / external derived models

external IO saves snapshot V
  -> CommandBus.markPersisted({ documentId, documentVersion: V })
  -> clean content-state identity updated
  -> current dirty boolean recalculated
  -> dirty-state-changed only if the boolean toggles
```

The event capacity check occurs after the K1-2 runtime produces an isolated
candidate transition but before `CommandBus` adopts it. Discarding a candidate
therefore preserves document, version, history, checkpoint, cache, and events.

## File Map

### New production files

| File | Responsibility |
|---|---|
| `src/core-kernel/domain/address.ts` | Public stable `ScoreAddress`, `ScorePoint`, and hierarchical `ScoreRange` types. |
| `src/core-kernel/read/contracts.ts` | Public snapshot/read/checkpoint/selector result types and closed failures. |
| `src/core-kernel/read/address-codec.ts` | Private strict decoders for address, point, range, and persisted-checkpoint inputs. |
| `src/core-kernel/read/deep-freeze.ts` | Private recursive runtime freeze for Core-owned plain data. |
| `src/core-kernel/read/snapshot.ts` | Private snapshot construction/cache and atomic `KernelReadState` creation. |
| `src/core-kernel/read/entity-index.ts` | Private stable-ID/ownership index built over one frozen snapshot. |
| `src/core-kernel/read/selectors.ts` | The six public pure built-in selector functions. |
| `src/core-kernel/read/session-state.ts` | Private clean identity, version-to-state mapping, checkpoint transition, and snapshot-cache state. |
| `src/core-kernel/events/contracts.ts` | Public event, handler, subscription, and failure/result contracts. |
| `src/core-kernel/events/facts.ts` | Private conversion from committed K1-2 facts to public affected targets/events. |
| `src/core-kernel/events/runtime.ts` | Private deterministic sequencing, subscription ordering, dispatch snapshot, and exception isolation. |
| `src/core-kernel/session/runtime.ts` | Private composition of command state, read/checkpoint state, last emitted event sequence, preflight, and candidate session transitions. |

### Modified production files

| File | Change |
|---|---|
| `src/core-kernel/commands/runtime.ts` | Add an internal committed-operation fact to committed transitions; K1-2 result/state semantics remain unchanged. |
| `src/core-kernel/commands/contracts.ts` | Add only `event.reentrant-write` and `event.sequence-overflow` to `CommandFailure`. |
| `src/core-kernel/commands/command-bus.ts` | Orchestrate K1-2 transitions with read session state, checkpointing, event preflight/dispatch, and new public methods. |
| `src/core-kernel/index.ts` | Export approved address/read/selector/event contracts and functions; do not export internal helpers or publishers. |

### Tests

| File | Responsibility |
|---|---|
| `test/core-kernel/address-range.test.ts` | Strict address/range decoding, ordering, ownership, normalization, and failures. |
| `test/core-kernel/read-system.test.ts` | Snapshot identity, deep freeze, detachment, read state, selectors, cache opacity, and extensions. |
| `test/core-kernel/dirty-checkpoint.test.ts` | Initial/edit/save/async-save/undo/redo/branch/checkpoint failures. |
| `test/core-kernel/event-system.test.ts` | Event count/order/payload, subscriber semantics, isolation, reentrancy, and overflow. |
| `test/core-kernel/command-system.test.ts` | Additive public CommandBus method and K1-2 compatibility assertions only. |
| `test/core-kernel/command-internals.test.ts` | Internal committed-fact and candidate-discard invariants. |
| `test/core-kernel/public-api-boundary.test.ts` | Exact approved exports and forbidden internal/K1-4/K1-5 APIs. |

## Public Address and Range Contracts

`ScoreAddress` deliberately aliases the K1-2 target union so reads and writes do
not develop different stable entity languages.

```typescript
export type ScoreAddress = ScoreEntityTarget;

export type MeasurePoint = {
  readonly kind: "measure";
  readonly measureId: string;
};

export type PartMeasurePoint = {
  readonly kind: "part-measure";
  readonly partId: string;
  readonly measureId: string;
};

export type VoiceEventPoint = {
  readonly kind: "voice-event";
  readonly voiceId: string;
  readonly eventId: string;
};

export type ScorePoint = MeasurePoint | PartMeasurePoint | VoiceEventPoint;

export type ScoreRange =
  | {
      readonly kind: "measure-range";
      readonly start: MeasurePoint;
      readonly end: MeasurePoint;
    }
  | {
      readonly kind: "part-measure-range";
      readonly start: PartMeasurePoint;
      readonly end: PartMeasurePoint;
    }
  | {
      readonly kind: "voice-event-range";
      readonly start: VoiceEventPoint;
      readonly end: VoiceEventPoint;
    };
```

Range rules:

- Both endpoints are inclusive.
- Reverse endpoints are normalized; UI anchor/focus direction is not retained.
- Measure variants use `measureDefinitions` order.
- Part Measure ranges require one `partId` and select that Part's contents by `measureId`, returned in global Measure order even when stored differently.
- Voice Event ranges require one `voiceId` and use `sequence.events` order.
- Cross-kind, cross-Part, and cross-Voice endpoints reject.
- Empty/caret ranges and disjoint range sets are not K1-3 contracts.

## Public Read Contracts

```typescript
export interface DocumentSnapshot {
  readonly documentId: string;
  readonly schemaVersion: ScoreDocumentSchemaVersion;
  readonly documentVersion: number;
  readonly document: ScoreDocument;
}

export interface KernelHistoryState {
  readonly undoDepth: number;
  readonly redoDepth: number;
}

export interface KernelReadState {
  readonly snapshot: DocumentSnapshot;
  readonly history: KernelHistoryState;
  readonly dirty: boolean;
}

export type ReadFailure =
  | { readonly code: "read.invalid-address" }
  | { readonly code: "read.entity-not-found" }
  | { readonly code: "read.invalid-range" }
  | { readonly code: "read.range-endpoint-not-found" }
  | { readonly code: "read.range-owner-mismatch" }
  | { readonly code: "read.invalid-snapshot" }
  | { readonly code: "read.invariant-violation" };

export type ReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ReadFailure };
```

`ScoreDocument` is already recursively readonly at the TypeScript boundary;
K1-3 additionally clones and recursively `Object.freeze`s the full runtime
graph. A cached snapshot is reused only while `documentVersion` is unchanged.
The public contract never promises `===` identity.

`CommandBus.read(): ReadResult<KernelReadState>` observes command state once,
then returns the cached/new snapshot and small frozen session summary. A read
inside an event handler is allowed and observes the already accepted state.
Snapshot cache replacement is an internal read transition, not an in-place
mutation:

```typescript
interface ReadTransition {
  readonly state: ReadSessionState;
  readonly result: ReadResult<KernelReadState>;
}
```

`readKernelState(commandState, readState)` returns the original `readState` when
the cached snapshot matches the current document version. When it constructs a
new snapshot successfully, it returns a new `ReadSessionState` containing that
cache entry. On failure it returns the original state and a rejected read
result. `CommandBus.read()` adopts only the returned private read state and then
returns `result`; it never changes document, version, history, checkpoint, dirty
state, or event sequence.

## Public Selector Contracts

```typescript
export function selectScoreMetadata(
  snapshot: DocumentSnapshot,
): ReadResult<ScoreMetadata>;

export function selectScoreEntity(
  snapshot: DocumentSnapshot,
  address: unknown,
): ReadResult<SelectedScoreEntity>;

export function selectScoreEntityOwnership(
  snapshot: DocumentSnapshot,
  address: unknown,
): ReadResult<ScoreEntityOwnership>;

export function selectScoreRange(
  snapshot: DocumentSnapshot,
  range: unknown,
): ReadResult<ScoreRangeSelection>;

export function selectHistoryState(
  state: KernelReadState,
): ReadResult<KernelHistoryState>;

export function selectDirtyState(
  state: KernelReadState,
): ReadResult<boolean>;
```

The public selector result types are closed:

```typescript
export type SelectedScoreEntity =
  | { readonly kind: "document"; readonly value: ScoreDocument }
  | { readonly kind: "measure"; readonly value: MeasureDefinition }
  | { readonly kind: "part"; readonly value: Part }
  | { readonly kind: "staff"; readonly value: StaffDefinition }
  | { readonly kind: "voice"; readonly value: Voice }
  | { readonly kind: "event"; readonly value: RhythmicEvent }
  | { readonly kind: "note"; readonly value: ScoreNote };

export type ScoreEntityOwnership =
  | { readonly entityKind: "document"; readonly documentId: string }
  | { readonly entityKind: "measure"; readonly documentId: string }
  | { readonly entityKind: "part"; readonly documentId: string }
  | {
      readonly entityKind: "staff";
      readonly documentId: string;
      readonly partId: string;
    }
  | {
      readonly entityKind: "voice";
      readonly documentId: string;
      readonly partId: string;
      readonly measureId: string;
    }
  | {
      readonly entityKind: "event";
      readonly documentId: string;
      readonly partId: string;
      readonly measureId: string;
      readonly voiceId: string;
    }
  | {
      readonly entityKind: "note";
      readonly documentId: string;
      readonly partId: string;
      readonly measureId: string;
      readonly voiceId: string;
      readonly eventId: string;
    };

export type ScoreRangeSelection =
  | {
      readonly kind: "measure-range";
      readonly normalized: Extract<ScoreRange, { readonly kind: "measure-range" }>;
      readonly measures: readonly MeasureDefinition[];
    }
  | {
      readonly kind: "part-measure-range";
      readonly normalized: Extract<ScoreRange, { readonly kind: "part-measure-range" }>;
      readonly measureContents: readonly PartMeasureContent[];
    }
  | {
      readonly kind: "voice-event-range";
      readonly normalized: Extract<ScoreRange, { readonly kind: "voice-event-range" }>;
      readonly events: readonly RhythmicEvent[];
    };
```

An Event's `staffId` is an assignment/reference, not a structural owner, so it
is not inserted into the ownership chain. `entityKind` makes every ownership
shape discriminated and prevents impossible partial chains. Selector results
may reference the already detached and frozen snapshot graph; they never
reference CommandBus's live document.

The private index is cached in a `WeakMap<DocumentSnapshot, EntityIndex>` and
contains stable-ID/owner/ordering metadata only. It is not part of snapshot
serialization or public exports.

## Dirty-State and Persisted-Checkpoint Design

The deterministic content-state identity is:

```text
0                                      when undoStack is empty
undoStack[undoStack.length - 1].sequence otherwise
```

K1-2 history sequence already assigns a unique identity to every committed
branch node. Undo moves to the prior identity; redo restores the entry identity;
a new commit after undo receives a new sequence and cannot collide with the
discarded branch.

K1-3 private read-session state contains:

```typescript
interface ReadSessionState {
  readonly cleanStateIdentity: number;
  readonly stateIdentityByDocumentVersion: ReadonlyMap<number, number>;
  readonly snapshotCache?: DocumentSnapshot;
}
```

The map begins with `0 -> 0` and records every accepted committed transition.
It stores numbers only—never commands, mutations, documents, or snapshots. This
allows an asynchronous save of snapshot V to finish after later edits without
marking the wrong state clean.

No transition mutates the Map in place. A committed command/history candidate
copies the previous entries, adds its new version mapping, and places that Map
only in the detached candidate. Rejected/no-op/event-overflow/internal-failure
paths keep the original Map and complete read-session state by identity.

```typescript
export interface PersistedCheckpoint {
  readonly documentId: string;
  readonly documentVersion: number;
}

export type CheckpointFailure =
  | { readonly code: "checkpoint.invalid" }
  | { readonly code: "checkpoint.document-mismatch" }
  | { readonly code: "checkpoint.version-unavailable" }
  | { readonly code: "checkpoint.invariant-violation" }
  | { readonly code: "event.reentrant-write" }
  | { readonly code: "event.sequence-overflow" };

export type MarkPersistedResult =
  | {
      readonly status: "updated" | "no-op";
      readonly documentVersion: number;
      readonly dirty: boolean;
    }
  | {
      readonly status: "rejected";
      readonly documentVersion: number;
      readonly dirty: boolean;
      readonly failure: CheckpointFailure;
    };
```

`CommandBus.markPersisted(input: unknown)` strictly decodes the two-field
checkpoint. `updated` means the clean identity changed, even when current dirty
remains `true`; `no-op` means the same clean identity was already recorded.
Only a dirty boolean toggle emits an event.

## Event Contracts

```typescript
export type KernelEventCause = "submit" | "undo" | "redo" | "mark-persisted";

interface KernelEventBase {
  readonly eventVersion: 1;
  readonly eventSequence: number;
  readonly documentId: string;
  readonly documentVersion: number;
}

export type KernelEvent =
  | (KernelEventBase & {
      readonly eventType: "core.document.committed";
      readonly cause: "submit" | "undo" | "redo";
      readonly commandId: CoreCommandId;
      readonly affectedEntities: readonly ScoreAddress[];
    })
  | (KernelEventBase & {
      readonly eventType: "core.session.dirty-state-changed";
      readonly cause: KernelEventCause;
      readonly dirty: boolean;
    });

export type KernelEventHandler = (event: KernelEvent) => void;
export type KernelEventUnsubscribe = () => void;

export type EventSubscriptionResult =
  | {
      readonly status: "subscribed";
      readonly unsubscribe: KernelEventUnsubscribe;
    }
  | {
      readonly status: "rejected";
      readonly failure: { readonly code: "event.invalid-handler" };
    };
```

`CommandBus.subscribe(handler: unknown): EventSubscriptionResult` validates
that the handler is callable. Each
call creates a distinct private subscriber record; repeated registration of the
same function therefore creates independent subscriptions. Dispatch copies the
current handler list before invoking it. Subscribe/unsubscribe during a callback
does not change that current copy. Unsubscribe is idempotent.

Affected-entity ordering is stable:

1. original command target;
2. structural owner Voice when not already present;
3. inserted/removed Event;
4. contained Notes in document order;
5. duplicates removed by kind + ID, preserving first occurrence.

Property commands normally expose only their original target. Insert/remove
events expose enough stable IDs for invalidation without exposing forward or
inverse mutation objects. Undo and redo reuse the original command's affected
entity set.

## CommandBus Transition Integration

K1-2's private `CommandTransition` gains an optional committed fact:

```typescript
interface CommittedOperation {
  readonly cause: "submit" | "undo" | "redo";
  readonly command: CoreCommandEnvelope;
  readonly effectiveMutation: CoreMutation;
}

interface CommandTransition {
  readonly state: CommandRuntimeState;
  readonly result: CommandResult;
  readonly committed?: CommittedOperation;
}
```

This is not exported from `src/core-kernel/index.ts`. Rejected/no-op transitions
have no committed fact. Replay ignores it and continues returning the exact
K1-2 public result shape.

For each existing write method, CommandBus performs:

1. reject immediately with `event.reentrant-write` if currently dispatching;
2. obtain a detached K1-2 transition without adopting it;
3. return rejected/no-op unchanged when not committed;
4. derive a detached read-session candidate, including cache invalidation,
   version-to-state identity, and dirty toggle;
5. calculate whether one or two public events are required and reserve their
   safe sequences;
6. build and deeply freeze every required public fact while state is still
   detached;
7. if reservation/fact construction fails, return a stable rejection and keep
   the original full session state by identity;
8. adopt command state, read-session state, and `lastEventSequence` exactly
   once;
9. dispatch document event, then optional dirty event;
10. return the original committed K1-2 `CommandResult`.

`event.sequence-overflow` is used only for safe-counter exhaustion. Any other
unexpected K1-3 candidate-integration failure reuses the existing privacy-safe
classification: submit returns `command.internal-error`; undo/redo return
`history.invariant-violation`; checkpoint returns
`checkpoint.invariant-violation`. Subscriber failures never alter step 10.
Event delivery is synchronous so a
consumer reading during the callback sees the correlated committed version.

The two additive K1-3 CommandFailure members are:

```typescript
| { readonly code: "event.reentrant-write" }
| { readonly code: "event.sequence-overflow" }
```

No existing K1-2 code is renamed or reclassified.

## Event Sequence and Failure Isolation

- `eventSequence` begins at 1 and increments once per dispatched fact.
- Private session state stores `lastEventSequence`, initialized to `0`, rather
  than a next-sequence value that could itself overflow.
- Reserving `count` facts is allowed only when
  `Number.isSafeInteger(lastEventSequence + count)`; the reserved values are
  `lastEventSequence + 1` through `lastEventSequence + count`, and the accepted
  state stores the inclusive upper bound as the new `lastEventSequence`.
- A committed transition while already dirty normally requires one sequence.
- A transition toggling dirty requires two consecutive sequences.
- `markPersisted` requires one sequence only when dirty toggles.
- Capacity is checked with safe-integer arithmetic before any state is adopted.
- Handler invocation uses `try/catch` per handler. Raw exception values are neither returned nor placed into another event.
- The dispatching flag covers the entire handler loop for all facts from one operation. Any nested write/checkpoint request is rejected and emits nothing.
- Read and subscription lifecycle operations do not mutate score/checkpoint state and remain allowed during callbacks.

## Compatibility and Migration

- No `ScoreDocument` or serialized JSON change; schema remains `brilliant-score-1`.
- No data migration or physical file IO.
- K1-2 command input, command catalog, mutations, history entries, validation, support classification, versions, and replay results retain their meaning.
- Public `CommandFailure` receives two additive event-boundary members. This is required because reentrant calls use the existing write methods and must return stable `CommandResult` failures.
- Old snapshots remain valid read values but cannot replace active state.
- K1-4 may later wrap subscriptions/selectors with module identity/capability; it must not expose K1-3's private publisher or handler records.
- K1-5 may later report subscriber exceptions structurally; K1-3 does not invent an interim raw-error channel.

## Testing Strategy

### Address/range

- all seven stable address kinds;
- extra fields, getters, empty IDs, obsolete track/beat/tick/path/index shapes;
- global and Part Measure order follows `measureDefinitions` even when `measureContents` storage is shuffled;
- inclusive forward/reverse range normalization;
- missing endpoint, cross-kind, cross-Part, cross-Voice, and wrong-owner rejection;
- Voice Event order follows `sequence.events`.

### Snapshot/selectors

- initial V0 and every committed submit/undo/redo version;
- rejected/no-op operations retain the same logical snapshot version;
- recursive `Object.isFrozen` checks and failed mutation attempts;
- an old snapshot remains unchanged after later commits;
- unknown nested ExtensionBlock data survives snapshot and selectors;
- selector repeatability and no writable live reference;
- cache object identity is not asserted by public tests.

### Dirty/checkpoint

- initial clean, first commit dirty, no-op/reject unchanged;
- mark current version clean;
- undo/redo into and away from the checkpoint;
- asynchronous save of an older version while newer edits exist;
- a new history branch with deeply equal data remains dirty;
- malformed/wrong-document/unavailable version and invariant failures are atomic;
- no whole-document hash or IO dependency.

### Events

- exact zero/one/two event counts and event sequence order;
- semantic-valid/Profile-unsupported committed commands emit the same required
  facts as supported committed commands;
- submit/undo/redo command correlation and affected entities;
- dirty event only on boolean transition;
- frozen/detached payloads;
- registration order, duplicate subscriptions, dispatch snapshots, and idempotent unsubscribe;
- throwing handler isolation and later-handler execution;
- read during callback sees committed state;
- reentrant submit/undo/redo/markPersisted rejection with no nested facts;
- event sequence overflow discards the candidate transition completely;
- replay produces no subscriber or dirty/event session behavior.

## Rollback

Revert the new `domain/address.ts`, `read/*`, `events/*`, and `session/*` files; revert the
additive changes to command contracts/runtime/CommandBus/index and the K1-3
tests/spec updates. The frozen K1-1 model and accepted K1-2 command/history
implementation remain intact. No persisted file migration or user-data rollback
is required.
