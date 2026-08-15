# Implementation Plan — RKP-0 Authority Contract and Oracle Freeze

## Step 0 — Preflight and branch boundary

1. Verify planning commit is an ancestor and the operator worktree is clean.
2. Verify task status is still `planning` before the operator runs `task.py start`.
3. Verify RKP-1 through RKP-9 task directories are absent.
4. Record the baseline production/test/build-config manifests.

## Step 1 — Failure ledger and durable authority

1. Create only `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/research/official-run-failure-ledger.jsonl` and add the exact `Cvn7OfficialRunFailureV1` row from design section 2; unique key is `failureId` and the file stays outside `evidence/`.
2. Update CVN-7 task metadata, handoff and review status to `measurement incomplete / evidence invalid / performance remediation required`.
3. Update Core parent task/roadmap/performance baseline to route the next gate through RKP-0.
4. Add `.trellis/spec/core-kernel/backend/rust-runtime-transition.md` and link it from exactly `.trellis/spec/core-kernel/index.md` and `.trellis/spec/core-kernel/backend/index.md`, explicitly preserving Pure TypeScript as the current implementation authority until RKP-8.
5. Confirm post-Core roadmap files have zero delta.

**Rollback point:** commit or stash only Step 1 paths; revert them together if authority wording conflicts.

## Step 2 — Oracle schema and deterministic fixtures

1. Implement the exact manifest/scenario/operation/observation TypeScript types and strict data-only decoders from design sections 4-5.
2. Implement only the literal fixture and assembly recipes in `research/oracle-scenario-matrix.md`; do not choose or substitute a fixture.
3. Generate the exact rows 1-64 from that matrix in fixed order, including `A8` inverse proofs, `R4` missing-target zero delta and all cross-cutting operation programs.
4. Canonicalize, hash and compare with committed JSON/JSONL artifacts.
5. Assert two independent in-process generations return byte-identical output.
6. Assert every command ID appears once in each command scenario partition, every operation has one same-index observation, all source path/title literals still exist, and the exact SDK 8/34/ABI name lists equal `research/sdk-surface-migration-matrix.md`.

**Rollback point:** oracle code and fixtures form one isolated group; authority files remain valid if this group is reverted for repair.

## Step 3 — Qualification V2 contract freeze

1. Write the exact data-only contract from design section 8.
2. Validate its public-call timed region, fresh-process isolation, nearest-rank P95/P99 indices, non-finite rule, RSS checkpoints and liveness precedence against parent PRD and CVN-7 authority.
3. Verify fixture source path, generator export, generator version, seed, all counts, workload sizes and RSS ceilings have zero drift; verify the manifest's contract/specification hashes.
4. Keep official-run authorization false and omit a replacement liveness constant.

## Step 4 — Validation

Run in this order:

```powershell
python .\.trellis\scripts\task.py validate 08-15-rkp-0-authority-contract-oracle-freeze
python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation
python .\.trellis\scripts\task.py validate 07-29-core-vnext-product-ready-extensible-kernel-completion
python .\.trellis\scripts\task.py validate 06-29-commercial-guitar-tablature-product
python .\.trellis\scripts\task.py validate 08-11-post-core-official-plugin-product-roadmap
npm.cmd run typecheck
npm.cmd run build
node --test "dist/test/core-kernel/rust-migration/*.test.js"
npm.cmd run test:cvn7
npm.cmd test
git diff --check
```

Then verify:

- JSON and every JSONL line parse;
- all referenced context paths exist and are unique per manifest;
- exactly 64 scenario rows and 64 unique IDs;
- exact ordered row equality with `research/oracle-scenario-matrix.md`, dense operation/observation indices, 28 inverse proofs and all declared rejection zero-delta proofs;
- generation is byte-identical and all hashes verify;
- exact SDK/runtime/ABI names and all fixture provenance/count fields verify;
- the strict Qualification V2 contract rejects changed percentile indices, timed region, fixture facts, RSS method, liveness precedence or extra fields;
- changed paths are a subset of the explicit repository-relative allowlist in `prd.md`; directory wildcard matching is not used;
- `src/**`, package/lock/tsconfig/Cargo/post-Core/archive deltas are empty;
- RKP-1 through RKP-9 task directories remain absent.

## Step 5 — Commit and stop

Create one RKP-0 implementation commit. Report the exact hash, changed files, test counts, fixture hashes and clean status. Stop before task acceptance, archive, RKP-1 creation, official measurement or push. A separate auditor owns the next verdict.
