# RKP-2 Stage 6 Tracked-byte and EOL Portability Prerequisite — Design

## 1. Problem statement

S6.2 E2 needs a clean native baseline before it may build the Node addon or run the single large evidence request. At E1 candidate `c3c4d198...`, the native baseline is blocked by four Rust tests whose assertions parse their own checked-out source text with LF-only tokens. The repository stores LF blobs, but Windows Git with `core.autocrlf=true` checks the same files out as CRLF because those paths lack explicit attributes.

The same missing checkout contract also makes S6.2's working-tree-byte SHA registry unstable. Two clean worktrees at the same commit can legitimately expose different bytes and therefore different hashes. Hashing those bytes without first fixing their checkout representation does not identify a reproducible evidence source.

The repair has two complementary parts:

1. Git attributes make the seven relevant tracked files always materialize as LF.
2. Rust `#[cfg(test)]` source-shape assertions normalize CRLF in memory before inspecting text, so the assertions remain portable even if the source is supplied outside a conforming Git checkout.

Neither part changes runtime behavior.

## 2. Authority and lifecycle graph

```text
RKP-2 accepted authority line at 55cb575c
    |
    +-- this prerequisite planning -> implementation -> independent audit
    |       -> explicit acceptance/archive/integration decision
    |
    +-- only after integration: create a NEW S6.2 planning candidate
            -> replay E1 logical patch
            -> repair evidence provenance contract
            -> recompute hashes
            -> dedicated planning review
            -> new authorization
            -> E2, then one E3 run

Separate unaccepted diagnostic line:
02ef4af planning -> 5c709b8 A0 -> c3c4d19 E1 -> E2 stopped
```

The diagnostic line is evidence, not an authority base. It is never merged wholesale into this prerequisite.

## 3. Single-owner model

| Concern | Sole owner in this sequence |
|---|---|
| Checkout EOL policy for the seven paths | This prerequisite `.gitattributes` change |
| Rust source-shape assertion portability | This prerequisite, test-only portions of three Rust files |
| Runtime/store/index product semantics | Existing accepted RKP-2 implementation; unchanged |
| S6.2 worker sentinel implementation | Successor S6.2 E1 replay |
| Source-before-evidence and no-archive-reuse enforcement | Successor S6.2 planning/Workspace Law repair |
| Large evidence execution | Successor S6.2 E3 only |
| Qualification and runtime cutover | Later explicit RKP stages |

This prevents `.gitattributes`, Rust test repair and S6.2 evidence provenance from becoming overlapping repair owners.

## 4. Checkout byte contract

### 4.1 Exact `.gitattributes` additions

The implementation adds exactly these path-specific rules:

```gitattributes
crates/brilliant-kernel-runtime/src/runtime.rs text eol=lf
crates/brilliant-kernel-runtime/src/store.rs text eol=lf
crates/brilliant-kernel-runtime/src/indices.rs text eol=lf
test/core-kernel/fixtures/cvn-7-qualification-score.ts text eol=lf
test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts text eol=lf
test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts text eol=lf
test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1 text eol=lf
```

No wildcard such as `*.rs`, `*.ts`, `test/**` or `crates/**` is permitted. Existing five canonical fixture rules remain byte-for-byte unchanged.

### 4.2 Canonical byte definition

For a candidate commit `H` and governed path `P`:

```text
blobBytes(H, P)     = stdout bytes of git cat-file blob H:P
checkoutBytes(H, P) = raw bytes read from P immediately after a clean checkout
canonicalSha(H, P)  = SHA-256(blobBytes(H, P))
```

Acceptance requires:

```text
checkoutBytes(H, P, autocrlf=true)
  == checkoutBytes(H, P, autocrlf=false)
  == blobBytes(H, P)
```

The comparison includes byte length before SHA comparison. The verifier is a small task-local Node script or inline Node program that uses `spawnSync("git", ["cat-file", "blob", `${H}:${P}`], { encoding: null })`, requires `status === 0`, and reads checkout files with `fs.readFileSync()` as `Buffer`. Text decoding, PowerShell pipeline capture, newline normalization in the verifier, `Get-Content`, `git show` captured as text, or line-wise hashing is forbidden because any of them could transform or hide the exact bytes this task owns.

### 4.3 Five future workload hashes

The successor S6.2 task must freeze these five paths in canonical order:

1. `crates/brilliant-kernel-runtime/src/indices.rs`
2. `test/core-kernel/fixtures/cvn-7-qualification-score.ts`
3. `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts`
4. `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts`
5. `test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1`

The prerequisite does not write their future hash values into the old S6.2 task. It publishes candidate-head byte length/SHA evidence only in its own task evidence. The new S6.2 planning task consumes the accepted integration head and computes a new planning registry.

## 5. Rust source-shape test repair

### 5.1 Permitted transformation

At each existing `include_str!` source inspection, the test creates an in-memory LF view before the current split/contains logic:

```rust
let source = include_str!("...").replace("\r\n", "\n");
```

Equivalent code is acceptable only if it satisfies all of the following:

- it is located inside the existing `#[cfg(test)]` module;
- it maps CRLF to LF and does not mutate files;
- it does not delete or weaken any existing structural assertion;
- it introduces no exported item and is absent from non-test builds;
- it does not perform a broad repository rewrite.

The operator may use one private test helper per existing test module only when that reduces duplication without adding a new file or crossing product-module boundaries. A new crate, feature, dependency or shared production helper is forbidden.

### 5.2 Exact sites and preserved assertions

| File/site | Existing LF-sensitive token | Semantic assertion that must remain |
|---|---|---|
| `runtime.rs` `runtime_owns_only_the_live_store_and_revision_zero` | `}\n\n` | Runtime declaration does not retain `ScoreDocumentV1` |
| `store.rs` `every_typed_record_resolves_once_without_retaining_the_document_tree` | `}\n\n` | Store declaration does not retain `ScoreDocumentV1` |
| `indices.rs` metrics source inspection | `}\n\n` | Metrics fields remain exact and no full-document lookup scan field appears |
| `indices.rs` `indices_voice_lookup_then_binary_time_queries_are_exact_and_half_open` | `contents\n            .get` | Private query path uses indices and does not introduce iterator scan/loop |
| `indices.rs` `indices_rebuild_normalizes_without_handles_and_corruption_never_passes_parity` | `}\n\n` | Normalized projection contains no runtime handles |

The large scale test containing the metrics source inspection remains ignored in this prerequisite. A small direct parity test or helper test must exercise both LF and CRLF representations of the same representative source fragment so the fifth change is verified without running the million-entity workload.

### 5.3 Non-test product equivalence

Each governed Rust file has exactly one terminal test-module marker at the accepted base:

| File | Exact marker bytes | Required count in base and candidate |
|---|---|---:|
| `runtime.rs` | `#[cfg(test)]\nmod tests {` | 1 |
| `store.rs` | `#[cfg(test)]\npub(crate) mod tests {` | 1 |
| `indices.rs` | `#[cfg(test)]\nmod tests {` | 1 |

The task-local binary verifier must:

1. read base and candidate Git blobs with `git cat-file blob` as raw `Buffer` values;
2. require the file-specific exact marker to occur once in each blob;
3. take the byte prefix ending immediately before the marker;
4. require base and candidate production-prefix buffers to be byte-identical;
5. require every textual diff hunk in the three files to start at or after its marker.

No brace-counting parser, broad regex, comparison of already-normalized working-tree text, or manual statement that product code did not change is sufficient. This check permits test-module edits while mechanically proving that compiled non-test product regions did not change.

## 6. Fresh-checkout verification design

### 6.1 Isolation roots

All temporary clones and build products live below:

```text
E:\desktop\brilliant_ideas\brilliant_guitar\.tmp\rkp2-eol-portability\
├── checkout-autocrlf-true\
├── checkout-autocrlf-false\
├── cargo-target-1971\
├── cargo-target-1880\
└── transcripts\
```

The operator must set `TEMP` and `TMP` to an E-drive child before Cargo, Node or clone verification. The task never uses C: for build or test output.

### 6.2 Checkout construction

Each verification checkout is a new local clone created without a working tree, then checked out exactly once with a command-scoped `core.autocrlf` value:

```powershell
git clone --no-local --no-checkout <source-repo> <checkout>
git -C <checkout> -c core.autocrlf=true checkout --detach <candidate-head>
git -C <checkout> -c core.autocrlf=false checkout --detach <candidate-head>
```

The verifier must not copy files from the implementation worktree into either checkout. A checkout is invalid if it existed before the run, if checkout did not return exit 0, or if its status is not clean.

### 6.3 Per-path record

For each checkout and each of the seven paths, record:

```json
{
  "path": "<repo-relative path>",
  "byteLength": 0,
  "sha256": "<64 lowercase hex>",
  "indexEol": "lf",
  "worktreeEol": "lf",
  "attribute": "text eol=lf"
}
```

The final evidence contains exactly fourteen checkout records plus seven Git-blob records. Paths are sorted in the exact order defined in the PRD. Duplicate, missing or extra paths invalidate the result.

## 7. Validation layers

### Layer A — path and byte policy

- exact seven attribute rules;
- no wildcard expansion;
- two clean fresh checkouts;
- seven-by-seven byte length/SHA equality;
- Git blob equality;
- `git ls-files --eol` equality.

### Layer B — Rust regression

- Rust 1.97.1 fmt;
- Rust 1.97.1 workspace check;
- Rust 1.97.1 workspace all-target tests;
- Rust 1.97.1 clippy with warnings denied;
- Rust 1.88.0 workspace all-target check;
- four formerly failing tests pass;
- small LF/CRLF parity coverage reaches the fifth ignored-test source inspection;
- existing large opt-in/ignored test does not execute.

### Layer C — repository regression

- child, RKP-2 parent and Rust parent Trellis validation;
- JSON/JSONL parsing and path uniqueness;
- Markdown fence parity;
- `git diff --check`;
- TypeScript typecheck and build;
- focused Workspace Law classifier;
- full Node test classifier;
- independent 80-file manifest recomputation;
- no protected product/public/package/Cargo/toolchain change.

### Layer D — lifecycle

- task stays `in_progress` only after explicit start authorization;
- E3 count remains zero;
- no old S6.2 evidence file is created or copied;
- implementation candidate stops at dedicated independent review;
- acceptance/archive/integration remain separate owner decisions.

## 8. Node baseline classification

This prerequisite must not guess a Node count from another branch. During activation, the operator runs the focused and full commands at the accepted planning HEAD and records:

- process exit code;
- total/pass/fail/skip counts;
- exact sorted failure titles;
- exact 80-file manifest count and SHA-256.

The implementation candidate must reproduce that complete tuple. A failure is accepted as inherited only when its title is present in the activation tuple and all counts match exactly. Any new title, removed non-target title, duplicate summary, count drift or manifest drift is a blocking regression. This rule prevents a general `exit 1 is expected` bypass.

## 9. Evidence artifact

Future implementation writes only:

```text
.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md
```

The file must include:

- candidate HEAD and tree;
- base and planning authority HEADs;
- exact technical diff paths;
- fourteen checkout records and seven blob records;
- Cargo and Node command/exit summaries;
- four former Rust failure titles and their green result;
- ignored-large-test count and proof it did not run;
- production-region equality result;
- E3 run count zero;
- cleanup result for both temporary clones and build roots;
- clean/staged-empty status.

Raw build directories and large transcripts stay ignored under `.tmp`; they are not committed.

## 10. Rollback

Rollback never edits the blocked S6.2 worktree. It reverts only the prerequisite implementation and coordination commits on its branch. Because the base branch stores LF blobs already, reverting `.gitattributes` and the test-only normalization restores the exact `55cb575c` behavior and byte policy.

If a cross-checkout matrix fails, discard the temporary clones and return to the prerequisite implementation source commit. If any Rust product-region byte changes, reject the candidate rather than attempting a broad normalization.

## 11. Successor S6.2 contract

After this prerequisite is independently passed, accepted, archived and integrated:

1. create a new S6.2 planning branch from the exact integration HEAD;
2. mark the old `c3c4d198...` line as diagnostic/unaccepted;
3. replay only the E1 logical changes, not its task/lifecycle state;
4. recompute all five planning hashes on LF bytes;
5. implement the audit-required provenance gates:
   - `sourceHead != evidenceHead`;
   - source is a strict ancestor of evidence;
   - the source commit contains no evidence artifact;
   - source-to-evidence diff matches the exact evidence/lifecycle allowlist;
   - current request, result and sentinel hashes differ from every archived evidence record;
   - booleans such as `fresh_request_generated` are supporting facts, not the sole proof;
6. obtain a new dedicated planning audit P0/P1/P2=`0/0/0`;
7. obtain a new explicit implementation authorization;
8. rerun E2 from the beginning before the single E3 request.

This prerequisite does not itself satisfy any of those successor gates.
