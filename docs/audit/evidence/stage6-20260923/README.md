# Stage 6 Typed Read Identity Evidence

Date: 2026-09-23. Production baseline:
`eae40757681a3aa6810ee63ac70ea8f880687994`.

This is a characterization test. It records the current typed read boundary;
passing confirms the missing identity check, not a repair. It does not call
native IPC, a real document, a GUI, a provider, or a network service.

## Run

```powershell
node docs/audit/evidence/stage6-20260923/typed-read-identity.test.mjs
```

Expected result: **2 passed**.

## Coverage

The first case calls the production `ScoreReadClient.readSummary()` with a
host response for `other-score@99`, while the client is bound to a synthetic
workspace. Summary, metadata and structure reads have no expected document
identity input and currently accept this typed result.

The second case sends the same client through the production
`DirectScoreReadAgentPort` with a request precondition of `score-1@7` and a
matching Agent workspace context. The port ignores that context and returns
the typed `other-score@99` result as completed.

## Limits

This does not prove that the native score reader misroutes documents. It proves
that the typed read adapter and Agent direct port do not enforce the existing
request identity before returning a completed result. The bounded index and
range methods already perform their own input-specific checks; this evidence
is about the shared document identity invariant, not those range constraints.
