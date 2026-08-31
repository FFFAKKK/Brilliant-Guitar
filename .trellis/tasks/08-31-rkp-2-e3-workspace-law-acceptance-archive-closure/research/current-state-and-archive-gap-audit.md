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

One Stage 6 sibling task models a finite five-phase law. It reuses the accepted archive-aware pattern, expands only the existing Workspace Law test, requires a Q3 external audit, and ends with Stage 6 active but childless.

## Evidence classification

This is planning evidence only. It does not reclassify the target audit as archive authorization and does not authorize implementation.
