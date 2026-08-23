# RKP-1 Bounded Planning Repair R1

## Audit input and repair authority

- Preserved reviewed candidate: `b619f2409c1624900de352e5c28dde0f8c49767e` on the original branch.
- First independent verdict: `RETURN FOR BOUNDED PLANNING REPAIR`, P0/P1/P2=`0/3/1`.
- Second targeted verdict on candidate `922da5e826bea82267ce82eb4aa6be3df3eb1a5a`: `RETURN FOR BOUNDED PLANNING REPAIR`, P0/P1/P2=`0/2/0`.
- Third targeted verdict on candidate `9741abfee76d009dbea985192e5dfb162e16902a`: `RETURN FOR BOUNDED PLANNING REPAIR`, P0/P1/P2=`0/1/0`.
- Repair base: exact authority closeout `463c8514a61a61a39c8a5d2736261ae9e82b0fba`.
- Required graph: lifecycle-header-only `7174c5ac50655ae0cb8807e21c7045a0c1b6d15e` is a direct child of `463c851...`; one amended RKP-1 planning HEAD is its unique RKP-1 planning direct child; preserved `b619f240...` remains the untouched sibling of `7174c5a...`.
- Current authorized repair scope: only the third review's status-dependent `napi_remove_wrap` ownership-state P1 and direct tests, while preserving every earlier repair. The original P2 is not changed or claimed closed.

Task state remains `planning`; `task_start_run=false`, `production_implementation_authorized=false`, and `independent_planning_review=pending`. No Cargo/Rust/native command was run to produce this planning repair.

## P1 A — Windows native build/load contract

The Node crate is exactly a `cdylib` with Node-API v8. Lock generation is exactly `cargo +1.97.1 generate-lockfile --manifest-path Cargo.toml`. The only RKP-1 native target is Windows `x86_64-pc-windows-msvc` debug:

- source `target/x86_64-pc-windows-msvc/debug/brilliant_kernel_node.dll`;
- destination `target/rkp-1-node/brilliant_kernel_node.node`;
- PowerShell literal source check and `Copy-Item -LiteralPath`;
- `.node` existence/suffix checks;
- direct `process.dlopen` and `require` probes asserting exactly `createKernelSessionV1` and `readKernelSessionV1`;
- the same locked native create/read smoke from a fresh clone, with tracked tree clean and no package allowlist expansion.

Linux, macOS, Windows GNU, ARM and release-artifact loading/qualification are excluded from RKP-1. No cross-platform implementation choice remains.

## P1 B — Closed `StableFailureV1`

`design.md` now owns the exhaustive union: exactly 22 codes, common keys `failureVersion`/`code`, exact required additional keys and closed value enums. Create/read success and rejection wrappers, canonical key order and exact UTF-8 bytes are fixed. Raw serde/napi/native/panic messages and identities are forbidden.

First-failure precedence is exactly eight stages: TypeScript descriptor capture/request size; UTF-8; JSON syntax/one-value/trailing; bounded exact shape/extra/resource/safe-number; API/protocol version; score schema/structure; handle state/owner/non-blocking lock; response cap/panic/internal. Exact-byte, exact-key, adjacent multi-fault precedence, no-leak, detached and immutable tests are required.

The bridge remains a private smoke surface. Existing public TypeScript inventories stay exactly `28/51/8/34/9` with `brilliant-score-1` and default TypeScript runtime unchanged.

## P1 C — Owner-bound non-reentrant opaque handle

Creation stores private Node environment identity, Rust owner thread, live lifecycle generation and one `Mutex<KernelSession>` inside a type-tagged non-enumerable envelope. Read checks unknown, stale, environment, thread and thread-local reentrancy before non-blocking `try_lock`; busy and poisoned results have distinct stable codes. No thread/environment/pointer identity is serialized.

Tests cover foreign environment/thread, stale/unknown, reentrant immediate failure without hang, busy, poison, exact zero state delta and no identity leakage. RKP-1 still exports only create/read. The mutex-owned `KernelSession` is the sole future serialized state owner; adapter metadata is transport lifecycle only and cannot become a second score/revision owner.

## Second-round P1 — Pinned N-API unsafe/type-tag ownership

The only unsafe owner is future file `crates/brilliant-kernel-node/src/boundary.rs`. Six non-Node crate roots use `forbid(unsafe_code)`; the Node root denies unsafe and lowers it only for that module, and both Node root/boundary deny unsafe operations in unsafe functions. Safe public/internal wrappers surround minimum explicit blocks, each with an adjacent `SAFETY` comment that records live-object, fixed-tag, raw-pointer, table/generation and exactly-once ownership invariants. The workspace-law test scans every changed Rust file and rejects any other unsafe token/lint lowering.

The fixed tag is `TypeTag { lower: 0x4252_494c_4c49_414e, upper: 0x545f_524b_5031_5f31 }`. Creation keeps the already-passed unique unsafe owner and two-export law: result/key/capacity preflight occurs before `napi_wrap`; the unique finalizer is installed by wrap; `tag_object` follows; exact table insertion is last. The third-round section below narrows rollback ownership by `napi_status`. `wrap_and_tag`, `napi_add_finalizer`, macro classes, handwritten wrapper alternatives and extra exports remain forbidden.

Read validates object kind and the fixed tag before `napi_unwrap`, pointer dereference or table access. Wrong kind/tag maps to `bridge.handle-unknown` with table lookup/mutation counters at zero. The unique `napi_wrap` finalizer removes the exact table entry and releases token/envelope once. Tests cover tag failure before insertion, every partial-construction rollback, validate-before-dereference, wrong-tag no-registry activity, GC finalizer once, table removal/drop once, no double-free/leak and strict two free-function exports.

## Second-round P1 — Objective commit graph

No sole-child claim is made for the base. The exact statement is: `7174c5a...` is a direct child of `463c851...`; amended HEAD is the unique RKP-1 planning direct child of `7174c5a...`; preserved original candidate `b619f240...` remains the untouched sibling of `7174c5a...`. Neither the original branch nor `b619f240...` is deleted or rewritten.

## Third-round P1 — Status-dependent remove-wrap ownership

The construction guard is now a closed state machine: `PreWrapOwned -> WrappedFinalizerOwns -> RemovedGuardOwns -> Released`. Before wrap it completes the unpublished result, proves the key fresh and calls `HashMap::try_reserve(1)` as the complete capacity preflight while retaining the table guard. `napi_wrap` failure leaves the guard sole owner and one releaser; success immediately transfers sole token release to the registered finalizer. Tag success is followed by the reserved fresh-key insertion as the last recoverable action, so no fallible post-insert rollback exists.

On tag failure, the null-initialized remove out pointer is read only after `napi_status`. `napi_ok` cancels the finalizer and makes the guard owner: equal pointer releases expected once; mismatch/null never touches the unknown return but still releases expected once and returns `bridge.internal`. Non-`napi_ok` keeps finalizer ownership: the out pointer is untouched, the guard releases no token, the table remains absent, and the finalizer later releases token/envelope. The finalizer removes a table entry only when allocation identity and generation both match; it cannot delete a newer generation or another handle.

Fault injection covers remove non-`napi_ok` and `napi_ok` plus mismatched/null pointer. Each asserts canonical `bridge.internal`, no published session/result/table entry, exact guard/finalizer/token/envelope/table counters, unknown-pointer touch count zero, event/observable zero delta, no hang, no double-free/leak and no raw status/pointer leakage. The existing 22 variants, eight-stage precedence and two exports do not change.

## Rereview disposition

This is a third bounded planning repair candidate, not a local acceptance. Only the status-dependent remove-wrap ownership repair and direct regressions await targeted independent rereview; all earlier repairs remain frozen. Required terminal status is `TARGETED PLANNING REREVIEW REQUIRED`.
