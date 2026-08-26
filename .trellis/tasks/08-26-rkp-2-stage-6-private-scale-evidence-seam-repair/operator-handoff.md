# Operator Handoff

## Current state

- Exact base: `4a302bc9f9981940336fc97941b08e09bd0d1f67`.
- First planning candidate: `df686882efa30f489da138d2730acbdd4fb9cd30`.
- First independent planning audit: RETURN FOR BOUNDED PLANNING REPAIR, P0/P1/P2=`0/2/0`.
- This docs-only bounded repair closes mutable-authority and incomplete-worker-protocol findings; targeted rereview remains pending.
- Task remains `planning`; start/production authorization/candidate readiness false.
- RKP-2 S6.1 retained complete; S6.2/S6.3 false and operationally paused; TypeScript default.

## Frozen ownership

Future technical ownership remains exactly five paths. Planning authority is now nine immutable files whose LF-normalized UTF-8 SHA-256 values live only in child `task.json`. E0-E3 may mutate exactly eight lifecycle paths: child task/handoff/review/future implementation evidence, RKP-2 parent task/handoff/review, and Rust parent task. Any ninth path or any immutable digest change fails closed.

## Exact v1 seam and worker

- FQN `indices::tests::rkp2_stage_6_private_scale_evidence_v1`.
- Request env `BRILLIANT_RKP2_SCALE_REQUEST_V1`.
- Compile command and Cargo artifact predicate are literal; exactly one absolute existing Runtime libtest `.exe`.
- Execution uses `--exact`, `--ignored`, `--nocapture`, `--test-threads=1`.
- Entity `cvn7-e-00-0000-0-0` is resolved once, then private `DerivedIndices::lookup_owner` is called directly from a fresh metrics snapshot; deltas `1/1/0` and Voice owner `cvn7-v-00-0000-0` are exact.
- Rust prefix `BRILLIANT_RKP2_SCALE_RUST_V1:` and process prefix `BRILLIANT_RKP2_SCALE_PROCESS_V1:` each occur exactly once on success.
- Exact success/rejection shapes, closed 18-code details union and first-failure precedence are in immutable `design.md`.
- PowerShell named args are fixed at timeout `180000`, poll `25`, stdout/stderr caps `1048576`; env restoration, hidden process, refresh/RSS, output caps, tree termination, `5000ms` reap, redirect flush and cleanup are mandatory.
- Rejection has `partialEvidence=false`, no internal evidence, raw stream, path, backtrace or partial counter.

## Stage order

E0 lifecycle activation only. E1 compiles and proves the seam with a small existing Rust fixture but does not consume a stress request. E2 is the sole fixture/request owner, runs hostile protocol tests and one real stress integration. E3 creates a fresh request, reruns and freezes candidate evidence. Each commit is independently reversible.

## Baseline evidence

Clean base: TypeScript `78` files, manifest `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`, `582/581/1/0`; Rust `73/73` with fmt/check/clippy/MSRV; native `17/17`. Candidate workspace law remains intentionally fail-closed at `6/9`, all three failures naming the same unaccepted child path.

## Next action

Send the exact repaired planning HEAD to the same dedicated read-only auditor. Review the nine hash map, eight mutable paths, exact artifact/argv, direct owner probe, complete protocol/failure union, first-failure cleanup rules and E1/E2/E3 request ownership. Do not start or implement before targeted PASS and new authorization.
