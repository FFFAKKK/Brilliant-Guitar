# Operator Handoff

## Current state

- Planning base: `639e93555c15b46c54c8e9bb7ec610d4a77c7478`.
- Task status `in_progress`; native `task.py start` has run; production/user authorization covers only P0, audited P1 and the now-complete P2 successor-wire closure. P3-P4 are not authorized.
- First independent planning review returned P0/P1/P2=`0/3/1`; the four findings have been bounded-repaired in planning authority.
- Targeted independent planning rereview accepted exact head `1cd0caadff218c1471f67cdf1a1ab78f5653a605` at P0/P1/P2=`0/0/0`; P0 committed at `39e91e86bf696a30cc77b42bd1ec5e2ae6cc4fbe`. The exact P1 candidate `712c6dbb0b7556b4c345fab9ad8215fdbcec6990` passed its independent implementation audit at `0/0/0`, and P2 now closes the two audited REDs.
- RKP-2 Stage 6 seam repair has E1/E1R green; E2/E3 not started; external blocker `public-json-property-cap-contract-conflict`.
- TypeScript remains default.

## Exact decision

Widen the one Core Types `JSON_PROPERTY_LIMIT` from `1,048,576` to `1,572,864`; Contracts imports it. Keep depth 64, request/response 64 MiB, 22 StableFailure variants and depth→property→shape→number precedence.

The old boundary and `oldCap+1` become compatible; `newCap+1` rejects with exact `1572864/1572865`. The native TypeScript validator in `rust-kernel-smoke.ts` is the fifth technical owner and must preserve that failure instead of returning `bridge.internal`. `strict-input-capture.ts` remains read-only at its separate member/element limit `1,048,576`.

P1 changed only Core Types and intentionally stopped in the exact two-item bounded RED state recorded in `design.md`/`implement.md`; its independent audit passed. P2 changes only Contracts, the native TypeScript validator, the dedicated compatibility test and allowed lifecycle evidence. It closes both REDs without adding a second cap authority, then stops for independent audit before P3. P2 rollback returns to audited P1 RED; rolling back P1 restores old-wire green.

The `1,199,235`-value frozen request must then pass real `decode_create_request`, native create/read/export and consumer regressions without fixture, E1 seam or E2 harness changes.

## Do not do

Do not enter P3-P4, edit Core Types, strict-input capture, workspace-law, stress fixtures, Runtime/Node production or other protected paths, accept/archive/integrate, resume E2, push, qualify, cut over the runtime or create RKP-3. Archived RKP-1 and active specs remain immutable.

## Next gate

Stop now for dedicated independent P2 implementation audit. Core Types remains 6/6 at the sole cap `1_572_864`; Contracts is 17/17; the dedicated TypeScript compatibility suite is 2/2 against fake and real native envelopes. The former exact-byte RED and `P1-RED-TS-NATIVE-SUCCESSOR-MAPPING` are both GREEN, while predecessor/malformed native property failures still map to `bridge.internal`. P3 requires audit PASS plus separate user authorization.
