# CVN-7 Benchmark Method and Evidence Schema

## Two-build model

- accepted baseline commit: `38afdc3fd508dc67f7aa446fd323837a5d550b70`;
- baseline worktree: `.worktrees/cvn-7-accepted-baseline` detached;
- candidate worktree: `.worktrees/cvn-7-core-vnext-final-qualification`;
- each worktree owns an independent clean `dist/`;
- package lock hash and Node executable are identical;
- candidate harness loads either build root through an explicit validated path.

## Timing protocol

For each of eight operations and each build:

1. five warm-up workers;
2. twenty measured workers;
3. each worker creates fresh fixture/runtime state;
4. fixture generation, module import, process spawn and serialization are outside timed region;
5. `performance.now()` measures the public operation only;
6. sample pairs alternate order baseline→candidate / candidate→baseline;
7. raw durations are retained in invocation order;
8. aggregate uses sorted copies;
9. median = `(sorted[9] + sorted[10]) / 2`;
10. P95 = `sorted[18]`;
11. candidate/baseline ratios use raw aggregates;
12. any nonfinite or nonpositive duration invalidates the operation evidence.

## Memory protocol

Latency and memory runs are separate. Memory worker records:

- setup-before `heapUsed`/RSS;
- operation-before `heapUsed`/RSS;
- operation-after `heapUsed`/RSS;
- result-encode-after `heapUsed`/RSS;
- `process.resourceUsage().maxRSS` raw value and platform unit;
- normalized max RSS bytes;
- observed peak heapUsed = maximum of four explicit checkpoints.

Representative process max RSS limit is 1.0 GiB. Stress process max RSS limit is 2.0 GiB.

## Environment record

Exact raw fields:

- Node version and executable path hash;
- platform/arch;
- OS type/release/version;
- CPU model array and logical count;
- physical memory bytes;
- process execArgv;
- baseline/candidate/harness commits;
- package lock SHA-256;
- production build tree hashes;
- debugger/instrumentation flags presence;
- environment-match boolean plus per-field comparison results.

Tracked evidence stores a normalized executable label/hash rather than an absolute user path.

## Evidence validity precedence

1. schema/shape/commit/build mismatch → `EVIDENCE_INVALID`;
2. functional failure → `NOT_QUALIFIED_FUNCTIONAL`;
3. determinism failure → `NOT_QUALIFIED_DETERMINISM`;
4. resource failure → `NOT_QUALIFIED_RESOURCE`;
5. portable ratio failure → `NOT_QUALIFIED_PORTABLE_PERFORMANCE`;
6. exact reference match + absolute failure → `NOT_QUALIFIED_REFERENCE_PERFORMANCE`;
7. reference mismatch with all portable gates passing → `REFERENCE_ENVIRONMENT_PENDING`;
8. all blocking evidence + independent acceptance → `QUALIFIED`.

## Artifact writes

Workers write unique temporary files. Coordinator validates all results, sorts arrays, recomputes aggregates, then writes `<name>.tmp` and atomically renames to final JSON. Partial evidence never carries `qualified: true`. Superseded evidence moves under `evidence/superseded/<candidate-commit>/` with a reason record.

## Reproducible build manifest

For every `dist/src/**` file:

```json
{
  "relativePath": "src/.../file.js",
  "sizeBytes": 123,
  "sha256": "64-lowercase-hex"
}
```

Entries use `/` and ordinal sorting. Tree hash is SHA-256 over `relativePath + NUL + size + NUL + fileHash + LF` for each entry. Test output and timing artifacts are excluded.
