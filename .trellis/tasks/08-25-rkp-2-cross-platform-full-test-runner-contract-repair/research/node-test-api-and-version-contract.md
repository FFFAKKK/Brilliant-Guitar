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
6. Connect a stable built-in reporter and wait for its completion/errors.

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

The focused test must execute the real programmatic stream on both pinned versions. It verifies top-level file result names/counts, failure/cancellation signaling, stable reporter completion and expected skips. If event details differ across the supported versions, the implementation must use a tested normalization internal to the runner; it may not weaken completeness or silently drop a version.
