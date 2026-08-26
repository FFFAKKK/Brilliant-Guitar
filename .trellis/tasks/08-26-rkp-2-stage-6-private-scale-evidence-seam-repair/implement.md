# Implementation Plan: Private Scale Evidence Seam Repair

Implementation is forbidden until the exact planning candidate receives an independent PASS and the user separately authorizes implementation. `task.py start` is not part of this planning turn.

## 0. Entry gate

Before E0:

1. verify the implementation branch descends from this accepted planning head and exact base `4a302bc9f9981940336fc97941b08e09bd0d1f67`;
2. verify clean/staged-empty worktree;
3. record the independent planning auditor, exact accepted planning commit and `P0/P1/P2=0/0/0`;
4. verify RKP-2 S6.1 remains complete, S6.2/S6.3 remain false and TypeScript remains default;
5. verify the exact five technical paths and seventeen lifecycle paths; stop for a new planning review if another path is needed.

## E0 — Activation and lifecycle only

Run Trellis native start for this child only. Update only allowlisted lifecycle projections:

- child `status=in_progress`;
- `task_start_run=true` and production/user authorization true only for this repair;
- candidate ready false and implementation review pending;
- RKP-2/Rust parents show this child as the sole current blocking planning/implementation descendant;
- RKP-2 Stage 6 remains paused with S6.1 retained complete and S6.2/S6.3 false.

Suggested commit: `chore(rkp-2): activate private scale evidence seam repair`.

Gate: child/RKP-2/Rust-parent Trellis, JSON/JSONL, exact parent reference, literal allowlist, `git diff --check`, protected zero delta and clean commit.

Rollback: revert E0; planning authority remains intact and RKP-2 stays paused.

## E1 — cfg(test) Runtime seam

Owner: `crates/brilliant-kernel-runtime/src/indices.rs` only.

1. Add the versioned test-only evidence record and one ignored exact libtest.
2. Read the absolute request path from the test-process environment and decode with the real Contracts create-request codec.
3. Build the validated Store and capture existing import/index metrics.
4. Probe one known owner lookup and assert its exact counter delta.
5. Invoke private `verify_index_parity` and capture rebuild metrics.
6. Export exactly once, canonical-encode exactly once, and populate the two local evidence fields.
7. Assert all frozen counts, order/parity, `15013904` canonical bytes and `15013932` request bytes using checked arithmetic.
8. Print one machine-identifiable internal record for the captured child output. Do not expose a public item, product hook or persistent counter.

Suggested commit: `test(rkp-2): add private scale evidence seam`.

Focused RED/GREEN:

- before the seam, exact ignored libtest selection is absent;
- valid stress request yields exact counters/parity;
- invalid/missing request path, malformed request, counter/byte/order mismatch and overflow fail without a success record;
- the production library/API and Node exports remain byte/shape unchanged.

Gate:

```powershell
cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 test -p brilliant-kernel-runtime --locked
cargo +1.97.1 clippy -p brilliant-kernel-runtime --all-targets --locked -- -D warnings
cargo +1.88.0 check -p brilliant-kernel-runtime --all-targets --locked
```

Rollback: revert E1; no worker files exist yet.

## E2 — Worker, process boundary and workspace law

Owners:

- `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts`
- `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts`
- `test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1`
- `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`

### E2.1 Fixture/request worker

Call only `createStressCvn7Score()`. Assert counts and owner/unknown extension composition, encode with the existing canonical codec, write one temporary create request, and pass its literal absolute path to the process wrapper. Do not modify or wrap the fixture module.

### E2.2 Executable resolution

Precompile Runtime tests using Cargo JSON messages. Accept exactly one existing executable artifact for the `brilliant-kernel-runtime` libtest. Reject zero/multiple artifacts. Compilation is outside the liveness window.

### E2.3 Hidden PowerShell process

Use `Start-Process -WindowStyle Hidden -PassThru` with `-LiteralPath`-derived arguments and explicit redirected files. Invoke the exact ignored test with `--exact --ignored --nocapture`. Sample `PeakWorkingSet64`; impose 180 seconds only on the child workload; terminate that exact child on timeout.

### E2.4 Sentinel and failure tests

The final worker accepts exactly one `rkp2-private-scale-evidence-v1` sentinel. Focused fixtures cover success plus timeout, non-zero exit, abnormal termination, missing/duplicate/malformed sentinel, invalid schema/type, RSS failure, request/canonical byte mismatch, counter mismatch, overflow, parity/order/payload mismatch and cleanup failure. Each failure returns non-zero, settles within a bounded timeout and publishes no partial evidence.

Workspace law freezes:

- exact five technical paths;
- exact accepted planning and later implementation ranges;
- `cfg(test)` placement and no public/Node/export/dependency change;
- no second fixture builder;
- precompile-before-timer and exact libtest selection;
- no hard-coded performance pass budget or official qualification claim.

Suggested commit: `test(rkp-2): add fail-closed scale evidence worker`.

Gate: focused worker tests under current Node and Node `20.20.2`, RKP-2 workspace law, typecheck/build, literal changed-path checks and E1 Rust gates.

Rollback: revert E2; E1 remains a private independently testable seam.

## E3 — Actual stress evidence and candidate freeze

Run the real single-owner fixture journey once per required environment after clean build. Record only the final accepted data-only diagnostics in future `research/implementation-evidence.md`:

- exact fixture/request/canonical sizes;
- exact structural counters and owner lookup delta;
- Rust workload elapsed milliseconds;
- sampled peak working set bytes;
- executable identity, toolchain and sentinel version;
- full gate results and exact commit range.

Then update allowlisted lifecycle projections:

- child remains `in_progress`;
- `implementation_candidate_ready=true`;
- `implementation_review=pending`;
- RKP-2 remains paused before its own S6.2 consumption;
- no acceptance, archive, integration, cutover, official measurement or RKP-3 claim.

Suggested commit: `docs(rkp-2): freeze private scale evidence candidate`.

Rollback: revert E3 to the green E2 technical head without changing the seam/worker.

## Final implementation candidate gates

1. `cargo +1.97.1 fmt --all -- --check`
2. `cargo +1.97.1 check --workspace --all-targets --locked`
3. `cargo +1.97.1 test --workspace --all-targets --locked`
4. `cargo +1.97.1 clippy --workspace --all-targets --locked -- -D warnings`
5. `cargo +1.88.0 check --workspace --all-targets --locked`
6. LF clean checkout for Rust source-law tests.
7. `npm.cmd run typecheck` and `npm.cmd run build`.
8. Focused worker/workspace-law under Node current and `20.20.2`.
9. Accepted dynamic full runner under both Node versions with identical manifest/hash/totals and zero failure.
10. Native `--expose-gc` bridge/parity gates.
11. Child/RKP-2/Rust-parent Trellis, JSON/JSONL/path uniqueness, parent reference once, Markdown fences and `git diff --check`.
12. Exact accepted-planning-to-candidate allowlist; protected source/config/task/spec delta zero.
13. Clean/staged-empty status and no push.

The terminal message is `READY FOR INDEPENDENT IMPLEMENTATION REVIEW`. Only after a dedicated implementation PASS may the owner accept, archive, integrate and resume the original RKP-2 S6.2 as an evidence consumer.
