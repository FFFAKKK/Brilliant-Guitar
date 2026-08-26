# Review Candidate — RKP-1A Public JSON Property-Cap Scale Compatibility Repair

## Status

READY FOR INDEPENDENT PLANNING REVIEW.

This candidate is planning-only and does not authorize activation or implementation.

## Candidate claims

1. Exact request size is `1,199,235` counted JSON values; `1,048,577` was only first overflow.
2. `1,572,864` is the finite successor with `373,629` values / `31.156%` headroom.
3. Core Types stays the sole numeric owner and Contracts stays a consumer.
4. Stable failure 22, `codec.property-limit`, exact fields, depth 64, 64 MiB caps and precedence are unchanged.
5. The frozen fixture and RKP-2 E1/E1R are untouched; E2 remains blocked.
6. Future implementation is four technical paths across P0-P4 rollback commits.

## Planning range

Relative to `639e93555c15b46c54c8e9bb7ec610d4a77c7478`, the exact planning allowlist is 12 child artifacts plus three task-state projections. Production, tests, Cargo/package/tsconfig/toolchain, active specs and archived authorities are zero-delta.

## Audit focus

- Recompute the node-count table and headroom.
- Confirm one live authority and exact failure precedence.
- Challenge inclusive edges, exact actual semantics and bounded scan-only behavior.
- Confirm P3 proves real decoder/native behavior without a second fixture or admission path.
- Confirm RKP-2 S6.2/S6.3 remain false and all lifecycle permissions stay closed.

## Validation note

Typecheck/build pass. Clean source full baseline is 78 files, manifest `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`, 582 discovered / 578 pass / 1 expected GC skip / 3 known workspace-law fail-closed results. Those three are the pre-existing `6/9` unaccepted Stage-6 child projection, not product failures; this planning range leaves the workspace-law test byte-zero.
