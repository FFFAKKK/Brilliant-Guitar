# Commit Phase and Rollback Matrix

| Phase | Preconditions | Exact change ownership | Stop/rollback rule |
| --- | --- | --- | --- |
| C0 | B `08374273` clean | New closeout planning artifacts plus seven named existing lifecycle/task projections | This commit alone may be reverted; B remains independently passed and unaccepted. |
| C1 | C0 planning PASS + separate user authorization | Literal C1 list in `task.json`, including the single workspace-law projection | If any C1 gate fails, revert only C1; B is immutable. |
| C2 | C1 10/7/3, clean | Literal 13 active source paths and literal 13 archive destinations | Use native archive only. Do not reset or amend after move. |
| C3 | C2 13/13 inventory | Literal C3 list; only three archived self-reference files may change | On failure, remain archived-but-not-integrated and return for a bounded authority repair. |
| C4 | accepted C3 source frozen; Stage6 `639e935...` ancestor/clean | Stage6-only ff-only then literal C4 projection; top-level and current owner become Stage6 while source provenance stays immutable | Stale/missing/double owner blocks; recovery never rewrites C3/archive history. |
| C5 | Independent audit of B→C4 PASS | Literal C5 archive inventory and terminal projection list | Archive this closeout task only after PASS. Its JSONL remains archive-safe because it names stable external authorities. |

No stop/rollback rule authorizes Stage6 E2. Acceptance, native archive, integration, closeout-task archive, qualification, default cutover, RKP-3 and push each require their separately frozen future gates.

Archive month is a fail-closed preflight: C2/C5 stop unless exact `2026-08`. C4 recovery never writes closeout history after accepted C3; Stage6 becomes sole C4/C5 owner.
