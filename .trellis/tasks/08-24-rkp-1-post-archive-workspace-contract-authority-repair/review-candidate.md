# Review Candidate — RKP-1 Post-Archive Repair

## Verdict requested

`IMPLEMENTATION IN PROGRESS / FULL VERIFICATION REQUIRED`

Final targeted planning rereview R2 passed P0/P1/P2=`0/0/0` at `f7fecdcf7f2194b978ff2841b7913b670a2f7f8f`. Activation `716a9113f8961953ccf848191b4edabc15ab4a62`, isolated workspace-contract test repair `ce4e32d59ec72626e1ab8358632d46be35fe647e` and authority synchronization are complete. Candidate readiness remains false until all Stage 4 gates and the long RKP-2 planning-worktree focused rerun pass. Acceptance, archive, push, RKP-2 implementation and official qualification remain outside this implementation candidate.

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
10. Reverting implementation Commits 4 through 1 returns to the accepted planning HEAD recorded at activation; abandoning the full repair is a separate owner action that may return to base.
