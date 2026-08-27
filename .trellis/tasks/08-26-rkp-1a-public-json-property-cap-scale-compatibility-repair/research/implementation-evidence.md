# RKP-1A P0/P1/P2 Historical Implementation Evidence

## Fixed range

- Accepted planning authority: `1cd0caadff218c1471f67cdf1a1ab78f5653a605`.
- P0 activation: `39e91e86bf696a30cc77b42bd1ec5e2ae6cc4fbe`.
- P1 technical candidate: `712c6dbb0b7556b4c345fab9ad8215fdbcec6990`; independent implementation audit PASS at P0/P1/P2=`0/0/0`.
- P2 technical candidate and audited head: `0f65272951fd23080b6f536b2e58f50afe249b02`; independent implementation audit PASS at P0/P1/P2=`0/0/0`.
- P2-time historical snapshot: a later P3 attempt created no commit and was fully reverted. Root-cause audit returned `0/2/0` for native capture-profile admission and canonical-byte role drift.
- P2-time historical snapshot: first docs amendment candidate `978160e69b69d643c3d61ca946bde10bfe4aefb0` was returned at `0/1/1` for planning-only P3B self-worker protocol and P2 tense defects. Its repair `14023029878be7c785ac0de7828628c5e3f4f8b1` was returned at `0/2/0` for CommonJS direct-entry and Windows first-observed terminate/reap/cleanup gaps. It does not describe the live lifecycle.
- Subsequent live history: P3A and P3B completed their separately authorized implementation and independent audits through exact `e4103b779574fcdc728d024c1b8f30244cb332c3`. Only future B/P4 lifecycle, RKP-2 Stage6 E2, acceptance, archive, integration and default cutover remain unauthorized.

## P1 technical change

Only `crates/brilliant-core-types/src/json.rs` changes technically. The sole production `JSON_PROPERTY_LIMIT` changes from `1_048_576` to `1_572_864`. Direct tests cover old cap, old cap plus one, new cap minus one, new cap and new cap plus one; the first new overflow reports `actual=1_572_865`.

## Green gates

- `cargo +1.97.1 fmt --all -- --check`: PASS after pinned single-file rustfmt.
- `cargo +1.97.1 check -p brilliant-core-types --all-targets --locked`: PASS.
- `cargo +1.97.1 test -p brilliant-core-types --locked`: 6 passed, 0 failed.
- `cargo +1.97.1 clippy -p brilliant-core-types --all-targets --locked -- -D warnings`: PASS.
- `cargo +1.88.0 check -p brilliant-core-types --all-targets --locked`: PASS.
- Production owner scan: exactly one `pub const JSON_PROPERTY_LIMIT`, in `json.rs`, value `1_572_864`.
- `npm.cmd run typecheck` and `npm.cmd run build`: PASS.

All Rust build output uses `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\.scratch\rkp1a-property-cap-p1\target` with `CARGO_INCREMENTAL=0`; `TEMP` and `TMP` use the sibling `tmp` directory.

## Exact bounded RED set

### 1. Contracts predecessor snapshot

```text
cargo +1.97.1 test -p brilliant-kernel-contracts codec::tests::structural_rank_beats_source_order_for_compound_faults --locked -- --exact
```

Result: exit 101. The only executed test fails because actual canonical property facts are `limit=1572864, actual=1572865`, while the unchanged P2-owned snapshot expects `1048576/1048577`. The complete package run reports 15 passed, exactly this 1 failed, 0 ignored.

### 2. Native successor mapping predecessor

Diagnostic name: `P1-RED-TS-NATIVE-SUCCESSOR-MAPPING`.

The no-repository-write Node diagnostic imports the compiled adapter, injects an exact fake rejected native envelope `{ code: "codec.property-limit", limit: 1572864, actual: 1572865 }`, and asserts preservation. It exits 1 with actual `bridge.internal` versus expected `codec.property-limit`, proving the unchanged P2-owned adapter still accepts only the predecessor limit.

No other P1-specific failure occurred.

## Full runner attribution

The dirty P1 checkpoint prints `full-test-manifest-v1` for 78 files with SHA-256 `e4445a175cedaa34eaed455f48a98735ac2fa4808cc94314ff5148db6b6523d5`: 582 discovered, 577 passed, 1 expected skip and 4 failed. One failure is only the required clean-worktree assertion against the uncommitted `json.rs`; the other three are the pre-existing workspace-law 6/9 fail-closed results whose first rejected path is the unaccepted RKP-1A child `check.jsonl`. No product, codec or native TypeScript test newly fails. A clean-head full runner is required after the P1 commit.

## P2 successor-wire closure

P2 changes exactly three technical paths: Contracts codec tests/wire samples, the production TypeScript native failure validator and a new dedicated compatibility test. Contracts continues to import `brilliant_core_types::JSON_PROPERTY_LIMIT`; no second production constant or admission path exists.

- RED before the native adapter edit: the new focused TypeScript suite ran 0/2. The exact successor envelope downgraded to `bridge.internal`, and the predecessor envelope was still accepted, proving the suite detects both under-acceptance and accidental dual-wire widening.
- GREEN after P2: Core Types 6/6, Contracts 17/17, focused TypeScript fake+real native compatibility 2/2.
- Successor boundary: `newCap-1` and `newCap` accept; `newCap+1` returns exact canonical `codec.property-limit` bytes with `limit=1_572_864` and `actual=1_572_865`.
- Compatibility boundary: `oldCap` and `oldCap+1` now accept inside the shared Rust value-count cap. The TypeScript public native validator accepts only the successor wire; predecessor, extra, missing and wrong-type failure payloads remain exact `bridge.internal`.
- Resource/precedence regression: depth→property→shape→number, duplicate/unique linearity, saturating overflow, zero post-limit retention, request/response 64 MiB caps and depth 64 remain covered by the Contracts package.
- The real addon request is below 64 MiB, exceeds the successor property cap by exactly one counted value, returns no handle and preserves the exact successor failure through the production adapter.

The current checkout's full Runtime unit run exposes four known CRLF source-self-introspection failures in unchanged Runtime files. Final P2 evidence therefore uses the accepted LF detached-checkout gate; no Runtime source or test is modified.

## P3 amendment boundary — P2-time historical snapshot

At P2 time the amendment split future work into P3A and P3B. P3A owned only the closed TypeScript capture profile and its create/read call sites/tests; P2 had already changed the successor failure-wire validator at exact audited head `0f652729...`. P3B owned frozen real-consumer evidence, with distinct input/export SHA roles and semantic equality, and used the compatibility test itself as its sole CommonJS direct self-worker. Its exact `__filename` guard, first-observed settlement, taskkill/reap secondary state and two-attempt E:-scratch cleanup were planned fail-closed. This snapshot is superseded for live lifecycle by completed P3A/P3B audits through `e4103b7`; `indices.rs`, fixture, TypeScript encoder and Foundation BTreeMap remained byte-zero.

## Rollback and next gate

The P2 commit is a single direct child of audited P1 head `712c6dbb0b7556b4c345fab9ad8215fdbcec6990`. Reverting only P2 restores the exact audited P1 tree and therefore the same two bounded REDs; reverting P1 after that restores the old cap and old-wire green state. P2 audit passed. This document's prior P3 gate wording is historical; the current gate is A3 targeted P4-entry planning review, with only future B requiring PASS plus separate user authorization.
