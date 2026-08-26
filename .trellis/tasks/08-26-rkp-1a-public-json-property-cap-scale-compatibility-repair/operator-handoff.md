# Operator Handoff

## Current state

- Planning base: `639e93555c15b46c54c8e9bb7ec610d4a77c7478`.
- Task status planning; `task_start_run=false`; production/user implementation authorization false.
- First independent planning review returned P0/P1/P2=`0/3/1`; the four findings have been bounded-repaired in planning authority.
- Targeted independent planning rereview pending.
- RKP-2 Stage 6 seam repair has E1/E1R green; E2/E3 not started; external blocker `public-json-property-cap-contract-conflict`.
- TypeScript remains default.

## Exact decision

Widen the one Core Types `JSON_PROPERTY_LIMIT` from `1,048,576` to `1,572,864`; Contracts imports it. Keep depth 64, request/response 64 MiB, 22 StableFailure variants and depth→property→shape→number precedence.

The old boundary and `oldCap+1` become compatible; `newCap+1` rejects with exact `1572864/1572865`. The native TypeScript validator in `rust-kernel-smoke.ts` is the fifth technical owner and must preserve that failure instead of returning `bridge.internal`. `strict-input-capture.ts` remains read-only at its separate member/element limit `1,048,576`.

P1 changes only Core Types and intentionally stops in the exact two-item bounded RED state recorded in `design.md`/`implement.md`; no additional failure is permitted. An independent P1 implementation audit and new authorization gate P2. P2 closes Contracts and native wire mapping, then independently audits again before P3. P2 rollback returns to P1 RED; rolling back P1 restores old-wire green.

The `1,199,235`-value frozen request must then pass real `decode_create_request`, native create/read/export and consumer regressions without fixture, E1 seam or E2 harness changes.

## Do not do

Do not run `task.py start`, edit production/test files, accept/archive/integrate, resume E2, push, qualify, cut over the runtime or create RKP-3. Do not edit archived RKP-1 or active specs.

## Next gate

Submit the repaired docs-only candidate to the same targeted read-only planning gate. Implementation requires targeted PASS P0/P1/P2=`0/0/0` plus later explicit user authorization.
