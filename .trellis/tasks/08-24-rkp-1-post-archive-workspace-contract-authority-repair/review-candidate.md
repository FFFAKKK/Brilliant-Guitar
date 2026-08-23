# Review Candidate — RKP-1 Post-Archive Repair

## Verdict requested

`READY FOR TARGETED INDEPENDENT PLANNING REREVIEW`

Review the exact bounded-repair docs-only commit and report P0/P1/P2. The first review returned `0/3/0`; this rereview is limited to those three findings and direct regressions. Keep the review read-only; task activation, implementation, acceptance, archive, push, RKP-2 creation and official qualification remain outside this review.

## Review focus

1. Exact failure mechanism and native archive result.
2. Closed historical interval ending at audited `94387b...`.
3. Historical commit paths versus current archived paths.
4. Per-command rather than persistent `core.longpaths=true`.
5. Durable lifecycle facts without future-stage absence assertions.
6. One existing test plus narrow lifecycle authority allowlist.
7. Production, Rust, Cargo, public API, CVN-7 and RKP-2 boundary preservation.
8. Explicit rollback, full gates and independent implementation review.
9. Completion date is excluded; repair-task lifecycle paths are literal; readiness is set only in Commit 4 after full verification.
