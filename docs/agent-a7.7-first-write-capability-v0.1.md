# Agent A7.7: First Write Capability v0.1

## Outcome

A7.7 proves the first complete Agent write path with `score.update-title`:

```text
model input { title }
  + control-plane document precondition
  -> approval policy and exact-operation approval
  -> durable Invocation receipt
  -> Rust Capability Gateway
  -> existing ScoreSessionService.edit()
  -> core.document.set-metadata
  -> completion verification and UI projection refresh
```

The Agent receives no privileged document mutation API. It uses the same application
command path as the rest of the product, including version checks, document history,
and undo.

## Intent and authority are different data

The model may propose only the semantic input:

```json
{ "title": "New title" }
```

The control plane attaches the authoritative sidecar immediately before dispatch:

```text
documentId
documentVersion
workspaceId
runId
invocationId
```

This separation is essential. A model can express what should change, but it cannot
choose which document version it is authorized to mutate. The sidecar is also excluded
from the model-visible input schema, so prompt text cannot forge it.

## Why this is a Capability, not an Agent-only command

`score.update-title` is a versioned business Capability with one input contract and one
minimal result contract. The Agent is one caller of that Capability, not its owner.

The Rust gateway adapts the Capability into the existing application command:

```text
ScoreEditRequest
  -> ScoreSessionService.edit()
  -> core.document.set-metadata
```

This preserves the product's current validation, version increment, edit history, and
undo semantics. Building a parallel Agent mutation layer would duplicate those rules
and eventually let human and Agent edits behave differently.

## Approval is bound to one exact operation

The write is classified as high risk because it declares a document write side effect.
Under the current risk-based policy it must stop before dispatch and persist an approval
request containing:

- the exact Capability ID and contract version;
- the exact validated input and human-readable title summary;
- the workspace and document version;
- the Run and Invocation identities;
- the policy decision and side-effect evidence.

Approval is therefore not a reusable permission such as "the Agent may edit titles".
It authorizes one concrete Invocation. If the document changes before approval, the
continuation is rejected and the user must start from fresh state.

## Three consistency barriers

The path deliberately uses three different barriers because they solve different races:

1. Run Store sequence CAS prevents two processes from accepting the same approval or
   retry transition.
2. The durable Invocation receipt prevents a crash recovery from dispatching a started
   or resolved host operation again. Receipt schema v3 includes both input identity and
   document precondition identity.
3. The application document version rejects a command whose business state became stale
   after planning.

None of these replaces the others. Run CAS protects workflow state, the receipt protects
host-call identity, and the document version protects domain state.

## Minimal result and completion verification

The host returns only the facts required to verify and present this operation:

```text
documentId
documentVersion
previousTitle
title
undoAvailable
```

The Agent controller verifies the typed result and its Invocation identity before it may
complete the Run. The Workbench then re-reads the authoritative session and refreshes the
React projection. The callback is presentation synchronization, not proof of mutation;
the Rust service and durable receipt remain authoritative.

## State-machine effect

No second write state machine was introduced. The existing Run and Invocation machines
gain a real mutation flowing through their established states:

```text
planning
  -> validating
  -> waiting:approval
  -> approved
  -> dispatched
  -> host receipt started
  -> application edit
  -> host receipt resolved
  -> verifying
  -> completed
```

Cancellation after dispatch cannot claim that the edit stopped. It becomes a reconciliation
problem until the host receipt proves the outcome.

## Undo boundary

The title update enters the existing document history and the ordinary application undo
restores the previous title. A separate Agent undo Capability is intentionally deferred.
When added, it should target an exact completed mutation or history version instead of
issuing a vague global undo against whatever operation happened most recently.

## Verification

Coverage includes:

- strict TypeScript input and output contracts;
- title-edit intent routing with precedence over metadata reads;
- high-risk approval classification and exact title summary;
- no dispatch before approval;
- control-plane document precondition attachment;
- host receipt identity including the precondition;
- stale-version rejection;
- typed completion verification and projection refresh;
- Rust execution through the normal edit command;
- version increment and ordinary undo restoration;
- compatibility with recovery, retry, and existing read Capabilities.

## Next stage

A7.8 should turn this vertical slice into a write-quality framework. The next useful work
is deterministic write evaluation and richer edit preview: verify stale-state, denial,
approval, crash recovery, semantic postconditions, and user-visible diffs before adding
more mutation Capabilities. Complex musical edits should reuse this framework rather than
each inventing their own confirmation and recovery behavior.
