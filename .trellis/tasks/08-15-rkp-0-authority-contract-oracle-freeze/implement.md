# Implementation Plan — RKP-0 Authority Contract and Oracle Freeze

## Step 0 — Preflight and branch boundary

1. Verify planning commit is an ancestor and the operator worktree is clean.
2. Verify task status is still `planning` before the operator runs `task.py start`.
3. Verify RKP-1 through RKP-9 task directories are absent.
4. Record the baseline production/test/build-config manifests.

## Step 1 — Failure ledger and durable authority

1. Add the fifth `b21540fa` failure-ledger row with the exact RKP0-R001 fields.
2. Update CVN-7 task metadata, handoff and review status to `measurement incomplete / evidence invalid / performance remediation required`.
3. Update Core parent task/roadmap/performance baseline to route the next gate through RKP-0.
4. Add and link `rust-runtime-transition.md`, explicitly preserving Pure TypeScript as the current implementation authority until RKP-8.
5. Confirm post-Core roadmap files have zero delta.

**Rollback point:** commit or stash only Step 1 paths; revert them together if authority wording conflicts.

## Step 2 — Oracle schema and deterministic fixtures

1. Implement the exact manifest/scenario TypeScript types and strict data-only decoders.
2. Reuse existing accepted fixtures and helpers; copy only test fixture construction needed for isolation.
3. Generate the 28 accepted, 28 rejected and eight cross-cutting scenarios in fixed order.
4. Canonicalize, hash and compare with committed JSON/JSONL artifacts.
5. Assert two independent in-process generations return byte-identical output.
6. Assert every command ID appears once in each command scenario partition.

**Rollback point:** oracle code and fixtures form one isolated group; authority files remain valid if this group is reverted for repair.

## Step 3 — Qualification V2 contract freeze

1. Write the exact data-only contract from design section 7.
2. Validate it against parent PRD targets and current CVN-7 fixture/resource constants.
3. Verify workload size and RSS ceilings have zero drift.
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
- generation is byte-identical and all hashes verify;
- allowed-file diff only;
- `src/**`, package/lock/tsconfig/Cargo/post-Core/archive deltas are empty;
- RKP-1 through RKP-9 task directories remain absent.

## Step 5 — Commit and stop

Create one RKP-0 implementation commit. Report the exact hash, changed files, test counts, fixture hashes and clean status. Stop before task acceptance, archive, RKP-1 creation, official measurement or push. A separate auditor owns the next verdict.
