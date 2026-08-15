# Golden Oracle and Performance Contract

## Ordered Core command inventory

The oracle command partitions use this exact accepted order:

1. `core.document.set-metadata`
2. `core.note.set-written-pitch`
3. `core.event.set-note-value`
4. `core.voice.insert-notes-event`
5. `core.voice.insert-rest-event`
6. `core.event.remove`
7. `core.measure.insert`
8. `core.measure.remove`
9. `core.measure.move`
10. `core.measure.set-definition`
11. `core.part.insert`
12. `core.part.remove`
13. `core.part.move`
14. `core.part.set-name`
15. `core.part.set-instrument`
16. `core.staff.insert`
17. `core.staff.remove`
18. `core.staff.move`
19. `core.staff.set-definition`
20. `core.voice.insert`
21. `core.voice.remove`
22. `core.voice.move`
23. `core.voice.set-default-staff`
24. `core.voice.set-sequence-start`
25. `core.event.set-staff-assignment`
26. `core.range.delete`
27. `core.range.transpose-written-pitch`
28. `core.transaction.batch`

The capture test derives and compares the live catalog rather than trusting this document alone.

## Scenario source discipline

`oracle-scenario-matrix.md` is the sole row-construction authority. It fixes the source test, fixture recipe, assembly, accepted envelope, rejected target replacement, operation program and expected state relation for every row. The RKP-0 operator does not choose a fixture or negative branch. All 28 rejected rows use the fixed well-formed missing-target path and must return `command.target-not-found`; any drift returns to planning instead of changing the corpus recipe.

## Eight cross-cutting scenarios

| Order | ID | Required proof |
|---:|---|---|
| 1 | `cross.submit-noop-persisted-dirty` | commit, no-op, checkpoint and dirty transitions |
| 2 | `cross.undo-redo-tail-truncation` | forward/inverse identity and redo-tail deletion |
| 3 | `cross.atomic-batch-commit` | one version/history/event for changed children |
| 4 | `cross.batch-child-rejection-zero-delta` | failed index plus state/event equality |
| 5 | `cross.semantic-replay-equality` | fresh-session final document/result equality |
| 6 | `cross.integrated-two-module-order-availability` | catalog order, validation/classification and availability |
| 7 | `cross.detached-extension-migration` | migrated/not-required/rejected and active-state zero delta |
| 8 | `cross.assembly-mismatch-subscriber-isolation` | mismatch rejection and committed subscriber-failure isolation |

## Performance contract boundary

RKP-0 freezes budgets as data and runs no benchmark. Later measurements have two layers:

- Rust internal microbenchmarks for mechanism diagnosis;
- TypeScript/native/Rust end-to-end results for acceptance.

Only the second layer satisfies the 60 FPS gate. The representative and stress source file, generator exports, version, seeds, counts and RSS ceilings are literal manifest data. Qualification V2 uses fresh-process samples, a public-call-only timed region, nearest-rank P95/P99 (`sorted[18]`/`sorted[19]` for 20 samples), separate RSS workers and evidence-validity-before-performance precedence. Liveness is calibrated after the Rust engine exists, then independently reviewed as an evidence-method change.
