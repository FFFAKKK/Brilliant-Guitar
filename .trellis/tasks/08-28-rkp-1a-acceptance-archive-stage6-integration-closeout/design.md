# Design — RKP-1A Acceptance Archive and Stage6 Integration Closeout

## Authority and invariants

The accepted implementation input is immutable B `08374273b05bc992e749a17a959b64af0f293f0b`, whose only parent is accepted A3 `3063e0972072e246d43add8640ba1fe1ad02d787`. No closeout descendant may make mutable `HEAD` a proxy for B's implementation range.

Define the following names for later workspace-law work:

- `RKP1A_IMPLEMENTATION_BASE`: the pre-RKP-1A implementation base already frozen by the existing law.
- `RKP1A_ACCEPTED_B`: `08374273b05bc992e749a17a959b64af0f293f0b`.
- `RKP1A_HISTORICAL_ACTIVE_ROOT`: `.trellis/tasks/08-26-rkp-1a-public-json-property-cap-scale-compatibility-repair/` only for historical source paths in the immutable base→B range.
- `RKP1A_ARCHIVE_ROOT`: `.trellis/tasks/archive/2026-08/08-26-rkp-1a-public-json-property-cap-scale-compatibility-repair/` only after native archive.

The old active and archive roots are mutually exclusive current authorities. Active source is required before C2; archive source is required after C2; both present or both absent is fail-closed.

## Frozen 13-file RKP-1A inventory

The C2 move set is exactly these source paths and their path-for-path archive successors:

1. `task.json`
2. `prd.md`
3. `design.md`
4. `implement.md`
5. `implement.jsonl`
6. `check.jsonl`
7. `operator-handoff.md`
8. `review-candidate.md`
9. `research/root-cause-and-exact-node-count.md`
10. `research/authority-and-consumer-impact-map.md`
11. `research/file-test-ownership-matrix.md`
12. `research/planning-self-audit.md`
13. `research/implementation-evidence.md`

No directory glob, recursive archive allowlist, or unrelated archive authority is permitted.

## Phase model and literal future allowlists

### C0 — this planning candidate

Allowed paths are this task's complete planning artifact set; existing RKP-1A `task.json`, `operator-handoff.md`, `review-candidate.md`, `research/implementation-evidence.md`; and the Rust parent, RKP-2 parent and Stage6 child `task.json` files. C0 does not use `task.py start`.

### C1 — accepted-B authority transition

Only these literal paths may change: the four closeout lifecycle files `task.json`, `operator-handoff.md`, `review-candidate.md`, `research/commit-phase-and-rollback-matrix.md`; the four active RKP-1A lifecycle/evidence files; the three coordination `task.json` files; and `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`.

C1 records owner acceptance only after this planning task passes review and a separate user authorization. It pins accepted B and A3, changes workspace-law to compare immutable ranges, proves A3→B is exact eight paths and direct/non-merge, and does not archive or integrate.

### C2 — native old-RKP-1A archive

The exact 26-path move set is the thirteen active source paths above plus the thirteen corresponding archive paths under `RKP1A_ARCHIVE_ROOT`. The archive commit contains only the native archive status/completedAt update in moved `task.json` and the exact moves. It must run `python ./.trellis/scripts/task.py archive 08-26-rkp-1a-public-json-property-cap-scale-compatibility-repair` from a clean C1 head.

### C3 — archive-authority repair

Only these literal paths may change: archived `task.json`, archived `implement.jsonl`, archived `check.jsonl`; closeout `task.json`, `operator-handoff.md`, `review-candidate.md`, `research/commit-phase-and-rollback-matrix.md`; the Rust/RKP-2/Stage6 parent `task.json` files; and `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`.

C3 rewrites only actual active self-references to the archive root. It verifies B's immutable history, archive 13/13 inventory, active absence, archive presence, JSONL parsing/path uniqueness and parent-child exact-once. If another archived file needs mutation, stop for a new planning review.

### C4 — Stage6 explicit integration

The Stage6 worktree must be clean at `639e93555c15b46c54c8e9bb7ec610d4a77c7478`, and that commit must be an ancestor of C3 closeout head. `git merge --ff-only` is the sole integration command. The following docs-only integration projection may change only archived RKP-1A `task.json`, closeout `task.json`/`operator-handoff.md`/`review-candidate.md`/`research/commit-phase-and-rollback-matrix.md`, and the Rust/RKP-2/Stage6 parent `task.json` files. It records source, archive, accepted-B and integration facts; E2 remains false.

### C5 — independent closeout audit and archive

The independent audit reviews B→C4, archive authority, integration ancestry and the final workspace-law. Only after PASS may native archive move this closeout task's twelve planning artifacts to `.trellis/tasks/archive/2026-08/08-28-rkp-1a-acceptance-archive-stage6-integration-closeout/`. If a final parent projection is needed, it is a separate docs-only commit limited to the archived closeout `task.json` and the three parent `task.json` files; it must not rewrite acceptance/archive commits.

## Workspace-law transition contract

- C0: 10 tests / 6 pass / 4 expected failures. The fourth is `RKP-1A P4 candidate freeze is exact on accepted A3`, caused solely by C0 being a docs descendant of B. The other three existing unaccepted-child failures and their attribution remain unchanged.
- C1: 10 / 7 / 3 after replacing mutable-HEAD candidate logic with immutable B/history logic.
- C2: transitional output is not final evidence. The historical accepted-B checks must pass, and the one named C3 archive-successor self-projection readiness failure is expected until C3. Any additional failure blocks C3.
- C3 and C4: final focused result is 10 / 7 / 3; the three failures remain only the existing unaccepted children.

The law must compare B's historical active-root blobs/range separately from archive-root current paths. It must never widen a path set with wildcard, directory exemption or unbounded descendant range.

## Rollback and recovery

- C0 may be reverted alone; B remains the accepted candidate.
- C1 failure reverts only C1; B is untouched.
- C2 is never reset/amended. If C3 fails, preserve archived-but-not-integrated state and make a new bounded repair after planning review.
- Before C4, retain Stage6 pre-integration `639e935...`. After fast-forward, recovery uses a controlled new branch or governance commit, never a rewrite of accepted/archive commits.
- No rollback authorizes E2.
