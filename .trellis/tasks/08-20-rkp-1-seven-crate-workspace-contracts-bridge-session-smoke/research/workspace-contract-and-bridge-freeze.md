# RKP-1 Workspace, Contract and Bridge Freeze

## Exact project dependency adjacency list

```text
brilliant-core-types         -> []
brilliant-score-foundation   -> [brilliant-core-types]
brilliant-extension-protocol -> [brilliant-core-types]
brilliant-kernel-contracts   -> [brilliant-core-types, brilliant-score-foundation, brilliant-extension-protocol]
brilliant-kernel-runtime     -> [brilliant-core-types, brilliant-score-foundation, brilliant-extension-protocol, brilliant-kernel-contracts]
brilliant-kernel-session     -> [brilliant-kernel-runtime, brilliant-kernel-contracts, brilliant-extension-protocol]
brilliant-kernel-node        -> [brilliant-kernel-session, brilliant-kernel-contracts]
```

Cargo metadata tests compare sorted direct path dependencies to these exact arrays. Transitive reachability cannot justify an undeclared direct edge. Workspace member count, names and paths equal seven exactly.

## Exact external direct dependencies

| Owner | Dependency | Exact version/features |
|---|---|---|
| Core Types, Foundation, Extension Protocol, Kernel Contracts | `serde` | `=1.0.229`, `derive` only where deriving |
| Foundation, Kernel Contracts | `serde_json` | `=1.0.151`, default standard support |
| Kernel Node | `napi` | `=3.12.0`, defaults off, `napi8` through one crate feature |
| Kernel Node | `napi-derive` | `=3.6.2`, defaults off, `strict` |
| Kernel Node build | `napi-build` | `=2.4.0` |

No other direct external dependency is allowed. `Cargo.lock` freezes transitives. A Cargo feature/dependency drift test parses metadata; source-text matching alone is insufficient.

## Exact feature matrix

| Crate set | Features |
|---|---|
| six non-Node crates | `default=[]`; no optional features |
| `brilliant-kernel-node` | `default=["node-api-v8"]`; exactly `node-api-v8=["napi/napi8"]` |

No feature selects TypeScript/Rust runtime, changes a DTO, enables a handler/provider, or creates a second semantic path. `--all-features` and `--no-default-features` must both compile; the focused native smoke uses the default Node feature.

## Exact unsafe law

- `brilliant-core-types`, `brilliant-score-foundation`, `brilliant-extension-protocol`, `brilliant-kernel-contracts`, `brilliant-kernel-runtime` and `brilliant-kernel-session` each put `#![forbid(unsafe_code)]` at the crate root.
- `brilliant-kernel-node/src/lib.rs` puts `#![deny(unsafe_code)]` and `#![deny(unsafe_op_in_unsafe_fn)]` at the crate root and has exactly one lowering declaration: `#[allow(unsafe_code)] mod boundary;`.
- `brilliant-kernel-node/src/boundary.rs` is the only file allowed to contain explicit unsafe blocks and itself denies unsafe operations in unsafe functions. Its exported Rust wrappers are safe; the N-API finalizer has the required ABI but still places each unsafe operation in its own explicit block.
- Every unsafe block is immediately preceded by `// SAFETY:` and names the live JS argument, successful fixed-tag validation where applicable, raw-pointer provenance, table/generation state and exactly-once owner responsible for release.
- The workspace-law scanner allows the seven exact crate-root unsafe lint lines above, but rejects explicit unsafe blocks/functions/impls/traits/extern blocks outside `boundary.rs`, any other lint lowering, any missing `SAFETY` comment, `wrap_and_tag`, `napi_add_finalizer`, a macro class/constructor/method, or a third `#[napi]` export. It counts exactly one production call site each for `napi_wrap`, `tag_object`, `validate_type_tag`, `napi_unwrap`, `napi_remove_wrap` and `Box::from_raw`; raw-pointer dereference is confined to `boundary.rs`.

## Contract types frozen in RKP-1

### Core and score

- `ApiVersionV1(1)`, `ScoreSchemaVersionV1("brilliant-score-1")`.
- non-empty stable ID string; JSON numeric values limited to JavaScript safe integers where the existing contract uses numbers.
- revision/document version starts at `0` and uses a safe non-negative integer wrapper.
- bounded JSON: null/bool/safe-number/string/array/lexically ordered object, depth 64, at most 1,048,576 nodes/properties.
- structural `ScoreDocument` fields exactly match the accepted TypeScript contract; array order is preserved and object field order is canonical. RKP-1 proves a canonical single-measure/single-part smoke document only and does not claim full semantic parity.

### Session create/read

```text
KernelSessionCreateRequestV1
  apiVersion: 1
  document: ScoreDocument

KernelSessionCreateSuccessV1
  apiVersion: 1
  status: created
  value:
    documentId: StableId
    documentVersion: 0

KernelSessionCreateRejectedV1
  apiVersion: 1
  status: rejected
  failure: StableFailureV1

KernelSessionReadResultV1
  apiVersion: 1
  status: ok | rejected
  value when status=ok:
    snapshot: { documentId, schemaVersion, documentVersion, document }
    history: { undoDepth: 0, redoDepth: 0 }
    dirty: false
  failure when status=rejected: StableFailureV1
```

`brilliant-kernel-contracts` solely owns `StableFailureV1`, the closed `failureVersion: 1` + `code` union in `design.md`; each code has a required exact key list and no optional/extension map. Core Types owns only bounded path/scalar primitives, nested crates return private typed classifications, and Node maps to the Contracts-owned bridge variants. Canonical result bytes use exact declaration order and no whitespace/BOM/LF. The stable path type contains only bounded static field names/array indices. No variant can contain raw serde/napi/native/panic text or thread/environment identity.

RKP-1 reserves no submit/undo/redo/replay/select/markPersisted wire method. Those capabilities are added only by their owning later stage.

## Exact bridge ABI

- Node-API level: 8, required for private object type tags.
- Node manifest: exactly `[lib] crate-type=["cdylib"]`.
- Raw private export names: `createKernelSessionV1`, `readKernelSessionV1` and no others.
- Request/result payload transport: owned Node `Buffer` containing canonical UTF-8 JSON.
- Session transport: an empty plain Node object with no user-visible enumerable field, fixed N-API v8 `TypeTag { lower: 0x4252_494c_4c49_414e, upper: 0x545f_524b_5031_5f31 }`, and one wrapped token; no pointer-sized number or string token is exposed.
- Create returns one generated native result object with `payload` and optional `handle`. Rejection never returns a handle.
- Read accepts `unknown`, validates/type-tags/unwraps inside the guarded boundary and returns one buffer. The public TypeScript-facing adapter catches any residual native throw without retaining its message and maps it to `bridge.internal`; raw addon exports are not application exports.
- Synchronous only; no Promise, async runtime, worker, callback or reentrant JS call.

The only permitted pinned napi `3.12.0` composition lives in `boundary.rs`. Before wrap, create the complete unpublished result, prove the allocation/generation key fresh and retain a private table guard after `HashMap::try_reserve(1)` completes the capacity preflight. The closed ownership states are `PreWrapOwned`, `WrappedFinalizerOwns`, `RemovedGuardOwns`, `Released`. Unsafe `napi_wrap` success transfers the token from guard to the unique finalizer; failure leaves the guard owner. Unsafe `tag_object` success is followed only by the reserved, fresh-key, last-step infallible table insertion and immediate return. `wrap_and_tag`, `napi_add_finalizer`, macro classes and handwritten wrapper alternatives remain forbidden.

Tag failure calls unsafe `napi_remove_wrap` with a null-initialized out pointer and checks status before reading it. On `napi_ok`, finalizer ownership is cancelled and the guard becomes sole owner: equal returned/expected addresses release expected once; mismatch/null never dereferences/frees the unknown return but still releases expected once and returns `bridge.internal`. On non-`napi_ok`, the out pointer is untouched and finalizer ownership remains; the guard releases no token, the table stays absent, the unpublished result is discarded and the finalizer later releases token/envelope. The finalizer conditionally removes only an entry matching both its allocation identity and generation, then drops token exactly once. No path adds a failure variant, public export or raw status/pointer data.

The private table is keyed only by wrapped allocation identity plus monotonically increasing generation and holds one `Arc<HandleEnvelope>`. It exists solely for lifetime/stale validation. The envelope privately stores the live generation, creation `napi_env`, creation `ThreadId` and one `Mutex<KernelSession>`; it stores no score/revision/snapshot truth and is not an indexed runtime store. The unique finalizer installed by `napi_wrap` removes the exact table entry, marks the test seam stale, drops the table's `Arc`, then reconstructs/drops the boxed token exactly once; no other path installs a finalizer or frees a committed handle.

Each read checks object kind and fixed tag before token dereference or any table lookup/mutation. Wrong kind/tag maps to `bridge.handle-unknown` with registry counters unchanged. Only after successful unsafe `validate_type_tag` may unsafe `napi_unwrap` retrieve the token; the safe wrapper then performs exact live allocation/generation lookup, environment, thread and thread-local-reentrant checks in that order before session `try_lock`. `WouldBlock` maps to `bridge.handle-busy` and `Poisoned` to `bridge.handle-poisoned`; blocking `lock` is forbidden. The same session mutex remains the only future serialized writer owner.

## Exact Windows native build/load projection

- Lock creation: `cargo +1.97.1 generate-lockfile --manifest-path Cargo.toml`.
- Debug build: `cargo +1.97.1 build --manifest-path Cargo.toml --package brilliant-kernel-node --target x86_64-pc-windows-msvc --locked`.
- Source artifact: `target/x86_64-pc-windows-msvc/debug/brilliant_kernel_node.dll`.
- Load artifact: `target/rkp-1-node/brilliant_kernel_node.node`.
- Copy: PowerShell `Copy-Item -LiteralPath $nativeSource -Destination $nodeTarget` after literal source existence check.
- Load: both `process.dlopen(...path.resolve('target/rkp-1-node/brilliant_kernel_node.node'))` and `require('./target/rkp-1-node/brilliant_kernel_node.node')` must expose exactly the two frozen export names.
- Clean clone: repeat locked build, literal copy, two loaders and create/read smoke at the exact candidate; ignored `target/**` leaves `git status --porcelain` empty and no `package*.json`/lockfile/script change is permitted.

Only Windows `x86_64-pc-windows-msvc` debug is qualified by RKP-1. Linux/macOS, Windows GNU, ARM and release artifact/load decisions are excluded rather than left to the implementer.

## Codec precedence

Validation order is observable and fixed to the eight stages in `design.md`: TypeScript descriptor capture/request size; UTF-8; JSON syntax/one-value/trailing; bounded preorder exact-shape/extra/duplicate/type/tag/resource/safe-number checks; API then protocol version; score schema then structure; handle unknown/stale/environment/thread/reentrant/try-lock; response cap then panic/internal. Create skips the handle stage and read begins at it. Only the first owning failure is returned; adjacent-stage multi-fault tests assert exact winner bytes and exact key allowlists. No raw library/native text is retained.

## Panic boundary

The Node adapter guards every Rust call with thread-local scope plus `catch_unwind`. A process-global wrapper hook forwards unguarded panics to the prior hook and suppresses guarded panic details. The contained result is exactly `bridge.panic-contained`. Panics cannot produce a handle or partially update a session. The RKP-1 read path is immutable, so zero-delta is structurally enforced.

## Deliberately absent

No indexed `LiveScoreStore` or semantic handle registry, mutations, commands, ChangeSets, history, events, semantic validator, provider callback, WASM, gateway, catalog, plugin instance, public SDK, Tauri bridge, runtime selector, Product Host integration or cross-platform/release packaging matrix exists in RKP-1. The private allocation/generation table and per-envelope generation exist only to own native lifetime and classify stale transport handles; they are not a semantic/runtime index or a second state owner.
