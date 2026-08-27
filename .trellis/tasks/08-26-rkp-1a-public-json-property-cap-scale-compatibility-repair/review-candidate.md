# Review Candidate — RKP-1A Public JSON Property-Cap Scale Compatibility Repair

## Status

READY FOR TARGETED P4-ENTRY PLANNING REVIEW.

Exact planning head `1cd0caadff218c1471f67cdf1a1ab78f5653a605`, exact P1 head `712c6dbb0b7556b4c345fab9ad8215fdbcec6990` and exact P2 head `0f65272951fd23080b6f536b2e58f50afe249b02` each passed their required independent review at P0/P1/P2=`0/0/0`. A no-commit P3 attempt was reverted. Independent root-cause audit returned `0/2/0`; first amendment `978160e...` returned `0/1/1`, and its repair `14023029878be7c785ac0de7828628c5e3f4f8b1` returned `0/2/0` for CommonJS entry and Windows settlement. P3A and P3B subsequently completed their bounded implementation gates; P3B's independently reviewed parent is `e4103b779574fcdc728d024c1b8f30244cb332c3`. The P4-entry audit returned `0/1/0`; this A docs-only repair is the targeted planning review candidate. P4 B remains unauthorized.

## Candidate claims

1. Exact request size is `1,199,235` counted JSON values; `1,048,577` was only first overflow.
2. `1,572,864` is the finite successor with `373,629` values / `31.156%` headroom.
3. Core Types stays the sole numeric owner and Contracts stays a consumer.
4. Stable failure 22, `codec.property-limit`, exact fields, depth 64, 64 MiB caps and precedence are unchanged.
5. The frozen fixture and RKP-2 E1/E1R are untouched; E2 remains blocked.
6. The cumulative future technical allowlist is exactly seven paths. `captureStrictInput` owns a closed default/native profile; both create and response native captures select `native-wire-v1`; `indices.rs` is excluded.
7. P1 and P2 each stop for independent implementation audit; P2 rollback returns to audited P1 RED, not directly to a green predecessor.
8. The first planning review P0/P1/P2=`0/3/1` is recorded and bounded; exact repaired head `1cd0caa...` passed targeted rereview at `0/0/0`.
9. A is directly parented by `e4103b7`, changes exactly thirteen planning/projection paths and does not hard-code its own hash or change workspace-law.
10. Only accepted A plus separate authority permits B: B has exactly seven lifecycle owners plus the one mechanical workspace-law path, freezes the six-node chain and may set candidate-ready without acceptance/archive/integration/E2.

## Amended P3 contracts

P3A has exactly five incremental technical paths: `strict-input-capture.ts`, `rust-kernel-smoke.ts`, `cvn-3-strict-input.test.ts`, the RKP-1A compatibility test and RKP-2 workspace-law. It freezes default/native boundaries, direct DAG and JSON-cloned create, public read and hostile capture behavior, then stops for independent audit.

P3B technically changes only the RKP-1A compatibility test, with workspace-law projection only if required. That same CommonJS file is the sole normal test and direct self-worker; no helper path exists. Its exact `__filename` direct entry, argv/env/absent-`NODE_TEST_CONTEXT` guard, one compact sentinel schema, stream caps, 180000 ms timer, first-observed primary, exact taskkill/reap secondary states and recovered/two-failure cleanup matrix are frozen in design section 12.1. It proves real decoder/raw+public journeys, repeated reads, semantic equality and exact SHA roles. Input SHA is `5a8a318e58bc08a82a822c166ed11239ed4ed7b9ea45d50bb7dcb81d7c57f91e`; Rust canonical export SHA is `4d8597437cc8b07df6cfef9400086218636adb27257ad72d055e1e3a3deafff7`. Both are `15,013,904` bytes but are not raw-byte equal.

## P4 entry contract

A is planning-only. B must be directly parented by accepted A and changes exactly eight paths: the original seven lifecycle owners plus `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`, which only projects mechanical governance. Workspace-law must retain the historical `bd8946e → f06c57b → 673a2b9 → e4103b7` segment/cumulative gates, assert `e4103b7..A` is exactly the thirteen A paths and `A..HEAD` is exactly B's eight paths, and reject self-hash, merge, empty/extra commit, wildcard and directory exemption. Candidate-ready may be set only in B; review stays pending. A later rollback is a separately planned eight-path governance descendant restoring the seven lifecycle paths to A not-ready state and locking B→rollback, not a revert of A.

## Audit focus

- Recompute the node-count table and headroom.
- Confirm one live authority and exact failure precedence.
- Challenge inclusive edges, exact actual semantics and bounded scan-only behavior.
- Confirm both P1 bounded REDs are GREEN and the P2 audit gates P3.
- Confirm default capture remains byte-identical at `1,048,576`, `native-wire-v1` is `1,572,864`, and both native create/read calls select it without duplicate numbers.
- Confirm exact document/create/read value/member counts and DAG versus cloned-tree coverage.
- Confirm P3B proves real decoder/native behavior without a second fixture or admission path and never treats the raw input SHA as Foundation canonical.
- Confirm the one compatibility test is the only P3B source/worker, CommonJS `__filename` compiles without ESM, exact argv/env plus absent `NODE_TEST_CONTEXT` cannot recurse, and partial markers fail before spawn.
- Validate the exact sentinel shape and caps plus first-observed ordering in both directions, exact taskkill launch/nonzero/timeout and reap-timeout secondary states, cleanup recovery/two-failure, bounded settlement and zero partial publication.
- Confirm all request/result/stdout/stderr artifacts resolve under E: scratch and no partial success is published before cleanup.
- Confirm P2 head `0f652729...` already owns the successor wire validator; P3A changes only capture profile and its two call-site selections.
- Confirm P3A/P3B are audited history through `e4103b7`; check P4 is not started and only exact A planning review can permit separately authorized B. RKP-2 S6.2/S6.3 remain false.
- Verify `json.rs` is byte-zero relative to audited P1 and remains the sole `JSON_PROPERTY_LIMIT` owner at `1_572_864`; Contracts imports it directly and is 17/17. Verify new-cap inclusive/exclusive boundaries, exact `1572864/1572865` wire, depth→property→shape→number precedence, bounded scan-only retention and 64 MiB caps.
- Verify the dedicated TypeScript test uses the production adapter: exact successor fake and real native envelopes preserve `codec.property-limit`, while predecessor, extra, missing and wrong-type variants remain `bridge.internal`; the real rejection publishes no handle.
- Verify the exact seven-path cumulative technical allowlist excludes `indices.rs`, fixture, encoder, Cargo/package/spec/archive paths; A changes exactly thirteen planning/projection paths, and B's future eighth governance path is not a lifecycle owner.
- Verify Stage6 follow-up remains a later independent docs-only authority amendment followed by planning review, E1R2 audit and separate E2 authorization.

## Validation note

Typecheck/build pass. Clean first-amendment head `978160e69b69d643c3d61ca946bde10bfe4aefb0` discovers 79 files with manifest `afbd0246012b61c3670b31cc01180c4a90586e30ac3ff177d91cddfc2eb09357`: 584 discovered / 580 pass / 1 expected GC skip / 3 known workspace-law fail-closed results. The same three governance test names fail at `6/9`; their first rejected path is the unaccepted RKP-1A child `check.jsonl`. No product, capture, native or codec test fails.

The older source/candidate characterization remains historical evidence: source `639e935...` first rejected the unaccepted Stage-6 child `check.jsonl`, while candidate `c02c830...` first rejected the unaccepted RKP-1A child `check.jsonl`. Both were expected fail-closed governance evidence. This repair still does not edit or relax workspace-law.

P2 focused evidence remains GREEN: Core Types 6/6, Contracts 17/17 and the dedicated fake/real native compatibility suite 2/2. This planning amendment changes no production/test path. The same three unaccepted-child workspace-law failures remain separately attributed and are not relaxed or called green.
