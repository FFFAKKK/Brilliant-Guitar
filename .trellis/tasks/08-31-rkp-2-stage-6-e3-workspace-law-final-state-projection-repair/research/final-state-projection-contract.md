# E3 Final-State Projection Contract

## Frozen anchors

```text
E1R2_PLANNING_HEAD=eb0c13ed5ac218cfec9a983a4bc4e8dfb89acbd7
E2_BOUNDED_BASE=c7aa242b359401f76cd05944404cfc686854bec4
E2_TERMINAL_AND_E3_BASE=4ad23773e9c9e1081667a4eccb84cc464b85bc89
E3_SOURCE_TREE=9dbcef77fbcc258e4fe96fdfb2b28839f095d610
E3_PROTOCOL_SHA256=64e09779ea34bd04d504d515eb7c391f7db35a0a23a3c366fb2ffb5aa71c2862
```

## Historical path sets

`eb0c13e..4ad2377` must remain exactly:

```text
.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json
.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json
.trellis/tasks/08-30-rkp-2-stage-6-semantic-canonical-authority-amendment/operator-handoff.md
.trellis/tasks/08-30-rkp-2-stage-6-semantic-canonical-authority-amendment/review-candidate.md
.trellis/tasks/08-30-rkp-2-stage-6-semantic-canonical-authority-amendment/task.json
crates/brilliant-kernel-runtime/src/indices.rs
test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1
test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts
test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
```

`c7aa242..4ad2377` is the same set without `indices.rs`, for exactly ten paths.

## Original E3 source snapshot

Hash contract: LF-normalized UTF-8 SHA-256.

| Path | Frozen hash |
| --- | --- |
| Rust parent `task.json` | `a63c2b7d03d4cfcae6ad40cd0342e86dc9d55672a4b6947b6eafdcd3afb1ec98` |
| RKP-2 `operator-handoff.md` | `75121e76afad48887759559424a24dbde6ee377788e734f78f23c752809f911c` |
| RKP-2 `review-candidate.md` | `244fffc5e3323ed5acd61bff65eed2f6ff687a646668a60a274a315ceaa0daa6` |
| RKP-2 `task.json` | `8fd58e429eb65f54485e92eee8b3c1d1fcf90073316e90a45cd608ce08666001` |
| Stage 6 `operator-handoff.md` | `990aaa69d2dd3a6697ad9bb4a25d38063c0570ee148c0af567b7422dfd50633b` |
| Stage 6 `review-candidate.md` | `3034bea41d8d6583f60afee7a9cc8c76b6ce2207ef037b17f333dee8c6b1a4d8` |
| Stage 6 `task.json` before new-child merge | `f3c72eb2e08dbef8bcb5d638868d799ed14413f7ed8106ee6a59f179fef81362` |
| Stage 6 `research/implementation-evidence.md` | `1fdd32fd69ae48825497f4181d7824ce5de29d55ac3ba1a46a03a6747e1f8dd7` |

The seven non-overlap files must exact-match. Stage 6 `task.json` must semantically equal the source E3 projection plus exactly one new child reference; every other E3 field remains equal.

## Final candidate set equation

```text
currentE3FinalStateChanges
  = originalE3Eight
  ∪ lawRepairTechnicalOne
  ∪ lawRepairTaskTwelve
```

Cardinality must be `8 + 1 + 12 = 21` because the three sets are disjoint.

The equation is evaluated from `4ad23773...` and includes committed, unstaged, staged and untracked state. A duplicate in the declaration is an error even if set union hides it.

## Lifecycle truth

| Owner | Required state |
| --- | --- |
| 08-26 Stage 6 parent | live E3 owner; completed evidence seam; candidate ready; review pending |
| 08-30 semantic/canonical child | historical E1R2/E2 owner; `stage6_e3_started=false`; no live gate |
| 08-31 law repair child | planning until separate authorization; later single-file law owner |
| RKP-2 parent | S6.1 retained; S6.2/S6.3 false; paused |
| Rust parent | TypeScript default; no RKP3/qualification/cutover |

## Original planning hash fence

The existing nine-entry `immutable_planning_authority` map in the 08-26 task remains the only owner of the original planning hash fence. This repair consumes and verifies it; it does not duplicate or revise those nine values.
