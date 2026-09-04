# Review Candidate — RKP-4 Planning

## Candidate status

`DRAFT_PENDING_VALIDATION`

This review covers planning artifacts only. Production implementation,
acceptance, archive, RKP-5, qualification, cutover and push are all false.

## Review scope

Review the planning base against this task and the parent projection. Check:

1. RKP-3 facts are consumed without reopening accepted transaction semantics;
2. vector/cursor history and non-reused identity rules cover branch and delayed
   save behavior;
3. all expected submit/undo/redo failures occur before live mutation;
4. RKP-5 validation remains an explicit later seam rather than a false parity
   claim;
5. snapshot handshake, cache invalidation and old-snapshot ownership are sound;
6. non-document selectors cannot hide a full export/global scan;
7. `markPersisted` and operational checkpoint semantics are separated;
8. checkpoint failure after commit cannot retroactively reject the edit;
9. event sequence is atomic and JS callback failure is post-commit/isolated;
10. replay routes semantic envelopes through a fresh session and stops first;
11. predecessor private exports cannot bypass history and exact five-export
    boundary is defensible;
12. allowlist, RED tests, gates, rollback and lifecycle authority are complete.

## Expected review verdict format

```text
P0: <count>
P1: <count>
P2: <count>
verdict: pass | return_for_bounded_planning_repair
```

No independent-review claim is made by the current inline self-audit.

## Next gate on PASS

Ask the owner explicitly whether to run `task.py start` and execute C0-C8 of
the private RKP-4 implementation plan. Do not infer approval from planning PASS.
