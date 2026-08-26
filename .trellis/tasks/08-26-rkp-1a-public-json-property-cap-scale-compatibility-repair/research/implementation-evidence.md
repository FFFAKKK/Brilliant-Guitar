# RKP-1A P0/P1 Implementation Evidence

## Fixed range

- Accepted planning authority: `1cd0caadff218c1471f67cdf1a1ab78f5653a605`.
- P0 activation: `39e91e86bf696a30cc77b42bd1ec5e2ae6cc4fbe`.
- P1 technical candidate: the next single commit after P0; its exact hash is reported after commit and does not replace the audited planning head.
- P2-P4, RKP-2 Stage6 E2, acceptance, archive, integration and default cutover are not authorized.

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

## Rollback and next gate

Reverting P1 returns to P0 with the old cap and old-wire green state. The current P1 commit is not a final implementation candidate: stop for independent P1 implementation audit. Only PASS plus separate user authorization may begin P2.
