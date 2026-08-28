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

Only these literal paths may change: the three closeout lifecycle files `task.json`, `operator-handoff.md`, `review-candidate.md`; the four active RKP-1A lifecycle/evidence files; the three coordination `task.json` files; and `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`. The nine planning-authority files registered in `task.json` are byte-immutable after planning PASS.

C1 records owner acceptance only after this planning task passes review and a separate user authorization. It pins accepted B and A3, changes workspace-law to compare immutable ranges, proves A3→B is exact eight paths and direct/non-merge, and does not archive or integrate.

### C2 — native old-RKP-1A archive

The exact 26-path move set is the thirteen active source paths above plus the thirteen corresponding archive paths under `RKP1A_ARCHIVE_ROOT`. Before any C2/C5 mutation, `Get-Date -Format yyyy-MM` must equal exactly `2026-08`, otherwise stop for planning review. The archive commit contains only the native archive status/completedAt update in moved `task.json` and the exact moves.

### C3 — archive-authority repair

Only these literal paths may change: archived `task.json`, archived `implement.jsonl`, archived `check.jsonl`; closeout `task.json`, `operator-handoff.md`, `review-candidate.md`; the Rust/RKP-2/Stage6 parent `task.json` files; and `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`.

C3 rewrites only current self references: archived task relatedFiles[0..11] and nine immutable-authority keys move to archive; relatedFiles[12..23] remain byte-unchanged. Only implement JSONL rows 6-9 and check JSONL rows 5-10 change `file`; all other fields/reasons and historical active spellings stay byte-semantic unchanged. If another archived file needs mutation, stop for planning review.

### C4 — Stage6 explicit integration

C0-C3 keep the top-level `branch` and `worktree_path`, plus `meta.current_authority_owner_branch` and `meta.current_authority_owner_worktree`, equal to `codex/rkp-1a-acceptance-archive-stage6-integration-closeout` and `.worktrees/rkp-1a-acceptance-archive-stage6-integration-closeout`. Their frozen provenance is exactly `meta.frozen_closeout_source_branch = codex/rkp-1a-acceptance-archive-stage6-integration-closeout`, `meta.frozen_closeout_source_worktree = .worktrees/rkp-1a-acceptance-archive-stage6-integration-closeout`, `meta.frozen_closeout_c3_head = pending_exact_C3_independent_PASS_head`, and `meta.branch_owner_handoff = not_started_C0_C3_closeout_owner`.

After C3 independent PASS, the closeout branch freezes at exact C3. Before any projection edit, the clean Stage6 worktree must prove `HEAD == accepted C3` immediately after it alone runs `git merge --ff-only <accepted-C3>` and the closeout source branch must independently prove `HEAD == accepted C3`; `639e93555c15b46c54c8e9bb7ec610d4a77c7478` must be an accepted-C3 ancestor. The C4 integration projection is C3's single direct child and may run only in the Stage6 worktree. In that one commit it changes top-level `branch` to `codex/rkp-2-stage-6-private-scale-evidence-seam-repair`, top-level `worktree_path` to `.worktrees/rkp-2-stage-6-private-scale-evidence-seam-repair`, `meta.current_authority_owner_branch` to `codex/rkp-2-stage-6-private-scale-evidence-seam-repair`, `meta.current_authority_owner_worktree` to `.worktrees/rkp-2-stage-6-private-scale-evidence-seam-repair`, `meta.frozen_closeout_c3_head` to the exact accepted C3 hash, and `meta.branch_owner_handoff` to `completed_by_clean_ff_only_stage6_is_sole_C4_C5_owner`. It keeps both `meta.frozen_closeout_source_*` fields byte-equal to the closeout values. The target contract is predeclared by `meta.c4_target_branch`, `meta.c4_target_worktree_path`, `meta.c4_target_current_authority_owner_branch`, `meta.c4_target_current_authority_owner_worktree`, `meta.c4_target_branch_owner_handoff`, and `meta.c4_frozen_c3_relation`.

The C4 mechanical gate rejects missing fields, the pending C3 sentinel after C4, stale closeout top-level/current owner values, unequal top-level/current owner values, a non-direct C3 parent, closeout source containing C4, Stage6 not containing C4, or any double owner. It asserts: top-level owner equals current authority owner equals the Stage6 target; `C4 HEAD^ == frozen_closeout_c3_head`; closeout source `HEAD == frozen_closeout_c3_head`; Stage6 contains C4; and closeout source does not contain C4. C4/C5 remain Stage6-worktree-only and C4's literal allowlist does not expand. E2 remains false.

### C5 — independent closeout audit and archive

The independent audit reviews B→C4, archive authority, integration ancestry and final law. Only after PASS may native archive move this task's twelve artifacts. Terminal projection is mandatory: archived closeout `task.json` plus Rust/RKP-2/Stage6 parent task JSON; its eleven active relatedFiles self paths migrate to archive. Both JSONL files and nine immutable blobs remain byte-zero, then a targeted read-only audit precedes any Stage6 amendment planning.

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
