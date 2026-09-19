# Agent A7.6c: Approval Audit and Safe Retry v0.1

## Outcome

A7.6c closes the recovery gap between a persisted approval and the first host-side effect.
It also turns approval history into a queryable audit projection without adding a second
mutable source of truth.

## Design decisions

### Approval audit is an event projection

`projectAgentApprovalAudits(run)` pairs:

- `approval.required`
- `approval.approved` or `approval.denied`
- the referenced Invocation event streams

The resulting record answers:

- what was requested;
- when it was requested;
- who decided (`local-user`);
- when and how it was decided;
- how many execution attempts and retries occurred;
- the final Invocation status and approval execution outcome.

The audit record is not written separately. Run and Invocation events remain the facts;
the audit is a read model. This avoids a dual-write failure where execution commits but an
audit table does not, or vice versa.

### One outstanding Invocation per persisted checkpoint

An approved tool-call batch is executed as a persisted chain:

1. Approval and the first Invocation's `dispatched -> running` state are committed together.
2. When the current Invocation succeeds, its outcome and the next Invocation's
   `dispatched -> running` state are committed together.
3. The next Capability is called only after that commit succeeds.

Therefore a crash leaves at most one Invocation requiring host receipt reconciliation.
Pending batch members remain `validated`; they are never falsely presented as started.

### Retry requires proof and user authorization

Retry is available only when the host receipt service returns `not-started` for the exact
Invocation identity. Clicking the recovery action is not enough by itself. The Session asks
the receipt service again immediately before acquiring the retry lease.

The retry then commits these facts before invoking the Capability:

```text
Invocation: invocation.retry-authorized
Invocation: invocation.dispatched
Invocation: invocation.started
Run:        invocation.retry-authorized { invocationId, authorizedBy: local-user }
```

The original `invocationId` is reused because this is another attempt of the same logical
operation, not a new model decision. Host receipts and idempotency therefore keep one stable
operation identity, while Invocation events preserve the attempt history.

### Three concurrency boundaries

- The runtime retry lease prevents duplicate work in the current UI process.
- The Run Store sequence CAS prevents stale writers in other processes from committing a
  second retry authorization.
- The host receipt and stable `invocationId` protect the effect boundary when the process
  crashes after a commit.

No one mechanism is sufficient alone. The lease is fast but local, CAS is durable but cannot
observe host execution, and the receipt knows execution truth but does not serialize Run state.

## State-machine impact

Invocation transition:

```text
dispatched | running | outcome-unknown
  -> invocation.retry-authorized
  -> validated
  -> invocation.dispatched
  -> invocation.started
  -> running
```

Run transition:

```text
recovering:executing
  -> invocation.retry-authorized
  -> active:executing
```

The transition is deliberately unavailable from normal active or waiting states. Recovery
proof and user intent are prerequisites, not optional metadata.

## Verification

Targeted tests cover:

- approval and denial audit projections;
- a crash after approval is persisted but before the Capability starts;
- a fresh `not-started` receipt followed by a successful retry;
- refusal when a fresh receipt no longer proves `not-started`;
- retry attempt and actor history;
- duplicate cross-process retry rejection before Capability dispatch;
- one outstanding Invocation across a mixed approved batch;
- IPC rejection of retry authorization without a local-user actor.

## Next stage

A7.6d should make approval policy configurable by Capability risk class and workspace policy.
The model may explain why it wants an operation, but the control plane must continue to derive
risk, decide whether approval is mandatory, and construct the approval contract.
