# Review Candidate — RKP-1A Public JSON Property-Cap Scale Compatibility Repair

## Status

RKP-1A B OWNER ACCEPTED THROUGH C1; READY FOR INDEPENDENT C1 ACCEPTED-B AUTHORITY TRANSITION AUDIT.

Exact planning head `1cd0caadff218c1471f67cdf1a1ab78f5653a605`, exact P1 head `712c6dbb0b7556b4c345fab9ad8215fdbcec6990` and exact P2 head `0f65272951fd23080b6f536b2e58f50afe249b02` each passed their required independent review at P0/P1/P2=`0/0/0`. A no-commit P3 attempt was reverted. Independent root-cause audit returned `0/2/0`; first amendment `978160e...` returned `0/1/1`, and its repair `14023029878be7c785ac0de7828628c5e3f4f8b1` returned `0/2/0` for CommonJS entry and Windows settlement. P3A and P3B are completed, historically authorized, and independently audited; P3B's exact reviewed head is `e4103b779574fcdc728d024c1b8f30244cb332c3`. Replacement A3 `3063e0972072e246d43add8640ba1fe1ad02d787` passed the independent P4-entry planning review at `0/0/0`. The separately authorized B candidate freeze `08374273b05bc992e749a17a959b64af0f293f0b` independently passed implementation review at P0/P1/P2=`0/0/0`; only a distinct closeout planning review may now define owner acceptance, archive and Stage6 integration.

## C1 live authority

The preceding P4 chronology is historical pre-C1 evidence. C1 records B `08374273b05bc992e749a17a959b64af0f293f0b` as owner-accepted implementation authority after its independent P0/P1/P2=`0/0/0` audit. The only live gate is the dedicated independent C1 accepted-B authority-transition audit. Archive, integration and E2 remain unauthorized; `634ed8be...` remains only historical rejected-candidate evidence.

## Candidate claims

1. Exact request size is `1,199,235` counted JSON values; `1,048,577` was only first overflow.
2. `1,572,864` is the finite successor with `373,629` values / `31.156%` headroom.
3. Core Types stays the sole numeric owner and Contracts stays a consumer.
4. Stable failure 22, `codec.property-limit`, exact fields, depth 64, 64 MiB caps and precedence are unchanged.
5. The frozen fixture and RKP-2 E1/E1R are untouched; E2 remains blocked.
6. The cumulative future technical allowlist is exactly seven paths. `captureStrictInput` owns a closed default/native profile; both create and response native captures select `native-wire-v1`; `indices.rs` is excluded.
7. P1 and P2 each stop for independent implementation audit; P2 rollback returns to audited P1 RED, not directly to a green predecessor.
8. The first planning review P0/P1/P2=`0/3/1` is recorded and bounded; exact repaired head `1cd0caa...` passed targeted rereview at `0/0/0`.
9. A1 is directly parented by `e4103b7`; A2 is directly parented by A1; accepted A3 `3063e097...` is directly parented by A2. A1 and A2 each changed thirteen planning/projection paths, while A3 changes the allowed fifteen-path authority set.
10. B is the sole separately authorized candidate-freeze projection: it has exactly seven lifecycle owners plus the one mechanical workspace-law path, freezes `bd8946e → f06c57b → 673a2b9 → e4103b7 → aacb057 → 9e1770b → accepted A3 3063e097 → B`, sets candidate-ready without acceptance/archive/integration/E2, and never hard-codes B's own hash.

## Amended P3 contracts

P3A has exactly five incremental technical paths: `strict-input-capture.ts`, `rust-kernel-smoke.ts`, `cvn-3-strict-input.test.ts`, the RKP-1A compatibility test and RKP-2 workspace-law. It freezes default/native boundaries, direct DAG and JSON-cloned create, public read and hostile capture behavior, then stops for independent audit.

P3B technically changes only the RKP-1A compatibility test, with workspace-law projection only if required. That same CommonJS file is the sole normal test and direct self-worker; no helper path exists. Its exact `__filename` direct entry, argv/env/absent-`NODE_TEST_CONTEXT` guard, one compact sentinel schema, stream caps, 180000 ms timer, first-observed primary, exact taskkill/reap secondary states and recovered/two-failure cleanup matrix are frozen in design section 12.1. It proves real decoder/raw+public journeys, repeated reads, semantic equality and exact SHA roles. Input SHA is `5a8a318e58bc08a82a822c166ed11239ed4ed7b9ea45d50bb7dcb81d7c57f91e`; Rust canonical export SHA is `4d8597437cc8b07df6cfef9400086218636adb27257ad72d055e1e3a3deafff7`. Both are `15,013,904` bytes but are not raw-byte equal.

## P4 entry contract

A1, A2 and accepted A3 are planning-only history. The completed B candidate is directly parented by independently accepted A3 and changes exactly eight paths: the original seven lifecycle owners plus `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`, which only projects mechanical governance. Workspace-law retains the historical `bd8946e → f06c57b → 673a2b9 → e4103b7` segment/cumulative gates, separately asserts `e4103b7..A1` is A1's thirteen paths, `A1..A2` is A2's thirteen paths, `A2..accepted A3` is A3's fifteen paths, `e4103b7..accepted A3` is the fifteen-path cumulative set, and `accepted A3..B` is exactly B's eight paths. It rejects self-hash, merge, empty/extra commit, wildcard and directory exemption. Candidate-ready is set only in B; review remains pending. A later rollback is a separately planned eight-path governance descendant restoring the seven lifecycle paths to accepted-A3 P4-not-ready state and locking B→rollback, not a revert of B, A1, A2 or A3.

## Audit focus

- Recompute the node-count table and headroom.
- Confirm one live authority and exact failure precedence.
- Challenge inclusive edges, exact actual semantics and bounded scan-only behavior.
- Confirm both P1 bounded REDs are GREEN and the P2 audit gates P3.
- Confirm default capture remains byte-identical at `1,048,576`, `native-wire-v1` is `1,572,864`, and both native create/read calls select it without duplicate numbers.
- Confirm exact document/create/read value/member counts and DAG versus cloned-tree coverage.
- Confirm P3B proves real decoder/native behavior without a second fixture or admission path and never treats the raw input SHA as Foundation canonical.
- Confirm the one compatibility test is the only P3B source/worker, CommonJS `__filename` compiles without ESM, exact argv/env plus absent `NODE_TEST_CONTEXT` cannot recurse, and partial markers fail before spawn.
- Validate the exact sentinel shape and caps plus first-observed ordering in both directions, exact taskkill launch/nonzero/timeout and reap-timeout secondary states, cleanup recovery/two-failure, bounded settlement and zero partial publication.
- Confirm all request/result/stdout/stderr artifacts resolve under E: scratch and no partial success is published before cleanup.
- Confirm P2 head `0f652729...` already owns the successor wire validator; P3A changes only capture profile and its two call-site selections.
- Confirm P3A/P3B are audited history through `e4103b7`; B `08374273...` independently passed P4 implementation review and is owner-accepted only. The live next gate is the dedicated C1 authority-transition audit; `634ed8be...` is historical rejected-candidate evidence. Archive/integration/E2 remain unauthorized, and RKP-2 S6.2/S6.3 remain false.
- Verify `json.rs` is byte-zero relative to audited P1 and remains the sole `JSON_PROPERTY_LIMIT` owner at `1_572_864`; Contracts imports it directly and is 17/17. Verify new-cap inclusive/exclusive boundaries, exact `1572864/1572865` wire, depth→property→shape→number precedence, bounded scan-only retention and 64 MiB caps.
- Verify the dedicated TypeScript test uses the production adapter: exact successor fake and real native envelopes preserve `codec.property-limit`, while predecessor, extra, missing and wrong-type variants remain `bridge.internal`; the real rejection publishes no handle.
- Verify the exact seven-path cumulative technical allowlist excludes `indices.rs`, fixture, encoder, Cargo/package/spec/archive paths; A1/A2 each change thirteen planning/projection paths, A3 changes fifteen, and B's current eighth governance path is mechanical only, not a lifecycle owner.
- Verify Stage6 follow-up remains a later independent docs-only authority amendment followed by planning review, E1R2 audit and separate E2 authorization.

## Validation note

The fresh B candidate evidence is current: typecheck/build pass; both Node 24 and Node 20.20.2 discover 79 files with manifest `afbd0246012b61c3670b31cc01180c4a90586e30ac3ff177d91cddfc2eb09357`, yielding 591 discovered / 587 pass / 1 expected GC skip / 3 existing workspace-law fail-closed results. Current focused workspace-law is exactly 10 tests / 7 pass / 3 fail: `implementation changes stay inside the literal RKP-2 allowlists`, `part owner repair stays anchored to its accepted six-path wire contract`, and `Stage 6 hostile and resource evidence consumes the existing private Rust seams` remain the only unaccepted-child failures. The former `RKP-1A P3B candidate is exact and remains closed to P4` bounded RED is closed only by this B projection. Rust clean-LF workspace gates, sequential native bridge 9/9, dedicated RKP-1A compatibility 7/7, Trellis and structural/hash gates pass; no product, capture, native or codec failure is hidden. A fifth failure or changed attribution blocks this candidate.

The older source/candidate characterization remains historical evidence: source `639e935...` first rejected the unaccepted Stage-6 child `check.jsonl`, while candidate `c02c830...` first rejected the unaccepted RKP-1A child `check.jsonl`. Both were expected fail-closed governance evidence. The current completed B projection is the sole mechanical workspace-law change that closed the P4-entry bounded RED; it does not relax any other workspace-law gate.

P2 focused evidence remains GREEN: Core Types 6/6, Contracts 17/17 and the dedicated fake/real native compatibility suite 2/2. Replacement B changes no production path; its sole test change is the mechanical workspace-law projection. The same three unaccepted-child workspace-law failures remain separately attributed and are not relaxed or called green.
