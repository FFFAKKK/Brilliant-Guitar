# Scoped Wasm test guest

`guest.rs` implements dynamic counterparts of the normal CVN6 score/part
callbacks. Malicious markers are deliberate failure fixtures. The standalone
Cargo workspace is test-only and is not an eighth host crate.
It depends on the existing `brilliant-extension-protocol` optional
`scoped-guest-v1` data codec; keep that shared source with this fixture.

Rebuild from the repository root (Rust 1.88 and the target must be installed):

```powershell
rustup target add wasm32-unknown-unknown --toolchain 1.88.0
node test/core-kernel/fixtures/wasm-guest/build.mjs
node test/core-kernel/fixtures/wasm-guest/build.mjs --core-reads-v2
```

The script builds locked/offline, removes only Rust's two linker-layout global
exports, and validates the three-export/no-import ABI. The new opt-in example
writes `guest-v2.wasm` without touching the archived `guest.wasm`.
The original V1 fixture is pinned to its checked-in binary. After adding the
successor guest codec to the shared Rust protocol crate, the current-source V1
rebuild has different bytes. If they differ, the script leaves `guest.wasm`
untouched, writes the candidate under `target/wasm-guest/`, and exits with an
explicit error. Reproduce the archived V1 bytes from its original source commit
`42dec13` instead of substituting a later rebuild into historical evidence.
Keep source, lock, script and binary together. The checked-in binary lets normal
tests run without installing a guest compiler target. It is a test artifact,
not a shipped plugin. Reproduction uses the pinned toolchain on the same host;
cross-host byte identity is not claimed.

The guest selects a typed Core shape and borrows complete measure JSON rather
than materializing every note. `read-last-note` exercises an actual Core read;
it is a test marker, not a public command. All host views remain complete.
Callback values preserve literal marker-like keys and negative zero.
Parsed strings intentionally supply no lone-surrogate compatibility layer;
unparsed borrowed Core text remains intact. Malformed or unsupported decoded
input traps and is rejected atomically.
The unsafe memory operations use pointers into guest linear memory only.

`guest-v2.rs` is a separate, explicitly versioned example. It receives no
complete Core document, requests exact candidate-bound entities over the
Native read exchange, and receives only data replies. A capability probe
rejects V1 artifacts before installation. It retains the same no-import,
three-export Wasm ABI, per-callback fuel, and operation-level limits. The host
still constructs complete candidate projections, so only the guest input is
selective. See `docs/kernel-scoped-core-reads-v2.md` for its boundaries.

The current full-view workload supports 64 bars under unchanged fuel limits;
256-bar editing still exhausts fuel. This is reference-guest evidence, not a
capacity promise for other plugins. See
`docs/kernel-wasm-guest-capacity-2026-09-13.md`.
