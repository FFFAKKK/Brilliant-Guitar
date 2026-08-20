# Implementation Plan — Architecture Reset V2 Authority Sync

## Operating boundary

This is an authorized docs-only execution task. `task_start_run=true` is recorded for this task, but `production_implementation_authorized=false`. The task remains `in_progress` with `review-pending` sync audit after the candidate commit. Do not run `task.py archive`, push, create RKP-1, or create Rust/Cargo files.

## Ordered execution

1. Verify branch `codex/brilliant-guitar-architecture-v2-authority-sync`, HEAD `ea574ec4495ac2c82445d1275ad6648035231fc6`, clean/staged-empty state.
2. Create this task through Trellis and verify the product parent child reference occurs exactly once.
3. Record the accepted V2 source/audit pointers in the V2 task's `task.json`, `operator-handoff.md` and `review-candidate.md` only.
4. Synchronize product parent/PRD and `.trellis/spec/core-kernel/index.md`.
5. Synchronize Rust parent planning artifacts to the exact seven-crate V2 projection and RKP-1 gate.
6. Synchronize post-Core parent planning artifacts to Core Platform, Product Host, Product Extension Host and equal Instrument Plugin boundaries; preserve RKP-9 → Guitar Core Loop order.
7. Add historical/superseded banners and V2 links to the four old technical architecture documents without deleting or rewriting their bodies.
8. Complete `research/authority-sync-matrix.md` with every authority file, disposition, owner, retention and rollback action.
9. Run validation, self-audit and full test/build gates.
10. Stage only the allowlisted docs, make one candidate commit with subject `docs(architecture): synchronize Architecture Reset V2 authority`, then verify clean/staged-empty state.

## Exact allowlist

- New task directory `.trellis/tasks/08-20-brilliant-guitar-architecture-reset-v2-authority-sync/**`.
- V2 task `task.json`, `operator-handoff.md`, `review-candidate.md` only.
- Product parent `task.json`, `prd.md`, and four files under `technical/`.
- `.trellis/spec/core-kernel/index.md`.
- Rust parent `task.json`, `prd.md`, `design.md`, `implement.md`, `operator-handoff.md`, `review-candidate.md`, and research authority/roadmap/self-audit files.
- Post-Core parent `task.json`, `prd.md`, `design.md`, `implement.md`, `operator-handoff.md`, `review-candidate.md`, and roadmap/dependency research.

## Validation and review gate

Run Trellis validation for the new task, product parent, Rust parent and post-Core parent; parse JSON/JSONL; verify path existence and uniqueness; check Markdown/Mermaid fences; run `git diff --check`; compare the diff to the allowlist; assert protected production/archive deltas are zero; run typecheck, build and full `531/531`; then perform a planning/self-sync audit with P0/P1/P2=`0/0/0`. The candidate is not complete from a lifecycle perspective until an independent sync auditor reviews it.
