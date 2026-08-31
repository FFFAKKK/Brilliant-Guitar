# Private Scale Evidence Seam Repair — Targeted Planning Rereview Candidate

## Current implementation state

Exact planning authority `d638b81a3c9b3d7461f75a91c8d5b090f06adea2` received `PASS FOR BOUNDED IMPLEMENTATION`, P0/P1/P2=`0/0/0`, from the dedicated independent planning auditor. E1 through E3 later completed, and frozen E3 Workspace Law candidate `0c561d14193374436361eec09b361cab0170278a` received its own dedicated implementation audit PASS with P0/P1/P2=`0/0/0`.

The first candidate `df686882efa30f489da138d2730acbdd4fb9cd30` received P0/P1/P2=`0/2/0`. This bounded repair closes only:

1. implementation-time planning authority mutability;
2. unresolved private libtest, owner-probe, sentinel, process and failure-protocol decisions.

Acceptance-projection technical commit `4abfef9b3f7620d6428382af287cccd662aa7bf7` binds that PASS to one canonical record and an exact 18-path transition. Acceptance, archive, integration, push, Stage 6 S6.2/S6.3, cutover, qualification and RKP-3 remain unclaimed.

The first bounded repair candidate `176fd3670d3015631fc1553a59cc8e4d3a941221` received a second targeted result P0/P1/P2=`0/1/0`. The second repair candidate `8d773b8e9d39ac21aba9cad715609fffc80eefec` then received the final targeted result P0/P1/P2=`0/1/0`, limited to its contradiction between post-handoff wrapper ownership and a start-failure envelope that incorrectly claimed cleanup had not run. This third repair changes only that cleanup ownership/status contract.

## P1-1 closure

Nine named planning files are immutable after this commit. Their LF-normalized UTF-8 SHA-256 digests are recorded in `task.json.meta.immutable_planning_authority` and must be mechanically recomputed during every E0-E3 gate. The mutable lifecycle allowlist is exactly eight named paths. The future technical allowlist remains exactly five. A changed immutable digest, sixth technical path or ninth lifecycle path fails closed.

## P1-2 closure

- Exact libtest: `indices::tests::rkp2_stage_6_private_scale_evidence_v1`.
- Exact env: `BRILLIANT_RKP2_SCALE_REQUEST_V1`.
- Exact Cargo command/artifact predicate and exact execution argv are frozen.
- Exact two-step owner probe snapshots `store.metrics`, calls real `store.lookup_entity(&stable_id)`, snapshots again, then uses a fresh `Rkp2StoreMetrics::default()` with `store.indices.lookup_owner(entity, &mut owner_probe_metrics)`. Separate `entityProbe`/`ownerProbe` records prove the exact deltas and stay outside import/rebuild totals.
- Exact Rust/process prefixes, internal success shape, final success/rejection shapes, numeric ranges and forbidden fields are frozen.
- A closed sixteen-code primary failure/details union and exact first-failure precedence are frozen. Termination/reap live only in `terminationStatus`/`reapStatus`; cleanup is exactly `succeeded|failed`; none replaces an earlier primary.
- TypeScript validates before TEMP allocation and owns only pre-handoff failures. After handoff PowerShell solely owns request/stdout/stderr/root cleanup, including `Start-Process` failure, uses exact order/two attempts/`25ms`, and generates the external final sentinel only after cleanup status is known.
- PowerShell parameter types/values, exact `pwsh` call, temporary env, hidden child, per-poll refresh/RSS/caps, timeout/tree termination/reap and redirect flush are frozen.
- E1 has no stress request; E2 owns sole fixture/request generation and first real run; E3 uses a fresh request for evidence freeze.

## Invariants retained

Single fixture owner, exact `102400` Events / `51200` Notes / `18` Extensions, bytes `15013904/15013932`, frozen counters, five technical paths, S6.1 retained, S6.2/S6.3 false, TypeScript default and candidate workspace-law `6/9` fail-closed state remain unchanged.

## Review focus

1. all nine hash inputs and eight mutable paths are exact and non-overlapping;
2. Cargo predicate yields exactly one Windows libtest and no filename heuristic;
3. owner probe matches the real method signatures, produces two distinct records and cannot double-count entity lookup;
4. internal/final shapes and all failure details contain no open field;
5. cap/timeout/start remain primary through later shutdown/cleanup failure, clean-path cleanup alone maps to `process.cleanup-failed`, and every rejection has zero partial evidence;
6. wrapper cleanup is sole-owner, exact-order, two-attempt/`25ms`, reports only `succeeded|failed`, and precedes the sole external sentinel;
7. E1/E2/E3 request/evidence ownership is executable without a sixth technical path;
8. parent projections keep S6.1 and pause S6.2/S6.3.

## E1 private Rust seam complete

- The `cfg(test)` Runtime seam is implemented only in `indices.rs`; exact FQN, request env and internal prefix match the accepted authority.
- The small real fixture proves Contracts decode, atomic Store import, separated entity/owner probes, parity rebuild, one export, one canonical encode and zero persistent materialization/byte counters.
- E1 gates: focused `1/1`; exact Cargo artifact `1`; Clippy and MSRV pass; fresh `core.autocrlf=false` E: clone passes Runtime `16/16` with the stress test intentionally ignored.
- E2 has not started. Candidate readiness remains false; RKP-2 S6.2/S6.3 remain paused and TypeScript stays default.

## E3 implementation candidate

**READY FOR DEDICATED INDEPENDENT IMPLEMENTATION REVIEW**

The separately authorized E3 run used a fresh request at source HEAD `4ad23773e9c9e1081667a4eccb84cc464b85bc89` and returned the exact successful process protocol frozen in `research/implementation-evidence.md`. The protocol hash is `64e09779ea34bd04d504d515eb7c391f7db35a0a23a3c366fb2ffb5aa71c2862`; the worker completed in `14077309 us` with peak working set `821886976` bytes, no timeout, successful reap/cleanup and no partial evidence.

Review must verify the fresh-request boundary, six-file input manifest, exact protocol, all nine immutable planning hashes, lifecycle-only E3 diff, retained TypeScript default and the unchanged false S6.2/S6.3 gates. A technical PASS would authorize only a later owner acceptance decision; it does not itself archive, integrate, qualify, cut over, push or start RKP-3.

## Acceptance-projection review candidate

**READY FOR DEDICATED INDEPENDENT ACCEPTANCE-PROJECTION IMPLEMENTATION REVIEW**

The E3 audit record remains owned only by the 08-31 Workspace Law task and canonicalizes to 323 UTF-8 bytes with SHA-256 `dee0b92ce8a2ff6c8a9737c5b98104e39633b85aaad70e594f61e4847fdd7589`. This Stage 6 task stores only its owner path and digest. Review must pin the terminal candidate HEAD, verify historical 21-path and transition 18-path sets, reproduce dual-Node `11/8/3`, and confirm every later lifecycle flag remains false. The candidate remains `in_progress` and unaccepted.
