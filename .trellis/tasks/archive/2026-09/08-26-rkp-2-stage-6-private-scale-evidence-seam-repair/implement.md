# Implementation Plan: Private Scale Evidence Seam Repair

Implementation is forbidden until the exact repaired planning candidate receives an independent PASS and the user separately authorizes implementation. `task.py start` is not part of this planning repair.

## 0. Immutable entry gate

Before E0:

1. verify the implementation branch descends from the accepted repaired planning head and base `4a302bc9f9981940336fc97941b08e09bd0d1f67`;
2. verify clean/staged-empty worktree and RKP-2 S6.1 retained complete, S6.2/S6.3 false, TypeScript default;
3. record the independent planning PASS and explicit implementation authorization;
4. load `task.json.meta.immutable_planning_authority`, LF-normalize each listed file (`CRLF` and lone `CR` become `LF`), encode UTF-8 without BOM, compute SHA-256 and exact-match all nine entries;
5. verify the future technical allowlist is exactly five and implementation lifecycle mutable allowlist exactly eight; any extra path stops for planning review.

The nine immutable authorities are `prd.md`, `design.md`, `implement.md`, `implement.jsonl`, `check.jsonl`, and the four planning research files. E0-E3 never modify them.

The eight mutable lifecycle paths are child `task.json`, `operator-handoff.md`, `review-candidate.md`, future `research/implementation-evidence.md`; RKP-2 parent `task.json`, `operator-handoff.md`, `review-candidate.md`; Rust parent `task.json`.

## E0 — Activation and lifecycle only

Run Trellis native start for this child only. Modify only the eight lifecycle paths that exist at activation:

- child `status=in_progress`, start/production/user authorization true only for this repair;
- candidate ready false, implementation review pending;
- planning audit PASS and exact accepted planning head pinned;
- RKP-2/Rust parents retain S6.1 complete and show this child as the sole nested blocker;
- S6.2/S6.3 remain false.

Required checks: all nine immutable hashes, Trellis/JSON/JSONL, parent reference once, exact changed paths, protected delta zero, `git diff --check`, clean commit.

Suggested commit: `chore(rkp-2): activate private scale evidence seam repair`.

Rollback: revert E0; return to accepted planning with RKP-2 paused.

## E1 — cfg(test) Rust seam and small proof

Technical owner: `crates/brilliant-kernel-runtime/src/indices.rs` only.

### E1.1 Exact identities

- ignored FQN: `indices::tests::rkp2_stage_6_private_scale_evidence_v1`;
- request env: `BRILLIANT_RKP2_SCALE_REQUEST_V1`;
- Rust prefix: `BRILLIANT_RKP2_SCALE_RUST_V1:`;
- compile command: `cargo +1.97.1 test -p brilliant-kernel-runtime --lib --no-run --locked --message-format=json`;
- eligible artifact: `reason=compiler-artifact`, `target.name=brilliant_kernel_runtime`, `target.kind=["lib"]`, `profile.test=true`, non-empty absolute existing Windows `.exe`, exactly one match;
- later execution argv: `<exe> --exact indices::tests::rkp2_stage_6_private_scale_evidence_v1 --ignored --nocapture --test-threads=1`.

### E1.2 Seam behavior

Add the exact-shape internal evidence structure from `design.md` under `cfg(test)`. The ignored test reads the request path, decodes through Contracts, imports, captures existing metrics, performs the exact two-step owner probe, verifies parity, exports once, encodes once and prints exactly one compact internal sentinel.

Owner probes use the real API sequence:

1. `let stable_id = StableId::new("cvn7-e-00-0000-0-0").expect("stable evidence entity id");`
2. `let entity_before = store.metrics; let entity = store.lookup_entity(&stable_id).expect("known evidence entity"); let entity_after = store.metrics;` Require Event, `entity_index_lookups` delta `1`, every other `Rkp2StoreMetrics` delta `0`.
3. `let mut owner_probe_metrics = Rkp2StoreMetrics::default(); let owner = store.indices.lookup_owner(entity, &mut owner_probe_metrics).expect("known evidence owner");` Require Voice `cvn7-v-00-0000-0`, `owner_index_lookups=1`, every other field `0`.
4. Emit separate exact `entityProbe` and `ownerProbe` records. Do not call `LiveScoreStore::lookup_owner` and do not add either probe to import/rebuild totals.

### E1.3 E1 RED/GREEN gate

E1 does not generate or require the stress request. It proves compile/artifact identity and uses an existing small Rust test fixture/helper to unit-test evidence exact shape, local materialization/encode accounting, owner-probe delta logic, extra-field rejection and no persistent mutation. The ignored stress test may compile but is first executed in E2.

Run:

```powershell
cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 test -p brilliant-kernel-runtime --lib --locked
cargo +1.97.1 test -p brilliant-kernel-runtime --lib --no-run --locked --message-format=json
cargo +1.97.1 clippy -p brilliant-kernel-runtime --all-targets --locked -- -D warnings
cargo +1.88.0 check -p brilliant-kernel-runtime --all-targets --locked
```

Also mechanically prove no non-test/public symbol, Node export, DTO, persistent metric field, environment hook or second owner was added.

Suggested commit: `test(rkp-2): add private scale evidence seam`.

Rollback: revert E1; no worker or stress request exists.

## E2 — Worker/process, hostile protocol and first real stress run

Technical owners are the three new worker/process files and existing RKP-2 workspace-law test. No other file changes.

### E2.1 Single fixture and Cargo artifact

TypeScript calls only `createStressCvn7Score()`, validates the frozen counts/order/bytes, canonical-encodes once and writes a unique TEMP create-request file. Before creating any owned TEMP resource it validates the script/executable/test identity and all fixed named arguments. A pre-handoff failure is owned and cleaned by TypeScript and never fabricates a PowerShell process envelope. Rust has no second generator. Cold compile runs before the workload timer using the exact E1 command. Parse Cargo JSON and require exactly one eligible artifact; zero or multiple is rejection before process start.

### E2.2 Exact PowerShell call

Invoke exactly:

```text
pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <absolute-script> -ExecutablePath <absolute-exe> -RequestPath <absolute-request> -TestName indices::tests::rkp2_stage_6_private_scale_evidence_v1 -TimeoutMs 180000 -PollIntervalMs 25 -MaxStdoutBytes 1048576 -MaxStderrBytes 1048576
```

The script accepts only those fixed named values. Once it accepts the request/TEMP-root handoff it is the sole cleanup owner even if `Start-Process` throws. It temporarily sets `BRILLIANT_RKP2_SCALE_REQUEST_V1`, starts the exact libtest hidden with separate unique stdout/stderr files, polls every `25ms`, refreshes before each RSS read, caps each stream at `1048576`, times only the child workload, tree-terminates with validated `taskkill /T /F` after cap/timeout, always attempts bounded reap within `5000ms`, waits for redirect flush on normal exit and performs a final refresh. Its `finally` closes handles, restores/removes the environment variable, and cleans `request -> stdout -> stderr -> owned TEMP root` with existence checks, at most two attempts and an exact `25ms` retry interval. Any failed attempt fixes `cleanupStatus="failed"`; otherwise it is `"succeeded"`. Termination, reap and cleanup are recorded as the exact secondary statuses from `design.md`.

### E2.3 Exact protocol and precedence

Consume exactly one Rust prefix and emit exactly one `BRILLIANT_RKP2_SCALE_PROCESS_V1:` line only after `finally` has completed and cleanup status is known. Success/rejection shapes, integer ranges, closed codes/details and forbidden fields are exactly those in `design.md` section 6. Rejection contains no internal evidence/raw output/path/backtrace/partial counter and always has `partialEvidence=false`; a successful workload with failed cleanup is rejection `process.cleanup-failed`.

Primary first-failure selection is: start → sampling/refresh → output caps → timeout → exit code → sentinel count → JSON parse → protocol/range → RSS validity → counts/bytes/counters → parity → ordering → payload/round-trip → cleanup. Shutdown secondary statuses never participate in primary selection. Later cleanup never replaces an existing primary; it changes only fixed `cleanupStatus`.

Focused tests directly lock every reachable primary code and combinations, including cap plus termination failure retaining `process.output-limit-exceeded`, timeout plus reap failure retaining `process.timeout`, cleanup-only failure selecting `process.cleanup-failed`, primary plus cleanup failure, malformed/duplicate/missing sentinel, exact-shape/range/extra-field rejection, RSS unavailable/invalid, every evidence mismatch class and bounded no-hang. Cleanup fixtures require: an existing `.exe` that passes path preflight but is an invalid libtest, causing real `Start-Process` failure plus successful cleanup and absent root; first-attempt deletion failure plus successful retry retaining `process.start-failed`, `cleanupStatus="failed"` and absent root; and two failed attempts producing rejected/no-partial evidence before fixture-owned fault release and final zero-residue proof. They assert exact `terminationStatus/reapStatus/cleanupStatus`, inject at the process/test-infrastructure seam and do not copy product logic.

### E2.4 First real integration run

After hostile tests pass, E2 creates the real stress request and invokes the actual precompiled ignored libtest once. It must produce exact frozen counts/bytes/counters, owner probe, parity/order/payload and a positive safe elapsed/RSS diagnostic. This is integration proof, not formal child evidence freeze.

Workspace law verifies exact five technical paths, eight mutable lifecycle paths, nine immutable hashes, `cfg(test)` visibility, no second fixture, exact command/argv/prefix/parameters/precedence and protected zero delta.

Suggested commit: `test(rkp-2): add fail-closed scale evidence worker`.

Rollback: revert E2; E1 remains independently unit-tested.

## E3 — Fresh run, implementation evidence and candidate freeze

Create a new temporary request from the sole fixture; do not reuse the E2 request or captured output. Precompile/resolve again, perform the full worker journey and freeze only the successful exact final protocol plus toolchain/OS/commit/manifest context into future `research/implementation-evidence.md`.

Update only the eight mutable lifecycle paths:

- `stage_6_private_scale_evidence_seam_repair_completed=true`;
- child remains `in_progress`;
- `implementation_candidate_ready=true`;
- implementation review pending;
- RKP-2 remains paused before its own S6.2 consumption;
- no PASS/accept/archive/integration/cutover/qualification/RKP-3 claim.

All nine immutable authority hashes must still exact-match.

Suggested commit: `docs(rkp-2): freeze private scale evidence candidate`.

Rollback: revert E3 to the green E2 technical head.

## Final candidate gates

1. Rust 1.97.1 fmt/check/test/clippy `-D warnings`; MSRV 1.88 locked check; LF clean checkout.
2. TypeScript typecheck/build; focused worker/workspace-law under Node current and 20.20.2.
3. Accepted dynamic full runner under both Node versions with identical manifest/hash/totals and zero failure.
4. Native `--expose-gc` bridge/parity.
5. Exact real E3 stress evidence and all hostile process/protocol fixtures.
6. Child/RKP-2/Rust-parent Trellis, JSON/JSONL/path uniqueness, parent once, Markdown fences, `git diff --check`.
7. Nine LF-normalized hashes exact; implementation range exactly five technical plus actually changed subset of eight lifecycle paths; any ninth lifecycle path fails.
8. Protected source/config/task/spec delta zero; clean/staged-empty; no push.

Terminal state: `READY FOR INDEPENDENT IMPLEMENTATION REVIEW`. Acceptance/archive/integration and original RKP-2 S6.2 resumption are separate later gates.
