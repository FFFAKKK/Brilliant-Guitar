# Implementation Evidence — 2026-09-04

## Candidate

- Planning head: `3bcba71a2944f66149facf53bdf802cf57bb1cd2`.
- Activation head: `c152143fe88bc872ebbf2f249b9b3dc43a181458`.
- Technical candidate: `39595906d3799ed2b506315377000e5ba1c9100b`.
- Technical paths: `.trellis/scripts/common/task_context.py`, `.trellis/spec/core-kernel/backend/rust-runtime-transition.md`, and `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`.
- Direct implementation check: `P0/P1/P2=0/0/0`.

## RED to GREEN

| Gate | Before | Candidate |
|---|---|---|
| RKP-2 focused workspace contract | 4/11, seven path-only failures | 11/11 |
| Archived RKP-2 context validation | 12 missing former-active references | 25 implement + 20 check entries pass |
| Kernel/runtime assertions inside focused suite | 4/4 | 4/4 |

The accepted archive files were not edited or copied back into an active task root.

## Resolver negative proof

The direct Python helper check proves:

1. a literal existing path is returned unchanged;
2. an archived task's own former-active `design.md` resolves to that exact archive;
3. a former-active reference belonging to another archived task remains unresolved;
4. a nonexistent same-task suffix maps deterministically but remains nonexistent and therefore fails normal type validation.

## Final gates

- `python -m compileall .trellis/scripts/common/task_context.py`: pass.
- current repair `task.py validate`: implement `4/4`, check `4/4`.
- archived RKP-2 `task.py validate`: implement `25/25`, check `20/20`.
- `npm.cmd run typecheck`: pass.
- `npm.cmd run build`: pass.
- focused compiled suite: `11 total / 11 pass / 0 fail`.
- one full `npm.cmd test`: `611 total / 609 pass / 2 expected skip / 0 fail`.
- full discovery manifest: 80 files, SHA-256 `1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1`.
- `git diff --check`: pass.
- production, Cargo, package, tsconfig, native artifact and public API delta: zero.
- RKP-2 E3 execution count for this repair: zero.
- Rust gate, CVN-7 qualification, default-runtime cutover, RKP-3 and push: not run/not authorized.

## Verdict

PASS. The post-archive compatibility defect is repaired without reopening or changing the accepted RKP-2 kernel implementation.
