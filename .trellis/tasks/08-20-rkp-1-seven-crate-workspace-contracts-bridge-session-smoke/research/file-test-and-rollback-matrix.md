# RKP-1 Exact File, Test and Rollback Matrix

## Future implementation allowlist

Every future changed path must equal one of these literal repository-relative paths. No directory wildcard or sibling is implied.

### Workspace/toolchain

```text
.gitignore
Cargo.toml
Cargo.lock
rust-toolchain.toml
rustfmt.toml
crates/brilliant-core-types/Cargo.toml
crates/brilliant-core-types/src/lib.rs
crates/brilliant-core-types/src/failure.rs
crates/brilliant-core-types/src/json.rs
crates/brilliant-core-types/src/scalar.rs
crates/brilliant-score-foundation/Cargo.toml
crates/brilliant-score-foundation/src/lib.rs
crates/brilliant-score-foundation/src/codec.rs
crates/brilliant-score-foundation/src/dto.rs
crates/brilliant-extension-protocol/Cargo.toml
crates/brilliant-extension-protocol/src/lib.rs
crates/brilliant-extension-protocol/src/contracts.rs
crates/brilliant-kernel-contracts/Cargo.toml
crates/brilliant-kernel-contracts/src/lib.rs
crates/brilliant-kernel-contracts/src/codec.rs
crates/brilliant-kernel-contracts/src/session.rs
crates/brilliant-kernel-runtime/Cargo.toml
crates/brilliant-kernel-runtime/src/lib.rs
crates/brilliant-kernel-runtime/src/smoke_runtime.rs
crates/brilliant-kernel-session/Cargo.toml
crates/brilliant-kernel-session/src/lib.rs
crates/brilliant-kernel-session/src/session.rs
crates/brilliant-kernel-node/Cargo.toml
crates/brilliant-kernel-node/build.rs
crates/brilliant-kernel-node/src/lib.rs
crates/brilliant-kernel-node/src/boundary.rs
```

### Private TypeScript bridge and focused tests

```text
src/core-kernel/native/rust-kernel-smoke.ts
test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.ts
test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.ts
```

### Task state/evidence

```text
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/task.json
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/operator-handoff.md
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/review-candidate.md
.trellis/tasks/08-20-rkp-1-seven-crate-workspace-contracts-bridge-session-smoke/research/implementation-evidence.md
.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json
```

`package.json`, `package-lock.json`, all `tsconfig*.json`, `src/core-kernel/index.ts`, all existing tests, archived tasks and other authority bodies are explicit zero-delta paths even during implementation. The native build/load smoke uses direct Cargo/PowerShell/Node commands and the two named new tests; it must not add a package script or widen this allowlist.

## Stage ownership and rollback

| Stage | Owned paths | Independent proof | Rollback |
|---|---|---|---|
| 1 workspace/toolchain | root Rust files, `.gitignore`, all crate manifests/lib stubs, safe empty Node boundary stub, Node build.rs | exact metadata graph/features/pins, lock generation, Node-API v8 and Node `[lib] cdylib`; six crate-root unsafe forbids plus Node sole-file lowering; toolchain/MSRV check | revert Stage 1; no Rust remains |
| 2 contracts | Core Types/Foundation/Protocol/Contracts source files | strict/canonical/data-only unit tests | revert Stage 2; empty workspace still compiles |
| 3 runtime/session | Runtime/Session source files | immutable create/read Rust tests | revert Stage 3; contracts remain |
| 4 Node bridge | Node source, private TS adapter, Node smoke test | exact Windows `.dll`→`.node` copy/load/export and clean-clone smoke; four-state ownership machine, status-dependent remove-wrap, unsafe/type-tag/finalizer rollback, failure/hostile/panic/owner-handle tests | revert Stage 4; Rust session remains |
| 5 evidence | workspace-law test and exact task/parent evidence files | full matrices/regression/allowlist | revert Stage 5; code candidate unchanged |

## Test matrix

| Boundary | Required cases |
|---|---|
| workspace | exactly seven names/paths, exact direct edges, no cycles, direct pins, lock, Edition/Resolver/MSRV/toolchain, feature matrix, no forbidden owner imports; six non-Node roots `forbid(unsafe_code)`; Node root has exact deny/one-module allow; only Node `boundary.rs` may contain explicit unsafe and every block has adjacent `SAFETY`; exact call-site counts; no other lint lowering |
| Core Types | non-empty IDs, safe integers, depth 64/65, property 1,048,576/1,048,577, lexical object order and bounded stable paths without bridge-code ownership |
| Foundation | canonical smoke document round-trip, exact fields, unsupported schema, duplicate/extra/missing/trailing, deterministic bytes, unknown ExtensionBlock data preservation for fixture |
| Protocol | version/namespace/requirement/descriptor exact data, no executable provider trait/object/host callback |
| Contracts | sole Rust-owned closed `StableFailureV1`; exact create/read success/rejection wrapper bytes, every failure variant bytes/key allowlist, cap 64 MiB/64 MiB+1, invalid UTF-8/JSON, eight-stage adjacent multi-fault precedence, no raw error text |
| Runtime/Session | revision 0, full snapshot equality, history 0/0, clean false-to-dirty never occurs, rejected create no session, no mutable API |
| Windows native | `[lib] cdylib`; exact MSVC debug DLL exists; literal copy to exact `.node`; suffix; `process.dlopen` and `require`; exact export count/names; clean-clone smoke; tracked tree clean; no non-Windows claim |
| Node | exactly two free-function exports; fixed 128-bit type tag; only `boundary.rs` owns the explicit unsafe calls to `napi_wrap`, `tag_object`, `validate_type_tag`, `napi_unwrap`, `napi_remove_wrap`, finalizer pointer recovery/drop; no `wrap_and_tag`, `napi_add_finalizer`, macro class/constructor/method or third export; create/read, rejection no handle, private adapter not public, synchronous/no callback |
| handle owner | exact `PreWrapOwned -> WrappedFinalizerOwns -> RemovedGuardOwns -> Released`; result/fresh-key/`try_reserve(1)` before wrap and tag-success insertion last/infallible; wrap failure guard-drop `1`; tag rollback checks status first; remove non-`napi_ok`: table absent, out read/compare/deref/free `0/0/0/0`, guard/finalizer `0/1`; remove `napi_ok` mismatch/null: address compare `1`, unknown deref/free `0/0`, guard/finalizer `1/0`; both token/envelope drop `1/1`, canonical internal failure, no session/result/event delta, no hang/double-free/leak; finalizer removes only matching live allocation+generation; validate tag before unwrap/table; wrong tag no mutation; owner/reentrant/non-blocking busy/poison precedence and no identity/status leak |
| hostile boundary | getter/Proxy/sparse/cycle/poisoned primordials, detached immutable return, invalid native type mapping, exact first-failure bytes |
| panic | exact contained-panic bytes, no message/path/backtrace/pointer/thread ID, hook forwards unrelated panic, no session partial state |
| compatibility | schema and exact RKP-0 manifest `28/51/8/34/9`, existing app exports unchanged, TypeScript default unchanged |
| regression | focused Rust/Node tests, clean-clone Windows native smoke, typecheck, build, full TypeScript suite; no official qualification |

## File-boundary check

The implementation auditor must generate the changed-path set from the accepted planning commit to implementation head, normalize `/`, compare every path to the literal list above, and separately assert protected groups have zero unlisted delta. A directory prefix match is insufficient.
