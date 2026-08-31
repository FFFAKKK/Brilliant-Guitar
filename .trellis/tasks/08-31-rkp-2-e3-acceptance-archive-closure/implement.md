# Implementation Plan: RKP-2 E3 Acceptance and Archive Closure

## 0. Planning gate

1. Verify exact base `f27daf7b514731adaabbe8f7814d2b57e12a7df7`, clean source worktree, and branch `codex/rkp-2-e3-acceptance-archive-closure`.
2. Validate the 334-byte source review record and digest.
3. Freeze planning artifacts and run a dedicated independent planning audit.
4. Required planning verdict: P0/P1/P2=`0/0/0`.
5. Wait for separate user implementation authorization before `task.py start`.

## 1. Activation checkpoint

Allowed changes: closure `task.json`, `operator-handoff.md`, `review-candidate.md`, plus immediate E3 law parent lifecycle files only.

1. Run `task.py start 08-31-rkp-2-e3-acceptance-archive-closure`.
2. Record accepted planning commit and implementation authorization.
3. Set parent current planning child null and current implementation child to the closure task.
4. Keep target acceptance task active/review-pending; every later gate remains false.
5. Commit docs-only activation.

Rollback: revert activation commit. No technical file has changed.

## 2. Archive-aware Workspace Law

Modify only `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`.

1. Freeze `f27daf7`, the exact 334-byte record and digest.
2. Add literal active/archive roots and exact 11-file manifests for both tasks.
3. Add P1/P2/P3/P4 path and lifecycle validators.
4. Use `--no-renames` A/M/D projections with exact 40-path P3/P4 expectations.
5. Add every negative fixture from `design.md`.
6. Preserve the three historical failure names and all original 323-byte E3 record checks.
7. Commit the one-file technical checkpoint.

Gate before owner acceptance:

- target and closure task remain active;
- focused classification has no new unexpected failure;
- production/protected delta is zero;
- E3 stress has not run.

Rollback: revert the technical checkpoint.

## 3. Target acceptance sync

Modify only the declared target, E3-law-parent, Stage-6-parent, and closure lifecycle files.

1. Record the exact `f27daf7` review result in the closure task only.
2. Target task records implementation review PASS plus explicit owner acceptance/archive authorization.
3. E3 law and Stage 6 parents record only closure-record owner path and digest.
4. Keep target active until the P2 focused law passes.
5. Commit acceptance sync.

Gate: P2 passes; S6.2/S6.3 and all later flags remain false.

Rollback: revert acceptance sync.

## 4. Native target archive and candidate freeze

1. Confirm clean/staged-empty worktree.
2. Run:

   ```powershell
   python .\.trellis\scripts\task.py archive 08-31-rkp-2-e3-acceptance-state-projection
   ```

3. Confirm one active target root is absent and the exact archive root has 11 files.
4. Update the six parent lifecycle documents to P3, keeping the closure task active/review-pending.
5. Confirm exact no-rename 40-path projection from `f27daf7`.
6. Commit the P3 lifecycle projection if parent sync remains after native archive auto-commit.

Rollback: revert parent projection, then native archive commit, then acceptance sync.

## 5. Validation and independent implementation review

Run, without E3 stress:

```powershell
python .\.trellis\scripts\task.py validate 08-31-rkp-2-e3-acceptance-archive-closure
python .\.trellis\scripts\task.py validate 08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair
python .\.trellis\scripts\task.py validate 08-26-rkp-2-stage-6-private-scale-evidence-seam-repair
python .\.trellis\scripts\task.py validate 08-24-rkp-2-indexed-live-score-store-load-encode-parity
python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation
git diff --check
npm run typecheck
npm run build
```

Also run:

- focused Workspace Law on Node 20.20.2 and supported Node;
- dynamic full runner using the existing manifest mechanism, with E3 stress skipped;
- JSON/JSONL parse, path existence/uniqueness, parent-child count, Markdown fence checks;
- exact A/M/D 40-path projection;
- production/protected zero delta from `f27daf7`;
- clean source worktree and untouched E3 evidence hashes.

Candidate terminal text:

```text
READY FOR DEDICATED INDEPENDENT E3 ACCEPTANCE-ARCHIVE CLOSURE IMPLEMENTATION REVIEW
```

The review pins the exact P3 HEAD. A technical PASS is not itself permission to archive the closure task.

## 6. Post-review closure archive

Only after dedicated implementation PASS and a separate owner closeout authorization:

1. Record the audit of the P3 candidate in the closure task; do not alter the fixed source `f27daf7` review record.
2. Set E3 law parent current planning/implementation child to null and next gate to `explicit_owner_decision_for_e3_law_parent_acceptance_archive`.
3. Verify P4 using the already-reviewed Workspace Law; no technical edit is allowed.
4. Run native `task.py archive 08-31-rkp-2-e3-acceptance-archive-closure`.
5. Re-run focused, Trellis, JSON, path-set and clean-worktree gates.

Final state does not archive the E3 law or Stage 6 parents and does not start S6.2/S6.3.

## 7. Commit boundaries

Expected sequence:

```text
docs(rkp-2): activate E3 acceptance archive closure
test(rkp-2): add archive-aware E3 acceptance law
docs(rkp-2): record acceptance projection owner closeout
chore(task): archive 08-31-rkp-2-e3-acceptance-state-projection
docs(rkp-2): freeze E3 acceptance archive review candidate
<independent review, read-only>
docs(rkp-2): record accepted E3 archive closure
chore(task): archive 08-31-rkp-2-e3-acceptance-archive-closure
```

No amend, merge, push, qualification, or runtime cutover occurs.
