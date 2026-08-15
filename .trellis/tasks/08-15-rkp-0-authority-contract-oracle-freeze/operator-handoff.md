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

## Implementation candidate — 2026-08-15

- Verified the planning freeze exactly at `06dccbdb927c4e80070b41718123f06b2e3ab1b2` before activating only RKP-0. `task_start_run` is now true; `production_implementation_authorized` remains false.
- The candidate adds the strict manifest/schema, 64-row TypeScript public-API oracle, fixed command/SDK/ABI inventories, and Qualification V2 data contract solely under the RKP-0 allowlist.
- The CVN-7 fifth input is represented only by its invalid-input ledger row. No official measurement, Rust runtime, production source, or partial evidence was produced.
- Next owner: an independent RKP-0 implementation auditor. Do not accept, archive, push, or create another RKP task from this candidate.
