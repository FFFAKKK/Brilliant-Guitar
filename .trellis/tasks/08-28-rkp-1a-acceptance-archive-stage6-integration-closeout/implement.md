# Implementation Plan — RKP-1A Acceptance Archive and Stage6 Integration Closeout

## C0 — planning candidate only

1. Confirm exact base `08374273b05bc992e749a17a959b64af0f293f0b`, clean source and clean new worktree.
2. Create this planning task and parent-child link exactly once; do not run `task.py start`.
3. Record B independent implementation PASS P0/P1/P2=`0/0/0` as audit evidence, not as owner acceptance or archive/integration authorization.
4. Record RKP-1A closeout planning review as next gate. RKP-2 remains the sole active implementation child; Stage6 E2/E3 remain false and TypeScript remains default.
5. Run planning validation. The focused law is expected to return 10/6/4 because C0 is a B descendant; capture the fourth bounded closeout-planning RED without changing the test.

Commit: `docs(rkp-1a): plan acceptance archive and stage6 integration closeout`.

## C1 — accepted-B authority transition (future)

Preconditions: C0 independent planning PASS, separate user authorization, clean head.

1. Pin B `08374273...` and A3 `3063e097...`; record owner acceptance.
2. Mechanically migrate workspace-law from `HEAD`-as-B to immutable base→accepted-B checks, A3→B direct-parent/non-merge checks and historical-active/archive-root separation.
3. Re-run focused law: exact 10/7/3 only. Archive and integration remain false.

Commit: `docs(rkp-1a): transition accepted B closeout authority`.

## C2 — native archive (future)

Preconditions: C1 green, no unstaged files. Run only the frozen native command:

```powershell
python ./.trellis/scripts/task.py archive 08-26-rkp-1a-public-json-property-cap-scale-compatibility-repair
```

Validate the 13 source/13 archive inventory and capture the named C3 self-projection transition state; do not call it final green evidence.

Commit: native Trellis archive commit only.

## C3 — archive-authority repair (future)

Preconditions: C2 inventory exact. Update only archived `task.json`, `implement.jsonl` and `check.jsonl` if active self references fail. Verify active absence, archive presence, archive JSONL and final 10/7/3 law. Sync only the permitted parent task projections.

Commit: `docs(rkp-1a): repair archived closeout authority`.

## C4 — Stage6 fast-forward integration (future)

Preconditions: C0-C3 retain `branch`, `worktree_path`, `meta.current_authority_owner_branch`, and `meta.current_authority_owner_worktree` as `codex/rkp-1a-acceptance-archive-stage6-integration-closeout` / `.worktrees/rkp-1a-acceptance-archive-stage6-integration-closeout`; the frozen source fields have those same values, `meta.frozen_closeout_c3_head` is the pending sentinel, and `meta.branch_owner_handoff = not_started_C0_C3_closeout_owner`. Accepted C3 freezes the closeout source branch at exact C3. Only the clean Stage6 worktree may prove `639e935...` is its ancestor, run `git merge --ff-only <accepted-C3>`, and, before any projection edit, prove both Stage6 `HEAD == accepted C3` and closeout-source `HEAD == accepted C3`.

The first and only C4 projection commit is C3's direct child. It must set top-level `branch` and `meta.current_authority_owner_branch` to `codex/rkp-2-stage-6-private-scale-evidence-seam-repair`, top-level `worktree_path` and `meta.current_authority_owner_worktree` to `.worktrees/rkp-2-stage-6-private-scale-evidence-seam-repair`, `meta.frozen_closeout_c3_head` to exact accepted C3, and `meta.branch_owner_handoff` to `completed_by_clean_ff_only_stage6_is_sole_C4_C5_owner`; `meta.frozen_closeout_source_branch` and `meta.frozen_closeout_source_worktree` stay byte-equal. The predeclared `meta.c4_target_*` keys and `meta.c4_frozen_c3_relation` are the exact target comparison values, not prose-only hints.

Mechanically reject missing/pending/stale fields, unequal top-level/current owner, C4 whose parent is not frozen C3, a Stage6 branch not containing C4, a closeout source branch containing C4, or a double owner. Assert `C4 HEAD^ == frozen_closeout_c3_head`, closeout source `HEAD == frozen_closeout_c3_head`, and top-level/current values each equal the Stage6 target. C4/C5 commits occur only in Stage6 and C4 uses its existing literal allowlist without expansion; E2 remains false.

Commit: `docs(rkp-2): record RKP-1A closeout integration`.

## C5 — independent closeout audit and archive (future)

Audit B→C4 first. On PASS, native archive this closeout task; its JSONL must continue to reference only stable external authorities. Any terminal parent projection is docs/task-state only. The next possible task is a separate Stage6 semantic/canonical authority-amendment plan, never E2 implementation.

## Validation discipline

Every phase runs exact ancestry/path-set checks, Trellis, JSON/JSONL/path/parent checks, fences and `git diff --check`. Production/src, Cargo/package/tsconfig/spec and all tests except the C1/C3 workspace-law path remain zero delta. Rust/native/full evidence may be reused only where technical bytes have not changed; final C4 rechecks focused law on Node current and Node 20 with a newly printed manifest/hash. All temporary/build output stays on E:.

Planning-PASS authority files are never stage evidence sinks: only closeout `task.json`, `operator-handoff.md`, and `review-candidate.md` may carry C1/C3/C4 evidence. C2's focused transitional law remains exactly `RKP-1A P4 candidate freeze is exact on accepted A3` plus the three existing failures (10/6/4), never final green.
