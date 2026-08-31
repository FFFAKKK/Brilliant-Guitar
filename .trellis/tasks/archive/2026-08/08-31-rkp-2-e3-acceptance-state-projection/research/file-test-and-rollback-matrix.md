# File, Test and Rollback Matrix

## File ownership

| Set | Count | Purpose |
|---|---:|---|
| immutable planning | 8 | accepted design and implementation authority |
| technical | 1 | Workspace Law state machine and fixtures |
| lifecycle | 9 | child, law parent and Stage 6 review projections |
| terminal union | 18 | exact `0c561d14..HEAD` path set |

Protected zero-delta paths include `src/**`, `crates/**`, Cargo, package files, tsconfig, fixtures, worker/process files and `.trellis/spec/**`.

## Test matrix

| Test | Planning | Terminal candidate |
|---|---|---|
| historical 21-path candidate | exact | exact |
| transition path set | planned gap | exact 18 |
| audit record | documented | exact 323 bytes / digest |
| missing/mutated record | n/a | fail closed |
| duplicate record owner | n/a | fail closed |
| S6.2/S6.3/runtime/later drift | existing guard | fail closed |
| focused Node 20 | independent planning review must reproduce `11/7/4` | `11/8/3` |
| supported Node | measured `11/7/4` | `11/8/3` |
| full runner | no new classification claim | existing `611/606/3/2` or freshly verified equivalent |

The completed planning candidate measured exact `11 tests / 7 pass / 4 fail`: the three frozen historical names plus only `Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts`. Any other planning failure returns for planning repair.

## Rollback

| Checkpoint | Rollback |
|---|---|
| planning | delete only the new branch/worktree after preserving review evidence |
| activation | revert activation commit |
| technical | revert one-file technical commit |
| lifecycle | revert lifecycle commit, leaving technical transition state |

No rollback command touches the audited `e3-law` or original E3 source worktree.
