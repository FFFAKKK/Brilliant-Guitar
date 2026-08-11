# Planning Base and Dependency Audit

## Live baseline

- Worktree: `.worktrees/cvn-5-range-operations-explicit-atomic-batch`.
- Branch: `codex/cvn-5-range-operations-explicit-atomic-batch`.
- Planning base: `d521a618e42c01077e8545d1c87e9b36e14d4bdb`.
- Baseline subject: accepted and archived CVN-6 line with final journal record.
- Baseline tests: typecheck/build pass and full suite `383/383` at CVN-6 acceptance.

## Accepted dependencies

| Dependency | State at planning base | CVN-5 use |
|---|---|---|
| CVN-2 | accepted/archived | frozen nine-field official contribution ABI, SDK `8/34`, installed catalog |
| CVN-3 | accepted/archived | measure structure and primitive measure effects |
| CVN-4 | accepted/archived | Part/Staff/Voice/Event/Note structure and primitive event/pitch effects |
| CVN-6 | accepted/archived | integrated catalog/inventory assembly, availability, validators, profiles, facts, replay and migration |
| Extensibility Reservation | accepted/archived | Core-first, startup-frozen evolution fence |
| GD-0 | accepted/archived | public official-domain data/failure fence, no Guitar implementation |

## Closed dependency evidence

- CVN-6 source/test candidate: `8da50f90c9c05d87a8e1aa7a4e65b30e6ab82c7f`.
- CVN-6 acceptance record: `160674deb805a30837e4a7a3a815ca4981e3a767`.
- CVN-6 archive: `a0c1d6a7b8b38d053d591dca6586c8fff84bbdd6`.
- CVN-6 archived task: `.trellis/tasks/archive/2026-08/08-11-cvn-6-module-runtime-validation-migration-integration/`.
- CVN-5 planning base `d521a61` contains all three commits.

The dependency gate is satisfied. CVN-5 remains `planning` only because targeted independent planning rereview, explicit user implementation authorization and `task.py start` are separate gates.

## Dependency graph

```text
accepted CVN-2 + accepted CVN-3 + accepted CVN-4 + accepted CVN-6
                              |
                              v
                            CVN-5
                              |
                              v
                            CVN-7
```

CVN-5 does not reopen CVN-6. Any later accepted-surface or file-layout drift returns this task to planning review.

## Planning isolation

The old docs-only planning commits were replayed onto the CVN-6 archive line. Relative to `d521a61`, this candidate owns planning documents only: `src/**`, `test/**`, build configuration, archived CVN-6 records and the post-Core task have zero delta.
