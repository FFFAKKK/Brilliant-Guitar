# Review Candidate — RKP-1 Post-Archive Repair

## Verdict requested

`OWNER ACCEPTED / ARCHIVE PENDING`

The dedicated independent implementation audit passed P0/P1/P2=`0/0/0` in auditor task `01a01e48-1934-77b0-821e-a8026cd9e5f7`. Its exact technical candidate is `267a63bc6ff35b49842fb713c34f4099c8829e18`, covering `f7fecdcf7f2194b978ff2841b7913b670a2f7f8f..267a63bc6ff35b49842fb713c34f4099c8829e18`. The owner accepts that candidate and authorizes native archive in this closeout. This later lifecycle record does not impersonate the audited implementation HEAD. Push, RKP-2 implementation and official qualification remain outside the closeout.

## Verified candidate evidence

- Rust workspace 40/40; fmt, check, Clippy `-D warnings`, and MSRV 1.88 locked check pass.
- Windows MSVC addon build, deterministic DLL-to-`.node`, `process.dlopen`, `require`, and exact two exports pass.
- Node bridge 9/9 with `--expose-gc`; workspace-law 6/6 in the repair worktree and 6/6 from the long-path RKP-2 planning worktree.
- TypeScript typecheck/build pass; full suite 546 total, 545 pass, one expected GC skip, zero fail.
- The implementation range stays inside the ten literal accepted paths; protected implementation-time paths and all production/Rust/Cargo/package/tsconfig/spec/CVN-7 surfaces have zero delta.
- The independent auditor reproduced the focused workspace contract at 6/6 in both the repair worktree and the long RKP-2 planning worktree, and confirmed protected zero delta.

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
