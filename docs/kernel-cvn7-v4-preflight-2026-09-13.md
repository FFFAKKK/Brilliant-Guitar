# Frozen CVN-7 fixtures on Native/Wasm V4

## Outcome

This increment connects the unchanged Qualification V2 fixtures to actual Wasm
editing on the explicit V4 host. It adds a reproducible preflight and differential
tests, without changing host production Rust, the default backend, frozen
fixtures, resource limits or acceptance thresholds.

**Neither preflight passes. No commercial qualification is claimed.** This is
diagnostic evidence, not a partial official qualification publication.

Measured on Windows x64, Node 24.15.0, Intel i9-13900HX, with production source
at `65c1b4e2f19ae3e1cff063bdd33fb51bc8e19313` and the new guest/probe in this
increment. Reports record that parent commit, exact artifact hashes, actual
fixture counts and process results. They are retained in:

- `docs/evidence/cvn7-v4-preflight-representative-2026-09-13.json`
- `docs/evidence/cvn7-v4-preflight-stress-2026-09-13.json`

## Observations

| Fixture / operation | One measured call | Result |
| --- | ---: | --- |
| Representative construction | 1,281.48 ms | Created |
| Representative plugin edit | 482.63 ms | Committed |
| Representative undo | 462.47 ms | Committed; original data restored |
| Representative redo | 472.15 ms | Committed; edited encoding restored |
| Representative cached read | 0.21 ms | Same cached snapshot |
| Stress construction | 4,908.70 ms | `command.internal-error`; no edit attempted |

The representative fixture has 25,600 events and 12,800 notes. Stress has
102,400 events and 51,200 notes. Counts are checked against the frozen V2
contract, not just trusted from generator metadata.

These are one-call timings, **not p95/p99**. Representative editing is clearly
far from the frozen p95 <= 8 ms / p99 <= 16 ms gate. The cached-read sample
does not prove its p95 <= 1 ms gate. Peak process RSS was 500,658,176 bytes
and 1,294,495,744 bytes respectively; it includes fixture generation and
untimed oracle/equality checks. The failed stress construction is not evidence
that a successful stress editing run fits the memory budget.

### Encoding compatibility

Deep strict equality succeeds both immediately after Native admission and after
undo. Unknown extension data survives. However, `encodeScoreDocumentJson` uses
JSON object insertion order, while Rust's lossless object maps sort keys.
For example, the first extension payload keys change from
`marker, generatorVersion` to `generatorVersion, marker`.

- Generated input hash:
  `93a2bdcd5f9661705fa4364f02b44297ffeb7f4d504c231535d5fcd5d0295b78`
- Initial Native snapshot and undone snapshot hash:
  `e8f4b3b69c4dff4b0837083ec0e21a5f5f7a45ba2e7f7c5b1c6d882ab9e4fb11`

This is not evidence of data loss or a broken inverse transaction. It is an
unresolved mismatch with the existing CVN-7 worker's original-input byte-hash
check. The new preflight records both facts and exits 1; it does not silently
canonicalize the frozen oracle or declare compatibility complete.

### Stress admission and diagnostic capacity

The frozen TS profile oracle reports `unsupported`, with 6,401 diagnostics:
one `unsupported.part-count` and 6,400 `unsupported.voice-count`. Representative
has 1,601 such diagnostics. These are supportedness facts, not invalid document
semantics.

Rust's `CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1` is 4,096. The integrated constructor
uses `ScoreFeatureProfileV1::k1()` and maps assessment errors to
`command.internal-error`. Thus the frozen stress fixture and this assessment
policy have a concrete capacity conflict. An additional private callback wrapper
observed failure before the first host assessment callback, with a 15,016,222-byte
input containing 1,199,334 JSON values, below the 64 MiB input and 1,572,864-value
limits. This narrows the failure to the pre-callback Native path; no internal
Rust failure trace was added in this increment.

Do not fix this by dropping unsupported diagnostics, raising all caps, changing
the fixture, or removing the failure gate. Resolve bounded diagnostic reporting
and its compatibility contract explicitly, with a focused boundary regression.
The microkernel also needs a clear separation between valid score structure
and restrictions belonging to a particular product feature profile.

## What was added

- A separate `guest-cvn7.rs` / `guest-cvn7.wasm` implementing the frozen synthetic
  score/part module decode, prepare, effect decode/transform, validation and
  classification over the bounded guest V2 ABI. The synthetic validators
  intentionally return no issues, exactly like the frozen module; they are not
  substitutes for real product plugin validation.
- A test-only V4 installer and differential tests for editing, mixed Batch,
  history, events, rejected inputs and detached migration. Tests include lone
  UTF-16 surrogates, signed zero and preservation of unknown extension data.
  SDK callbacks are used only to generate oracle results; actual V4 execution
  leaves the callback trace empty.
- `scripts/probe-native-qualification-v4.mjs`: fresh child process, 60-second
  diagnostic timeout, public operation timing, fixture counts, data/encoding
  checks, callback checks, memory and artifact provenance. Both current fixtures
  return exit 1 for their documented preflight failures.

## Reproduction and validation

From the repository root, with Cargo and the existing native build prerequisites
on PATH:

```powershell
node scripts/build.mjs
node test/core-kernel/fixtures/wasm-guest/build.mjs --cvn7
node --test dist/test/core-kernel/rust-migration/cvn-7-native-wasm.test.js
node scripts/probe-native-qualification-v4.mjs representative
node scripts/probe-native-qualification-v4.mjs stress
```

Use the V4 native artifact built from the matching production source; see
`docs/kernel-lazy-core-projection-2026-09-13.md` for its build context. Neither
the new probe nor guest build rebuilds the host addon. Do not replace artifacts
while tests or measurements are running.

- Full Node/Native regression: **891 total, 889 passed, 2 skipped, 0 failed**.
- TS build passed; new Wasm guest built with Rust 1.88.0 for
  `wasm32-unknown-unknown`; an unchanged-source repeat was byte-identical.
- Guest Clippy passed on Rust 1.97.1 for the host target with `-D warnings`.
  Rust 1.88 lacks Clippy locally, and Rust 1.97.1 lacks the Wasm target locally;
  this is not a claim of Wasm-target Clippy coverage.
- Production Rust was unchanged. The preceding host Rust result remains
  579 passed / 1 ignored; the full host suite was not rerun this increment.
- Archived `guest.wasm` and existing `guest-v2.wasm` bytes remain unchanged.

Artifacts:

| Artifact | SHA-256 |
| --- | --- |
| `guest-cvn7.wasm` (166,545 bytes) | `e0a8cf1c2ca35156a836ee4cc64bf7dc35e62590931647e2f93cb1deee6ff69c` |
| `target/wasm-v1/brilliant_kernel_node.node` | `948101f2c264616f5d69dd2b0fcbcbf6b682c6ef142f54e32d4393ca3586e1d6` |

## Next development order

1. Reproduce and resolve stress diagnostic exhaustion with accurate bounded
   failure reporting and an explicit supportedness compatibility decision.
2. Resolve encoding/hash compatibility without weakening unknown-data
   preservation or silently rewriting the frozen oracle.
3. Replace remaining full-document candidate capture and semantic/profile scans
   on local edits with affected-region work, preserving atomicity and validation.
4. Once these preflights work, implement the full frozen qualification method:
   five fresh-process warmups, twenty measured samples, Batch/replay, long
   stress sequences and independently observed complexity/memory.
5. Complete real product-plugin/UI integration, default cutover and release
   review before claiming commercial readiness.

Foundational editing can support further integration work. These observations
do not justify increasing a commercial-completion percentage: performance,
stress capacity and release qualification remain substantive open work.
