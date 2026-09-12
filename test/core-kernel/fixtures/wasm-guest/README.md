# Scoped Wasm test guest

`guest.rs` implements dynamic counterparts of the normal CVN6 score/part
callbacks. Malicious markers are deliberate failure fixtures. The standalone
Cargo workspace is test-only and is not an eighth host crate.

Rebuild from the repository root (Rust 1.88 and the target must be installed):

```powershell
rustup target add wasm32-unknown-unknown --toolchain 1.88.0
node test/core-kernel/fixtures/wasm-guest/build.mjs
```

The script builds locked/offline, removes only Rust's two linker-layout global
exports, validates the three-export/no-import ABI, and writes `guest.wasm`.
Keep source, lock, script and binary together. The checked-in binary lets normal
tests run without installing a guest compiler target. It is a test artifact,
not a shipped plugin. Reproduction uses the pinned toolchain on the same host;
cross-host byte identity is not claimed.

The serde_json parser intentionally supplies no lone-surrogate compatibility
layer; malformed or unsupported input traps and is rejected atomically.
The unsafe memory operations use pointers into guest linear memory only.
