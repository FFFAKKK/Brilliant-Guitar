# Operator Handoff: RKP-2 E3 Acceptance and Archive Closure

## Current state

`IMPLEMENTATION ACTIVE — ARCHIVE-AWARE WORKSPACE LAW TECHNICAL CHECKPOINT NEXT`.

- Base: `f27daf7b514731adaabbe8f7814d2b57e12a7df7`.
- Branch: `codex/rkp-2-e3-acceptance-archive-closure`.
- Worktree: `.worktrees/e3-acceptance-archive-closure`.
- Task: `.trellis/tasks/08-31-rkp-2-e3-acceptance-archive-closure`.
- Parent: `08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair`.
- Target: `08-31-rkp-2-e3-acceptance-state-projection`.
- Source review: PASS P0/P1/P2=`0/0/0`, task/turn `01a01e48...` / `01a0562d...`.
- Source record: 334 bytes, SHA-256 `8559f7aed98ddc45154f90dd459688530ba5e24efedeb573389e06ca7d099436`.
- User implementation authorization: recorded from `继续吧` on `2026-08-31` after the explicit implementation gate.
- `task.py start`: completed; task status is `in_progress`.
- Production implementation remains unauthorized because this task owns only test/governance state.

## Purpose

Add one archive-aware Workspace Law transition, natively archive the reviewed target, and make this closure task's own later archive a pre-accepted docs-only state. This prevents a repeat of “review PASS creates a new forbidden lifecycle state.”

## Boundaries

The only future technical file is the Workspace Law test. Product/Rust/source/evidence/config/spec paths remain unchanged. E3 stress is not rerun. S6.2/S6.3, qualification, cutover, push and RKP-3 remain false.

## Next gate

The first review of `c35af97da235f075857181c72d64dc2c8506dfed` returned P0/P1/P2=`0/2/0`. The docs-only repair removes every closure self/target-active JSONL reference, freezes the target's exact three-path JSONL successor, and adds a fail-closed local-clock preflight before both native archives. Targeted rereview accepted exact authority `f84c84387fa21d4bdbc05b838397fb091ce664e9` with P0/P1/P2=`0/0/0`.

The separate user implementation authorization has been received and the activation checkpoint is complete. Next, modify only `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` to add the archive-aware P1/P2/P3/P4 law. The target task stays active and unaccepted until that technical checkpoint passes; no archive or later Stage 6 gate is authorized by activation.
