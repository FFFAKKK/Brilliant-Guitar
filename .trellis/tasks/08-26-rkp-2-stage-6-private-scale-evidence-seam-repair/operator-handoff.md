# Operator Handoff

## Current state

- Exact base: `4a302bc9f9981940336fc97941b08e09bd0d1f67`.
- First planning candidate: `df686882efa30f489da138d2730acbdd4fb9cd30`.
- First independent planning audit: RETURN FOR BOUNDED PLANNING REPAIR, P0/P1/P2=`0/2/0`.
- First bounded repair candidate: `176fd3670d3015631fc1553a59cc8e4d3a941221`.
- Second targeted planning review: RETURN FOR BOUNDED PLANNING REPAIR, P0/P1/P2=`0/1/0`, limited to the real owner-probe API and shutdown-primary contradiction.
- Second bounded repair candidate: `8d773b8e9d39ac21aba9cad715609fffc80eefec`.
- Final targeted planning review: RETURN FOR BOUNDED PLANNING REPAIR, P0/P1/P2=`0/1/0`, limited to contradictory cleanup ownership/status on `Start-Process` failure.
- This third docs-only bounded repair closes only that P1; final targeted rereview remains pending.
- Task remains `planning`; start/production authorization/candidate readiness false.
- RKP-2 S6.1 retained complete; S6.2/S6.3 false and operationally paused; TypeScript default.

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
