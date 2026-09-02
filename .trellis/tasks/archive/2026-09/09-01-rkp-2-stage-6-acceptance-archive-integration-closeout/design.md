# RKP-2 Stage 6 Acceptance, Archive and Integration Closeout — Design

## 1. Decision

Use a dedicated sibling closeout under RKP-2. Close the remaining active Stage 6 child first, then Stage 6, then hand the accepted chain to the original RKP-2 worktree by fast-forward only. The closeout branch never becomes a second long-lived RKP-2 owner.

```text
65debd52 planning base
  -> L0 planning PASS
  -> L1 activation
  -> L2 semantic child acceptance + native archive
  -> L3 Stage 6 acceptance + native archive + archive projection
  -> independent archive-candidate audit
  -> L4 clean ff-only into original RKP-2
  -> L5 sole-owner projection
  -> independent integration audit
  -> bounded L6 clock/date contract repair + targeted rereview
  -> L6 native closeout archive + terminal projection
  -> independent terminal rereview
```

Native archive commits are immutable; post-archive repairs are new descendants.

## 2. Frozen identities

| Identity | Value |
|---|---|
| planning base | `65debd52d379004c966cefe59f54d72ac1136eb4` |
| Stage 6 technical audit | `0c561d14193374436361eec09b361cab0170278a` |
| verdict | PASS, P0/P1/P2=`0/0/0` |
| original RKP-2 branch/worktree | `codex/rkp-2-indexed-live-score-store-implementation` / `.worktrees/rkp-2-indexed-live-score-store-implementation` |
| closeout branch/worktree | `codex/rkp-2-stage-6-acceptance-archive-integration-closeout` / `.worktrees/rkp-2-stage-6-acceptance-archive-integration-closeout` |
| archive month/root | `2026-09` / `.trellis/tasks/archive/2026-09/09-01-rkp-2-stage-6-acceptance-archive-integration-closeout` |
| historical semantic/Stage 6 archive date/deadline | `2026-09-01` / `23:50:00+08:00` |
| L6 closeout archive date/deadline | `2026-09-02` / `2026-09-02T23:50:00+08:00` |

The `2026-09-01` date and `23:50:00+08:00` deadline are immutable historical facts for the already completed L2 semantic-child and L3 Stage 6 native archives. They are not an L6 clock and L6 must never consume them. Before L6, local date must be exactly `2026-09-02`, local offset must be `+08:00`, and current time must be earlier than `2026-09-02T23:50:00+08:00`; any mismatch stops the line before authorization mutation or `task.py archive`.

## 3. Exact manifests

### Semantic/canonical child — 12

Top level: `check.jsonl`, `design.md`, `implement.jsonl`, `implement.md`, `operator-handoff.md`, `prd.md`, `review-candidate.md`, `task.json`.

Research: `current-seam-and-authority-audit.md`, `e1r2-file-test-rollback-matrix.md`, `planning-self-audit.md`, `semantic-canonical-role-matrix.md`.

Active/archive roots:

```text
.trellis/tasks/08-30-rkp-2-stage-6-semantic-canonical-authority-amendment
.trellis/tasks/archive/2026-09/08-30-rkp-2-stage-6-semantic-canonical-authority-amendment
```

### Stage 6 — 13

Top level: the same eight standard files.

Research: `file-ownership-and-rollback.md`, `implementation-evidence.md`, `planning-self-audit.md`, `root-cause-and-counter-write-map.md`, `scale-worker-and-failure-matrix.md`.

Active/archive roots:

```text
.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair
.trellis/tasks/archive/2026-09/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair
```

### This closeout — 12

Eight standard files plus four research files in `task.json.relatedFiles`; archive root:

`.trellis/tasks/archive/2026-09/09-01-rkp-2-stage-6-acceptance-archive-integration-closeout`.

## 4. Task-tree and authority rules

1. Exactly one active/archive root exists for each task.
2. Parent `children` retains historical lineage; live `current_*_child` may name only active tasks.
3. Before Stage 6 archive, RKP-2 current implementation child remains Stage 6.
4. After Stage 6 archive and before closeout archive, it becomes this closeout.
5. After closeout archive, both RKP-2 current-child fields are null.
6. Rust parent continues to name RKP-2 throughout.

## 5. Phases

### L0 — planning

Only this planning tree plus narrow RKP-2/Stage 6/Rust-parent planning projections change. Targets and tests are immutable.

### L1 — activation

Native start activates only this closeout. It records accepted planning authority and bounded authorization; it does not accept/archive targets.

### L2 — consumed child closeout

Pin existing E1R2/E2 evidence, record child acceptance/archive authorization, replace stale E3 gate with historical completion, natively archive the exact 12 files, repair only current self paths/JSONLs if required, and prove Stage 6 has no active child.

### L3 — Stage 6 closeout

Pin `0c561d...` and P0/P1/P2=`0/0/0`, record acceptance/archive authorization, preserve S6.2/S6.3 false and later flags false, natively archive exact 13 files, repair declared archive projections and Workspace Law, then freeze for independent audit.

### L4 — fast-forward integration

After PASS, freeze source and in the clean original RKP-2 worktree run:

```powershell
git merge --ff-only <AUDITED_STAGE6_ARCHIVE_CANDIDATE>
```

Target pre-head must be an ancestor; source remains at audited candidate; no merge commit.

### L5 — sole-owner projection

The first direct child of the audited candidate is created only in original RKP-2. Current owner becomes original RKP-2 branch/worktree, frozen provenance remains closeout source, RKP-2 current child becomes this closeout, S6.2 false, next gate independent integration review.

### L6 — closeout archive and terminal projection

The independent integration audit of `3799faf635482f0301e61a56f1faf83ea3fe0f5f` returned P0/P1/P2=`0/1/0`, `RETURN FOR ONE BOUNDED L6 CLOCK/DATE CONTRACT REPAIR`. L4/L5 remain accepted evidence; the review is not an integration or L6 authorization. The bounded repair must pass a targeted independent rereview before any L6 action.

After that targeted rereview and separate L6 authorization, read only `closeout_archive_date=2026-09-02` and `closeout_archive_deadline_local=2026-09-02T23:50:00+08:00` for the L6 clock preflight. Preserve `archive_month=2026-09` and the existing closeout archive root. Do not read the historical `archive_date` or `archive_deadline_local` fields. Stop without changing acceptance/archive flags if the local date, `+08:00` offset, or deadline check fails. Only then may L6 natively archive this closeout and create one terminal projection whose native `completedAt` is exactly `2026-09-02`:

```text
RKP-2 status                  in_progress
current planning child        null
current implementation child  null
S6.2 / S6.3                  false / false
next gate                     explicit_user_authorization_for_rkp2_s6_2_resume
Rust parent current child     RKP-2
default runtime               typescript
```

Targeted terminal rereview must pass before completion report.

## 6. Workspace-law model

Add exact phases `planning`, `activation`, `semantic-child-archived`, `stage6-archived`, `integrated`, `closeout-archived`. Resolve exact active/archive roots and manifests; lock A/M/D sets, native moves, direct-parent relations, source freeze/sole-owner handoff, accepted audit record digest and terminal RKP-2 projection. The clock projection keeps semantic child and Stage 6 `completedAt=2026-09-01`, requires closeout `completedAt=2026-09-02`, preserves the `2026-09` month/root, and rejects any historical/L6 clock crossover. The bounded date-repair candidate must be the direct single-parent child of `3799faf635482f0301e61a56f1faf83ea3fe0f5f` and change exactly `design.md`, `implement.md`, `task.json`, and the Workspace Law test. Existing E3/Q4 assertions stay unchanged.

## 7. Literal allowlists

Planning: this closeout tree plus RKP-2, Stage 6 and Rust-parent `task.json`.

Future lifecycle: exact three task manifests and archive successors; closeout/RKP-2 `task.json`, `operator-handoff.md`, `review-candidate.md`; Rust-parent `task.json`; and `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`.

Everything else is protected.

## 8. Rollback

L0/L1 may be reverted. Native archives are never reset/amended. Before L4 original RKP-2 is untouched. After L4 recovery uses a new controlled governance commit, never history rewrite. No rollback authorizes later stages.
