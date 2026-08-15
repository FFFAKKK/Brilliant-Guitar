# Operator Handoff — RKP-0

## Assignment

Implement only `.trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze`. Independent planning review passed `0/0/0` at `9a9f957ce4fcaded8ec87365f0f59f3f621b73da`; activation follows only after the final metadata-projection check.

- Planned operator branch: `codex/rkp-0-authority-contract-oracle-freeze`
- Planned operator worktree: `.worktrees/rkp-0-authority-contract-oracle-freeze`
- Base: the reviewed docs-only planning commit on `codex/core-rust-runtime-performance-remediation`
- Task state before operator activation: `planning`
- Task start remains false and production implementation authorization remains false; the operator activates only this docs/test-only child after verifying the final reviewed planning HEAD

Read `prd.md`, `design.md`, `implement.md`, both JSONL manifests, `research/oracle-scenario-matrix.md` and `research/sdk-surface-migration-matrix.md`. Respect the exact repository-relative allowlist. Implement rows 1-64 verbatim; use the exact ledger schema and Qualification V2 method. This task owns authority/test-only oracle work and zero production runtime work.

Stop after one verified implementation commit and clean status. Acceptance, archive, push, RKP-1 creation and any official qualification run remain outside the assignment.
