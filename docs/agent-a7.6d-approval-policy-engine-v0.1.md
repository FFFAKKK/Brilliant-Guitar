# Agent A7.6d: Approval Policy Engine v0.1

## Outcome

A7.6d replaces the old static approval flag with one deterministic control-plane
decision:

```text
Capability facts + immutable Run policy -> allow | require-approval | deny
```

The model sees only the effective result for the current Run. It cannot lower a
Capability's approval requirement, select the policy mode, classify its own risk,
or construct the persisted approval contract.

## Why policy is separate from Capability code

A Capability knows facts about itself:

- its semantic approval floor: `risk-based` or `always`;
- its scope and preconditions;
- its document, filesystem, network, settings, and playback side effects.

A Run knows the user's current operating policy:

- `disallow`: omit every Capability that would require approval;
- `risk-based`: allow low-risk reads and interrupt for higher-risk work;
- `always`: interrupt before every Capability execution.

Neither object can decide alone. Combining them in `evaluateCapabilityApproval()`
keeps the decision deterministic, testable, versioned, and independent from model
wording.

## Risk classification v0.1

The evaluator derives risk from declared side effects:

| Risk | Capability facts |
| --- | --- |
| High | Any document, filesystem, network, or settings write |
| Medium | Filesystem, network, or settings read; playback start or stop |
| Low | Document read or no side effect |

`approvalRequirement: always` raises the Capability floor even when side effects
would otherwise be low risk. A Run policy may raise that floor, but never lower it.

## Decision matrix

| Effective Capability baseline | `disallow` | `risk-based` | `always` |
| --- | --- | --- | --- |
| Low-risk / no approval floor | allow | allow | require approval |
| Medium, high, or `always` floor | deny | require approval | require approval |

`deny` means the Capability is omitted from the model-visible Toolset. It is not a
tool-call error after the model has already selected the tool.

## PDP and PEP

`evaluateCapabilityApproval()` is the policy decision point (PDP). It has no I/O
and returns the decision, risk level, reasons, policy version, policy mode, and
Capability requirement.

`ToolsetResolver` is the first policy enforcement point (PEP):

- `deny` omits the Capability;
- `allow` exposes it with `requiresApproval: false`;
- `require-approval` exposes it with `requiresApproval: true`.

`AgentRunController` is the second PEP. Before persisting `approval.required`, it
evaluates the authoritative catalog entry again and fails closed if the result no
longer requires approval. This protects execution from stale or forged model-visible
descriptors.

The two evaluations serve different boundaries. Toolset resolution limits what the
model may propose; controller evaluation limits what the host may execute.

## Persisted policy evidence

Every `AgentRequiredApprovalItem` snapshots:

```text
policyVersion
mode
capabilityRequirement
decision = require-approval
```

The item also snapshots the exact Invocation, input summary, workspace and document
version, scope, side effects, risk, and Capability contract version. An approval is
therefore evidence for one exact operation, not a reusable ambient permission.

When classification rules change, the Run policy version must change as well. Old
audit records keep the decision context that existed when the user acted.

## State-machine impact

The policy engine does not introduce another mutable state machine. It decides which
existing transition is legal:

```text
allow             -> validated Invocation may dispatch
require-approval  -> active:executing -> waiting:executing(approval)
deny              -> Capability absent from Toolset
```

Approval continuation, Run Store sequence CAS, host receipts, and retry rules remain
responsible for the later execution lifecycle.

## Industry alignment

This design follows the same broad shape as mature HITL systems:

- OpenAI Agents SDK tools can compute approval dynamically, interrupt a Run, serialize
  its state, and resume exact tool calls after decisions.
- Microsoft Agent Framework persists typed human requests in workflow checkpoints and
  re-emits pending requests after restore.
- Authorization remains enforced at the execution boundary rather than being delegated
  to model instructions.

References:

- https://openai.github.io/openai-agents-js/guides/human-in-the-loop/
- https://openai.github.io/openai-agents-js/guides/tools/
- https://learn.microsoft.com/en-us/agent-framework/workflows/human-in-the-loop

## Verification

Targeted tests cover:

- low, medium, and high side-effect classification;
- Capability and Run policy floors;
- all three policy decisions;
- model-visible Toolset enforcement;
- controller-generated policy snapshots;
- denial before Capability exposure or dispatch;
- IPC rejection of malformed approval policy evidence;
- compatibility with approval continuation, recovery, retry, and audit projections.

## Next stage

A7.7 should prove the complete architecture with the first real write Capability. A
small metadata edit is the best vertical slice: preview the intended title change,
require approval, enforce the document version, execute through the host command
boundary, verify the new state, and expose an undo path.
