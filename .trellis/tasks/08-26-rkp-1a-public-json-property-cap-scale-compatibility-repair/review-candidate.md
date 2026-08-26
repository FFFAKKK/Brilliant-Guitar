# Review Candidate — RKP-1A Public JSON Property-Cap Scale Compatibility Repair

## Status

P0 ACTIVATED — P1 CORE TYPES BOUNDED RED CHECKPOINT AUTHORIZED.

Exact planning head `1cd0caadff218c1471f67cdf1a1ab78f5653a605` passed targeted independent planning rereview at P0/P1/P2=`0/0/0`. User authorization is limited to P0 and P1; P2-P4 remain unauthorized.

## Candidate claims

1. Exact request size is `1,199,235` counted JSON values; `1,048,577` was only first overflow.
2. `1,572,864` is the finite successor with `373,629` values / `31.156%` headroom.
3. Core Types stays the sole numeric owner and Contracts stays a consumer.
4. Stable failure 22, `codec.property-limit`, exact fields, depth 64, 64 MiB caps and precedence are unchanged.
5. The frozen fixture and RKP-2 E1/E1R are untouched; E2 remains blocked.
6. `rust-kernel-smoke.ts` is the fifth technical path because it validates the native failure limit; `strict-input-capture.ts` remains a read-only different counting contract.
7. P1 and P2 each stop for independent implementation audit; P2 rollback returns to audited P1 RED, not directly to a green predecessor.
8. The first planning review P0/P1/P2=`0/3/1` is recorded and bounded; exact repaired head `1cd0caa...` passed targeted rereview at `0/0/0`.

## Planning range

Relative to `639e93555c15b46c54c8e9bb7ec610d4a77c7478`, the exact planning allowlist is 12 child artifacts plus three task-state projections. Production, tests, Cargo/package/tsconfig/toolchain, active specs and archived authorities are zero-delta.

## Audit focus

- Recompute the node-count table and headroom.
- Confirm one live authority and exact failure precedence.
- Challenge inclusive edges, exact actual semantics and bounded scan-only behavior.
- Confirm P1's exact bounded RED allowlist, audit stop and two-step rollback; confirm P2 audit gates P3.
- Confirm the native TypeScript wire consumer changes while `strict-input-capture.ts` remains read-only.
- Confirm P3 proves real decoder/native behavior without a second fixture or admission path.
- Confirm RKP-2 S6.2/S6.3 remain false and all lifecycle permissions stay closed.

## Validation note

Typecheck/build pass. Clean source `639e935...` and planning candidate `c02c830...` each discover 78 files with manifest `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`, 582 discovered / 578 pass / 1 expected GC skip / 3 known workspace-law fail-closed results; the same three test names fail at `6/9` and no product/native/codec test fails.

The first rejected path is not the same: source `639e935...` first rejects the unaccepted Stage-6 child `check.jsonl`; candidate `c02c830...` first rejects the unaccepted RKP-1A child `check.jsonl`. Both are expected fail-closed governance evidence; workspace-law remains byte-zero in this planning repair.
