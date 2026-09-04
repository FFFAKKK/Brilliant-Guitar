# History, Dirty Identity and Checkpoint Decision

## Decision

Use one append/truncate history vector plus cursor, a never-reused history
sequence as content identity, an append-only per-document-version identity
vector for delayed save completion, and one latest replaceable operational
document checkpoint. Public-compatible `markPersisted` and internal operational
checkpointing are different mechanisms.

## Why one vector plus cursor

Two independent undo/redo stacks duplicate ownership transfers and obscure the
single canonical sequence. The authority explicitly selects a vector/cursor,
and RKP-3 already provides a forward/inverse pair per accepted transition.

```text
entries: [A#1, B#2, C#3]
cursor:                   3   -> undoDepth 3 / redoDepth 0
undo C:                   2   -> undoDepth 2 / redoDepth 1
submit D#4: [A#1, B#2, D#4], cursor 3
```

Sequence `3` is not reused. No-op/reject does not truncate C. This makes branch
identity and redo preservation testable without document equality.

## Identity table

| Transition | Version | Cursor identity | Clean identity | Dirty |
|---|---:|---:|---:|---|
| create | 0 | 0 | 0 | false |
| submit A | 1 | 1 | 0 | true |
| mark version 1 | 1 | 1 | 1 | false |
| submit B | 2 | 2 | 1 | true |
| delayed mark version 1 | 2 | 2 | 1 | true/no-op |
| undo B | 3 | 1 | 1 | false |
| redo B | 4 | 2 | 1 | true |
| undo then submit deep-equal C | 6 | 3 | 1 | true |

The per-version vector is `[0, 1, 2, 1, 2, 1, 3]` for this illustrative trace.
It retains the identity of every observed version even if a redo entry is later
truncated. Lookup is O(1), and `markPersisted` needs neither document clone nor
hash.

## Atomic reservation law

Before adoption, a state-changing transition reserves/checks:

1. next document version;
2. next history sequence for an effective submit;
3. history capacity after prospective tail truncation;
4. per-version identity capacity;
5. exact one/two/zero event sequence interval;
6. stored operation preconditions and the complete RKP-3 CommitPlan;
7. checked checkpoint scheduling counter addition for a new entry.

Tail truncation, entry append, cursor/version/identity writes and event-sequence
advance occur only after expected failures are exhausted. No attempt metric may
masquerade as committed state.

## Operational checkpoint interpretation

The authority says checkpoint is scheduled after 512 committed entries or
32 MiB accumulated ChangeSets, and physical recovery belongs elsewhere. RKP-4
therefore keeps one latest immutable checkpoint:

```text
{ accepted document version, history cursor, content identity, document }
```

One `Option` is deliberately the smallest bounded retention policy. It avoids
inventing a public restore history or silently evicting semantic history. The
scheduler counts accepted new history entries and their existing checked
`ChangeSet.logical_bytes`; undo/redo move a cursor and add no entry.

Checkpoint materialization is post-critical-section maintenance. Success
atomically replaces the old checkpoint and resets counters. Failure preserves
the committed edit, old checkpoint, due flag and counters and is retried later.
It emits no event and never changes clean/dirty identity.

## Rejected alternatives

- **Two stacks:** conflicts with authority and complicates stable identities.
- **Whole-document history:** violates the no-copy history contract and scale
  goal.
- **Deep equality or document hash for dirty:** adds global work and collapses
  distinct branches.
- **Treat `markPersisted` as the operational checkpoint:** conflates an external
  save acknowledgement with internal maintenance and would introduce I/O/hash
  semantics into Core.
- **Roll back a commit when post-commit checkpoint materialization fails:** the
  edit is already accepted; retroactive failure would violate event/history
  atomicity.
- **Evict history at checkpoint:** explicitly forbidden; checkpoint is not a
  compaction license.

## RKP-5 seam

Undo/redo stored effects still need accepted Level A/B/C revalidation and
classification. RKP-4 builds one pre-adoption hook after stored-effect planning
and before commit. In RKP-4 it performs only RKP-3 local invariants and is tested
with stage-safe inputs. RKP-5 fills that hook; RKP-4 does not fake or backport
RKP-5 results.
