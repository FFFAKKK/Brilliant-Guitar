# Agent A7.9a: Version-Bound ChangeSet v0.1

## Outcome

A7.9a establishes the authoritative host protocol needed before a complex Agent write can
enter the approval state machine:

```text
intent: set tempo to 132 BPM
  -> prepare version-bound ChangeSet
  -> approve that exact ChangeSet identity
  -> commit through ScoreSessionService.edit
  -> independently read metadata back
  -> retain the normal undo record
```

This stage deliberately does not expose the two internal capabilities to the model. The
model-facing capability will remain a small intent contract. A control-plane coordinator
will own preparation and commit in A7.9b.

## Contract

The first narrow ChangeSet is `ScoreTempoChangeSetV1`:

```text
changeSetId
kind: score-tempo
documentId
baseDocumentVersion
beforeTempoBpm
afterTempoBpm
```

`score.prepare-tempo-change` reads the authoritative metadata projection and creates this
record. The caller supplies only the target BPM plus the control-plane document
precondition. No full score snapshot is copied or returned.

The ChangeSet identity is a domain-separated SHA-256 digest over the document identity,
base version, and exact IEEE-754 bits of the before and after BPM values. It is a stable
content identity, not a signature and not an authorization token. Authorization still
belongs to the approval state machine.

## Commit invariants

`score.commit-tempo-change` rejects the request unless all of these remain true:

- the ChangeSet has the expected strict shape and semantic kind;
- its content still produces the same `changeSetId`;
- its document identity and base version equal the transport precondition;
- the current document identity, version, and tempo equal the prepared before-state;
- the target tempo is finite, positive, and different from the current tempo.

The commit does not mutate the kernel directly. It submits the existing
`core.document.set-metadata` command through `ScoreSessionService.edit`, preserving title
and authors while changing only tempo. This keeps idempotency, version conflict behavior,
history, and undo on the normal application path.

## Independent read-back

After the edit returns, the Gateway calls `read_metadata` again and verifies:

- the document identity is unchanged;
- the document version is exactly `baseDocumentVersion + 1`;
- the stored tempo exactly equals the approved target;
- the edit produced an available undo record.

The result includes the committed `changeSetId`, before and after BPM, resulting document
version, and undo availability. A successful command response alone is therefore not
enough to claim completion.

## Failure semantics

- A stale prepare is rejected with `score.document-version-conflict`.
- A no-op prepare is rejected with `score.change-set-empty` and needs no approval.
- A malformed or content-tampered ChangeSet is rejected before execution.
- A once-valid ChangeSet whose source state changed is rejected with
  `score.change-set-stale` and must be prepared and approved again.
- A failed read-back never becomes a successful result, even if the write may have
  occurred. Receipt recovery and reconciliation remain responsible for unknown outcomes.

The protocol is stateless between prepare and commit. The persisted ChangeSet contains
the facts needed for recovery, while optimistic version checks make old approvals expire
safely after any intervening edit.

## Why the split matters

The intent, ChangeSet, and command answer different questions:

- Intent: what outcome did the model ask for?
- ChangeSet: what exact current fact will change, and from which document version?
- Command: how does the application perform that approved change atomically?

Keeping these concepts separate prevents model prose from becoming execution authority,
lets the user approve authoritative before-and-after values, and lets the host prove that
the approved object is still applicable at commit time.

## Verification

Rust coverage proves preparation, content identity, tamper rejection, stale rejection,
UI bypass rejection, application-layer commit, independent metadata read-back, exact
version increment, and undo restoration. TypeScript coverage proves strict decoding of
prepare input, ChangeSet, commit input, and commit result.

## Next stage

A7.9b should add a control-plane prepared-mutation coordinator:

```text
model calls score.update-tempo({ tempoBpm })
  -> controller invokes internal prepare
  -> approval.required persists the exact ChangeSet and authoritative preview
  -> approval.granted resumes internal commit
  -> semantic completion verifier matches result to ChangeSet identity
```

The internal prepare and commit capabilities must remain absent from the provider toolset.
