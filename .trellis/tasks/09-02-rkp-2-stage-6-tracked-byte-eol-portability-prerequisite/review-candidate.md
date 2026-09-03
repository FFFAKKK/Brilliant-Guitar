# EOL prerequisite implementation review candidate

## Status

`I3 PROVISIONAL COORDINATION FREEZE / CLEAN REPLAY PENDING`

## Exact object

- Branch: `codex/rkp-2-stage-6-eol-evidence-repair`
- Worktree: `.worktrees/rkp-2-stage-6-eol-portability-prerequisite`
- Planning base: `55cb575c606646e8449359b0c46d5c905b3bb3c6`
- Fresh I0 source: `64bc508cd56bd0a250f890af186c097dc2b6880e`
- I0 evidence projection: `547447cc9b4cd0124afb5dc1b22d96a773c5b4dc`
- I1 technical commit: `30d4acb0e3ce29e849c2a89b2ac1225bb5dafe49`
- Candidate coordination commit: pending this provisional commit
- Task status: `in_progress`
- S6.2/S6.3/E3: not started / not started / zero
- Default runtime: TypeScript

## Verified before clean I3 replay

- I0 source contained no implementation evidence and no technical delta.
- Three independent generators produced the same `4,892`-byte full-index patch with SHA-256 `fb635082a2951b5e3d8b9352230bd462e0c08aa5b7326a93403537baf62b1b05`.
- Expected V1/V2 signatures are equal; Part Owner equals control and the other three are independently predeclared transitions.
- The technical commit changes exactly `.gitattributes` plus test-only regions of `runtime.rs`, `store.rs`, and `indices.rs`.
- Rust boundary reconstruction and five focused tests pass.
- I2 publishes all 14 checkout and 7 blob records; every raw byte sequence is equal and LF-only.
- Rust 1.97.1 fmt/check/test/clippy and Rust 1.88.0 check pass.
- TypeScript typecheck/build pass.

## Remaining candidate-freeze gate

From this clean provisional commit: rerun Trellis/JSON/fence/diff, full Node, fresh I3 control, fresh rebuilt expected lane, candidate signature comparison, manifest equality, exact 4+6 path sets, protected-path checks and cleanup. Only then may status become `READY FOR DEDICATED INDEPENDENT EOL PREREQUISITE IMPLEMENTATION REVIEW`.

No acceptance, archive, integration, S6.2, S6.3, E3, qualification, runtime cutover, RKP-3 or push is authorized.