# Operator Handoff

## Current state

- Acceptance-projection candidate `f27daf7b514731adaabbe8f7814d2b57e12a7df7` passed its dedicated review and is now owner-accepted/archive-authorized.
- The new 334-byte review record is single-owned by `.trellis/tasks/08-31-rkp-2-e3-acceptance-archive-closure/task.json`, SHA-256 `8559f7aed98ddc45154f90dd459688530ba5e24efedeb573389e06ca7d099436`.
- Next action is the same-sequence native target archive clock preflight; S6.2/S6.3 remain false.
- E3 Workspace Law candidate `0c561d14193374436361eec09b361cab0170278a` received dedicated implementation audit PASS, P0/P1/P2=`0/0/0`.
- The sole canonical audit record is owned by the 08-31 law task; this Stage 6 task stores only its path and SHA-256 `dee0b92ce8a2ff6c8a9737c5b98104e39633b85aaad70e594f61e4847fdd7589`.
- Acceptance-projection technical commit `4abfef9b3f7620d6428382af287cccd662aa7bf7` preserves the historical 21-path candidate and produces an exact 18-path terminal transition.
- Dual-Node focused Workspace Law is `11/8/3`, with only the three unchanged historical fail-closed tests remaining.
- The transition is ready for a dedicated independent implementation review; it is not accepted, archived or integrated.
- RKP-2 S6.1 remains retained complete; S6.2/S6.3 are false and operationally paused; TypeScript remains default.

## Frozen ownership

Future technical ownership remains exactly five paths. Planning authority is now nine immutable files whose LF-normalized UTF-8 SHA-256 values live only in child `task.json`. E0-E3 may mutate exactly eight lifecycle paths: child task/handoff/review/future implementation evidence, RKP-2 parent task/handoff/review, and Rust parent task. Any ninth path or any immutable digest change fails closed.

## Exact v1 seam and worker

- FQN `indices::tests::rkp2_stage_6_private_scale_evidence_v1`.
- Request env `BRILLIANT_RKP2_SCALE_REQUEST_V1`.
- Compile command and Cargo artifact predicate are literal; exactly one absolute existing Runtime libtest `.exe`.
- Execution uses `--exact`, `--ignored`, `--nocapture`, `--test-threads=1`.
- Entity `cvn7-e-00-0000-0-0` is resolved by real `store.lookup_entity(&stable_id)` between `store.metrics` snapshots; then `store.indices.lookup_owner(entity, &mut Rkp2StoreMetrics::default())` is called directly. Separate `entityProbe` and `ownerProbe` records prove exact deltas without changing import/rebuild totals.
- Rust prefix `BRILLIANT_RKP2_SCALE_RUST_V1:` and process prefix `BRILLIANT_RKP2_SCALE_PROCESS_V1:` each occur exactly once on success.
- Exact success/rejection shapes, sixteen-code primary union, shutdown secondary statuses and first-failure precedence are in immutable `design.md`.
- PowerShell named args are fixed at timeout `180000`, poll `25`, stdout/stderr caps `1048576`; env restoration, hidden process, refresh/RSS, output caps, tree termination, `5000ms` reap and redirect flush are mandatory. After validated handoff PowerShell is the sole cleanup owner, cleans `request -> stdout -> stderr -> root` with at most two attempts and `25ms` retry, records only `cleanupStatus=succeeded|failed`, and emits the final sentinel after cleanup.
- Rejection has `partialEvidence=false`, no internal evidence, raw stream, path, backtrace or partial counter.

## Stage order

E0 lifecycle activation only. E1 compiles and proves the seam with a small existing Rust fixture but does not consume a stress request. E2 is the sole fixture/request owner, runs hostile protocol tests and one real stress integration. E3 creates a fresh request, reruns and freezes candidate evidence. Each commit is independently reversible.

## Baseline evidence

Clean base: TypeScript `78` files, manifest `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`, `582/581/1/0`; Rust `73/73` with fmt/check/clippy/MSRV; native `17/17`. Candidate workspace law remains intentionally fail-closed at `6/9`, all three failures naming the same unaccepted child path.

## Next action

Final targeted independent planning rereview accepted exact authority head `d638b81a3c9b3d7461f75a91c8d5b090f06adea2` with P0/P1/P2=`0/0/0` and verdict `PASS FOR BOUNDED IMPLEMENTATION`. The user separately authorized this child's E0-E3 implementation. Native `task.py start` completed; E0 is active/complete, candidate readiness remains false and implementation review remains pending.

Proceed only to E1 using the frozen five-path technical and eight-path mutable lifecycle allowlists. RKP-2 S6.1 stays retained complete while S6.2/S6.3 remain false and operationally paused; TypeScript remains the default runtime. No acceptance, archive, integration, push, qualification, cutover or RKP-3 is authorized.

## E1 private Rust seam complete

- The `cfg(test)` Runtime seam is implemented only in `indices.rs`; exact FQN, request env and internal prefix match the accepted authority.
- The small real fixture proves Contracts decode, atomic Store import, separated entity/owner probes, parity rebuild, one export, one canonical encode and zero persistent materialization/byte counters.
- E1 gates: focused `1/1`; exact Cargo artifact `1`; Clippy and MSRV pass; fresh `core.autocrlf=false` E: clone passes Runtime `16/16` with the stress test intentionally ignored.
- E2 has not started. Candidate readiness remains false; RKP-2 S6.2/S6.3 remain paused and TypeScript stays default.

## E3 fresh evidence candidate freeze

The user explicitly authorized E3 after the fifth E2 repair passed its dedicated independent rereview. A new request was generated from the sole stress fixture at source HEAD `4ad23773e9c9e1081667a4eccb84cc464b85bc89`; no E2 request or output was reused. Cargo was resolved again and the complete Rust worker journey returned `status=ok`.

The frozen result is `102400` Events / `51200` Notes, exact index and owner probes, `474517/474517` import/rebuild entries, semantic and canonical-byte parity, deterministic topology and extension preservation. Rust workload time was `12964590 us`, end-to-end worker time `14077309 us`, and peak working set `821886976` bytes. Exit/reap/cleanup were `0/succeeded/succeeded`, timeout was false and partial evidence was false. The exact protocol and input manifest are in `research/implementation-evidence.md`.

This child remains `in_progress` and is now ready only for a dedicated independent implementation review. RKP-2 stays paused before S6.2; S6.2/S6.3, acceptance, archive, integration, qualification, cutover, push and RKP-3 remain unstarted.

## Acceptance-projection current gate

The dedicated E3 Workspace Law implementation review has now passed and is bound to the single audit record described above. The next and only live gate is a fresh read-only review of the acceptance-projection candidate. No E3 stress rerun occurred, and the PASS did not authorize acceptance, archive, integration, S6.2/S6.3, qualification, runtime cutover, push or RKP-3.
