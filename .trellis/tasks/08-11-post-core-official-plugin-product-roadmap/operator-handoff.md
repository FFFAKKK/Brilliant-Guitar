# Operator Handoff — Post-Core Official Plugin and Product Roadmap

## Planning branch

- Branch: `codex/post-core-official-plugin-product-roadmap`
- Worktree: `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\post-core-official-plugin-product-roadmap`
- Base commit: `faaf424cf370bbf055ad2cf9862e472a50edc22f`
- Base branch: `codex/cvn-2-official-module-sdk-frozen-assembly`
- Task: `.trellis/tasks/08-11-post-core-official-plugin-product-roadmap`
- Task status: `planning`

## Scope already completed by planner

- durable Core-first hierarchy;
- official plugin and product-host responsibility split;
- product-layer gap audit;
- exact child sequence and dependencies;
- CVN-7 activation stop;
- product/CVN route synchronization;
- implement/check context manifests;
- planning verification and review evidence.

## Current execution owner

The active implementation route remains the separate CVN-2 worktree. Continue its final independent implementation review, bounded repair if findings exist, commit, acceptance and archive. This post-Core branch contains no CVN-2 candidate source/test changes.

## Lineage convergence before CVN-6

After CVN-2 is accepted/archived and its worktree is clean, prepare the CVN-6 planning base so it contains both the accepted CVN-2 implementation commit and this planning branch HEAD. Do not merge this branch into the current dirty CVN-2 candidate. Before CVN-6 planning, prove both commits are ancestors of the unified base, the product-parent child reference occurs once, this task remains `planning`, and this documentation merge adds zero `src/**`, `test/**`, `package.json` or `tsconfig.json` delta beyond accepted CVN-2.

## Activation stop

Keep this parent task in `planning`. Do not run `task.py start` on the parent. Do not create post-Core implementation children until CVN-0 through CVN-7 are accepted and archived.

## First future action

After CVN-7 closes and the user approves the next stage:

1. return to this parent task;
2. verify all gates in `implement.md` section 2;
3. create only `official-guitar-domain-v1` as the first child;
4. plan and independently review that child before implementation activation.

## Protected boundaries

- one ScoreDocument truth;
- one CommandBus/transaction/history/replay/dirty/event owner;
- Core remains free of Guitar/UI/render/playback/physical IO dependencies;
- official modules read detached state and write through semantic commands;
- `workbench-editor-session-v1` uniquely owns Application Assembly; assembly failure publishes no session/partial provider catalog and ready sessions keep a fixed contribution set;
- future public plugins enter through an Extension Host/versioned facade and never raw Registry, bare event bus or mutable ScoreDocument access;
- public visual/functional plugin work remains after the official product loop and Product Qualification.

## Repository actions

- Planning commit only.
- No remote push.
- No production/task activation implied by the planning commit.

## Planning verification — 2026-08-11

- child Trellis context validation: implement `15/15`, check `16/16`;
- product-parent Trellis context validation: implement `0/0`, check `0/0`;
- task/parent JSON and both JSONL files parse; parent child reference count is `1` and future implementation child directories are `0`;
- protected `src/**`, `test/**`, `package.json` and `tsconfig.json` status/delta relative to `faaf424cf370bbf055ad2cf9862e472a50edc22f` is zero;
- `git diff --check`, TypeScript typecheck and build pass;
- full baseline test: `315/315` passed;
- final independent planning review: P0/P1/P2=`0/0/0` after the bounded Application Assembly ownership repair.
