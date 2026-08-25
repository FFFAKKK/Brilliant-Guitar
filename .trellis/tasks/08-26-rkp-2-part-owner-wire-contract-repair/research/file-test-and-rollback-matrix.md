# File, Test and Rollback Matrix

## 1. Planning ownership

| Set | Paths | Planning action |
| --- | ---: | --- |
| New child artifacts | 11 | create complete planning candidate |
| RKP-2 projection | 3 | current blocking child, S6 pause and next gate only |
| Rust-parent projection | 1 | blocking descendant and next gate only |
| Production/test/spec/config | 0 | protected zero-delta |

## 2. Future technical allowlist

| Path | Stage | Purpose | Rollback |
| --- | --- | --- | --- |
| `crates/brilliant-score-foundation/src/dto.rs` | R1 | exact Part field serde rename and Part unknown-field closure | revert R1 |
| `crates/brilliant-score-foundation/src/codec.rs` | R1 | direct Part mapping/Part-extra rejection and exact Score round-trip tests | revert R1 |
| `crates/brilliant-kernel-contracts/src/codec.rs` | R2 | public request and stable failure bytes | revert R2 |
| `test/core-kernel/rust-migration/rkp-2-store-fixtures.ts` | R2 | ordered score/Part unknown blocks | revert R2 |
| `test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts` | R2 | native create/read and zero handle | revert R2 |
| `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` | R2 | allowlist, attributes and public counts | revert R2 |

No seventh path is implicit. `crates/brilliant-kernel-runtime/src/store.rs`, Node source, package/Cargo files and TypeScript production are read-only context.

## 3. Lifecycle allowlist

- child task artifacts, plus future `research/implementation-evidence.md`;
- RKP-2 `task.json`, `operator-handoff.md`, `review-candidate.md`;
- Rust parent `task.json`.

The lifecycle set records blocking/resume state only. It does not own the public wire or technical behavior.

## 4. Test matrix

| Case | Direct Foundation | Contracts | Native | Required result |
| --- | ---: | ---: | ---: | --- |
| score owner exact | yes | yes | yes | accepted, exact output |
| Part owner `partId` | yes | yes | yes | accepted, only camelCase output |
| `part_id` only | yes | yes | yes | reject, no alias/handle |
| both spellings | yes | yes | yes | reject extra, no handle |
| Part owner other extra | yes | yes | yes | Foundation struct fields and public boundary reject |
| score owner extra | no | yes | yes | Contracts/TypeScript public exact-shape owner rejects; zero handle |
| Part ID wrong type/empty | optional | yes | yes | existing exact stable failure |
| missing Part reference | validation | yes | yes | existing invalid-reference |
| score + Part unknown blocks | canonical | request | create/read | nested/order lossless |
| repeated read and mutation | n/a | encode | read twice | identical, detached |
| public inventories | n/a | workspace law | loaders | exact zero drift |

## 5. Stage gates

- R0: lifecycle and Trellis only.
- R1: Foundation fmt/test/clippy.
- R2: Foundation+Contracts, TypeScript build, workspace-law and real native focused suites.
- R3: full Rust 1.97.1, MSRV 1.88.0, dynamic full runner, native loaders/GC, Trellis, JSON/JSONL, allowlist and protected delta.

## 6. Rollback destinations

| Point | Destination | Preserved facts |
| --- | --- | --- |
| planning rejected | `ce673a2...` | original RKP-2 S6.0, no child implementation |
| R0 rejected | accepted planning head | reviewed plan, no production delta |
| R1 rejected | R0 commit | active blocked child only |
| R2 rejected | R1 commit | narrow serde fix/direct tests retained |
| R3 evidence rejected | R2 commit | technical proof retained, candidate reopened |
| implementation audit rejected | exact R3 candidate parent as directed | no archive/integration/S6 resume |
| closeout rejected | accepted implementation candidate | active child authority restored |

No rollback rewrites or removes `ce673a2`, the accepted runner repair, Stage 1–5 history or other worktrees.

## 7. Protected-delta queries

Planning must prove relative to `ce673a2...`:

- `src/**`, `test/**`, `crates/**`, `Cargo*`, `rust-toolchain.toml`, `rustfmt.toml`, `package*.json`, `tsconfig*.json`, `.trellis/spec/**` are unchanged;
- changed paths equal the eleven child artifacts plus the four narrow parent projection paths;
- RKP-2 parent lists this child exactly once and Rust parent retains RKP-2 as the sole active implementation child.
