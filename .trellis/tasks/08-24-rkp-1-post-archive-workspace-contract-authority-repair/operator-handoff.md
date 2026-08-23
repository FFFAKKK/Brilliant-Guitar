# Operator Handoff — RKP-1 Post-Archive Repair

## Status

`TARGETED PLANNING REREVIEW R2 REQUIRED`. Task remains `planning`; `task_start_run=false`; `production_implementation_authorized=false`.

## Object

- branch: `codex/rkp-1-post-archive-contract-repair`
- worktree: `.worktrees/rkp-1-post-archive-contract-repair`
- base: `063b332dd48c05796fb3450a8004f42ff2148b20`
- audited implementation: `94387b339b5e4d9ce6b7f97597a1b56edd051f01`
- task: `.trellis/tasks/08-24-rkp-1-post-archive-workspace-contract-authority-repair`

The first independent review returned `P0/P1/P2=0/3/0`; targeted rereview R1 returned `0/1/0` on the aggregate rollback destination only. The corrected contract returns a four-commit implementation rollback to the accepted planning HEAD recorded at activation, while abandoning the whole repair is a separate owner action. Completion-date coupling, literal lifecycle paths and the Stage 4 readiness gate remain closed. The operator changes only the literal implementation allowlist in `design.md`, follows `implement.md`, and stops for independent implementation review. RKP-2 remains planning-only.
