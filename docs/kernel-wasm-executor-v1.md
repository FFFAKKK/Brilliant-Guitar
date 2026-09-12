# Private WASM executor V1

This implements the execution-service part of S2.3 inside the existing session
crate. Enable `brilliant-kernel-session/wasm-executor-v1` explicitly. No eighth
crate, Core business field, public TypeScript export, Node export or default
engine change is introduced. The existing V1 and integrated V2 Node builds do
not activate this feature.

`WasmExecutorV1` implements the existing `ContributionExecutorV2` byte interface.
It has no document, Store, history or mutation API. Runtime remains responsible
for decoding replies, checking effect ownership and constraints, preparing
transactions and adopting one final result.

## Artifact and execution contract

The host passes owned policy, an expected SHA-256, ABI version 1 and module bytes
to `WasmExecutorV1::capture`. Capture checks size, digest, validated binary and
exact export types before retaining the compiled immutable module. Editing or
discarding the input buffer cannot alter the captured artifact. The digest proves
byte integrity; it does **not** prove SDK authenticity or authorize a module.

All imports are forbidden, including WASI and arbitrary host functions. V1 has
exactly these exports:

| Export | Type | Meaning |
| --- | --- | --- |
| `memory` | wasm32 linear memory | Input/output bytes |
| `brilliant_alloc_v1` | `(i32 length) -> i32 offset` | Reserves a writable input region |
| `brilliant_execute_v1` | `(i32 offset, i32 length) -> i64 packed` | Computes reply bytes |

The output `i64` is interpreted as unsigned bits: high 32 bits are the byte
offset, low 32 bits are the byte length. The host checks the output limit and
checked range before copying. Input/output may alias; input is copied in first
and output is detached before the instance is dropped. The executor performs no
JSON roundtrip, so existing escaped UTF-16, negative zero and precise numeric
spellings survive unchanged. Response semantics still belong to the runtime.

Every callback receives a fresh Store and instance. Guest globals and memory,
including state from a failed invocation, never carry into later callbacks.
Start functions are allowed but share the same fuel and resource policy as
allocation and execution. No wall clock, random source, filesystem, network or
host callback is provided. Pinning Wasmi's deterministic feature canonicalizes
arithmetic NaNs; this is not a substitute for cross-platform qualification.

## V1 resource policy

Host limits may tighten these caps. Guest output cannot change policy.

| Resource | Cap |
| --- | --- |
| Artifact bytes | 4 MiB |
| Fuel per invocation | 10,000,000, including start and allocation |
| Guest linear memory | 64 MiB; at least one aligned 64 KiB page of host allowance |
| Input / output bytes | 16 MiB each |
| Instances / memories | One per call |
| Tables / elements per table | 8 / 16,384 |
| Call depth / value stack height | 256 / 65,536 |

Memory/table growth denial traps. Compilation is eager and uses Wasmi 2.0.0's
`EnforcedLimits::strict()` in addition to the artifact byte cap. Memory64, SIMD,
multi-memory, custom pages and tail calls are excluded by feature/configuration.
Compilation, host copying and all process allocations are not fuel-metered;
these limits are **not** a hard wall-clock or whole-process-memory guarantee.
There is no persistent instance cache or guest-controlled compiler configuration.

Detailed errors are private Rust values. The existing executor trait maps failure
to its closed callback failure, so engine diagnostics and guest strings do not
become new public failure variants.

## Dependencies and verification

Wasmi 2.0.0 declares Rust 1.86 and compiles with the project's Rust 1.88 minimum.
Its optional production dependency is confined to session, with SHA-256 from
`sha2 = 0.10.9`. `wat = 1.228.0` and existing `serde_json` are test dependencies.
All versions are pinned and locked. Existing package versions were not upgraded.
Official references: [Wasmi source](https://github.com/wasmi-labs/wasmi) and
[fuel configuration](https://docs.rs/wasmi/latest/wasmi/struct.Config.html).

Ten actual WASM tests cover capture/hash/ABI/import failures, compiler limits,
fuel exhaustion in each execution phase, memory/table/stack exhaustion, buffer
bounds, lossless bytes and repeatability, and fresh state after guest failure.
Two of those tests exercise the real integrated session: the Core pitch plus
extension commit/undo/redo journey equals the SDK-generated wire results;
fuel exhaustion and invalid prepare/transform/final replies cannot adopt an
effective Core Batch prefix. Attempt telemetry may increase while all document,
history, checkpoint, dirty and availability fields stay unchanged.

Reproduce the SDK-derived protocol fixture after building the existing V2 addon:

```powershell
npm run build
node dist/test/core-kernel/rust-migration/capture-wasm-session-fixture.js --write
cargo test -p brilliant-kernel-session --features wasm-executor-v1 --locked --offline
```

The protocol guest uses fixed replies captured from one genuine SDK journey and
dispatches by operation/document extension presence. It is an execution-seam
fixture, **not** a JS-to-WASM compiler, full business validator, SDK binding or
proof of general multi-module guest support.

## Remaining S2.3 work

The production embedding still binds the JS executor. Connecting this service
requires an authenticated, module-scoped artifact binding and host dispatch that
keeps capability checks and aggregate assessment outside guest control. The
current byte trait represents the existing aggregate callback service; giving a
single untrusted guest authority to assess every installed module would violate
that boundary. Multi-module ownership, malformed module-scoped results, SDK
compatibility and Node lifetime/reentry need end-to-end tests at that binding.

Cross-plugin read/dependency declarations, complete resource accounting, platform
and performance qualification, and default product cutover remain unfinished.
This implementation does not close all of S2.3 or commercial qualification.
