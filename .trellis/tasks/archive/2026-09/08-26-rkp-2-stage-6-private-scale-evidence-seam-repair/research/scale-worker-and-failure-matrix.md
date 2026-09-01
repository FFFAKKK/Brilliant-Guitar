# Scale Worker and Failure Matrix

## Fixed identities

| Item | Exact contract |
| --- | --- |
| Rust test | `indices::tests::rkp2_stage_6_private_scale_evidence_v1` |
| Request env | `BRILLIANT_RKP2_SCALE_REQUEST_V1` |
| Rust prefix | `BRILLIANT_RKP2_SCALE_RUST_V1:` |
| Process prefix | `BRILLIANT_RKP2_SCALE_PROCESS_V1:` |
| Compile | `cargo +1.97.1 test -p brilliant-kernel-runtime --lib --no-run --locked --message-format=json` |
| Execute argv | `<exe> --exact indices::tests::rkp2_stage_6_private_scale_evidence_v1 --ignored --nocapture --test-threads=1` |

Cargo accepts exactly one `compiler-artifact` with `target.name=brilliant_kernel_runtime`, `target.kind=["lib"]`, `profile.test=true`, and a non-empty absolute existing Windows `.exe`. Zero or multiple matches fail before process start.

## Exact PowerShell call

```text
pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <script> -ExecutablePath <exe> -RequestPath <request> -TestName indices::tests::rkp2_stage_6_private_scale_evidence_v1 -TimeoutMs 180000 -PollIntervalMs 25 -MaxStdoutBytes 1048576 -MaxStderrBytes 1048576
```

TypeScript validates the seven named parameters and all fixed identities before allocating the owned TEMP root/request; a pre-handoff failure is cleaned and rejected by TypeScript outside the PowerShell envelope. After the validated handoff, the PowerShell wrapper is the sole cleanup owner even if `Start-Process` throws. The script temporarily sets the request env in its own process, starts the child hidden, redirects stdout/stderr to unique TEMP files, polls after `Refresh`, samples checked maximum `PeakWorkingSet64`, checks both caps, tree-terminates with validated `taskkill /T /F` after cap/timeout and always attempts bounded reap within `5000ms`. Normal/nonzero exit uses `terminationStatus=not-required`, calls `WaitForExit`, records actual reap, and performs final `Refresh`.

In `finally`, the wrapper closes handles, restores/removes the env, then cleans exact order `request -> stdout -> stderr -> owned TEMP root`. Each target uses an existence check, at most two deletion attempts and exact `25ms` retry spacing. Any failed attempt fixes `cleanupStatus=failed` even if retry succeeds; otherwise it is `succeeded`. The wrapper emits the one final process sentinel only after this result is known.

## Single successful journey

1. E2 TypeScript calls only `createStressCvn7Score()` and writes one temporary create request.
2. Cold compile and exact artifact selection finish before the timer.
3. PowerShell starts the exact ignored libtest; the 180-second clock covers workload only.
4. Rust decodes through Contracts, imports, performs the exact two-step owner probe, rebuilds parity, exports once and encodes once.
5. Rust emits exactly one compact internal sentinel; PowerShell captures rather than relays raw libtest output.
6. PowerShell emits exactly one compact final sentinel with process diagnostics and `partialEvidence=false`.
7. E2 proves a real integration run; E3 generates a fresh request and reruns for formal child evidence/candidate freeze.

## Frozen fixture and evidence

| Dimension | Exact value |
| --- | ---: |
| measures / parts / staves | `400 / 16 / 16` |
| contents / voices | `6400 / 12800` |
| events / notes | `102400 / 51200` |
| extensions / Part-owned / unknown | `18 / 16 / 1` |
| canonical score / create request bytes | `15013904 / 15013932` |
| entities visited | `166833` |
| records measure/part/staff/voice/event/note/extension | `400/16/16/12800/102400/51200/18` |
| topology / reference / time edges | `173250 / 19216 / 102400` |
| index entries / rebuild entries | `474517 / 474517` |
| full-document materializations | `1` |
| canonical encode bytes | `15013904` |
| entity/owner/other probe deltas | `1 / 1 / 0` |

## Exact success/rejection boundary

Rust internal JSON is the exact section-3.3 shape in `design.md`, including separate `entityProbe` and `ownerProbe`. Final success is exact `{schemaVersion:1,status:"ok",evidence,process,partialEvidence:false}`; `process` has only `exitCode=0`, `timedOut=false`, positive safe `peakWorkingSetBytes`, safe `stdoutBytes`, safe `stderrBytes`, `terminationStatus="not-required"`, `reapStatus="succeeded"`, and `cleanupStatus="succeeded"`.

Final rejection has the same exact process keys. `Start-Process` failure freezes primary `process.start-failed`, `terminationStatus="not-required"`, `reapStatus="not-required"` and actual cleanup `succeeded|failed`; cap/timeout freezes attempted termination and reap as `succeeded|failed`; normal/nonzero exit freezes `terminationStatus="not-required"` and actual reap; cleanup is always `succeeded|failed`. Shutdown outcomes are secondary fields, not failure codes.

Final rejection is exact `{schemaVersion:1,status:"rejected",failure,process,partialEvidence:false}` and forbids internal evidence, raw streams, paths, backtraces and partial counters. `failure` is the closed `{code,details}` union in `design.md`; `process` has only nullable exit/RSS, timeout boolean, output byte counts and cleanup status.

## Closed failure fixtures

| Code | Required focused trigger and proof |
| --- | --- |
| `process.start-failed` | existing path-preflight-eligible but invalid libtest `.exe` makes `Start-Process` throw after handoff; actual cleanup status, no partial evidence, no hang |
| `process.output-limit-exceeded` | stdout and stderr cap+1 independently; primary survives `terminationStatus="failed"` |
| `process.timeout` | live child crosses `180000`; primary survives `reapStatus="failed"` |
| `process.nonzero-exit` | safe normalized nonzero Windows exit code |
| `process.sentinel-count-invalid` | zero and two internal prefixes |
| `process.sentinel-malformed` | invalid JSON after the sole prefix |
| `process.protocol-invalid` | arguments/artifact/internal/final shape, type, range, version, extra-field and identity cases |
| `process.rss-unavailable` | poll and final-refresh access failure |
| `process.rss-invalid` | zero, negative and unsafe-integer projection |
| `evidence.counter-mismatch` | every closed metric/probe leaf can identify expected/actual |
| `evidence.overflow` | checked metric/bytes/elapsed/process numeric conversion |
| `evidence.parity-mismatch` | normalized projection and count branches |
| `evidence.bytes-mismatch` | canonical and request bytes independently |
| `evidence.order-mismatch` | topology and extensions independently |
| `evidence.payload-mismatch` | fixture/counts/entityProbe/ownerProbe/roundTrip independently |
| `process.cleanup-failed` | each request/stdout/stderr/temp-directory target when cleanup is the first primary; success workload plus cleanup failure also becomes this rejection |

All tests assert exact code/details/shape, nonzero exit, bounded settlement and `partialEvidence=false`. No free-form message or copied production parser is allowed.

## First-failure matrix

Primary precedence is exact: start → sampling/refresh → output caps → timeout → exit → sentinel count → JSON parse → protocol/range → RSS validity → counts/bytes/counters → parity → ordering → payload/round-trip → cleanup. Termination and reap statuses are secondary and never participate in primary selection.

Focused combinations cover both the primary and later shutdown/cleanup status. Exact required rows include: cap plus termination failure remains `process.output-limit-exceeded` with `terminationStatus="failed"`; timeout plus reap failure remains `process.timeout` with `reapStatus="failed"`; clean-path cleanup failure alone is `process.cleanup-failed` with `cleanupStatus="failed"`; an existing primary plus cleanup failure keeps that primary. Nonzero exit plus malformed sentinel remains nonzero; counter mismatch plus parity remains counter; parity plus order remains parity. Later secondary statuses never replace the first primary.

The real cleanup matrix is fixed:

1. existing path-preflight-eligible but invalid libtest `.exe` causes real `Start-Process` failure, primary `process.start-failed`, `terminationStatus="not-required"`, `reapStatus="not-required"`, `cleanupStatus="succeeded"`, bounded settlement and absent owned TEMP root;
2. injected first deletion failure and successful second attempt keep primary `process.start-failed`, record `cleanupStatus="failed"`, and leave no owned TEMP root because any attempt failure is protocol-visible;
3. two failed attempts produce rejection with the earlier primary (or `process.cleanup-failed` if cleanup is first), `cleanupStatus="failed"` and `partialEvidence=false`; after assertions, the test fixture releases its deliberate fault and proves zero final test residue without changing protocol status.

Cap/timeout records attempted termination and reap as `succeeded|failed`. Normal/nonzero exit records `terminationStatus="not-required"` and actual reap. No focused test expects a shutdown-secondary result as a primary code. No final envelope exists until cleanup has completed, and success workload plus cleanup failure is rejected as `process.cleanup-failed`.

## Timing and qualification meaning

- E1 does not run the stress fixture.
- Compilation and fixture generation are outside the 180-second interval.
- Rust `Instant` reports workload microseconds; PowerShell reports peak working set bytes.
- Both are mandatory observable safe integers but have no pass budget beyond liveness and valid sampling.
- The run is not CVN-7 official measurement, RKP-7 product budget evidence or RKP-9 Qualification V2.
