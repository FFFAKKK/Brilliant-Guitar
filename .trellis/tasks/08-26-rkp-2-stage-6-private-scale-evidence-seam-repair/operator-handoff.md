# Operator Handoff

## Current state

- Planning base: `4a302bc9f9981940336fc97941b08e09bd0d1f67`.
- Branch: `codex/rkp-2-stage-6-private-scale-evidence-seam-repair`.
- Task status: `planning`.
- `task_start_run=false`; production/user implementation authorization false.
- Independent planning review: pending.
- RKP-2 S6.1 is retained complete at the base. S6.2 and S6.3 are not started; Stage 6 is operationally paused.
- TypeScript remains default. No push, archive, cutover, qualification or RKP-3.

## Why this child exists

Independent root-cause audit returned P0/P1/P2=`0/1/0`. Ten of twelve metric categories already have checked write points, but the S6.2 evidence journey needs local proof of one full-document export and the resulting canonical byte count. Those two values have no non-zero write point, and private `verify_index_parity` cannot be reached through the current TypeScript-only allowlist. This is an evidence/allowlist defect, not a proven product-complexity defect.

## Frozen decision

Use one `cfg(test)`-only Runtime libtest seam in `indices.rs`. It decodes the temporary request through Contracts, composes existing import/rebuild/query metrics, exports once, encodes once, and produces one versioned data-only record. `full_document_materializations=1` and `canonical_encode_bytes=encoded.len()` remain local and are never persisted.

The worker consumes only `createStressCvn7Score()`, precompiles and uniquely resolves the Runtime libtest, then invokes the exact ignored test through a hidden PowerShell process. Cold compilation is outside the 180-second workload guard. Peak RSS and Rust elapsed time are diagnostics only. Every timeout/process/sentinel/RSS/counter/parity/byte/order error fails closed with no partial evidence.

## Future stages

1. E0 activation/lifecycle only.
2. E1 private Rust seam and exact unit evidence.
3. E2 worker/process failure fixtures and workspace law.
4. E3 actual stress run, evidence and candidate freeze.

Each is separately reversible. After an independent implementation PASS, separate acceptance/archive/integration gates must complete before the original RKP-2 S6.2 resumes as a consumer.

## Next action

Send the exact docs-only planning candidate to a dedicated read-only planning auditor. Focus on the five-path sufficiency, no persistent/second owner, single fixture, exact libtest identity, 180-second boundary, sentinel/RSS failure closure, counter equations and truthful parent S6.1/S6.2 projection. Do not run `task.py start` or implement before PASS and new implementation authorization.

Baseline evidence is `78` files with manifest `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`, `582/581/1/0`; Rust `73/73`; native `17/17`. Candidate workspace-law status is intentionally `6/9`, with all three failures pointing to the same not-yet-accepted child lifecycle path; base is `9/9`.
