# Planning Candidate Self-Audit

## V2 authority-sync projection

- Current architecture authority: `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/design.md` at `e81c739b...`; user accepted, independent audit `PASS`, 34/34.
- Authority-sync candidate: `.trellis/tasks/08-20-brilliant-guitar-architecture-reset-v2-authority-sync`; RKP-1 remains absent until independent sync audit/acceptance.
- Exact target crates: `brilliant-core-types`, `brilliant-score-foundation`, `brilliant-extension-protocol`, `brilliant-kernel-contracts`, `brilliant-kernel-runtime`, `brilliant-kernel-session`, `brilliant-kernel-node`.
- Unique owners: Runtime mechanisms=`brilliant-kernel-runtime`; Session/use cases/composition=`brilliant-kernel-session`; Product ApplicationAssembly and Product Extension Host=`Product Host`; Instrument Plugin protocol is equal/no privileged Guitar provider.

## Verdict

Independent review history is `0/5/0` at `561a2ec`, `0/1/0` at `05df623`, then `0/0/0 PASS` at `9a9f957ce4fcaded8ec87365f0f59f3f621b73da`. The final authority projection changes review metadata only and awaits a last read-only projection check before operator activation.

## Evidence

- planning base ancestor: `b21540fa3636e6c8e827ff24c2099f4ff331285d`;
- parent context validation: implement 18 / check 19;
- RKP-0 context validation: implement 17 / check 18;
- Core parent validation: 3 / 3;
- product parent validation: 0 / 0;
- post-Core validation: implement 15 / check 16;
- JSON/JSONL parse, path existence and per-manifest uniqueness: pass;
- Core parent -> Rust parent reference count: 1;
- Rust parent -> RKP-0 reference count: 1;
- RKP-1 through RKP-9 task-directory count: 0;
- typecheck: pass;
- build: pass;
- full tests: 531 / 531;
- `git diff --check`: pass;
- protected production/test/build-config/post-Core/archive delta: empty;
- task states: parent and child `planning`;
- task start and production authorization: false;
- worktree changes: selected Core parent metadata plus the two new planning task directories only.

## Bounded repair closure

1. `oracle-scenario-matrix.md` fixes all 64 rows, exact fixtures, operations, outcomes, inverse proofs and zero-delta cases.
2. Manifest schema now contains exact export/ABI names, fixture provenance/counts and contract/specification hashes.
3. `sdk-surface-migration-matrix.md` protects the CVN-2 8/34 entry and separates Rust official extensions from the future public TypeScript/React SDK.
4. Qualification V2 now fixes fresh-process isolation, timed region, nearest-rank P95/P99, RSS sampling and liveness precedence.
5. RKP-0 implementation paths are a closed repository-relative list and the failure ledger has an exact schema and unique key outside `evidence/`.

## Final projection check

The final reviewer verifies only that this metadata projection accurately records the `9a9f957` PASS, keeps both tasks in `planning`, leaves task start and production authorization false, and introduces no contract or protected-path delta.
