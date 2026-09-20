# Agent Typed-Port Orchestration Boundary V1

Date: 2026-09-20

## Scope

The Agent runtime owns planning, approval, durable run state, invocation recovery,
completion verification, and adapters from model-facing tools to application ports.
It does not own PluginPlatform registration or Score port implementations.

## Execution Paths

Direct read tools consume `ScoreReadPort` through Agent-only adapters. Prepared
mutations consume `ScoreChangeSetPort` through `FirstPartyPreparedMutationCoordinator`.
If that typed preparation port is unavailable, the run fails closed; the Agent
must not reconstruct `score.prepare-*` requests over the generic capability path.

After approval, commit remains on the durable Agent invocation path. The prepared
execution binds the internal `score.commit-*` request to the outer Agent invocation
identity, so invocation receipts, replay checks, and crash recovery continue to use
the same persisted run and invocation records.

## Workflow Boundary

`AgentWorkflowRuntime` receives a read-only `WorkflowDirectory`. It may resolve and
pin workflow identity, version, owner, entry operations, and allowed operation IDs.
It must not register, remove, mutate, or reclassify plugin contributions.

PluginPlatform owns the workflow directory and session freeze. Score application
services own `ScoreReadPort` and `ScoreChangeSetPort`. The Agent depends on those
interfaces and does not duplicate their contracts or implementations.
