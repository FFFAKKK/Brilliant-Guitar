# Authority and Evidence Input Audit

## Accepted runtime input

`b21540fa3636e6c8e827ff24c2099f4ff331285d` is the clean CVN-7 candidate and the planning base. It contains the accepted CVN-0 through CVN-6 production behavior plus the reviewed CVN-7 qualification harness. The Rust planning branch begins at this commit and initially changes planning artifacts only.

## Evidence status to project in RKP-0

The fifth official input has these fixed fields:

| Field | Value |
|---|---|
| candidate/harness | `b21540fa3636e6c8e827ff24c2099f4ff331285d` |
| baseline | `38afdc3fd508dc67f7aa446fd323837a5d550b70` |
| action | `stress-submit` |
| fixture / phase | `stress` / `memory` |
| timeout | `10,800,000 ms` |
| requests / results | `411 / 410` |
| worker started | true |
| stderr classification | `worker-timeout` |
| measurement complete | false |
| evidence valid | false |
| partial evidence | false |
| reusable evidence | false |

The frozen workload and 2 GiB ceiling remain unchanged. TEMP diagnostics remain diagnostic material and are not copied into task-local evidence. The normalized record is written only to `.trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/research/official-run-failure-ledger.jsonl` under unique key `cvn7-official-2026-08-15-b21540fa-stress-submit-memory`; it is never placed in `evidence/`.

## Authority files consumed

- Core Kernel current specifications under `.trellis/spec/core-kernel/`;
- Core VNext parent feature-contract matrix, roadmap, performance baseline and implementation order;
- CVN-7 PRD/design/implementation handoff and current task metadata;
- archived CVN-2 public module SDK contract and implementation review;
- archived CVN-6 runtime/validation/migration contract;
- post-Core product roadmap and its Extension Host/Application Assembly fences;
- product REQ-007, REQ-015, REQ-017, REQ-018 and REQ-019.

## Transition rule

RKP-0 may document an accepted migration target, but it may not describe the Rust runtime as current production. That authority switch belongs exclusively to accepted RKP-8.
