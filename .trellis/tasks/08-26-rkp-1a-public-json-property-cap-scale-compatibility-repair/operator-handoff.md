# Operator Handoff

## Current state

- Planning base: `639e93555c15b46c54c8e9bb7ec610d4a77c7478`.
- Task status `in_progress`; native `task.py start` has run; production/user authorization is true only for P0 activation and P1 Core Types bounded RED checkpoint.
- First independent planning review returned P0/P1/P2=`0/3/1`; the four findings have been bounded-repaired in planning authority.
- Targeted independent planning rereview accepted exact head `1cd0caadff218c1471f67cdf1a1ab78f5653a605` at P0/P1/P2=`0/0/0`; P0 committed at `39e91e86bf696a30cc77b42bd1ec5e2ae6cc4fbe` and P1 is complete as the exact bounded RED checkpoint.
- RKP-2 Stage 6 seam repair has E1/E1R green; E2/E3 not started; external blocker `public-json-property-cap-contract-conflict`.
- TypeScript remains default.

## Exact decision

Widen the one Core Types `JSON_PROPERTY_LIMIT` from `1,048,576` to `1,572,864`; Contracts imports it. Keep depth 64, request/response 64 MiB, 22 StableFailure variants and depth→property→shape→number precedence.

The old boundary and `oldCap+1` become compatible; `newCap+1` rejects with exact `1572864/1572865`. The native TypeScript validator in `rust-kernel-smoke.ts` is the fifth technical owner and must preserve that failure instead of returning `bridge.internal`. `strict-input-capture.ts` remains read-only at its separate member/element limit `1,048,576`.

P1 changes only Core Types and intentionally stops in the exact two-item bounded RED state recorded in `design.md`/`implement.md`; no additional failure is permitted. An independent P1 implementation audit and new authorization gate P2. P2 closes Contracts and native wire mapping, then independently audits again before P3. P2 rollback returns to P1 RED; rolling back P1 restores old-wire green.

The `1,199,235`-value frozen request must then pass real `decode_create_request`, native create/read/export and consumer regressions without fixture, E1 seam or E2 harness changes.

## Do not do

Do not enter P2-P4, edit Contracts/native/other production or tests, accept/archive/integrate, resume E2, push, qualify, cut over the runtime or create RKP-3. P1 may edit only `crates/brilliant-core-types/src/json.rs`; archived RKP-1 and active specs remain immutable.

## Next gate

Stop now for dedicated independent P1 implementation audit. Core Types is green at 6/6 with the sole cap `1_572_864`; Contracts is 15/16 with only `structural_rank_beats_source_order_for_compound_faults` failing its predecessor bytes, and `P1-RED-TS-NATIVE-SUCCESSOR-MAPPING` returns actual `bridge.internal`. P2 requires audit PASS plus separate user authorization.
