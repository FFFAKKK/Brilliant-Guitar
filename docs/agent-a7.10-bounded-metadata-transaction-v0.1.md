# Agent A7.10: Bounded Metadata Transaction v0.1

## Outcome

A7.10 introduces the first bounded multi-operation Agent transaction:

```text
Provider: score.update-metadata({ title?, tempoBpm? })
  -> control plane: score.prepare-metadata-transaction
  -> persist exact ChangeSet and one approval
  -> local user approves that ChangeSet identity
  -> control plane: score.commit-metadata-transaction
  -> one Core metadata command, one document version, one undo record
  -> semantic completion verification
```

The Provider sees one task-oriented Capability. The internal prepare and commit
Capabilities remain absent from the model-visible catalog.

## Why bounded transactions

The Agent does not receive a generic `executeCommands[]` tool. An arbitrary command list would
make the model responsible for command ordering, invariants, conflict detection, and rollback.
Those responsibilities belong to the control plane and the application kernel.

Instead, each transaction family defines:

- a closed intent input;
- an authoritative prepare step;
- a version-bound and tamper-resistant ChangeSet;
- a deterministic compiler to an application command;
- a semantic result verifier.

This keeps the model expressive at the task level without giving it direct kernel authority.

## Three representations

The same user request has three different representations:

1. **Intent**: `{ title: "夜曲", tempoBpm: 132 }` describes the desired outcome.
2. **ChangeSet**: records the exact document, base version, canonical operation order, and complete
   before/after metadata snapshots.
3. **Compiled command**: one `core.document.set-metadata` command preserving unrelated authors.

The ChangeSet is the approval object. The compiled command is an implementation detail.

## ChangeSet identity

`ScoreMetadataTransactionChangeSetV1` contains:

- `changeSetId`;
- `documentId` and `baseDocumentVersion`;
- canonical operations: `set-title`, then `set-tempo` when applicable;
- complete `before` and `after` snapshots for title and tempo.

The ID is a domain-separated SHA-256 digest over the document identity, base version, and both
snapshots. Changing any approved fact invalidates the identity. The host also derives the expected
operation list from the snapshots, so reordered, duplicated, omitted, or invented operations fail
closed.

## Atomicity and undo

Title and tempo share one document metadata aggregate. Executing two independent writes would risk
lost updates and would create two history entries. The transaction compiler therefore coalesces the
two semantic operations into one domain command.

The commit contract proves:

- all preconditions still match the prepared snapshot;
- the document version increases exactly once;
- independent readback equals the approved `after` snapshot;
- one undo record is available;
- one Undo restores both fields together.

This is transaction atomicity at the domain boundary, not merely a loop of tool calls.

## Approval and state machine

The approval preview now supports a bounded `change-list`. Every row is still a strict field change,
and the whole list is persisted with one ChangeSet ID.

No new Run lifecycle state is required. The existing durable checkpoint remains:

```text
active/planning -> waiting/executing/approval -> active/executing
```

Transaction detail belongs to the persisted Invocation and ChangeSet. Adding states for every
prepared operation would mix workflow state with domain data and make recovery harder.

## Recovery and retry

The persisted prepared execution contains the exact internal commit request. Receipt lookup and
safe retry derive the same internal identity from that snapshot, while Provider-visible results are
normalized back to `score.update-metadata`.

Sequence CAS still prevents two processes from consuming the same approval or retry authorization.
The host invocation receipt still prevents ambiguous redispatch after a crash.

## Verification

The semantic verifier checks:

- original intent against the approved `after` snapshot;
- result ChangeSet ID against the persisted ChangeSet;
- exact before/after snapshots and operation order;
- document identity and exactly one version increase;
- availability of the single undo record.

Deterministic evaluation verifies that the model sees only the outer Capability and that both field
changes appear in one authoritative approval preview.

## Deliberate limits

This version supports only title and global tempo. It does not expose arbitrary Core commands,
nested transactions, cross-document writes, note-range transformations, or unbounded operation
lists.

The next transaction family should add a stable musical entity target, such as a measure meter
change. That will test target identity and musical invariants while retaining the same
prepare/approve/commit/verify protocol.
