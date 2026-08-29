# Implementation Plan — RKP-1A Public JSON Property-Cap Scale Compatibility Repair

## 0. Phase gate

P0, P1 and P2 are complete and independently audited; exact P2 head is `0f65272951fd23080b6f536b2e58f50afe249b02`. P3A and P3B are complete, historically authorized and separately audited; P3B's exact reviewed head is `e4103b779574fcdc728d024c1b8f30244cb332c3`. A1 and A2 are completed docs-only P4-entry amendments. This A3 repair does not authorize P4 B. Do not run `task.py start` again.

Before every phase:

1. verify exact accepted planning HEAD, branch, clean worktree and staged-empty state;
2. verify the seven cumulative technical and seven lifecycle paths are the complete allowlists;
3. verify archived RKP-1 and the frozen stress fixture are byte-zero;
4. use session-only `TEMP`, `TMP` and `CARGO_TARGET_DIR` under `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\.scratch\rkp1a-property-cap`, with `CARGO_INCREMENTAL=0`;
5. stage only the current phase and run `git diff --check`.

## P0 — activation, docs only

Owners: seven lifecycle paths only.

- Record planning audit PASS and user implementation authorization.
- Run native Trellis start for this child only.
- Keep RKP-2 Stage 6 paused, E1/E1R green and E2 not started.
- Set candidate-ready false and implementation review pending.

Commit: `chore(rkp-1a): activate public property cap repair`.

Gate: Trellis child/parents, JSON/JSONL, authority/current/archive and protected-delta checks. Rollback: revert P0 only.

## P1 — Core Types single authority

Owner: `crates/brilliant-core-types/src/json.rs`.

- Change the sole `JSON_PROPERTY_LIMIT` to exactly `1_572_864`.
- Add direct `BoundedJsonValue` tests for `oldCap`, `oldCap + 1`, `newCap - 1`, `newCap`, and `newCap + 1`.
- Prove the new failure actual is `1_572_865`, safe and non-wrapping.
- Preserve depth 64, key-not-counted semantics and data-only serialization.

Commit: `fix(rkp-1a): widen the single bounded json value cap`.

Bounded RED gate:

- Core Types focused tests, fmt/check/clippy/MSRV and the one-owner source scan must be green.
- `codec::tests::structural_rank_beats_source_order_for_compound_faults` is allowed to fail only because actual bytes are the new `1572864/1572865` while its unchanged snapshot expects `1048576/1048577`.
- A no-repository-write diagnostic named `P1-RED-TS-NATIVE-SUCCESSOR-MAPPING` must show that a fake native `codec.property-limit` with exact `1572864/1572865` is still downgraded to `bridge.internal` by the predecessor TypeScript validator. Record its command and diff. The P2 committed regression test will be named `fake and real native successor property-limit stays stable`.
- No other RED is allowed. Full failing test names and reasons are part of P1 evidence.

After committing P1, stop for a dedicated independent P1 implementation audit. Only PASS plus separate user authorization permits P2. Rollback P1 restores the old cap and old-wire green state.

## P2 — Contracts strict decoder and resource laws

Owners: `crates/brilliant-kernel-contracts/src/codec.rs`, `src/core-kernel/native/rust-kernel-smoke.ts`, and `test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts`.

- Keep importing Core Types `JSON_PROPERTY_LIMIT`; add compile/runtime equality assertions without a duplicated numeric owner.
- Update direct boundary and exact-byte tests to the successor cap.
- Freeze depth → property → shape → number adjacent and compound precedence.
- Prove scan-only zero post-limit retention, bounded four-slot fault storage, duplicate discard, unique/duplicate linear visits and no counter wrap.
- Prove invalid UTF-8, invalid/trailing JSON, exact-shape/extra-field and safe-number behavior is unchanged.
- Prove request `64 MiB + 1` is rejected before parsing or full copy and response cap remains unchanged.
- Change only the native adapter's property-limit validator to the successor limit. Do not change `STRICT_INPUT_MAX_PROPERTIES` or TypeScript capture behavior.
- Add exact fake and real native `newCap+1` assertions proving `codec.property-limit`, `limit=1_572_864`, `actual=1_572_865` and no downgrade to `bridge.internal`.

Commit: `fix(rkp-1a): align strict decoder resource contract`.

Historical gate: Contracts/Core Types focused tests, fake/real native successor mapping, exact wire snapshots, fmt/check/clippy/MSRV and protected-path checks were green; exact P2 head passed dedicated independent audit. P3A subsequently received planning PASS and separate authorization, then completed its independent implementation audit; P3B did likewise and is reviewed through exact `e4103b7`. No P3 authorization remains pending.

Rollback: revert P2 to the independently audited P1 bounded RED state. A second rollback of P1 is required to restore the old-cap/old-wire green state.

## P3A — TypeScript native-wire capture profile repair

Owners:

- `src/core-kernel/codec/strict-input-capture.ts`;
- `src/core-kernel/native/rust-kernel-smoke.ts`;
- `test/core-kernel/cvn-3-strict-input.test.ts`;
- `test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts`;
- `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`.

- Keep `captureStrictInput` as the sole capture implementation and limit/profile owner. Add the closed `default | native-wire-v1` profile union; default is `1_048_576`, native is `1_572_864`. Callers select a profile and never repeat a number.
- Select `native-wire-v1` for both create-document capture and native response capture. Preserve create overflow as `bridge.capture-invalid` and response overflow/malformed as `bridge.internal`.
- Prove default and native cap-1/cap/cap+1; DAG and JSON-cloned create; public read; accessor/proxy/cycle/depth/extra/malformed handling; 64 MiB caps; no new failure/export/DTO.
- Freeze document/create/read Rust-value, TS-member and byte counts, including DAG WeakMap count `1,045,635` and cloned-tree count `1,199,232`.

Workspace-law freezes the accepted amended planning interval, exact seven technical/seven lifecycle allowlists, single Rust cap authority and closed capture profiles. It also asserts two Node exports, 22 stable failures, public `28/51/8/34/9`, `brilliant-score-1`, TypeScript default and excluded `indices.rs`.

Commit: `fix(rkp-1a): add native wire capture profile`.

Gate: focused capture/native/workspace-law tests on current Node and Node 20.20.2, native bridge, full dynamic runner, protected zero-delta and exact default-byte behavior. Stop for dedicated independent P3A implementation audit. P3B requires PASS and separate user authorization. Rollback: revert P3A exactly to audited P2.

## P3B — frozen consumer proof

Technical owner and sole self-worker source: `test/core-kernel/rust-migration/rkp-1a-property-cap-compatibility.test.ts`; a necessary workspace-law projection may only use its already allowlisted workspace-law path. Do not add a helper, worker or process path.

- Consume `createStressCvn7Score()` read-only; assert exact entity/extension/value/member/byte facts for direct DAG and JSON-cloned equivalent trees.
- Pass the unchanged request through real `decode_create_request` and both raw/public native create/read/export journeys with no bypass, slicing or field removal.
- Assert input SHA `5a8a318e58bc08a82a822c166ed11239ed4ed7b9ea45d50bb7dcb81d7c57f91e`, Rust canonical export SHA `4d8597437cc8b07df6cfef9400086218636adb27257ad72d055e1e3a3deafff7`, semantic deep equality, repeated raw/public read stability and 18/16/1 extension preservation. Do not assert raw input bytes equal Rust output bytes.
- Prove the predecessor cap rejects the same request deterministically at `1_048_576/1_048_577` without rewriting history.
- Compile the same test file as CommonJS with exact `import * as path from "node:path"`, and use only `path.resolve(process.argv[1] ?? "") === path.resolve(__filename)` for direct entry. Spawn `process.execPath <absolute compiled test> --rkp1a-p3b-self-worker-v1` with `BRILLIANT_RKP1A_P3B_SELF_WORKER_V1=1`, exact request/result path variables, `shell:false`, `windowsHide:true`, bounded pipes and no `NODE_TEST_CONTEXT`. Direct entry, exact argv, exact env and absent `NODE_TEST_CONTEXT` must all hold; every partial combination rejects before test registration/spawn, normal `node:test` only registers tests, and direct worker mode registers none and cannot recurse. Do not use a default `node:path` import, introduce ESM or change `tsconfig`.
- Implement the exact `BRILLIANT_RKP1A_P3B_SELF_WORKER_V1:` compact-JSON schema from `design.md` in this file only. Require exact recursive keys/types/ranges/order, exact literal counts/bytes/hashes/proofs, positive safe-integer elapsed/RSS, result-file byte equality, empty stderr and one LF-terminated stdout sentinel with no mixed output.
- Cap raw stdout and stderr separately at `1_048_576` bytes. Start the `180000 ms` timer immediately before spawn and keep it through settlement. On timeout/overflow launch exact `taskkill.exe /PID <pid> /T /F` with `shell:false`, `windowsHide:true` and a `5000 ms` guard, then wait independently at most `5000 ms` for child close/reap. Use only the resolved E: scratch leaf for request/result/stdout/stderr/native artifacts, with no default C: TEMP or target.
- Apply `primary ??= failure` to every observed event. Earlier overflow remains primary over later timeout/signal/nonzero; earlier timeout remains primary over termination-induced signal/nonzero. Taskkill launch error/nonzero/timeout and reap timeout are deterministic secondary failures and promote only when no primary exists. Any terminate/reap failure rejects.
- Close all child/request/result/stdout/stderr handles, then delete and confirm absence of the exact owned scratch leaf under a `5000 ms` guard, at most twice with exactly `100 ms` delay. First-fail/second-success is successful with test-local `cleanupRecovered=true`; two failures reject. Cleanup never replaces an existing primary but becomes primary after an otherwise successful workload. Publish no partial success.
- Add executable test-local fixtures in this same file for CommonJS direct-entry positive/negative compilation, `NODE_TEST_CONTEXT` recursion, overflow-before-timeout, timeout-before-signal, taskkill launch error/nonzero/timeout, reap timeout, cleanup recovery/two-failure, nonzero/signal, cap+1 streams, sentinel missing/duplicate/invalid JSON/mixed/extra fields and result mismatch. Inject failures through test-only seams without destructive OS actions or a product hook.
- Record wall/RSS only as non-qualification diagnostics; do not run 10,000 submit/replay.

Commit: `test(rkp-1a): prove frozen stress request through real consumers`.

Gate: focused current/Node20 raw and public journey plus the complete negative matrix, native bridge, full dynamic runner with identical manifest/hash/totals, Rust workspace gates, exact hashes, single-file changed-path proof, E:-only artifact proof and protected zero-delta. Stop for dedicated independent P3B implementation audit. P4 requires PASS and separate authorization. Rollback: revert P3B only, retaining audited P3A.

## P4 — candidate freeze

P4 entry A1 is the first docs-only planning amendment, directly parented by `e4103b779574fcdc728d024c1b8f30244cb332c3`, with exactly thirteen listed planning/projection paths. A2 is directly parented by `aacb057af6eaa7c16e88ed94e2ecfc323c540032` and has the same thirteen paths. A3 is this bounded docs-only repair, directly parented by `9e1770b39f01484c860a39a6746f3ef7a638f612`; it has the expanded fifteen permitted authority/projection paths, with `e4103b7..A2` remaining thirteen and `e4103b7..A3` exactly fifteen. It does not modify workspace-law and never records its own hash. It leaves candidate-ready false and stops for targeted independent P4-entry planning review.

Only after exact A3 independently passes and separate user authority is given may B begin with direct parent accepted A3. B has exactly eight paths: the original seven lifecycle owners plus `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`, which is a mechanical governance projection only. B freezes `bd8946e → f06c57b → 673a2b9 → e4103b7 → A1 aacb057 → A2 9e1770b → accepted A3 HEAD → B HEAD`; historical segment/cumulative checks remain, individual A1/A2 thirteen-path and A3 fifteen-path commit sets are fixed, `e4103b7..accepted A3` is the cumulative fifteen paths, and `accepted A3..B` is exactly B's eight. No self-hash, wildcard/directory exemption, merge, empty commit or extra commit is allowed.

Owners for B: the original seven lifecycle paths only; workspace-law is not a lifecycle owner.

- Run all final gates from a clean HEAD and record exact commands, totals, hashes, elapsed diagnostics and protected deltas in the one future implementation evidence file.
- Set implementation candidate-ready true and review pending.
- Keep archive/integration/E2 resume false.
- Request independent implementation audit; do not claim PASS.

If a post-B rollback is needed, do not use ordinary `git revert B`: make one explicit later eight-path governance rollback descendant. It restores the seven lifecycle files to accepted-A3 P4-not-ready state, retains only workspace-law to freeze B→rollback, and does not revert A1/A2/A3.

Commit: `docs(rkp-1a): freeze property cap repair candidate`.

## Final gate matrix

- `cargo +1.97.1 fmt --all -- --check`
- `cargo +1.97.1 check --workspace --all-targets --locked`
- `cargo +1.97.1 test --workspace --all-targets --locked`
- `cargo +1.97.1 clippy --workspace --all-targets --locked -- -D warnings`
- `cargo +1.88.0 check --workspace --all-targets --locked`
- `npm.cmd run typecheck`, `npm.cmd run build`, dynamic full runner on Node current and 20.20.2
- native `--expose-gc` bridge and dedicated RKP-1A compatibility test
- child/Rust parent/RKP-2/Stage6 child Trellis; JSON/JSONL/path/parent/fence/diff checks
- implementation-base-to-HEAD literal allowlist and all protected paths zero
- final clean/staged empty

Only an accepted, archived and explicitly integrated RKP-1A descendant may begin a separate Stage-6 docs-only authority amendment. That amendment freezes semantic/canonical roles, one Store export, primary plus verification encode, and exactly `indices.rs` plus workspace-law as its technical allowlist. After planning PASS, E1R2 implementation and independent audit PASS, E2 still requires separate authorization.
