# Review Candidate — RKP-1A Public JSON Property-Cap Scale Compatibility Repair

## Status

READY FOR TARGETED PLANNING REREVIEW.

Exact planning head `1cd0caadff218c1471f67cdf1a1ab78f5653a605`, exact P1 head `712c6dbb0b7556b4c345fab9ad8215fdbcec6990` and exact P2 head `0f65272951fd23080b6f536b2e58f50afe249b02` each passed their required independent review at P0/P1/P2=`0/0/0`. A no-commit P3 attempt was reverted. Independent root-cause audit returned `0/2/0`; this docs-only amendment is the targeted planning rereview candidate. P3A/P3B/P4 remain unauthorized.

## Candidate claims

1. Exact request size is `1,199,235` counted JSON values; `1,048,577` was only first overflow.
2. `1,572,864` is the finite successor with `373,629` values / `31.156%` headroom.
3. Core Types stays the sole numeric owner and Contracts stays a consumer.
4. Stable failure 22, `codec.property-limit`, exact fields, depth 64, 64 MiB caps and precedence are unchanged.
5. The frozen fixture and RKP-2 E1/E1R are untouched; E2 remains blocked.
6. The cumulative future technical allowlist is exactly seven paths. `captureStrictInput` owns a closed default/native profile; both create and response native captures select `native-wire-v1`; `indices.rs` is excluded.
7. P1 and P2 each stop for independent implementation audit; P2 rollback returns to audited P1 RED, not directly to a green predecessor.
8. The first planning review P0/P1/P2=`0/3/1` is recorded and bounded; exact repaired head `1cd0caa...` passed targeted rereview at `0/0/0`.

## Amended P3 contracts

P3A has exactly five incremental technical paths: `strict-input-capture.ts`, `rust-kernel-smoke.ts`, `cvn-3-strict-input.test.ts`, the RKP-1A compatibility test and RKP-2 workspace-law. It freezes default/native boundaries, direct DAG and JSON-cloned create, public read and hostile capture behavior, then stops for independent audit.

P3B technically changes only the RKP-1A compatibility test, with workspace-law projection only if required. It proves real decoder/raw+public journeys, repeated reads, semantic equality and exact SHA roles. Input SHA is `5a8a318e58bc08a82a822c166ed11239ed4ed7b9ea45d50bb7dcb81d7c57f91e`; Rust canonical export SHA is `4d8597437cc8b07df6cfef9400086218636adb27257ad72d055e1e3a3deafff7`. Both are `15,013,904` bytes but are not raw-byte equal.

## Audit focus

- Recompute the node-count table and headroom.
- Confirm one live authority and exact failure precedence.
- Challenge inclusive edges, exact actual semantics and bounded scan-only behavior.
- Confirm both P1 bounded REDs are GREEN and the P2 audit gates P3.
- Confirm default capture remains byte-identical at `1,048,576`, `native-wire-v1` is `1,572,864`, and both native create/read calls select it without duplicate numbers.
- Confirm exact document/create/read value/member counts and DAG versus cloned-tree coverage.
- Confirm P3B proves real decoder/native behavior without a second fixture or admission path and never treats the raw input SHA as Foundation canonical.
- Confirm P3A and P3B each stop for independent audit and separate authorization; RKP-2 S6.2/S6.3 remain false.
- Verify `json.rs` is byte-zero relative to audited P1 and remains the sole `JSON_PROPERTY_LIMIT` owner at `1_572_864`; Contracts imports it directly and is 17/17. Verify new-cap inclusive/exclusive boundaries, exact `1572864/1572865` wire, depth→property→shape→number precedence, bounded scan-only retention and 64 MiB caps.
- Verify the dedicated TypeScript test uses the production adapter: exact successor fake and real native envelopes preserve `codec.property-limit`, while predecessor, extra, missing and wrong-type variants remain `bridge.internal`; the real rejection publishes no handle.
- Verify the exact seven-path cumulative allowlist excludes `indices.rs`, fixture, encoder, Cargo/package/spec/archive paths; this amendment changes only 16 docs/governance paths.
- Verify Stage6 follow-up remains a later independent docs-only authority amendment followed by planning review, E1R2 audit and separate E2 authorization.

## Validation note

Typecheck/build pass. Clean source `639e935...` and planning candidate `c02c830...` each discover 78 files with manifest `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`, 582 discovered / 578 pass / 1 expected GC skip / 3 known workspace-law fail-closed results; the same three test names fail at `6/9` and no product/native/codec test fails.

The first rejected path is not the same: source `639e935...` first rejects the unaccepted Stage-6 child `check.jsonl`; candidate `c02c830...` first rejects the unaccepted RKP-1A child `check.jsonl`. Both are expected fail-closed governance evidence; workspace-law remains byte-zero in this planning repair.

P2 focused evidence remains GREEN: Core Types 6/6, Contracts 17/17 and the dedicated fake/real native compatibility suite 2/2. This planning amendment changes no production/test path. The same three unaccepted-child workspace-law failures remain separately attributed and are not relaxed or called green.
