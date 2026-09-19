# Agent A7.9b: Prepared Mutation Control Plane v0.1

## Outcome

A7.9b connects the version-bound Tempo ChangeSet protocol to the Agent state machine:

```text
Provider tool: score.update-tempo({ tempoBpm: 132 })
  -> control plane: score.prepare-tempo-change
  -> persist outer Invocation + exact ChangeSet + approval atomically
  -> local user approves that ChangeSet identity
  -> control plane: score.commit-tempo-change
  -> normalize the internal result to the outer Invocation
  -> semantic completion verification
```

The Provider sees only `score.update-tempo`. The internal prepare and commit capability
identifiers are absent from the model-visible catalog and toolset.

## Intent and execution are separate

`AgentInvocationRecord.input` remains the model-proposed intent:

```text
{ tempoBpm: 132 }
```

The new optional `preparedExecution` is produced by the trusted control plane and contains:

- the host preparation Invocation identity;
- the authoritative `changeSetId`;
- the internal commit Capability and contract version;
- the versioned document precondition;
- the exact commit input containing the ChangeSet;
- the authoritative approval summary and before/after preview.

Keeping both representations is important. Audit and evaluation can still explain what
the model requested, while execution and recovery use only the prepared host contract.

## Atomic approval checkpoint

Approval-required tool calls no longer persist `turn.tools-accepted` and then separately
construct the approval record. The controller prepares all required immutable data first,
then commits one `approval.required` event whose Run snapshot already contains the waiting
Invocation and its `preparedExecution`.

This closes a crash gap. There are now two safe sides of the checkpoint:

- Before `approval.required`: prepare may have run, but it was read-only and no mutation
  authority exists. Planning can safely run again.
- After `approval.required`: the Run Store contains the exact Invocation, ChangeSet,
  preview, scope, and approval identity needed for continuation or recovery.

The Run reducer accepts `approval.required` directly from active planning and moves to
`waiting:executing:approval` in the same event.

## Exact approval binding

`AgentRequiredApprovalItem` can now carry `changeSetId`. Approval continuation verifies
all of the following before dispatch:

- approval identity and local-user decision;
- outer Invocation identity and contract;
- current workspace, document, and version scope;
- persisted approval `changeSetId` equals `preparedExecution.changeSetId`.

The approval UI renders authoritative `96 BPM -> 132 BPM` values and a short ChangeSet
fingerprint. The full identity remains available in the element title and persisted audit
event.

## Dispatch and recovery

Normal Agent state and conversation records keep the outer identity
`score.update-tempo`. At dispatch time the control plane derives the effective internal
request `score.commit-tempo-change` from `preparedExecution`.

The same derivation is used for:

- initial approved dispatch;
- user-authorized safe retry;
- host receipt lookup after interruption.

Host results and recovered receipts are validated against the internal request first,
then normalized back to the outer Invocation identity. This prevents internal plumbing
from leaking into Provider context while keeping receipt identity exact.

## Completion proof

`verifyScoreTempoUpdateCompletion` requires:

- a valid original target BPM;
- a valid persisted prepared execution;
- commit result `changeSetId` equal to the approved ChangeSet;
- before and after BPM equal to the ChangeSet facts;
- result document identity equal to the ChangeSet document;
- exactly one document version increment;
- an available undo record.

Evidence includes the outer Invocation ID, complete ChangeSet ID, resulting document
version, and final tempo fact.

## Failure behavior

- Invalid, stale, or mismatched preparation fails before approval.
- Denial records the outer Invocation as rejected and performs no commit call.
- A changed workspace version prevents approval continuation before dispatch.
- An uncertain commit outcome enters the existing receipt reconciliation path using the
  internal commit identity.
- Malformed persisted prepared executions and malformed approval ChangeSet identities
  are rejected at the Run Store IPC boundary.

## Verification

Coverage proves:

- only the outer capability is model-visible;
- prepare occurs before approval and commit does not;
- approval contains authoritative before/after values and exact ChangeSet identity;
- approval dispatches the exact persisted ChangeSet;
- denial never dispatches commit;
- recovered receipts use internal identity and restore outer identity;
- Session routing, completion response, projection refresh, and deterministic evaluation;
- strict persistence rejection for malformed prepared execution data.

## Next stage

A7.10 should generalize the prepared-mutation registry beyond Tempo and define bounded
ChangeSet operation families for musical edits. The next candidate can be a single
measure meter change, which adds a stable entity target and musical invariant checks
without yet introducing arbitrary note-range transformations.
