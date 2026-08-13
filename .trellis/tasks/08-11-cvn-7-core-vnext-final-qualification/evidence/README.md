# CVN-7 Evidence Directory

This directory is a planning scaffold. No qualification measurement has been run or claimed by the planning candidate.

Future accepted evidence filenames:

- `environment.json`
- `build-manifest-baseline.json`
- `build-manifest-candidate.json`
- `contract-trace.json`
- `functional-matrix.json`
- `representative-fixture.json`
- `portable-ab.json`
- `reference-windows.json`
- `stress.json`
- `qualification-summary.md`
- `independent-technical-review.md`

Final JSON files use `schemaVersion: 1` and pass `cvn-7-evidence-validator`. The single official clean `--mode all` run writes every partial worker result outside both worktrees under `%TEMP%/cvn7-qualification/<harnessCommit>/<runId>/`; task-local `.tmp/` is forbidden. Only one complete validated set is atomically published here and then captured by the measurement commit. Superseded final evidence moves under `superseded/<candidate-commit>/` with a reason record. Any rerun restores the same frozen inputs to a clean state and repeats the complete `--mode all`; old partial or per-mode output is never reused, promoted or assembled.
