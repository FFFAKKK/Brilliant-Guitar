# CVN-7 Planning Operator Handoff

## Current state

- Worktree: `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\cvn-7-core-vnext-final-qualification`.
- Branch: `codex/cvn-7-core-vnext-final-qualification`.
- Qualification base: `38afdc3fd508dc67f7aa446fd323837a5d550b70`.
- Task: `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/`.
- Status: `planning`.
- Task start: `false`.
- Production implementation authorization: `false`.
- Initial independent planning review: `RETURN FOR BOUNDED PLANNING REPAIR`, P0/P1/P2=`0/6/2`.
- Targeted rereview round 1: `RETURN FOR BOUNDED PLANNING REPAIR`, P0/P1/P2=`0/1/1`.
- Final targeted planning rereview: `PASS`, P0/P1/P2=`0/0/0`; all initial findings are closed.
- Qualification implementation authorization: pending; task start and measurements remain false.
- Push: not requested.

## What this task adds

CVN-7 adds a deterministic qualification harness, cross-stage tests, reproducible-build evidence, representative/portable/reference/stress measurements, product-quality authority synchronization and final Core closure records. Its default production-source delta is zero.

## Immediate operator action

Present the reviewed planning repair candidate and its PASS to the user. Commit the reviewed planning paths only after commit authorization, then keep implementation gated until a separate qualification-execution approval; do not run `task.py start` or qualification workers as part of recording this planning verdict.

## First operator action after targeted planning PASS

1. record the independent planning result;
2. present the reviewed planning commit to the user;
3. wait for separate qualification implementation approval;
4. only after approval run `task.py start`;
5. begin `implement.md` Stage 0 and create the detached `38afdc3` baseline worktree;
6. stop before source changes and route any behavior defect to the named primary owner.

## Fixed stop conditions

Return to planning review when any of these appears:

- a new public command/type/export/failure/capability/effect or persisted field;
- any planned `src/**` edit;
- any edit to an existing accepted test;
- a dependency or package-lock change;
- a fixture count, seed, generator version, operation, sample count, budget or exact environment change;
- a proposal to merge product runtime measurements into Core qualification;
- a second owner for `SPEC-010-product-quality.md`;
- a post-Core child activation before CVN-7 and the parent Core VNext task are accepted and archived.

## Review package

Give the independent planning reviewer:

- `prd.md`, `design.md`, `implement.md`;
- all `research/**` files;
- `review-candidate.md`;
- parent FC matrix/performance baseline/documentation sync/roadmap;
- archived CVN-5 and CVN-6 implementation reviews;
- post-Core PRD/design/handoff;
- planning validation transcript;
- docs-only allowlist and production-zero-diff proof.

## Completion handoff

After final technical PASS and user acceptance, archive CVN-7, close and archive the Core VNext parent, then keep the post-Core parent gated until explicit user approval to create the Official Guitar Domain V1 **planning** child. Implementation remains a later explicit decision.
