# Design: archive-aware final candidate freeze

## 1. Authority model

S6.2 is immutable historical evidence after native archive. S6.3 reads the archived task and evidence as authority, while the active S6.3 task owns only final-state projection. The accepted chain is fixed:

```text
c920f057 reviewed implementation candidate
  -> e3518896 owner-acceptance synchronization
  -> 51dbabd1 native archive and integration HEAD
  -> S6.3 bounded repair and final candidate
```

The old active S6.2 root must be absent. The archive must contain exactly its twelve expected artifacts, and the evidence payload must continue to decode to the frozen sentinel hash and successful process/resource/parity invariants.

## 2. Technical change

Only `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` changes:

- add archive/acceptance constants and an exact archived S6.2 manifest;
- read the archived S6.2 task/evidence and assert completed/accepted/archived state;
- keep hostile fixtures for extra paths, wrong status, sentinel reuse, malformed records, partial evidence, and later-gate drift;
- distinguish historical ownership from current bytes: an accepted later owner may supersede an earlier candidate blob, but every such path must be named by that later owner;
- expand the Stage 6 path set only with already accepted descendant/archive paths and the literal S6.3 paths;
- remove clean-worktree coupling from historical S6.2 validation; final candidate cleanliness is checked by the execution gate instead.

No assertion about score semantics, wire behavior, capacity ordering, index metrics, runtime lifetime, or the scale result is deleted.

## 3. Allowlist synchronization

The parent design's implementation list gains `.gitattributes`, the accepted EOL authority introduced by the archived prerequisite. Its executable mirror changes from 21 to 22 exact unique paths. This is a governance correction, not new runtime scope.

S6.3 itself may change exactly one technical path and the lifecycle/authority paths enumerated in `task.json`. Production crates, worker, fixture, process script, package manifests, tsconfig, active specs, and runtime selection remain frozen.

## 4. Lifecycle projection

During implementation the active child is S6.3. At the frozen candidate:

- S6.2: completed, accepted, archived, integrated;
- S6.3 and Stage 6: completed;
- RKP-2: `implementation_candidate_ready=true`, final direct check pending;
- Rust parent: mirrors the same current child and readiness;
- TypeScript remains default;
- acceptance/archive of RKP-2, qualification, runtime cutover, RKP-3, and push remain false.

## 5. Verification

The implementation uses a short focused loop, then exactly one final complete lane:

1. JSON/JSONL and Trellis context validation.
2. Focused compiled Workspace Law test.
3. `npm.cmd run typecheck` and `npm.cmd run build`.
4. Rust `fmt --check`, `check`, `test`, `clippy`, plus MSRV `check` with the repository-pinned absolute Cargo executable required on this host.
5. Full Node Core suite once, using the already built native addon and without the opt-in E3 environment variable.
6. Exact diff, protected-path, status, result-count, and evidence-record checks.

## 6. Rollback

Revert S6.3 commits in reverse order. This restores the previous three known governance failures but leaves the accepted S6.2 archive and all kernel behavior untouched. Never delete or regenerate the archived evidence as rollback.
