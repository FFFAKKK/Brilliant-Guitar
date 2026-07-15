# K1-3 Address / Snapshots / Selectors / Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: load `trellis-before-dev`, then use `superpowers:executing-plans` in inline mode. Execute one task at a time, keep every reviewer gate, and do not dispatch implementation/check sub-agents.

**Goal:** Add stable hierarchical score addressing, immutable versioned reads, exact dirty checkpoints, and deterministic isolated post-commit events to the accepted K1-2 CommandBus without changing persisted score or command/history semantics.

**Architecture:** CommandBus remains the only public session owner. A private K1-3 session runtime composes the existing K1-2 command state with snapshot/checkpoint state and event sequencing; it returns isolated candidate transitions that CommandBus adopts before synchronously dispatching deeply frozen facts. Pure selectors operate only on detached frozen snapshots/read state.

**Tech Stack:** TypeScript 5.8 strict mode, Node.js 24 test runner, CommonJS output, built-in `structuredClone`/`Object.freeze`; no new dependency.

## Global Constraints

- Persisted schema remains exactly `brilliant-score-1`.
- The six K1-2 commands, envelopes, validation/profile semantics, mutation/history contents, and replay results retain their meaning.
- No React, Tauri, VexFlow, Web Audio, DOM, filesystem, physical `.bgp` IO, Guitar semantics, Registry/Capability, dynamic registration, or general report framework.
- No public array index, JSON path, tick, layout/screen coordinate, internal mutation, HistoryEntry, handler record, or mutable document.
- Public inputs with `unknown` boundaries return closed failures and never leak raw exceptions.
- New counters use safe integers, no time/randomness, and preflight overflow before state adoption.
- Every production step follows red-green-refactor and ends with targeted tests before a commit.
- `.trellis/maintenance/` is unrelated user-owned untracked state and must remain untouched.

---

## Task 1: Stable Address, Point, Range, and Strict Decoding

**Files:**

- Create: `src/core-kernel/domain/address.ts`
- Create: `src/core-kernel/read/address-codec.ts`
- Create: `test/core-kernel/address-range.test.ts`
- Modify: `src/core-kernel/index.ts`

**Interfaces:**

- Consumes: K1-2 `ScoreEntityTarget`; `ScoreDocument`, `Part`, `Voice`, and stable IDs.
- Produces: `ScoreAddress`, `ScorePoint`, `ScoreRange`; private `decodeScoreAddress`, `decodeScorePoint`, `decodeScoreRange`, and `decodePersistedCheckpoint` used by later tasks.

- [ ] **Step 1: Add failing compile-time/public type coverage**

Create the test file with typed examples for every approved point/range and no obsolete vocabulary:

```typescript
import type {
  ScoreAddress,
  ScorePoint,
  ScoreRange,
} from "../../src/core-kernel/index";

const address: ScoreAddress = { kind: "note", noteId: "note-1" };
const points: readonly ScorePoint[] = [
  { kind: "measure", measureId: "measure-1" },
  { kind: "part-measure", partId: "part-1", measureId: "measure-1" },
  { kind: "voice-event", voiceId: "voice-1", eventId: "event-1" },
];
const range: ScoreRange = {
  kind: "voice-event-range",
  start: points[2] as Extract<ScorePoint, { kind: "voice-event" }>,
  end: { kind: "voice-event", voiceId: "voice-1", eventId: "event-4" },
};
assert.equal(address.kind, "note");
assert.equal(range.kind, "voice-event-range");
```

- [ ] **Step 2: Run typecheck and observe the missing contracts**

Run:

```powershell
npm run typecheck
```

Expected: FAIL because `ScoreAddress`, `ScorePoint`, and `ScoreRange` are not exported.

- [ ] **Step 3: Define the exact public unions**

Implement `domain/address.ts` exactly as approved:

```typescript
import type { ScoreEntityTarget } from "../commands/contracts";

export type ScoreAddress = ScoreEntityTarget;
export type MeasurePoint = { readonly kind: "measure"; readonly measureId: string };
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
  | { readonly kind: "measure-range"; readonly start: MeasurePoint; readonly end: MeasurePoint }
  | { readonly kind: "part-measure-range"; readonly start: PartMeasurePoint; readonly end: PartMeasurePoint }
  | { readonly kind: "voice-event-range"; readonly start: VoiceEventPoint; readonly end: VoiceEventPoint };
```

Export only this domain module from `src/core-kernel/index.ts`.

- [ ] **Step 4: Add hostile-input decoder tests**

Import the private codec directly and assert these exact classifications:

```typescript
assert.deepEqual(decodeScoreRange({
  kind: "voice-event-range",
  start: { kind: "voice-event", voiceId: "voice-1", eventId: "event-1" },
  end: { kind: "voice-event", voiceId: "voice-2", eventId: "event-2" },
}), {
  ok: true,
  value: {
    kind: "voice-event-range",
    start: { kind: "voice-event", voiceId: "voice-1", eventId: "event-1" },
    end: { kind: "voice-event", voiceId: "voice-2", eventId: "event-2" },
  },
});

for (const input of [
  { trackId: "track-1", beatId: "beat-1" },
  { kind: "measure", measureId: "measure-1", index: 0 },
  { kind: "voice-event", voiceId: "", eventId: "event-1" },
  { kind: "voice-event-range", start: { kind: "measure", measureId: "m1" }, end: { kind: "measure", measureId: "m2" } },
]) {
  assert.equal(decodeScoreRange(input).ok, false);
}
```

Also create proxy/getter inputs and assert getters are never invoked.

- [ ] **Step 5: Implement strict exact-record decoding**

Use `Reflect.ownKeys`, data-property descriptors, exact key sets, non-empty strings, and closed kind switches. Do not import or expose K1-2's private codec helpers. Return only:

```typescript
type DecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false };
```

`decodePersistedCheckpoint` accepts exactly `documentId` and a non-negative safe `documentVersion`.

- [ ] **Step 6: Run targeted tests**

Run:

```powershell
npm run build
node --test dist/test/core-kernel/address-range.test.js
```

Expected: PASS; no getter is invoked and obsolete/index/path shapes reject.

- [ ] **Step 7: Commit Task 1**

```powershell
git add src/core-kernel/domain/address.ts src/core-kernel/read/address-codec.ts src/core-kernel/index.ts test/core-kernel/address-range.test.ts
git commit -m "feat(core): add stable score address and range contracts"
```

**Rollback:** revert this commit; no K1-1/K1-2 runtime behavior has changed.

---

## Task 2: Deeply Immutable Snapshot and Atomic Read State

**Files:**

- Create: `src/core-kernel/read/contracts.ts`
- Create: `src/core-kernel/read/deep-freeze.ts`
- Create: `src/core-kernel/read/snapshot.ts`
- Create: `src/core-kernel/read/session-state.ts`
- Create: `test/core-kernel/read-system.test.ts`
- Modify: `src/core-kernel/commands/command-bus.ts`
- Modify: `src/core-kernel/index.ts`

**Interfaces:**

- Consumes: validated private `CommandRuntimeState` and K1-2 history depths.
- Produces: `DocumentSnapshot`, `KernelHistoryState`, `KernelReadState`, `ReadFailure`, `ReadResult<T>`, `CommandBus.read()` and private read-session initialization/cache.

- [ ] **Step 1: Write failing snapshot/read tests**

Cover initial V0, commit V1, old-snapshot retention, no-op/rejected version stability, deep unknown ExtensionBlock data, and recursive freeze:

```typescript
const bus = requireBus();
const first = bus.read();
assert.equal(first.ok, true);
if (!first.ok) return;
assert.equal(first.value.snapshot.documentId, "score-1");
assert.equal(first.value.snapshot.schemaVersion, "brilliant-score-1");
assert.equal(first.value.snapshot.documentVersion, 0);
assert.deepEqual(first.value.history, { undoDepth: 0, redoDepth: 0 });
assert.equal(first.value.dirty, false);
assert.equal(Object.isFrozen(first.value.snapshot), true);
assert.equal(Object.isFrozen(first.value.snapshot.document.parts[0]), true);

bus.submit(setPitch("D"));
const second = requireRead(bus);
assert.equal(second.snapshot.documentVersion, 1);
assert.equal(first.value.snapshot.document.parts[0]!.measureContents[0]!
  .voices[0]!.sequence.events[0]!.content.kind, "notes");
```

Attempt `Reflect.set` at metadata, nested note, array, and ExtensionBlock payload levels and assert `false` plus unchanged live behavior.

- [ ] **Step 2: Run the test and observe missing read API**

```powershell
npm run typecheck
```

Expected: FAIL because `CommandBus.read` and read contracts do not exist.

- [ ] **Step 3: Implement read contracts and deep freeze**

Add the exact interfaces/failures from `design.md`. Implement a private recursive freeze over Core-owned structured-cloned arrays/plain objects:

```typescript
export function deepFreezeValue<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreezeValue(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}
```

Keep this helper private; Core snapshots contain validated plain data, not caller getters.

- [ ] **Step 4: Implement snapshot cache and initial read-session state**

Initialize:

```typescript
{
  cleanStateIdentity: 0,
  stateIdentityByDocumentVersion: new Map([[0, 0]]),
  snapshotCache: undefined,
}
```

Build snapshots with `structuredClone(commandState.document)`, deep-freeze the clone and envelope, and cache only the current version. On failure return `read.invariant-violation` and preserve the previous cache/state.

- [ ] **Step 5: Add `CommandBus.read()` without changing writes**

Extend construction to initialize private read-session state. Add:

```typescript
read(): ReadResult<KernelReadState> {
  const transition = readKernelState(this.#commandState, this.#readState);
  this.#readState = transition.state;
  return transition.result;
}
```

`readKernelState` returns the exact private `ReadTransition` from `design.md`;
cache hit returns the original read state, cache creation returns a new read
state, and failure returns the original state. Tasks 2–4 keep private
command/read fields explicit; Task 5 moves them into the approved private
composed session runtime. Do not add `getDocument` or a mutable document
property.

- [ ] **Step 6: Run targeted read and K1-2 regression tests**

```powershell
npm run build
node --test dist/test/core-kernel/read-system.test.js
node --test dist/test/core-kernel/command-system.test.js
```

Expected: PASS; K1-2 write behavior is unchanged.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src/core-kernel/read src/core-kernel/commands/command-bus.ts src/core-kernel/index.ts test/core-kernel/read-system.test.ts
git commit -m "feat(core): add immutable versioned read snapshots"
```

**Rollback:** revert Task 2; Task 1 address types may remain independently.

---

## Task 3: Pure Entity, Ownership, and Hierarchical Range Selectors

**Files:**

- Create: `src/core-kernel/read/entity-index.ts`
- Create: `src/core-kernel/read/selectors.ts`
- Modify: `src/core-kernel/read/contracts.ts`
- Modify: `test/core-kernel/address-range.test.ts`
- Modify: `test/core-kernel/read-system.test.ts`
- Modify: `src/core-kernel/index.ts`

**Interfaces:**

- Consumes: `DocumentSnapshot`, `KernelReadState`, strict address/range decoders, `measureDefinitions`, Part contents, and Voice sequences.
- Produces: the exact six selectors and their frozen result unions.

- [ ] **Step 1: Write failing seven-entity and ownership tests**

For every address kind assert value and structural owner chain. Representative deep case:

```typescript
const selected = selectScoreEntity(snapshot, { kind: "note", noteId: "note-1" });
assert.equal(selected.ok, true);
if (selected.ok) {
  assert.equal(selected.value.kind, "note");
  assert.equal(selected.value.value.id, "note-1");
  assert.equal(Object.isFrozen(selected.value.value), true);
}
assert.deepEqual(
  selectScoreEntityOwnership(snapshot, { kind: "note", noteId: "note-1" }),
  { ok: true, value: {
    entityKind: "note",
    documentId: "score-1",
    partId: "part-1",
    measureId: "measure-1",
    voiceId: "voice-1",
    eventId: "event-1",
  } },
);
```

Assert a missing ID returns `read.entity-not-found` and malformed address returns `read.invalid-address`.

- [ ] **Step 2: Write failing range normalization/order tests**

Create at least two Measures and deliberately reverse one Part's `measureContents` storage. Assert:

```typescript
const result = selectScoreRange(snapshot, {
  kind: "part-measure-range",
  start: { kind: "part-measure", partId: "part-1", measureId: "measure-2" },
  end: { kind: "part-measure", partId: "part-1", measureId: "measure-1" },
});
assert.equal(result.ok, true);
if (result.ok && result.value.kind === "part-measure-range") {
  assert.deepEqual(result.value.measureContents.map(({ measureId }) => measureId),
    ["measure-1", "measure-2"]);
  assert.equal(result.value.normalized.start.measureId, "measure-1");
}
```

Add exact failures for missing endpoints, cross-kind endpoints, different Part IDs, different Voice IDs, and an Event owned by another Voice.

- [ ] **Step 3: Run targeted tests and observe missing selectors**

```powershell
npm run typecheck
```

Expected: FAIL on missing selector exports/types.

- [ ] **Step 4: Build the private per-snapshot index**

Traverse in this order: document; `measureDefinitions`; Parts; Part staves; each Part's contents joined to global Measure order; Voices; Events; Notes. Store selected frozen values plus structural owner IDs. Reject duplicate/missing data as `read.invariant-violation` even though Core-produced snapshots should already be semantically valid.

Cache indexes only in:

```typescript
const INDEX_BY_SNAPSHOT = new WeakMap<DocumentSnapshot, EntityIndex>();
```

Do not attach indexes to snapshots or export them.

- [ ] **Step 5: Implement the six pure selectors**

Every selector wraps its body in a total exception boundary and returns `ReadResult<T>`. `selectScoreRange` normalizes inclusive endpoint indexes and slices through `endIndex + 1`. It returns frozen result envelopes referencing only the frozen snapshot graph.

- [ ] **Step 6: Prove purity and repeatability**

Call every selector twice on the same snapshot and assert deep equality. Mutate returned envelopes with `Reflect.set` and assert failure/no live-state effect. Do not assert index or snapshot object-reference identity.

- [ ] **Step 7: Run targeted tests**

```powershell
npm run build
node --test dist/test/core-kernel/address-range.test.js
node --test dist/test/core-kernel/read-system.test.js
```

Expected: PASS with deterministic order and exact failures.

- [ ] **Step 8: Commit Task 3**

```powershell
git add src/core-kernel/read src/core-kernel/index.ts test/core-kernel/address-range.test.ts test/core-kernel/read-system.test.ts
git commit -m "feat(core): add pure score snapshot selectors"
```

**Rollback:** revert Task 3; snapshots remain usable as the full read value.

---

## Task 4: Exact Dirty State and Async-Safe Persisted Checkpoint

**Files:**

- Create: `test/core-kernel/dirty-checkpoint.test.ts`
- Modify: `src/core-kernel/read/contracts.ts`
- Modify: `src/core-kernel/read/session-state.ts`
- Modify: `src/core-kernel/commands/command-bus.ts`
- Modify: `test/core-kernel/command-internals.test.ts`

**Interfaces:**

- Consumes: K1-2 `HistoryEntry.sequence`, undo/redo stacks, document versions, and strict checkpoint decoder.
- Produces: `PersistedCheckpoint`, `CheckpointFailure`, `MarkPersistedResult`, version-to-content-state mapping, exact dirty state, and `CommandBus.markPersisted(input: unknown)`.

- [ ] **Step 1: Write the failing clean/dirty state machine test**

```typescript
const bus = requireBus();
assert.equal(requireRead(bus).dirty, false);
assert.equal(bus.submit(setMetadata("Saved candidate")).status, "committed");
assert.equal(requireRead(bus).dirty, true);
assert.deepEqual(bus.markPersisted({ documentId: "score-1", documentVersion: 1 }), {
  status: "updated", documentVersion: 1, dirty: false,
});
assert.equal(bus.submit(setPitch("D")).status, "committed");
assert.equal(requireRead(bus).dirty, true);
assert.equal(bus.undo().status, "committed");
assert.equal(requireRead(bus).dirty, false);
assert.equal(bus.redo().status, "committed");
assert.equal(requireRead(bus).dirty, true);
```

- [ ] **Step 2: Write the failing asynchronous-save test**

Capture V1, commit V2, then mark V1 persisted. Assert the result is `updated` with current `documentVersion: 2` and `dirty: true`; undo to V1's content identity and assert clean. This prevents marking unsaved V2 clean.

- [ ] **Step 3: Write branch and rejection tests**

Cover:

```typescript
const wrongDocument = bus.markPersisted({
  documentId: "other",
  documentVersion: 0,
});
assert.equal(wrongDocument.status, "rejected");
if (wrongDocument.status === "rejected") {
  assert.equal(wrongDocument.failure.code, "checkpoint.document-mismatch");
}

const unavailableVersion = bus.markPersisted({
  documentId: "score-1",
  documentVersion: 999,
});
assert.equal(unavailableVersion.status, "rejected");
if (unavailableVersion.status === "rejected") {
  assert.equal(unavailableVersion.failure.code, "checkpoint.version-unavailable");
}
```

Also test malformed/extra/getter input, same-checkpoint no-op, no-op/rejected commands preserving dirty, and a new branch that recreates equal content but remains dirty.

- [ ] **Step 4: Run tests and observe missing checkpoint behavior**

```powershell
npm run typecheck
```

Expected: FAIL on `markPersisted` and checkpoint contracts.

- [ ] **Step 5: Implement content-state identity and version map**

Use only:

```typescript
function contentStateIdentity(state: CommandRuntimeState): number {
  return state.undoStack[state.undoStack.length - 1]?.sequence ?? 0;
}
```

Record `{documentVersion -> contentStateIdentity}` only after an accepted committed transition. Do not store documents, commands, or mutations in this map. Compute dirty as `currentIdentity !== cleanIdentity`.
Never mutate the previous Map in place: construct the copied Map inside the
detached candidate and adopt it only with the full accepted session transition.

- [ ] **Step 6: Implement atomic `markPersisted`**

Strictly decode input, verify document ID and known version, then replace only the clean identity. Return `updated` when identity changes and `no-op` otherwise. Catch unexpected failures as `checkpoint.invariant-violation`; no public raw exception.

- [ ] **Step 7: Run dirty and K1-2 history tests**

```powershell
npm run build
node --test dist/test/core-kernel/dirty-checkpoint.test.js
node --test dist/test/core-kernel/command-system.test.js
node --test dist/test/core-kernel/command-internals.test.js
```

Expected: PASS; undo/redo versions remain K1-2 monotonic and dirty follows content identity instead.

- [ ] **Step 8: Commit Task 4**

```powershell
git add src/core-kernel/read src/core-kernel/commands test/core-kernel/dirty-checkpoint.test.ts test/core-kernel/command-internals.test.ts
git commit -m "feat(core): add exact persisted dirty checkpoint"
```

**Rollback:** revert Task 4; immutable read functionality remains.

---

## Task 5: Deterministic Post-Commit Events, Isolation, and Reentrancy

**Files:**

- Create: `src/core-kernel/events/contracts.ts`
- Create: `src/core-kernel/events/facts.ts`
- Create: `src/core-kernel/events/runtime.ts`
- Create: `src/core-kernel/session/runtime.ts`
- Create: `test/core-kernel/event-system.test.ts`
- Modify: `src/core-kernel/commands/contracts.ts`
- Modify: `src/core-kernel/commands/runtime.ts`
- Modify: `src/core-kernel/commands/command-bus.ts`
- Modify: `src/core-kernel/index.ts`
- Modify: `test/core-kernel/command-system.test.ts`
- Modify: `test/core-kernel/command-internals.test.ts`
- Modify: `test/core-kernel/dirty-checkpoint.test.ts`

**Interfaces:**

- Consumes: isolated K1-2 `CommandTransition`, effective private mutation, checkpoint transition, read-session state.
- Produces: `KernelEvent`, subscription contracts, internal committed-operation facts, candidate event preflight, synchronous dispatch, and stable reentrant/overflow failures.

- [ ] **Step 1: Write failing event count and order tests**

Subscribe, commit from initial clean state, and assert exactly:

```typescript
assert.deepEqual(events.map(({ eventType, eventSequence }) =>
  [eventType, eventSequence]), [
  ["core.document.committed", 1],
  ["core.session.dirty-state-changed", 2],
]);
assert.equal(events[0]!.documentVersion, 1);
assert.equal(events[1]!.documentVersion, 1);
```

A second commit while already dirty emits only document-committed sequence 3.
Rejected/no-op/empty undo/empty redo emit nothing. Mark persisted emits only
dirty-state-changed when the boolean toggles. Insert a semantic-valid two-Note
Event that K1 Profile classifies `unsupported.chord`; because K1-2 commits it,
assert the normal committed fact(s) are emitted and the unsupported support
classification is unchanged.

- [ ] **Step 2: Write affected-target and payload-boundary tests**

Assert metadata/pitch/value commands expose only their original target. Insert
orders Voice, Event, then Notes because Voice is the original target. Remove
orders Event, owning Voice, then contained Notes because Event is the original
target. Undo/redo reuse the exact original affected set. Recursively assert
payload freeze and absence of `document`, `mutation`, `history`, `handler`,
`timestamp`, `path`, and UI/runtime objects.

- [ ] **Step 3: Write subscriber lifecycle/isolation tests**

Register three handlers, make the first subscribe another handler, make the second unsubscribe, and make one throw. Assert the current dispatch uses the original registration snapshot, later events use the changed list, duplicate handler registrations are independent, unsubscribe is idempotent, later handlers still run, and the committed result/state remain valid.

- [ ] **Step 4: Write reentrancy tests through the real CommandBus**

Inside a callback call `read`, `submit`, `undo`, `redo`, and `markPersisted`. Assert read succeeds at the committed version while every write/checkpoint returns a rejection with `event.reentrant-write`, changes no state, and emits no nested facts.

- [ ] **Step 5: Write internal event-overflow atomicity test**

Use private `session/runtime.ts` with `lastEventSequence` set to
`Number.MAX_SAFE_INTEGER` to prove any one-fact transition rejects. Set it to
`Number.MAX_SAFE_INTEGER - 1` to prove a two-fact transition rejects while a
one-fact transition can consume the final safe value. Submit a command and
assert the rejected case exactly:

```typescript
assert.equal(transition.result.status, "rejected");
if (transition.result.status === "rejected") {
  assert.equal(transition.result.failure.code, "event.sequence-overflow");
}
assert.strictEqual(transition.state, originalState);
assert.deepEqual(transition.events, []);
```

Repeat for undo/redo and a checkpoint dirty toggle. The public constructor must not expose a test option.

- [ ] **Step 6: Run tests and observe missing event contracts**

```powershell
npm run typecheck
```

Expected: FAIL on event imports, subscribe method, and additive failure variants.

- [ ] **Step 7: Add internal committed-operation facts**

Extend only private runtime transitions:

```typescript
interface CommittedOperation {
  readonly cause: "submit" | "undo" | "redo";
  readonly command: CoreCommandEnvelope;
  readonly effectiveMutation: CoreMutation;
}
```

Rejected/no-op transitions omit it. Replay ignores it. Do not add it to any public result or index export.

- [ ] **Step 8: Implement event fact construction and sequence reservation**

Build the two exact public event variants from committed facts/session state.
Deduplicate affected addresses by `kind + stable ID`. Deep-freeze before
dispatch. Store `lastEventSequence`, initialized to `0`; preflight
`lastEventSequence + count` with safe-integer checks before adopting
command/checkpoint state, assign the inclusive sequence interval, then store the
interval upper bound only on acceptance. Build and freeze the complete event
array while the command/read/checkpoint candidate is still detached.

- [ ] **Step 9: Implement private session runtime**

Compose command state, read-session state, and `lastEventSequence`. A session
transition returns `{ state, result, events }`. Candidate rejection returns the
original state by identity and an empty event array. This internal layer is the
direct unit-test seam for overflow/atomicity; it is never exported publicly.
Wrap candidate integration in a total exception boundary: unexpected submit
integration maps to `command.internal-error`, undo/redo integration to
`history.invariant-violation`, and checkpoint integration to
`checkpoint.invariant-violation`. Only safe-counter exhaustion maps to
`event.sequence-overflow`.

- [ ] **Step 10: Implement CommandBus subscriptions and dispatch guard**

Store private subscriber records and a private dispatching boolean. `subscribe` validates functions and returns an idempotent closure. For each operation, reject reentrancy before calling session runtime; adopt the successful session state before dispatch; copy handlers; catch each handler separately; clear the guard in `finally`.

- [ ] **Step 11: Add only the two CommandFailure variants**

```typescript
| { readonly code: "event.reentrant-write" }
| { readonly code: "event.sequence-overflow" }
```

Do not rename, widen, or wrap existing K1-2 failures.

- [ ] **Step 12: Run targeted event/session regressions**

```powershell
npm run build
node --test dist/test/core-kernel/event-system.test.js
node --test dist/test/core-kernel/dirty-checkpoint.test.js
node --test dist/test/core-kernel/command-system.test.js
node --test dist/test/core-kernel/command-internals.test.js
```

Expected: PASS; handler throws do not escape and replay tests remain unchanged.

- [ ] **Step 13: Commit Task 5**

```powershell
git add src/core-kernel/events src/core-kernel/session src/core-kernel/commands src/core-kernel/index.ts test/core-kernel/event-system.test.ts test/core-kernel/dirty-checkpoint.test.ts test/core-kernel/command-system.test.ts test/core-kernel/command-internals.test.ts
git commit -m "feat(core): add deterministic post-commit events"
```

**Rollback:** revert Task 5; Tasks 1–4 remain independently testable read/checkpoint functionality, but final K1-3 acceptance is not possible without events.

---

## Task 6: Public Boundary, Specification Sync, and Full K1-3 Gate

**Files:**

- Modify: `test/core-kernel/public-api-boundary.test.ts`
- Modify: `.trellis/spec/core-kernel/index.md`
- Modify: `.trellis/spec/core-kernel/backend/index.md`
- Modify: `.trellis/spec/core-kernel/backend/pure-kernel-boundary.md`
- Modify: `.trellis/spec/core-kernel/backend/quality-guidelines.md`
- Modify: `.trellis/spec/core-kernel/backend/snapshot-events.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-014-kernel-snapshot-events.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-009-extension-api.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/prd.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/design.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/technical/microkernel-architecture.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/technical/modular-plugin-architecture.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/technical/software-architecture.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/requirements/REQ-017-kernel-module-communication.md`
- Modify: `.trellis/tasks/07-07-pure-core-kernel-v1/prd.md`
- Modify: `.trellis/tasks/07-07-pure-core-kernel-v1/design.md`
- Modify: `.trellis/tasks/07-07-pure-core-kernel-v1/implement.md`
- Modify: `.trellis/tasks/07-07-pure-core-kernel-v1/task.json`

**Interfaces:**

- Consumes: all completed K1-3 behavior and public exports.
- Produces: one non-conflicting active contract set and the final evidence package for independent review.

- [ ] **Step 1: Make the public export test fail closed**

Update the exact runtime export list for approved selector functions and keep a forbidden list containing at least:

```typescript
[
  "CoreMutation", "HistoryEntry", "CommittedOperation",
  "deepFreezeValue", "EntityIndex", "publish", "KernelEventBus",
  "cleanStateIdentity", "stateIdentityByDocumentVersion",
  "getDocument", "setDocument", "replaceDocument",
  "KernelRegistry", "KernelCapability", "KernelError", "KernelReport",
  "registerSelector", "registerEvent", "snapshotId",
]
```

Inspect the public index text and assert it does not export private codec/index/runtime/fact/session modules.

- [ ] **Step 2: Run boundary tests before final export cleanup**

```powershell
npm run build
node --test dist/test/core-kernel/public-api-boundary.test.js
node --test dist/test/core-kernel/forbidden-dependency-boundary.test.js
```

Expected: FAIL until index exports/private module references match the approved list.

- [ ] **Step 3: Finalize public exports**

Export public types/functions only from:

```typescript
export * from "./domain/address";
export * from "./read/contracts";
export * from "./read/selectors";
export * from "./events/contracts";
```

Do not export event publishing, internal codecs, session runtime, freeze/cache/index helpers, K1-2 internal transition facts, or mutable state access.

- [ ] **Step 4: Synchronize active planning/spec documents**

Replace old claims that snapshots require `snapshotId`/created time, that K1-3 includes serializable/diagnostic/registry selectors, or that it emits load/history/registry/migration events. State that the independent K1-3 task is authoritative and that implementation remains subject to final acceptance.

Do not edit historical `planning-snapshots/` or archived tasks; they are evidence, not active contracts.

- [ ] **Step 5: Run focused K1-3 tests together**

```powershell
npm run build
node --test dist/test/core-kernel/address-range.test.js dist/test/core-kernel/read-system.test.js dist/test/core-kernel/dirty-checkpoint.test.js dist/test/core-kernel/event-system.test.js
```

Expected: all K1-3 tests PASS.

- [ ] **Step 6: Run the complete quality gate**

```powershell
npm run typecheck
npm run build
npm test
git diff --check
python ./.trellis/scripts/task.py validate 07-15-k1-3-address-snapshots-selectors-events
```

Expected: all commands exit 0. If Node spawn fails with sandbox `EPERM`, rerun the same commands in the approved environment and record that evidence; do not reinterpret it as a test failure or silently skip it.

- [ ] **Step 7: Confirm clean scope and exact baseline**

```powershell
git status --short --branch
git diff --name-only codex/k1-2-commands-transactions-history...HEAD
git diff --check
```

Expected: only K1-3 production/tests/spec planning files plus known user-owned `.trellis/maintenance/`; no UI/IO/Guitar/K1-4/K1-5 implementation.

- [ ] **Step 8: Commit Task 6**

```powershell
git add src/core-kernel test/core-kernel '.trellis/spec/core-kernel/index.md' '.trellis/spec/core-kernel/backend/index.md' '.trellis/spec/core-kernel/backend/pure-kernel-boundary.md' '.trellis/spec/core-kernel/backend/quality-guidelines.md' '.trellis/spec/core-kernel/backend/snapshot-events.md' '.trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-009-extension-api.md' '.trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-014-kernel-snapshot-events.md' '.trellis/tasks/06-29-commercial-guitar-tablature-product/prd.md' '.trellis/tasks/06-29-commercial-guitar-tablature-product/design.md' '.trellis/tasks/06-29-commercial-guitar-tablature-product/technical/microkernel-architecture.md' '.trellis/tasks/06-29-commercial-guitar-tablature-product/technical/modular-plugin-architecture.md' '.trellis/tasks/06-29-commercial-guitar-tablature-product/technical/software-architecture.md' '.trellis/tasks/06-29-commercial-guitar-tablature-product/requirements/REQ-017-kernel-module-communication.md' '.trellis/tasks/07-07-pure-core-kernel-v1/prd.md' '.trellis/tasks/07-07-pure-core-kernel-v1/design.md' '.trellis/tasks/07-07-pure-core-kernel-v1/implement.md' '.trellis/tasks/07-07-pure-core-kernel-v1/task.json' '.trellis/tasks/07-15-k1-3-address-snapshots-selectors-events'
git commit -m "docs(core): close k1-3 read and event contracts"
```

Before committing, inspect the staged list and explicitly exclude `.trellis/maintenance/`.

**Rollback:** revert Task 6 documentation/boundary commit, then revert Task 5 through Task 1 in reverse order if the entire K1-3 block is rejected. No persisted user data needs migration.

---

## Final Review Checklist Before `task.py start`

Requirement coverage:

| Requirements | Implementation tasks | Primary acceptance |
|---|---|---|
| `K1-3-REQ-001..004` | Task 1 contracts/codec; Task 3 resolution | PRD AC-001; address/range tests |
| `K1-3-REQ-005..009` | Task 2 snapshot/read; Task 3 selectors/index | PRD AC-002/003; read tests |
| `K1-3-REQ-010..011` | Task 4 checkpoint state machine | PRD AC-004; dirty-checkpoint tests |
| `K1-3-REQ-012..015` | Task 5 event/session runtime | PRD AC-005; event tests |
| `K1-3-REQ-016..019` | Task 5 compatibility; Task 6 boundaries/specs | PRD AC-006/007; full regression/boundary gate |

- [ ] `prd.md` contains no unresolved question, duplicated brainstorm section, or placeholder.
- [ ] `design.md` defines every public type, method, ordering rule, failure family, state transition, and privacy boundary referenced by implementation.
- [ ] Every requirement `K1-3-REQ-001..019` maps to at least one implementation task and acceptance test.
- [ ] No task requires a mutable document getter, public event publisher, whole-document history snapshot, wall clock, random ID, or dynamic registry.
- [ ] Async save cannot mark a later unsaved version clean.
- [ ] Event overflow cannot commit without its required facts.
- [ ] K1-2 replay remains event/session-free and deterministic.
- [ ] Active parent/product/Core specs defer to the independent K1-3 authority and contain no conflicting old API.
- [ ] User has reviewed and explicitly approved `prd.md`, `design.md`, and `implement.md`.

Do not run `task.py start`, implement production code, stage, or commit the
planning set until the user completes the final planning review.
