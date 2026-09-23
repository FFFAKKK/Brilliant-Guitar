# Stage 5 Agent Completion Identity Evidence

Date: 2026-09-23. Production baseline:
`eae40757681a3aa6810ee63ac70ea8f880687994`.

This is a characterization test. It records the current boundary behavior; a
passing run confirms the missing identity check, not a repair. It does not call
the Agent provider, native IPC, a real document, a GUI, or a network service.

## Run

From the audit worktree:

```powershell
node docs/audit/evidence/stage5-20260923/completion-identity.test.mjs
```

Expected result: **2 passed**.

## Coverage

The test calls the production `verifyScoreSummaryCompletion` verifier twice
with the same valid transport identity and a valid `ScoreSummaryV1` payload.
The control payload identifies the run's document as `score-1@7`. The mismatch
payload identifies `other-score@99`. Both are currently accepted.

The production completion input contains the goal, context items and
invocation records, but no run workspace/document precondition. The invocation
record also does not retain the request's document identity. Therefore the
generic read verifier can validate the shape of a result without proving that
the result belongs to the document requested by the run.

## Limits

This is a front-end verification boundary finding. It does not prove that the
current native score reader returns another document. It proves that a
cross-host, stale, or misrouted result that passes the existing typed data
contract can be promoted to authoritative completion. Repair should carry the
existing workspace/precondition identity into one shared read-result verifier,
then invert this characterization into a regression test.
