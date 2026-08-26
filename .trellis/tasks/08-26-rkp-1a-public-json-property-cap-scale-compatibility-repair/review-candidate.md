# Review Candidate — RKP-1A Public JSON Property-Cap Scale Compatibility Repair

## Status

P2 SUCCESSOR WIRE COMPLETE — INDEPENDENT IMPLEMENTATION AUDIT REQUIRED.

Exact planning head `1cd0caadff218c1471f67cdf1a1ab78f5653a605` passed targeted independent planning rereview at P0/P1/P2=`0/0/0`. Exact P1 head `712c6dbb0b7556b4c345fab9ad8215fdbcec6990` passed independent implementation audit at `0/0/0`. P2 is a single child commit that makes both bounded REDs GREEN and now stops for independent P2 audit; P3-P4 remain unauthorized.

## Candidate claims

1. Exact request size is `1,199,235` counted JSON values; `1,048,577` was only first overflow.
2. `1,572,864` is the finite successor with `373,629` values / `31.156%` headroom.
3. Core Types stays the sole numeric owner and Contracts stays a consumer.
4. Stable failure 22, `codec.property-limit`, exact fields, depth 64, 64 MiB caps and precedence are unchanged.
5. The frozen fixture and RKP-2 E1/E1R are untouched; E2 remains blocked.
6. `rust-kernel-smoke.ts` is the fifth technical path because it validates the native failure limit; `strict-input-capture.ts` remains a read-only different counting contract.
7. P1 and P2 each stop for independent implementation audit; P2 rollback returns to audited P1 RED, not directly to a green predecessor.
8. The first planning review P0/P1/P2=`0/3/1` is recorded and bounded; exact repaired head `1cd0caa...` passed targeted rereview at `0/0/0`.

## P2 range

Relative to audited P1 head `712c6dbb0b7556b4c345fab9ad8215fdbcec6990`, the exact P2 technical range is `crates/brilliant-kernel-contracts/src/codec.rs`, `src/core-kernel/native/rust-kernel-smoke.ts` and `test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts`, plus the seven accepted lifecycle/evidence paths. Core Types, strict-input capture, workspace-law, fixture, Runtime/Session/Node native source, Cargo/package/tsconfig/toolchain, specs and archives are byte-zero.

## Audit focus

- Recompute the node-count table and headroom.
- Confirm one live authority and exact failure precedence.
- Challenge inclusive edges, exact actual semantics and bounded scan-only behavior.
- Confirm both P1 bounded REDs are GREEN and the P2 audit gates P3.
- Confirm the native TypeScript wire consumer changes while `strict-input-capture.ts` remains read-only.
- Confirm P3 proves real decoder/native behavior without a second fixture or admission path.
- Confirm RKP-2 S6.2/S6.3 remain false and all lifecycle permissions stay closed.
- Verify `json.rs` is byte-zero relative to audited P1 and remains the sole `JSON_PROPERTY_LIMIT` owner at `1_572_864`; Contracts imports it directly and is 17/17. Verify new-cap inclusive/exclusive boundaries, exact `1572864/1572865` wire, depth→property→shape→number precedence, bounded scan-only retention and 64 MiB caps.
- Verify the dedicated TypeScript test uses the production adapter: exact successor fake and real native envelopes preserve `codec.property-limit`, while predecessor, extra, missing and wrong-type variants remain `bridge.internal`; the real rejection publishes no handle.
- Verify the P2 parent is exact audited P1, so reverting this one commit mechanically restores the two audited REDs; P1 rollback alone restores predecessor-wire green.

## Validation note

Typecheck/build pass. Clean source `639e935...` and planning candidate `c02c830...` each discover 78 files with manifest `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`, 582 discovered / 578 pass / 1 expected GC skip / 3 known workspace-law fail-closed results; the same three test names fail at `6/9` and no product/native/codec test fails.

The first rejected path is not the same: source `639e935...` first rejects the unaccepted Stage-6 child `check.jsonl`; candidate `c02c830...` first rejects the unaccepted RKP-1A child `check.jsonl`. Both are expected fail-closed governance evidence; workspace-law remains byte-zero in this planning repair.

P2 focused evidence is GREEN: Core Types 6/6, Contracts 17/17 and the dedicated fake/real native compatibility suite 2/2. Clean-head full-runner totals and the E-only LF Rust checkout result are reported with the exact P2 commit; the same three unaccepted-child workspace-law failures remain separately attributed and are not relaxed.
