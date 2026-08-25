# Node Test API and Version Contract

## Primary authority

- current Node test-runner API: <https://nodejs.org/api/test.html>
- Node 20.20.2 API: <https://nodejs.org/download/release/v20.20.2/docs/api/test.html>

The Node test runner is stable from Node 20.0.0. Both target versions expose programmatic `run({ files, concurrency })`. Node 20 documents separate child-process execution for explicit test files by default. Current Node adds `cwd` and `isolation` options later, so passing them would make a supposed Node 20-compatible runner invalid.

## Frozen compatibility choice

1. Supported minimum is Node 20.0.0; evidence pins 20.20.2 and 24.15.0.
2. Enumerate absolute literal files independently.
3. Verify the CLI is running at repository root.
4. Call only `run({ files: absoluteFiles, concurrency: true })`.
5. Treat semantic request as repo CWD plus process isolation. Verify target-version default before run; do not pass unsupported options or branch on OS.
6. Connect a stable built-in reporter for display and a separate structured observer for truth; attach both synchronously after `run()` returns.

## Rejected choices

| Choice | Rejection |
|---|---|
| shell wildcard | divergent Node/shell discovery and exit-zero partial run |
| Node `globPatterns` | not the required stable Node 20 literal-files contract |
| third-party glob | new dependency/lock drift and second discovery semantics |
| pass `cwd`/`isolation` | absent from Node 20.20.2 `run` options |
| hard-code 77/557 | breaks on Stage 6 test growth and hides discovery changes |
| spawn one huge `node --test <args>` command | command-line quoting/length becomes another platform discovery boundary |

## Reporter/event-coverage compatibility gate

The cross-version normalizer is frozen to common stable `test:pass` and `test:fail` events, with `test:interrupted` as a failure signal. Truth consumes exactly event type plus `data.file`; it must never infer outcomes from `data.name`, `data.nesting`, `test:complete`, `data.details.type`, diagnostic payloads, reporter text or version-private fields. Any `test:fail` at any nesting immediately selects `runner.test-failed`.

Every `test:pass.data.file` must be a non-empty absolute string and normalize to an exact frozen manifest member. Missing/non-string/empty/relative values select `runner.outcome-path-missing`; absolute non-members select `runner.outcome-unknown`. A pass inserts into an idempotent `seenManifestFiles` set, so multiple internal passes for one file are valid. Normal end requires `seenManifestFiles` to equal the manifest set; a strict subset selects `runner.outcome-missing`. Empty files receive Node's file-level pass, while files with tests receive internal pass events. `runner.outcome-path-mismatch` and `runner.outcome-duplicate` are removed from the planned error union.

Any supported-version `test:interrupted`, stream error/abort, close before normal end, missing end or reporter sink/pipeline/flush failure is nonzero. Exit zero waits for normal stream end, independent equality of enumerator manifest, actual `run()` files and pass-seen files, zero fail/interrupted and completed reporter flush. Listener attachment occurs synchronously after `run()` returns, with injected earliest-post-return emission/close coverage.

Real Node 20.20.2 and 24.15.0 fixtures cover raw drain, fast reporter and slow/backpressured reporter. The TEMP two-file fixture records one empty-file pass (`file` and `name` equal absolute paths), internal pass/fail rows (`file` is the manifest member, `name` is an opaque title), and identical event sets across modes/versions. The real 78-file Stage-2 tree records 567 pass plus one governance-only fail, attributes all 78 files through `data.file`, and emits no unique file-terminal row. Counts are characterization snapshots only. A supported version whose common `test:pass.data.file` cannot prove exact manifest coverage fails the compatibility gate rather than weakening completeness.
