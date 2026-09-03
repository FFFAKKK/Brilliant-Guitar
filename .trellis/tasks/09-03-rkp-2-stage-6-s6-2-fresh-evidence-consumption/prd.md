# RKP-2 Stage 6 S6.2 Fresh Evidence Consumption — PRD

## Goal

Resume RKP-2 Stage 6 S6.2 from the integrated prerequisite head
9da9d036a6c2ef184ea68d5b33fabfb1e9a0eba5. Build a fresh evidence-consumption
candidate for the indexed Rust LiveScoreStore, prove the hostile, resource and
fixed large-fixture contracts at one committed source, and stop before S6.3.

This task is a new owner. The stopped branch
codex/rkp-2-stage-6-s6-2-evidence-consumption and its head c3c4d198... are
diagnostic history only. They may explain prior failures, but no old task state,
commit, request, result, sentinel or evidence record may be reused.

Task creation is authorized. Implementation activation is not yet authorized:
the exact docs-only candidate must first pass a fresh read-only planning audit,
then the user must explicitly approve task start.

## Confirmed baseline

- Planning base HEAD/tree: 9da9d036a6c2ef184ea68d5b33fabfb1e9a0eba5 /
  179e08f0f3ec77f9368cc781c9e4567671791f30.
- The EOL prerequisite passed targeted rereview at ff847a5d... /
  dd223ba4... with P0/P1/P2=0/0/0, was accepted at e4d6216d..., archived
  natively at 9da9d036..., and fast-forward integrated into RKP-2.
- RKP-2 Stages 1–5 and S6.1 remain complete. S6.2 and S6.3 remain false.
- TypeScript remains the product default.
- Current typecheck and build pass.
- Current focused Workspace Law is exactly 11 tests / 7 pass / 4 fail / 0
  skipped. A dirty built-native full diagnostic is 611 / 604 / 5 / 2; the fifth
  failure is only the RKP0 clean-lifecycle guard. A clean fresh checkout before
  ignored native-addon materialization is exactly 590 / 582 / 7 / 1: three
  file-level missing-addon failures plus the four governance failures. After a
  validated native build and hash-equal DLL-to-.node copy, the same clean
  candidate is exactly 611 / 605 / 4 / 2. Both lanes use manifest 80 files and
  SHA-256 1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1.

## Requirements

### S62F-R001 — Exact fresh resume point

All planning and implementation descend from 9da9d036.... The archived EOL
prerequisite is immutable history. The new task branch is
codex/rkp-2-stage-6-s6-2-fresh-evidence-consumption and the intended worktree is
.worktrees/rkp-2-stage-6-s6-2-fresh-evidence-consumption.

### S62F-R002 — One accepted evidence mechanism

Use the accepted fixture, ignored Rust libtest, TypeScript worker and PowerShell
process wrapper already present at the planning base. Do not fork or redesign
the fixture, Runtime seam, process envelope, failure precedence, timeout, stream
caps, ownership handoff, reap or cleanup protocol.

### S62F-R003 — Literal technical boundary

Exactly these three test-harness files may change technically:

- test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
- test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts
- test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts

Production Rust and TypeScript, the fixture, the PowerShell wrapper, Cargo and
package configuration, public contracts and active specs are protected.

### S62F-R004 — Reconstruct, do not reuse, the stopped E1

The stopped E1 diff may be inspected only as diagnostic input. The operator
must reconstruct its logical worker/test changes against current LF bytes and
rewrite the Workspace Law portion against the current 9da9d036... authority.
Cherry-picking the stopped commit or accepting its task metadata is forbidden.

### S62F-R005 — Frozen workload and EOL inputs

Before activation, E1, E2, E3 and candidate freeze, raw SHA-256 values for the
five workload inputs must match the phase-specific map in task.json. At planning
base they are:

- indices.rs: 3e7a1c7f284df006181d49923c52191427c66d68b131df1f2190450523eb90b7
- cvn-7-qualification-score.ts: 5edc34b540835b5edd888706a86df564c0afadc09189293d38d2c4a1b01c05cc
- rkp-2-scale-evidence-worker.ts: ec0c59d6516b7635ff6bc595ca67aba0a588cf7a2dee328c9f825fbac8e6531f
- rkp-2-scale-evidence-worker.test.ts: 72649e5990529b503de461a7daace037cd74199f57504a9b98e4037b928c88b2
- rkp-2-scale-evidence-process.ps1: d0a8486b0cd7cc4e7c1a9c3131ff6ec3c1e79d37d7c54dd54fb03a77282b751f

Initial planning commit 7d7adc03... was returned with P0/P1/P2=0/1/0:
those four values came from the legacy parent worktree's CRLF view. The values
above are the authoritative LF raw-byte SHA-256 values reproduced in this
fresh worktree and in the accepted EOL archive. No tracked technical byte was
changed by the correction.

E1 may change only the worker and worker-test hashes. The Runtime indices,
fixture and PowerShell hashes remain identical. The seven tracked EOL paths
must remain LF-only and byte-equal to their Git blobs in fresh
core.autocrlf=true and core.autocrlf=false checkouts.

### S62F-R006 — Strict source-before-evidence ordering

E1 creates one committed source head containing the bounded three-file
technical change and its implementation-input hash projection. At that source
head:

- research/implementation-evidence.md is absent;
- the index and worktree are clean;
- no E3 request has run;
- focused, full, Cargo, TypeScript and dual-autocrlf source gates pass their
  exact classifications.

No tracked technical byte may change after this source head. Any technical
repair requires a new reviewed source commit and invalidates later evidence.

### S62F-R007 — Representative proof before scale proof

At the exact source head, E2 must prove strict rejection, capacity edges, stale
handles, index parity/corruption rejection, exact entity/owner probes,
deterministic export, detached aliases and unknown-extension preservation. E2
runs no large opt-in workload and produces no tracked edit.

### S62F-R008 — Fixed scale workload

The single authorized E3 run uses fixture cvn7-stress-v1 with 400 measures, 16
parts, 12,800 voices, 102,400 Events, 51,200 Notes and 18 ExtensionBlocks; one
entity probe, one owner probe, one parity rebuild, one DTO materialization and
one canonical encode; a 180,000 ms child guard; and 1,048,576-byte stdout and
stderr caps. Cargo output and TEMP/TMP remain on E:.

### S62F-R009 — Freshness and non-reuse proof

E3 starts only after E1 and E2 pass at the same source head. It clears the three
scale environment variables, creates one new worker-owned random leaf using
exclusive file creation, and invokes the opt-in test exactly once. Evidence
must record fresh_request_generated=true, archived_result_reused=false and
e3_execution_count=1. The reconstructed process-sentinel SHA-256 must not equal
the archived mechanism-run hash
64e09779ea34bd04d504d515eb7c391f7db35a0a23a3c366fb2ffb5aa71c2862.

### S62F-R010 — Lossless result validity

A valid result contains exactly one BRILLIANT_RKP2_SCALE_PROCESS_V1 process
sentinel and one BRILLIANT_RKP2_SCALE_CONSUMPTION_V1 record. Independent decode
must reproduce the exact sentinel bytes, byte length and SHA-256 and prove exit
0, timedOut=false, positive elapsed/RSS, exact counts/counters, parity,
semantic/canonical equality, canonical order, extension preservation,
terminationStatus=not-required, reapStatus=succeeded, cleanupStatus=succeeded
and partialEvidence=false.

Timeout, cap overflow, nonzero exit, missing/duplicate/malformed record,
Base64/length/hash mismatch, stale input, counter/parity/byte/order mismatch,
cleanup failure or partial output is EVIDENCE_INVALID and cannot publish PASS.

### S62F-R011 — Exact source-to-evidence diff

The candidate-freeze commit after E3 changes only the eight declared lifecycle
paths, including the new implementation-evidence file. The exact range from
the E1 source head to the E4 candidate must have zero technical delta. The
source commit/tree and evidence commit/tree are recorded separately.

### S62F-R012 — Claim boundary

S6.2 may claim only diagnostic structural correctness and liveness within its
fixed guard. It may not claim RKP-7 latency/RSS budgets, RKP-9 Qualification V2,
60 FPS readiness, product performance acceptance or default-runtime readiness.

### S62F-R013 — Lifecycle separation

Planning audit, user activation, E1 source creation, E2 representative proof,
E3 fresh execution, E4 candidate freeze, implementation audit, owner
acceptance, native archive and parent integration are separate gates. Technical
PASS never authorizes the next lifecycle action.

## Acceptance criteria

- [x] Planning diff is exactly the fifteen literal planning paths and contains
  no production/test/spec/config edit.
- [x] New task is planning; task_start_run, production implementation, E3,
  S6.2, S6.3, qualification, cutover, RKP-3, archive and push are false.
- [x] Parent and Rust-parent projections name this task as the sole current
  planning descendant and name one planning-audit gate.
- [x] JSON/JSONL, Trellis validation, Markdown fences, path existence,
  uniqueness, hashes and diff checks pass.
- [x] Clean committed planning candidate produces focused 11/7/4/0; a fresh
  no-native checkout produces 590/582/7/1 with exactly three missing-addon
  file failures plus four governance failures; the validated built-native lane
  produces 611/605/4/2 with only the four governance failures.
- [x] Dedicated fresh planning audit returns P0/P1/P2=0/0/0 for exact
  candidate `7942de056f6b0b6806740e5567de9e493236cec2`; this permits only a
  separate explicit user activation decision.
- [ ] After explicit activation, E1 changes exactly three technical paths and
  freezes one evidence source with evidence absent.
- [ ] E1/E2/E4 produce focused 11/8/3/0 and full 611/606/3/2 with only the
  three inherited governance failures and the same 80-file manifest.
- [ ] Dual-autocrlf seven-path byte checks pass at the E1 source.
- [ ] E3 runs exactly once and proves all freshness, validity, cleanup and
  non-reuse requirements.
- [ ] E4 source-to-evidence range is exactly eight lifecycle paths and zero
  technical paths.
- [ ] Dedicated implementation audit returns P0/P1/P2=0/0/0.
- [ ] No acceptance, archive, integration, S6.3 or later gate occurs without a
  separate owner decision.

## Out of scope

- New Store, index, codec, fixture, process-envelope or Runtime behavior.
- Commands, transactions, history, undo/redo, selectors or providers.
- Product qualification, default cutover, RKP-3 creation, remote push.
- S6.3 execution or RKP-2 final completion.

## Open questions

None. Live repository evidence and the accepted prerequisite fix the scope.
