# Commit Phase and Rollback Matrix

| Phase | Preconditions | Exact change ownership | Stop/rollback rule |
| --- | --- | --- | --- |
| C0 | B `08374273` clean | New closeout planning artifacts plus seven named existing lifecycle/task projections | This commit alone may be reverted; B remains independently passed and unaccepted. |
| C1 | C0 planning PASS + separate user authorization | Literal C1 list in `task.json`, including the single workspace-law projection | If any C1 gate fails, revert only C1; B is immutable. |
| C2 | C1 10/7/3, clean | Literal 13 active source paths and literal 13 archive destinations | Use native archive only. Do not reset or amend after move. |
| C3 | C2 13/13 inventory | Literal C3 list; only three archived self-reference files may change | On failure, remain archived-but-not-integrated and return for a bounded authority repair. |
| C4 | accepted C3 source frozen; Stage6 `639e935...` ancestor/clean | Stage6-only ff-only then the one direct-C3-child projection using the existing C4 literal allowlist | Missing/pending/stale/unequal/double owner blocks; recovery never rewrites C3/archive history. |
| C5 | Independent audit of B→C4 PASS | Literal C5 archive inventory and terminal projection list | Archive this closeout task only after PASS. Its JSONL remains archive-safe because it names stable external authorities. |

No stop/rollback rule authorizes Stage6 E2. Acceptance, native archive, integration, closeout-task archive, qualification, default cutover, RKP-3 and push each require their separately frozen future gates.

Archive month is a fail-closed preflight: C2/C5 stop unless exact `2026-08`. C4 recovery never writes closeout history after accepted C3; Stage6 becomes sole C4/C5 owner.

## C4 mechanical owner transition

Before C4, top-level `branch` / `worktree_path` and `meta.current_authority_owner_branch` / `meta.current_authority_owner_worktree` are the closeout values `codex/rkp-1a-acceptance-archive-stage6-integration-closeout` and `.worktrees/rkp-1a-acceptance-archive-stage6-integration-closeout`. `meta.frozen_closeout_source_branch` and `meta.frozen_closeout_source_worktree` retain those exact values; `meta.frozen_closeout_c3_head = pending_exact_C3_independent_PASS_head`; and `meta.branch_owner_handoff = not_started_C0_C3_closeout_owner`.

Only Stage6 may merge cleanly with `git merge --ff-only <accepted-C3>`. Before C4 projection it proves both Stage6 `HEAD == accepted C3` and closeout-source `HEAD == accepted C3`. The C4 commit is the sole direct child of C3 and sets top-level `branch`, `meta.current_authority_owner_branch` to `codex/rkp-2-stage-6-private-scale-evidence-seam-repair`; top-level `worktree_path`, `meta.current_authority_owner_worktree` to `.worktrees/rkp-2-stage-6-private-scale-evidence-seam-repair`; `meta.frozen_closeout_c3_head` to accepted C3; and `meta.branch_owner_handoff = completed_by_clean_ff_only_stage6_is_sole_C4_C5_owner`. It preserves both frozen source fields byte-equal. The predeclared exact target keys are `meta.c4_target_branch`, `meta.c4_target_worktree_path`, `meta.c4_target_current_authority_owner_branch`, `meta.c4_target_current_authority_owner_worktree`, `meta.c4_target_branch_owner_handoff`, and `meta.c4_frozen_c3_relation`.

The gate asserts top-level owner equals current owner equals the Stage6 target; `C4 HEAD^ == frozen_closeout_c3_head`; closeout-source `HEAD == frozen_closeout_c3_head`; Stage6 contains C4; and closeout source does not contain C4. Missing keys, a pending C3 value after C4, stale/unequal owners, a non-direct parent, or double ownership fail closed. C4/C5 only run in Stage6 and C4's literal allowlist remains unchanged.
