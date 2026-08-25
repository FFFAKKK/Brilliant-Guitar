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

## Reporter/outcome compatibility gate

The cross-version normalizer is frozen to common stable `test:pass` and `test:fail` events. It consumes only event type plus `data.nesting`, `data.file` and `data.name`; it must never infer outcomes from `test:complete`, `data.details.type`, diagnostic payloads or reporter text. Any `test:fail` at any nesting fails. Only nesting-zero pass/fail events may identify manifest-file terminal outcomes. `data.file` or `data.name` is required; if both exist they must normalize to the same absolute manifest member. Every manifest file has exactly one outcome; unknown, duplicate or missing outcomes fail.

Any supported-version `test:interrupted`, stream error/abort, close before normal end, missing end or reporter sink/pipeline/flush failure is nonzero. Exit zero waits for normal stream end, exact outcome-set equality, zero fail/interrupted and completed reporter flush. Listener attachment occurs synchronously after `run()` returns, with injected earliest-post-return emission/close coverage.

The implementation test matrix records real Node 20.20.2 and 24.15.0 event characterization fixtures. Each fixture documents emitted event types and the exact four consumed fields above; version-only fields may be retained as unconsumed evidence but may not control the result. A supported version whose common fields cannot prove one exact top-level outcome per manifest file fails the compatibility gate rather than weakening completeness.
