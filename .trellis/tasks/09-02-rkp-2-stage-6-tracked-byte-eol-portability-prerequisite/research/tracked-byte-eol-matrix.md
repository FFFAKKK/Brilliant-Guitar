# Tracked-byte and EOL matrix

## Authority checkout observation

Observed at base `55cb575c606646e8449359b0c46d5c905b3bb3c6` with system `core.autocrlf=true`:

| Path | Git index | Working tree | Attribute | Role |
|---|---|---|---|---|
| `crates/brilliant-kernel-runtime/src/runtime.rs` | LF | CRLF | unspecified | source-shape self-check |
| `crates/brilliant-kernel-runtime/src/store.rs` | LF | CRLF | unspecified | source-shape self-check |
| `crates/brilliant-kernel-runtime/src/indices.rs` | LF | CRLF | unspecified | source-shape self-check + workload hash |
| `test/core-kernel/fixtures/cvn-7-qualification-score.ts` | LF | CRLF | unspecified | workload hash |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts` | LF | CRLF | unspecified | workload hash |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts` | LF | CRLF | unspecified | workload hash |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1` | LF | CRLF | unspecified | workload hash |

The observed `git ls-files --eol` projection for each path was `i/lf w/crlf attr/`.

## Required candidate projection

For both fresh-checkout modes:

| Path | Expected Git index | Expected working tree | Expected attribute |
|---|---|---|---|
| all seven exact paths | LF | LF | `text eol=lf` |

`core.autocrlf` is still allowed to differ globally; the path-specific repository contract overrides it for these files.

## Byte-comparison matrix

For candidate `H`, every row below must be true:

| Comparison | Required result |
|---|---|
| checkout(true) byte length vs checkout(false) byte length | equal |
| checkout(true) bytes vs checkout(false) bytes | equal |
| checkout(true) SHA vs checkout(false) SHA | equal |
| checkout(true) bytes vs `git show H:path` bytes | equal |
| checkout(false) bytes vs `git show H:path` bytes | equal |
| checkout status | clean |
| CRLF pair count | zero |

The verifier compares raw byte arrays. A verifier that first decodes or normalizes text is invalid.

## Existing `.gitattributes` authority

The base already fixes five canonical trace/oracle fixture paths to `text eol=lf`. Those rules remain unchanged. This task appends seven explicit entries and does not generalize them to wildcards.

## Hash succession rule

The diagnostic S6.2 hash for `indices.rs`, `d5196f3add959be92ea5bc6c0b3af3388e36bfe65ba623f3f8ab25addbe81fbd`, describes the CRLF working-tree bytes at that attempt. It is not the future accepted hash.

The successor S6.2 task computes:

```text
planning hashes       = five canonical LF files at the new planning base
implementation hashes = the same five paths at the replayed E1 source head
```

Only the worker and worker-test semantic edits may make implementation hashes differ from planning hashes. `indices.rs`, fixture and process wrapper must remain identical between the successor's planning and E1 source heads.
