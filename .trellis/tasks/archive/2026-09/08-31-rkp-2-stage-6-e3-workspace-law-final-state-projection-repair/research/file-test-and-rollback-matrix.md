# File, Test and Rollback Matrix

## Planning candidate changes

| Path | Purpose |
| --- | --- |
| this task root (12 files) | self-contained planning authority, research and handoff |
| parent 08-26 `task.json` | unique child link and current planning gate only |

No technical file changes during planning.

## Future implementation changes

| Path | Owner | Change | Rollback |
| --- | --- | --- | --- |
| `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` | E3 law repair | freeze historical E2; add E3 final projection and negatives | revert one technical commit |
| original E3 eight paths | original 08-26 E3 owner | reconstruct already-measured evidence/lifecycle terminal state | restore `4ad23773...` projection |
| this task `task.json` / handoff / review | repair lifecycle | activation and candidate evidence | restore accepted planning state |

## Protected paths

The following are zero-delta technical boundaries for this repair:

```text
src/**
crates/**
test/core-kernel/fixtures/**
test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts
test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts
test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1
package.json
package-lock.json
tsconfig.json
Cargo.toml
Cargo.lock
.trellis/spec/**
```

## Test matrix

| Test | Expected |
| --- | --- |
| historical E1R2+E2 exact 11 paths | pass |
| historical E2 exact 10 paths | pass |
| original E3 exact eight paths | pass |
| full 21-path E3 repair union | pass |
| three owner sets disjoint | pass |
| evidence protocol/source/count/process fields | pass |
| original nine planning hashes | pass |
| 08-30 remains historical | pass |
| S6.2/S6.3 false, TS default | pass |
| missing evidence path | fail closed |
| ninth E3 lifecycle path | fail closed |
| protocol hash mismatch | fail closed |
| premature implementation PASS | fail closed |
| S6.2/S6.3/runtime drift | fail closed |

Focused suite terminal classification:

```text
11 total
8 pass
3 exact historical fail-closed
0 new failure
```

## Rollback points

1. **After planning commit:** revert docs-only planning commit; E3 source worktree remains untouched.
2. **After activation:** revert lifecycle-only activation commit; no technical delta exists.
3. **After reconstruction:** restore original branch state; no workload is rerun.
4. **After technical commit:** revert the one Workspace Law commit; classification returns to 7/4.

Rollback never changes the original E3 temp cleanup result or performance evidence.
