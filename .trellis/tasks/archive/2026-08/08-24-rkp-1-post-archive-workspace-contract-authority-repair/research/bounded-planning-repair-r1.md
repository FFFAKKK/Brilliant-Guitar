# Bounded Planning Repair R1

## Independent return

- candidate: `1e09a2071b9b957e6fdebc64d20ebe4faa0c01a3`
- result: `P0/P1/P2=0/3/0`
- verdict: `RETURN FOR BOUNDED PLANNING REPAIR`

## Exact repairs

1. Removed completion-date coupling from the lifecycle regression.
2. Replaced the open repair-task lifecycle allowance with four literal paths; every other repair planning artifact is implementation-time protected.
3. Replaced the incomplete two-commit description with four stateful commits: activation, test repair, authority sync with readiness false, and full-gate evidence/status with readiness true.

No production, test, archived authority or RKP-2 implementation file changes in this planning repair.

## Targeted rereview R1

- candidate: `47a32d26909bbe3550c5858cd4d4ea793ec68a16`
- result: `P0/P1/P2=0/1/0`
- remaining direct regression: the four future implementation commits were incorrectly described as returning to base `063b332d`.

The rollback contract now distinguishes two operations: reversing implementation Commits 4 through 1 returns to the exact accepted planning HEAD recorded at activation; separately abandoning the entire repair may revert all docs-only planning commits to base. Targeted rereview R2 remains pending.
