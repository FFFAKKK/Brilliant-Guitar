# Agent A7.8: Write Quality Framework v0.1

## Outcome

A7.8 turns the first title mutation into a reusable quality framework with three
control-plane artifacts:

```text
structured approval preview
  -> exact approved Invocation
  -> semantic postcondition verification
  -> deterministic workflow evaluation
```

The framework does not add another execution path. It makes the existing approval,
Capability, and completion boundaries observable and testable.

## Structured approval preview

An approval item may now persist a typed preview:

```text
kind: field-change
field: score.title
before: null
after: 夜曲
```

The preview is produced by the trusted Capability descriptor, validated by the control
plane, stored in the `approval.required` event, restored with the Run, and rendered by
the approval UI. It is not generated from model prose.

`before: null` is intentional in v0.1. The current title is not independently read during
the approval preparation step, so the UI shows only the exact target value. Claiming an
old value without version-bound evidence would produce a more attractive but less honest
preview.

Legacy persisted approval events without a `preview` field remain valid and render the
existing summary. New previews are strict: unknown fields, malformed semantic paths, and
oversized values are rejected at the IPC boundary.

## Semantic postconditions

The title completion verifier now checks more than the output shape. A completed Run must
prove all of the following:

- the successful Invocation input is a valid `ScoreUpdateTitleInputV1`;
- the result is a valid `ScoreTitleUpdateV1`;
- the result title exactly equals the approved Invocation title;
- the document version increased by exactly one from the Invocation base version;
- the application reports an available undo record.

Only then does verification emit evidence such as:

```text
invocation-7
score-1@8
score.title=夜曲
```

This keeps the model outside the completion decision. A fluent final message cannot make
an incorrect or non-undoable write count as completed.

## Deterministic write evaluation

The offline evaluation baseline now includes approved and denied title-edit workflows.
Both use the real router, toolset, controller, approval state machine, Capability port,
completion verifier, and Fake Provider. No paid Provider or credential is used.

The approved case verifies:

- routing selects only `score.update-title`;
- execution pauses for approval;
- the persisted preview contains the exact target title;
- approval resumes the same Invocation;
- the control-plane document precondition reaches the host;
- semantic verification emits the expected document and field evidence;
- the final response remains grounded in the verified result.

The denied case verifies:

- the same exact preview is shown before the decision;
- the Invocation remains in the workflow audit trail;
- no `invocation.dispatched` event occurs;
- the host Capability call count is zero;
- the Run returns to a non-terminal user-input wait instead of claiming success.

## Correct execution metrics

`capabilityCallCount` now counts `invocation.dispatched` events rather than the number of
Invocation records. This distinction matters for approvals: a proposed or rejected
Invocation is auditable work, but it is not an executed host call. Retries naturally count
each dispatch attempt.

## Remaining boundary

The semantic verifier currently trusts the typed application result returned by the Rust
Capability Gateway. That is sufficient for the small title mutation because the gateway
adapts the existing atomic `ScoreSessionService.edit()` result.

Complex musical edits need a stronger two-stage contract:

```text
prepare version-bound ChangeSet and preview
  -> approve exact ChangeSet identity
  -> commit through application command
  -> independently read back affected musical facts
```

That stage should provide authoritative before-and-after values, affected entity counts,
and musical invariants without sending a full score through the model or UI.

## Verification

Coverage includes:

- strict preview contract validation;
- legacy approval compatibility;
- recovery of persisted structured previews;
- title intent/result equality;
- exact version increment;
- undo availability;
- approved write evaluation;
- denied write evaluation with zero dispatches;
- existing stale-version, sequence-CAS, receipt-recovery, and retry tests.

## Next stage

A7.9 should introduce a version-bound `ChangeSet` preparation contract for complex music
mutations. The first candidate should remain narrow, such as changing tempo or one measure's
meter, so prepare, preview, commit, read-back verification, and undo can be proven before
adding note-range transformations.
