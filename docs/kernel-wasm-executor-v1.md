# Private WASM executor V1

This implements the S2.3 execution service inside the existing session crate
and a private contribution-scoped Node binding. Enable
`brilliant-kernel-session/wasm-executor-v1` for the service, or build the separate
`wasm-bridge-v1` Node artifact for the host binding. No eighth host crate, Core
business field, public TypeScript export or default engine change is introduced.
The existing V1 and integrated V2 Node builds do not activate this feature or
gain exports.

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

## S2.3b: authentic contribution-scoped host binding

The private Node host can now opt in through
`installNativeWasmIntegratedBackendV1(addon, catalog, bindings)`. This sidecar is
in `src/native-host/wasm-bindings.ts`, outside the pure Core and public SDK
export/ABI sets. Node crypto/type utilities stay in this host layer; Core has no
outward dependency on it. The authentic compiled catalog remains
the identity and capability authority. Each binding has exactly `moduleId`,
`contributionId`, `abiVersion: 1`, lowercase SHA-256 `sha256`, and `bytes`.
The host validates a dense roster of 1–1024 unique installed contributions,
copies actual Uint8Array intrinsic storage, excludes shared memory and verifies
all hashes before compiling any artifact. Limits are 4 MiB per artifact and
64 MiB across the roster. Hash equality proves artifact integrity, not authority.

Compiled code belongs to the exact catalog/source object. It survives caller
byte mutation and selector restoration; later sessions with another catalog
cannot reuse the selected binding. All six callbacks of a bound contribution
use its guest, with no JS fallback on failure. Unbound contributions still use
their authentic SDK callbacks. A complete session and migration addon is
required, so detached migration cannot silently fall back to JS.

Guest request bytes are strict UTF-8 JSON:

```json
{"callbackVersion":1,"moduleId":"example.module","contributionId":"example.contribution.v1","operation":"commandDecode","definitionId":"example.apply","arguments":[{"target":{},"payload":{}}]}
```

`operation` is `commandDecode`, `commandPrepare`, `effectDecode`,
`effectTransform`, `validate` or `classify`. `definitionId` identifies the
command/effect, or is null for validate/classify. Arguments and result shapes
follow that individual SDK callback. Views contain Core data and only that
contribution's compatible extension blocks. Optional absent values are omitted
from JSON objects; transport preserves negative zero and escaped UTF-16 code
units. The guest must implement the relevant codec if it supports those values.
Output must be valid UTF-8 JSON and passes existing host result validation.

The host owns Core semantics, target checks, all contribution availability,
validator/classifier order, issue-source checks and aggregate assessment.
A guest cannot return aggregate `assess` results or grant itself another
contribution's effects or issue identity. Rust retains transaction/history
ownership and rolls back an effective Batch prefix on guest failure. Guest
instances are fresh for each callback and hold no session handles/host imports.

Build `wasm-bridge-v1` into its own `target/wasm-v1` artifact (eight Node
exports); old V1/V2 remain separate five/seven-export builds. Normal builds do
not enable Wasmi. The nine binding tests use an actual Rust-compiled guest that
computes dynamic pitch/extension edits, not the earlier canned protocol replies.
They cover two bound owners, JS/Wasm coexistence, malicious results, invalid
UTF-8, fuel failure, migration both directions, history/branch/checkpoint/replay,
subscriber/bridge reentry and captured artifact lifetime. Fixture source, lock,
Wasm bytes and reproduction script are under
`test/core-kernel/fixtures/wasm-guest/`.

The fixture uses serde_json, which rejects lone UTF-16 surrogates in values it
parses. Opaque unrelated extensions never enter its view and remain preserved.
This is not a general JS-to-Wasm compiler or a declaration that arbitrary JS
callback implementations have an equivalent Wasm implementation.

## Remaining S2.3 work

Cross-plugin read/dependency declarations, complete resource accounting, platform
and performance qualification, and default product cutover remain unfinished.
The installer is a private trusted composition-root seam, not a public plugin
package loader, authoring SDK or runtime installation UI. No commercial
qualification or default product cutover is claimed.
