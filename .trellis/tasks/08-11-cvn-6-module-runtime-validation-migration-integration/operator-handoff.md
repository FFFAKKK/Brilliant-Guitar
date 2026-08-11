# CVN-6 Planning Operator Handoff

## Candidate Identity

- Task: `08-11-cvn-6-module-runtime-validation-migration-integration`.
- Worktree: `.worktrees/cvn-6-unified-planning-base`.
- Branch: `codex/cvn-6-unified-planning-base`.
- Unified base: `050af1eed067300f2e2fb0339eff6f2430e43b36`.
- Required ancestors: `302dafe451bd4e10f4978d3076e367473b2fa3ae`, `c68fcc648051b51b73fda3e5bda6eb9e33298f39`.
- Lifecycle: `planning`.
- `task_start_run=false`.
- `production_implementation_authorized=false`.

## What This Child Owns

- `CVN-FC-112`: assembly-bound official runtime on the existing Core owner.
- `CVN-FC-120`: changed-candidate validation/profile/diagnostic pipeline.
- `CVN-FC-121`: write and validation availability with lossless degradation.
- `CVN-FC-122`: detached deterministic official extension migration.

It consumes CVN-2 without changing its ABI. It also closes the integrated Registry constructor, integrated event identity and construction resource result required to implement the accepted GD-0 surface.

## Operator Order After Future Activation

1. verify the accepted planning commit and both ancestors;
2. activate only this child after explicit approval;
3. follow `implement.md` phases 1 through 10 in order;
4. keep source/test edits inside the exact allowlists;
5. obtain independent implementation review before acceptance/archive.

The parent coordination task is not an implementation target. CVN-5 remains gated on accepted CVN-6. CVN-7 remains gated on accepted/archived CVN-0 through CVN-6.

## Boundary Reminders

- CVN-6 kernel assembly identity is distinct from the post-Core Product Host Application Assembly.
- Each synthetic module command is one contribution-owned transaction; cross-module aggregate batch belongs to CVN-5.
- Guitar Domain, product services/host and public plugin platform remain on the post-CVN-7 roadmap.
- Existing persisted schema and physical file behavior remain exact.

## Immediate Handoff Target

An independent planning auditor should review `review-candidate.md`, the four public closures, the ten-stage pipeline, callback counts, migration precedence, resource limits, file allowlists and parent/post-Core synchronization. Implementation activation follows only after a recorded P0/P1/P2=`0/0/0` result and user approval.
