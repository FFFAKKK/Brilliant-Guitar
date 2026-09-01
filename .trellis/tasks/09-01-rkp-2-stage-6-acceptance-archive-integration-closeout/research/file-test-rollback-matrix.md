# File, test and rollback matrix

| Phase | Mutable authority | Required proof | Rollback |
|---|---|---|---|
| L0 | closeout planning + three projections | Trellis/JSON/paths/protected zero | revert planning commit |
| L1 | lifecycle files only | activation exact paths | revert L1 |
| L2 | semantic child lifecycle/archive + projections | exact 12 move, active absent | bounded post-archive repair |
| L3 | Stage 6 lifecycle/archive, Workspace Law, projections | exact 13 move, audit pin | bounded post-archive repair |
| L4 | Git refs only | ff-only equality/source freeze | controlled new branch |
| L5 | projections + Workspace Law | sole owner/direct child/full gates | revert before closeout archive |
| L6 | closeout 12-file archive + terminal projections | exact terminal state/rereview | bounded successor repair |

Protected throughout: `src/**`, `crates/**`, Cargo/package/tsconfig, fixtures, qualification, active specs and every test except exact Workspace Law.
