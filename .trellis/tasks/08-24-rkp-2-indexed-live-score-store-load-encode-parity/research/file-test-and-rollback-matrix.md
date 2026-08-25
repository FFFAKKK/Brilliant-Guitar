# File, Test and Rollback Matrix

## Planning candidate ownership

| Path | Planning action |
|---|---|
| `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/check.jsonl` | define exact review context |
| `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/design.md` | freeze implementation-level architecture |
| `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/implement.jsonl` | define exact implementation context |
| `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/implement.md` | freeze staged execution and rollback |
| `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md` | delimit later operator action |
| `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/prd.md` | freeze requirements and gates |
| `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md` | define independent review target |
| `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json` | keep lifecycle and metadata |
| `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/research/container-and-index-decision.md` | record container/index evidence |
| `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/research/current-rust-and-ts-baseline-audit.md` | record current baseline |
| `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/research/file-test-and-rollback-matrix.md` | own literal path/test/rollback matrix |
| `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/research/planning-candidate-self-audit.md` | record self-audit and external review history |
| `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/research/rkp1-repair-and-rkp2-entry-gate.md` | freeze sibling integration gate |
| `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json` | add unique child/current planning projection and activation gate |
| `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/implement.md` | add dated RKP-2 planning projection |
| `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/research/stage-dependency-and-rollback-map.md` | freeze repair-aware RKP-2 entry gate |

All other paths are planning-time zero delta.

## Future implementation production/test matrix

| Path | Stage | Exact responsibility | Rollback owner |
|---|---:|---|---|
| `Cargo.toml` | 1 | exact slotmap workspace pin | Stage 1 |
| `Cargo.lock` | 1 | resolved pinned dependency | Stage 1 |
| `crates/brilliant-kernel-runtime/Cargo.toml` | 1 | sole direct slotmap consumer | Stage 1 |
| `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` | 1,6 | durable crate/dependency/public-boundary laws | Stage 1/6 |
| `test/core-kernel/rust-migration/rkp-2-store-fixtures.ts` | 1,5,6 | deterministic minimal/edge/representative/stress fixture adapters | Stage 1/5/6 |
| `crates/brilliant-score-foundation/src/lib.rs` | 2 | module/export wiring for workspace-internal validation/time | Stage 2 |
| `crates/brilliant-score-foundation/src/codec.rs` | 2 | completed load validation call and preserved canonical encode | Stage 2 |
| `crates/brilliant-score-foundation/src/fraction.rs` | 2 | exact checked Fraction/time primitives | Stage 2 |
| `crates/brilliant-score-foundation/src/validation.rs` | 2 | deterministic complete load validation | Stage 2 |
| `crates/brilliant-kernel-contracts/src/codec.rs` | 2 | map Foundation internal capacity to existing bridge.internal; no public shape/count change | Stage 2 |
| `crates/brilliant-kernel-runtime/src/lib.rs` | 3-5 | private modules and final KernelRuntime export | matching stage |
| `crates/brilliant-kernel-runtime/src/handles.rs` | 3 | typed private generational keys | Stage 3 |
| `crates/brilliant-kernel-runtime/src/records.rs` | 3 | scalar record model | Stage 3 |
| `crates/brilliant-kernel-runtime/src/topology.rs` | 3 | canonical semantic order/edges | Stage 3 |
| `crates/brilliant-kernel-runtime/src/store.rs` | 3-5 | builder, store, export coordination | matching stage |
| `crates/brilliant-kernel-runtime/src/indices.rs` | 4 | lookup/reference/extension/parity indices | Stage 4 |
| `crates/brilliant-kernel-runtime/src/time_index.rs` | 4 | exact Voice point/range query | Stage 4 |
| `crates/brilliant-kernel-runtime/src/smoke_runtime.rs` | 5 | delete RKP-1 whole-DTO holder | Stage 5 |
| `crates/brilliant-kernel-runtime/src/runtime.rs` | 5 | LiveScoreStore-backed revision-zero Runtime | Stage 5 |
| `crates/brilliant-kernel-session/src/session.rs` | 5 | fallible create/mapping and unchanged read contract | Stage 5 |
| `test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts` | 5,6 | native canonical/hostile/resource/scale integration | Stage 5/6 |

No other production/test/config path is implied by a directory wildcard.

## Task lifecycle matrix

| Path | Activation | Stage 6 | Audit/closeout |
|---|---:|---:|---:|
| RKP-2 `task.json` | yes | yes | yes |
| RKP-2 `operator-handoff.md` | yes | yes | yes |
| RKP-2 `review-candidate.md` | yes | yes | yes |
| RKP-2 `research/implementation-evidence.md` | no | create | update only for bounded audited evidence |
| Rust parent `task.json` | yes | yes | yes |

Planning authority files stay byte-identical during implementation except for the following one-time post-Stage-5 successor-projection repair. Once its targeted planning rereview accepts the exact candidate, the repaired authority files freeze again.

## One-time post-Stage-5 successor-projection repair

| Path | One-time ownership | Frozen result / rollback |
|---|---|---|
| `implement.jsonl` | from approved planning state `53646c92b81bc3ac160ec5d72b0d3f80c97b7eb0`, projection commit `bda15099f4932aced965eabc6b6e147accd9b5ce` changes only the deleted `smoke_runtime.rs` context row's `file` and `reason` fields | one `runtime.rs` row, 25 rows total; revert with the authority closure when abandoning the repair |
| `check.jsonl` | from approved planning state `53646c92b81bc3ac160ec5d72b0d3f80c97b7eb0`, projection commit `bda15099f4932aced965eabc6b6e147accd9b5ce` changes only the deleted `smoke_runtime.rs` review row's `file` and `reason` fields | one `runtime.rs` row, 20 rows total; revert with the authority closure when abandoning the repair |
| `design.md`, `implement.md`, `research/file-test-and-rollback-matrix.md` | this bounded planning-authority closure only | exact content SHA-256 frozen by workspace-law after targeted rereview; later edits require a new planning review |
| `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` | mechanically enforce the exact ten-path allowlist, both single-row projections and five final content hashes | revert only with the complete authority closure; no wildcard or task-directory exemption |
| RKP-2 `task.json`, `operator-handoff.md`, `review-candidate.md`; Rust parent `task.json` | project the pending targeted rereview without changing Stage 5/6/default-runtime facts | remove the pending repair projection if the candidate is rejected; do not alter technical stage history |

The repair has one authority owner: the exact docs-only closure candidate submitted for targeted planning rereview. The preceding `bda15099...` commit is only its manifest projection input, not a second planning authority. Workspace-law must prove approved planning state `53646c92...`, Stage 5 parent `4f5f45a...` and projection `bda15099...` exist; `53646c92...` is an ancestor of `4f5f45a...`; `4f5f45a...` is the direct parent of `bda15099...`; and the LF-normalized approved manifests equal the Stage 5-parent manifests. Relative to approved planning state, `bda15099...` changes only the designated successor row's `file` and `reason` fields; every other row and field is identical. The Stage 5 production commit and six-stage technical sequence remain unchanged.

## Protected boundary

Explicitly protected:

- `src/**`;
- all tests except the three RKP-2 test/fixture paths above;
- `package.json`, `package-lock.json`, `tsconfig.json`;
- `rust-toolchain.toml`, `rustfmt.toml`;
- `crates/brilliant-core-types/**`;
- all `crates/brilliant-kernel-contracts/**` except the single allowlisted `src/codec.rs` mapping;
- `crates/brilliant-extension-protocol/**`;
- `crates/brilliant-kernel-node/**`;
- active `.trellis/spec/**`;
- CVN-7 qualification runner/contracts/evidence;
- Guitar, other instruments, Product Host and public plugin code.

## Test matrix

| Area | Required cases | Expected outcome |
|---|---|---|
| Identity | document/entity duplicates across every type | later canonical ID path, duplicate-id |
| Handles | remove/reinsert same slot; cross-type API use | stale old key; compile-time distinct types |
| Topology | reordered arrays, non-lexicographic IDs | byte/order preservation independent of ID/hash/slot |
| Ownership | every entity parent; missing/duplicate content | O(1) owner or deterministic invalid-reference |
| Time | start, dotted, tuplet, pickup, overflow, bounds | exact Fraction; point/range order; deterministic invalid-value |
| Entity lookup | every type, missing ID | one map + one typed slot lookup; no scan |
| Part content | each Part/Measure | direct typed-key lookup; coverage exact |
| Extensions | score/Part, unknown, duplicate, missing owner, nested payload | lossless or deterministic rejection |
| References | measure/default staff/event staff/Part owner | exact ordered referrer projection |
| Index parity | clean rebuild, randomized IDs, deliberate corruption | equality for clean; internal rejection for corruption |
| Encode | minimal, all optional fields, representative, repeated read | semantic and canonical byte equality |
| Hostile | wrong schema/shape/value/reference, cap edges | existing stable failure codes only; zero handle on create reject |
| Public surface | native export/failure counts and TS 28/51/8/34/9 | exact baseline |
| Resource | semantic-invalid + Foundation reserve fault; semantic-valid + Runtime reserve fault; response cap | exact existing bridge.internal/no publication for reserve faults; existing response-too-large for response cap |
| Scale | 102,400 Events / 51,200 Notes | completes liveness worker; linear structural counters |
| Regression | Rust workspace, Node GC, TS typecheck/build/full | zero unexpected failures on activation base |

## Commit rollback chain

```text
C0 activation
C1 dependency/contracts
C2 Foundation validation/time
C3 store/topology
C4 indices/parity
C5 export/runtime/session
C6 scale/evidence
```

Reverse `C6 -> C0`. Every commit owns only its rows. No partial candidate is accepted or made default.
