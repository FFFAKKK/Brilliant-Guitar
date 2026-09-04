# Native Events, Read and Replay Boundary

## Verdict

Use two new private Node exports, not one export per feature. Rust owns state
transitions and deterministic event facts; the TypeScript adapter owns frozen
JS objects, cached object identity, callback registration/dispatch and the
reentrant-write guard.

## Export surface

```text
existing:
  createKernelSessionV1
  readKernelSessionV1
  submitKernelStage3V1

new:
  operateKernelStage4V1
  replayKernelStage4V1
```

`operateKernelStage4V1` is a versioned tagged request for submit, undo, redo,
mark-persisted, read, and select. This keeps handle/mutex/panic logic in one
place and prevents six near-duplicate bridge entrypoints.

`replayKernelStage4V1` takes no handle. That structural rule proves replay
cannot mutate a live session or dispatch to its subscribers.

## Cache handshake

Native cannot safely answer only “cache hit” unless it knows the JS caller owns
the matching frozen object. Every Stage-4 read therefore sends
`knownSnapshotVersion: number | null`.

```text
adapter has matching revision + native has matching cache
  -> identity/history/dirty + document null
  -> adapter returns same frozen DocumentSnapshot object

adapter has no match or native cache has no match
  -> full detached document
  -> adapter freezes and records new DocumentSnapshot
```

The handle scopes the cache identity, so a numeric revision is sufficient; a
new adapter sends `null`. Legacy read always asks for the full payload.

## Selector boundary

Selectors are tagged operations and return one observed document version plus
the selected DTO/failure. Metadata/entity/ownership/range use Runtime indices;
history/dirty use scalar state. Document entity selection is explicitly a full
snapshot request. No selector accepts an arbitrary function, JSON path, array
index, mutable reference or raw store handle.

## Event bridge

Rust returns ordered events in the same operation response that reports the
committed transition. JS dispatch begins only after strict decode/deep freeze
and completes before the adapter method returns. Because no callback crosses
FFI:

- Rust does not retain N-API references or call into JS under its session lock;
- callback throws/rejections cannot poison or roll back the runtime;
- reads during callbacks make a new native read safely after the write call has
  released the lock;
- writes during callbacks are rejected by `dispatchDepth` without entering
  native code.

Subscriber snapshot semantics are per event, not per operation: changes made by
a handler affect the next event in a two-event operation, matching the accepted
TypeScript contract.

## Predecessor compatibility

The old Stage-3 submit entrypoint must not bypass new history. It delegates to
the unified Stage-4-aware Core submit transition and maps only its old result
fields. Its events have no registered legacy observer and are discarded at the
boundary, but the Rust sequence still advances coherently. The legacy read now
returns real history/dirty fields and a full document.

Successor-aware edits may relax only placeholder assertions made obsolete by
RKP-4. They may not weaken handle, byte, freeze, export or RKP-3 transaction
checks.

## Replay isolation

Replay captures the complete input before starting, builds a fresh Session and
submits semantic envelopes. It returns final canonical document and stage-owned
per-command results. It neither consumes nor exposes history entries,
ChangeSets, event logs, snapshots or callbacks as inputs. Rejection stops the
loop at the first index; already committed fresh-session changes remain in the
returned final document, exactly as the accepted TypeScript replay contract.

## Privacy and resource rules

- Exact tagged shapes, depth 64, native properties 1,572,864, dense arrays,
  safe integers and 64 MiB request/response caps remain mandatory.
- Results contain no Rust type name, pointer, generation, path, backtrace, raw
  error, handler value or maintenance document.
- Submit/undo/redo never return a full document; explicit read/replay final
  output are the only Stage-4 full-document wire paths.
- Snapshot response overflow is a read failure, not session corruption.
- No public TypeScript export or product engine selector is added.
