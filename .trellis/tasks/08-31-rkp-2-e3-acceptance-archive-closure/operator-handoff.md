# Operator Handoff: RKP-2 E3 Acceptance and Archive Closure

## Current state

`PLANNING CANDIDATE — IMPLEMENTATION UNAUTHORIZED`.

- Base: `f27daf7b514731adaabbe8f7814d2b57e12a7df7`.
- Branch: `codex/rkp-2-e3-acceptance-archive-closure`.
- Worktree: `.worktrees/e3-acceptance-archive-closure`.
- Task: `.trellis/tasks/08-31-rkp-2-e3-acceptance-archive-closure`.
- Parent: `08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair`.
- Target: `08-31-rkp-2-e3-acceptance-state-projection`.
- Source review: PASS P0/P1/P2=`0/0/0`, task/turn `01a01e48...` / `01a0562d...`.
- Source record: 334 bytes, SHA-256 `8559f7aed98ddc45154f90dd459688530ba5e24efedeb573389e06ca7d099436`.

## Purpose

Add one archive-aware Workspace Law transition, natively archive the reviewed target, and make this closure task's own later archive a pre-accepted docs-only state. This prevents a repeat of “review PASS creates a new forbidden lifecycle state.”

## Boundaries

The only future technical file is the Workspace Law test. Product/Rust/source/evidence/config/spec paths remain unchanged. E3 stress is not rerun. S6.2/S6.3, qualification, cutover, push and RKP-3 remain false.

## Next gate

Dedicated independent planning review of the exact docs-only planning commit. Do not run `task.py start`, edit the technical test, accept/archive any task, or advance Stage 6 before planning PASS and separate user implementation authorization.
