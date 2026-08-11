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

Final JSON files use `schemaVersion: 1` and pass `cvn-7-evidence-validator`. Partial worker results remain under untracked task-local `.tmp/`; superseded final evidence moves under `superseded/<candidate-commit>/` with a reason record.
