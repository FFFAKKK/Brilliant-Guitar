# CVN-6 Independent Planning Review Candidate

## Status

`READY FOR INDEPENDENT PLANNING REVIEW`

This is a planning-only candidate. Production implementation authorization and task activation remain false.

## Review Baseline

- unified base: `050af1eed067300f2e2fb0339eff6f2430e43b36`;
- accepted/archived CVN-2 parent line: `302dafe451bd4e10f4978d3076e367473b2fa3ae`;
- post-Core roadmap parent: `c68fcc648051b51b73fda3e5bda6eb9e33298f39`.

## Required Review Questions

1. Do both required parent commits remain ancestors and does the candidate contain only planning-authority changes?
2. Does every CVN-2 consumer preserve the nine-field ABI, SDK `8/34`, frozen catalog and zero callback execution at compile time?
3. Is the existing CVN-1 runtime the only session/history/dirty/replay/event owner?
4. Is `createKernelRegistry(catalog)` the unique integrated Registry construction decision with exact Core-only preservation?
5. Are integrated event identity and resource creation failure fully specified without widening Core-only runtime behavior?
6. Are same-assembly, cross-assembly, Core/integrated and forged-object failures deterministic and ordered before runtime exposure?
7. Is compatibility evaluated per block with exact versions, full mixed facts, lossless read-only behavior and zero incompatible callback calls?
8. Are validator/classifier order and `0/0`, `1/1`, `1/0`, read-only `0/0/0` counts decision-complete?
9. Are effect ownership, candidate isolation, inverse derivation, no-op and rejection state exact?
10. Is migration public, versioned, detached, owner-scoped, idempotent and based on an accepted effect definition without an ABI field addition?
11. Are every cap, boundary+1 result, failure priority and privacy allowlist explicit?
12. Does the synthetic two-module proof stay below the CVN-5 batch boundary?
13. Is CVN-6 kernel assembly terminology clearly separated from the post-Core Application Assembly?
14. Are source/test allowlists sufficient and narrow, with protected production paths unchanged in this planning candidate?
15. Do parent task, roadmap, contract matrix and active spec agree that CVN-6 is planning/review-pending while CVN-5/CVN-7 remain gated?

## Expected Verdict Format

```text
PASS | RETURN FOR BOUNDED PLANNING REPAIR
P0: <count>
P1: <count>
P2: <count>
```

Every finding must identify an exact planning file and line range, the violated accepted contract, user-visible or operator-visible impact, and the narrow repair required. Review remains read-only.
