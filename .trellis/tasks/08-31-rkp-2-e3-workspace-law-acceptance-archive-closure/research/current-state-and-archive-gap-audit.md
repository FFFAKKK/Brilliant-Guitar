# Current State and Archive Gap Audit

## Scope

Read-only evidence audit at planning base `c73e2139d3a1a9e89e4ec6071678d75be1c02abb`.

## Confirmed repository state

- E3 acceptance-state projection is archived at its literal `2026-08` path.
- Its acceptance/archive closure is also archived and completed.
- E3 Workspace Law target remains active and `in_progress`.
- The target's independent implementation review is passed and bound to candidate `0c561d1419...`.
- The target owns a 323-byte canonical audit record with SHA-256 `dee0b92c...7589`.
- Target `archive_authorized=false` and next gate is explicit owner decision.
- Stage 6 remains `in_progress` and points to the target as current implementation child.
- RKP-2 remains paused before S6.2; S6.2/S6.3 are false and TypeScript is default.
- Focused Workspace Law is 11 tests / 8 pass / 3 exact historical fail.
- Full baseline is 611 / 606 / 3 / 2.

Creating this planning-only sibling produces one deliberate live-law gap before the future technical phase: focused becomes `11/7/4` and full becomes `611/605/4/2`. The sole new failure is the existing Stage 6 semantic/final-state projection test seeing 11 new task paths; this is the exact object planned for Q1T, not a product regression.

## The exact gap

Current Workspace Law encodes the target task active path and its 12 planning artifacts as present. Native archive would:

```text
delete 12 active paths
add 12 archive paths
change target lifecycle to completed
```

Without a prior law extension, this valid lifecycle transition appears as unauthorized path and state drift. Therefore the smallest sufficient solution is one test-file update plus lifecycle files, not a production repair.

## First independent planning review

Dedicated audit task `01a057bc-ce6b-7b31-a667-afd1a1a91dcf`, turn `01a057bc-d3e2-7121-beb4-d2b3a36bb4f3`, reviewed candidate `7b1c0e31f768ab802635c20d77909ba9b345e558` and returned P0/P1/P2=`0/3/0`:

1. the closure duplicated the target's 323-byte structured audit record;
2. target JSONL contained six active self-references that would break after native archive while the nine-file allowlist excluded their repair;
3. the planned Q3→Q4 sequence committed an illegal child/closure intermediate state.

The bounded repair removes the duplicate structure, expands only the lifecycle/context allowlist from 9 to 11 for the two target JSONL manifests, changes Q2 arithmetic from `A11/M7/D0=18` to `A11/M9/D0=20`, and makes the Stage 6 terminal projection plus closure move one native archive commit. Q3/Q4 path arithmetic remains `A23/M4/D12=39`.

## Second targeted planning review

Dedicated audit task `01a05842-edbd-7e10-842e-ce936fa6a727`, turn `01a05842-f31a-78a2-9c4e-efab66309d52`, reviewed repaired candidate `63212ae9021427b5d8af118dc677c7fe0499871e` and returned P0/P1/P2=`0/1/0`. It mechanically confirmed the three original findings closed, then found one same-boundary gap: the Q4 command used `git diff --name-only`, which omits untracked paths, while native archive may stage the archive root.

The second bounded repair changes no owner, phase, allowlist or A/M/D projection. It replaces that incomplete preflight with NUL-delimited porcelain status over all untracked files, requires exactly six staged lifecycle entries with blank worktree columns and no other path, and adds a post-archive single-parent plus exact commit-local `A11/D11/M3` membership check before the real Q4 law. Any mismatch reverts the one native archive commit.

## Third targeted planning review

Dedicated audit task `01a05893-1f82-74d1-8764-c115e6cfa550`, turn `01a05893-3360-7d31-ba12-5eb4a80d9b85`, reviewed candidate `bf15f20379aee873430981b72f68a55d235d5bb6` and returned P0/P1/P2=`0/1/0`. It confirmed the Q4 all-untracked preflight and archive-commit membership repair closed, then found one execution-clock drift: the calendar had rolled to `2026-09-01` while the two future native archive roots and fail-before-move checks still named `2026-08-31`.

The third bounded repair changes only future execution projections. The target and closure native archives now resolve under `archive/2026-09`, both clock checks require local date `2026-09-01` before `23:50:00`, and a missed execution day requires another bounded date sync. Already accepted historical archives remain under their real `archive/2026-08` locations. Owners, manifests, phases and path arithmetic remain unchanged.

## Rejected routes

### Direct archive

Rejected because it changes the law's asserted filesystem topology before the law can validate the change.

### Make this task a target child

Rejected because the target would be archived while containing an active child, and closing that child would require another recursive closeout.

### Manual directory move

Rejected because it bypasses Trellis status/completedAt/commit behavior and invalidates reproducibility.

### New archive subsystem

Rejected because existing `task.py archive` is sufficient; the gap is projection authority, not archive mechanics.

### Start S6.2

Rejected because Stage 6 lifecycle closure is an independent gate and S6.2 remains explicitly false.

## Selected route

One Stage 6 sibling task models a finite five-phase law. It reuses the accepted archive-aware pattern, expands only the existing Workspace Law test, performs the bounded two-JSONL context projection before target archive, requires a Q3 external audit, and ends with Stage 6 active but childless through one atomic Q4 archive commit whose pre-state and commit membership both fail closed. Its future archive month/date is an execution-day contract, not historical authority; expiry returns to bounded date sync rather than falling back, moving manually or changing the system clock.

## Evidence classification

This is planning evidence only. It does not reclassify the target audit as archive authorization and does not authorize implementation.
