# Operator Handoff — RKP-0

## Assignment

Implement only `.trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze` after its independent planning review passes.

- Planned operator branch: `codex/rkp-0-authority-contract-oracle-freeze`
- Planned operator worktree: `.worktrees/rkp-0-authority-contract-oracle-freeze`
- Base: the reviewed docs-only planning commit on `codex/core-rust-runtime-performance-remediation`
- Task state before operator activation: `planning`
- Production implementation authorization: false until the reviewed handoff explicitly activates RKP-0

Read `prd.md`, `design.md`, `implement.md` and both JSONL manifests. Respect the exact allowlist. This task owns authority/test-only oracle work and zero production runtime work.

Stop after one verified implementation commit and clean status. Acceptance, archive, push, RKP-1 creation and any official qualification run remain outside the assignment.
