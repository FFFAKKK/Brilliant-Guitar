# Scale Worker and Failure Matrix

## Single successful journey

1. TypeScript imports `createStressCvn7Score()` from the existing CVN-7 fixture module.
2. It asserts exact counts, extension ownership/order and canonical byte count.
3. It writes one temporary create request and verifies `15013932 < 67108864`.
4. It precompiles Runtime tests with Cargo JSON messages and selects exactly one Runtime libtest executable.
5. PowerShell launches that executable hidden with the exact ignored test and request-path environment.
6. Rust decodes through Contracts, imports, probes owner lookup, rebuilds parity, exports once and encodes once.
7. The wrapper samples peak working set, enforces workload liveness and returns one v1 evidence sentinel.
8. TypeScript validates every field before publication and removes the temporary directory.

## Frozen fixture and evidence

| Dimension | Exact value |
| --- | ---: |
| measures / parts / staves | `400 / 16 / 16` |
| contents / voices | `6400 / 12800` |
| events / notes | `102400 / 51200` |
| extensions / Part-owned / unknown | `18 / 16 / 1` |
| canonical score / create request bytes | `15013904 / 15013932` |
| entities visited | `166833` |
| topology / reference / time edges | `173250 / 19216 / 102400` |
| index entries / rebuild entries | `474517 / 474517` |
| full-document materializations | `1` |
| canonical encode bytes | `15013904` |

## Failure matrix

| Fault | Required result |
| --- | --- |
| fixture count/order/owner mismatch | fail before process start; no evidence |
| canonical or request byte mismatch/cap breach | fail before process start; no evidence |
| Cargo non-zero or zero/multiple matching executables | fail; process calls `0` |
| missing/unreadable/malformed request | Rust test fails; no final evidence |
| Contracts decode/semantic failure | no Store/evidence publication |
| 180-second workload timeout | terminate exact child, non-zero, no evidence |
| non-zero/abnormal child exit | non-zero, no evidence |
| RSS sampling/read failure | non-zero, no evidence |
| absent/duplicate/malformed sentinel | stable worker failure, no evidence |
| counter/record/lookup mismatch | stable worker failure, no evidence |
| overflow or lossy conversion | fail closed, no evidence |
| parity/order/payload/byte mismatch | fail closed, no evidence |
| cleanup failure | preserve first failure; never publish evidence |

Each hostile test has a bounded settle assertion. Injectable process/Cargo seams exist only inside test infrastructure; the real path uses an actual libtest process.

## Timing and RSS meaning

- Compilation and fixture generation are outside the 180-second interval.
- Rust `Instant` reports workload elapsed time.
- `PeakWorkingSet64` is sampled while the exact child is alive.
- Neither value has a pass threshold beyond liveness and successful observation.
- Diagnostics carry toolchain/OS/commit identity and are not an official measurement or budget qualification.
