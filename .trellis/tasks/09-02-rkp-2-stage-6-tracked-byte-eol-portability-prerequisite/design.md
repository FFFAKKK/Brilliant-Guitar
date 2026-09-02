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

The only permitted edit to each existing inspection is the exact binding/expression change frozen in `I0_EXPECTED_PATCH.diff` and spelled out in section 8.3. An equivalent spelling is not accepted because it would invalidate the independently frozen expected-transition lane. Every frozen edit must also satisfy all of the following:

- it is located inside the existing `#[cfg(test)]` module;
- it maps CRLF to LF and does not mutate files;
- it does not delete or weaken any existing structural assertion;
- it introduces no exported item and is absent from non-test builds;
- it does not perform a broad repository rewrite.

No helper is added. `runtime.rs`, `store.rs`, the `indices.rs` query site and the `indices.rs` projection site use the exact direct expressions in section 8.3. The metrics site uses the exact shadowing binding shown there to keep the owned normalized string alive. A new helper, alternate binding name, crate, feature or dependency is forbidden.

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

The task-local verifier must use one deterministic Rust lexical scanner over the Git-blob bytes. Its states are `code`, `line-comment`, nested `block-comment`, cooked string/byte-string, raw string/byte-string with counted `#` delimiters, and char/byte-char. Braces change depth only in `code`. Unterminated state, invalid UTF-8, a second marker, or an unmatched brace invalidates the candidate.

For each base and candidate blob the verifier must:

1. require the file-specific exact marker to occur once;
2. start at the marker's opening `{`, locate the matching module-closing `}`, and require every following byte to be ASCII whitespace;
3. require the raw byte prefix before the marker to be byte-identical between base and candidate;
4. locate by unique exact function name the five existing inspection functions:
   - `runtime_owns_only_the_live_store_and_revision_zero`;
   - `every_typed_record_resolves_once_without_retaining_the_document_tree`;
   - `rkp2_stage_6_private_scale_evidence_v1`;
   - `indices_voice_lookup_then_binary_time_queries_are_exact_and_half_open`;
   - `indices_rebuild_normalizes_without_handles_and_corruption_never_passes_parity`;
5. require exactly one new test function named `source_shape_normalization_is_lf_crlf_invariant`, located inside the `indices.rs` test module;
6. parse `git diff --unified=0`; for each of the five existing inspections, require both old and new hunk ranges to lie fully inside its corresponding matched function; for the new parity function, require a zero-length old insertion range immediately before the terminal module's matching closing brace and the complete new range to equal that single function;
7. require the five existing functions' only token changes to be the CRLF-to-LF normalization binding/expression; all pre-existing negative assertions and all other tokens remain equal;
8. require the new parity function to exercise the same normalization on LF and CRLF versions of a representative `Rkp2StoreMetrics` declaration, compare the normalized values, then run the `split("pub(crate) struct Rkp2StoreMetrics {")` and `split("}\n\n")` extraction on both;
9. remove the five permitted normalization edits and the one permitted parity function from the candidate in memory and require the reconstructed bytes to equal the base blob exactly.

Step 2 rejects the audited suffix bypass: a new top-level item after the test module makes the module-closing suffix non-whitespace. Steps 6-9 also reject unrelated edits inside the test modules. A prefix-only comparison, broad regex, line-number-only hunk check, comparison of normalized working-tree text, or manual statement that product code did not change is insufficient.

Before inspecting the real candidate, the same verifier must pass five synthetic self-tests: accept the exact permitted patch model; reject a top-level function appended after the module; ignore braces inside cooked/raw strings and nested comments; reject a hunk in an unrelated test function; reject deletion or mutation of one preserved negative assertion. Its complete source text and SHA-256 are copied into `implementation-evidence.md`, so the independent reviewer can rerun the identical verifier rather than trusting a prose result.

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
- four primary assertion signatures and exact `3 + 1` cause split;
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
- one deterministic primary assertion signature per failing title;
- exact 80-file manifest count and SHA-256.

### 8.1 Confirmed planning causes

The clean planning HEAD's four failures are recorded separately rather than as one cause:

| Failure title | Primary planning cause |
|---|---|
| `implementation changes stay inside the literal RKP-2 allowlists` | new planning child's `check.jsonl` is outside an older exact path set |
| `Stage 6 hostile and resource evidence consumes the existing private Rust seams` | new planning child's `check.jsonl` is outside an older Stage 6 path set |
| `Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts` | new planning child enlarges the historical closeout path projection |
| `part owner repair stays anchored to its accepted six-path wire contract` | inherited base drift: historical blob assertion expects the pre-RKP-1A property cap `1_048_577`, while accepted RKP-1A authority is `1_572_865` |

All four are non-product governance failures, but they are not interchangeable and are not waived by title equality.

### 8.2 Primary assertion signature

I0 and I3 must use Node's programmatic test runner with these fixed options:

```text
files: [<absolute compiled rkp-2-workspace-contracts.test.js>]
isolation: "none"
concurrency: 1
```

The capture script consumes the stream through its terminal event and records `process.version`. Default process isolation is forbidden because it exposes only a file-level failure. For each exact title, the title-level `test:fail` event must have:

```text
data.details.error.code        == "ERR_TEST_FAILURE"
data.details.error.failureType == "testCodeFailure"
data.details.error.cause       == exactly one inner AssertionError
```

The script unwraps exactly one `.cause` level. The inner value must have `name === "AssertionError"`, `code === "ERR_ASSERTION"`, no further `.cause`, and own `operator`, `actual`, `expected` and `generatedMessage` fields. Missing, extra-wrapper, file-level-only or malformed events invalidate capture. Exclude stack, duration, absolute line numbers and ANSI output. Canonicalize and hash this data-only record:

```text
{
  "title": "<exact title>",
  "outerErrorCode": "ERR_TEST_FAILURE",
  "outerFailureType": "testCodeFailure",
  "errorName": "AssertionError",
  "errorCode": "ERR_ASSERTION",
  "operator": "<strictEqual|deepStrictEqual|...>",
  "generatedMessage": <captured true|false>,
  "messageSha256": "<sha256 of direct error.message UTF-8>",
  "actualSha256": "<sha256 of canonical JSON actual>",
  "expectedSha256": "<sha256 of canonical JSON expected>"
}
```

Canonical JSON permits only null, boolean, finite number, string, arrays and plain objects with lexically sorted keys; encountering another value type invalidates capture. Each title must emit exactly one signature. I0 freezes the four baseline records. I3 does not compare every candidate record directly to that baseline; it executes the independent control/expected/candidate comparisons in section 8.3.

The programmatic capture script's complete source and SHA-256 are also stored in `implementation-evidence.md`; I0 and I3 must use the same hash. A different capture script invalidates the comparison.

### 8.3 Control replay and predeclared allowed transition

Full equality between the I0 baseline signatures and the implementation candidate is not required, because the approved `.gitattributes`/Rust path additions intentionally change the first unknown-path failure for three historical governance tests. The comparison must therefore distinguish a reproduced baseline from a prediction made before the candidate exists. The operator performs this exact sequence:

1. apply only the audited lifecycle projection, run `task.py start`, and create one clean A0 commit;
2. set `I0_SOURCE_HEAD` to that exact A0 commit before any technical edit or evidence file exists;
3. record the Node executable path, `process.version`, compiled focused-test path, capture-script bytes/SHA-256 and I0 baseline tuple;
4. from `I0_SOURCE_HEAD`, construct the control and expected-transition lanes below before editing the active implementation branch;
5. freeze their records and the expected patch bundle before I1 starts.

The three lanes are:

1. **Control lane** — a fresh detached checkout of `I0_SOURCE_HEAD`; its signatures must equal the I0 activation signatures byte-for-byte.
2. **Expected-transition lane** — a second fresh detached checkout of `I0_SOURCE_HEAD`; before any candidate exists, apply the deterministic four-file technical patch bundle defined below and create the exact final coordination-path projection. New evidence paths use the fixed UTF-8 placeholder `EOL_EXPECTED_TRANSITION_V1\n`. Before freezing signatures, repeat the capture after changing each placeholder independently to `EOL_EXPECTED_TRANSITION_V2\n`; every signature must remain byte-identical, proving that content is irrelevant and only the predeclared path set drives the historical assertion. If any placeholder-content mutation changes a signature, stop in I0 and return to planning. The section 5.3 verifier and exact path-set checker must accept this synthetic tree. Capture and freeze `EXPECTED_I3_SIGNATURES` plus the synthetic patch bundle SHA-256.
3. **Candidate lane** — the eventual I3 implementation/evidence HEAD; capture its signatures with the same Node version and same capture-script SHA.

The expected technical bundle is generated only from `I0_SOURCE_HEAD`, never from the later candidate. It contains exactly the seven `.gitattributes` lines in section 4.1 and six Rust edits. The five existing sites use these exact replacement forms:

```rust
// runtime.rs
let source = include_str!("runtime.rs").replace("\r\n", "\n");

// store.rs
let source = include_str!("store.rs").replace("\r\n", "\n");

// indices.rs metrics site
let metrics_source = include_str!("indices.rs").replace("\r\n", "\n");
let metrics_source = metrics_source
    .split("pub(crate) struct Rkp2StoreMetrics {")
    // the existing chain continues unchanged

// indices.rs query site
let source = include_str!("store.rs").replace("\r\n", "\n");

// indices.rs projection site
let source = include_str!("indices.rs").replace("\r\n", "\n");
```

The sixth edit is exactly this test inserted immediately before the matched closing brace of the terminal `indices.rs` test module:

```rust
#[test]
fn source_shape_normalization_is_lf_crlf_invariant() {
    let lf = "pub(crate) struct Rkp2StoreMetrics {\n    entity_index_lookups: usize,\n}\n\n";
    let crlf = lf.replace('\n', "\r\n");
    let normalized_lf = lf.replace("\r\n", "\n");
    let normalized_crlf = crlf.replace("\r\n", "\n");
    assert_eq!(normalized_lf, normalized_crlf);

    for source in [&normalized_lf, &normalized_crlf] {
        let declaration = source
            .split("pub(crate) struct Rkp2StoreMetrics {")
            .nth(1)
            .expect("metrics declaration")
            .split("}\n\n")
            .next()
            .expect("metrics fields");
        assert_eq!(declaration, "\n    entity_index_lookups: usize,");
    }
}
```

The I0 generator implements these as unique exact-text substitutions against the base blobs, requires one match per substitution, runs the five verifier self-tests, and emits `I0_EXPECTED_PATCH.diff`. The patch bytes and SHA-256 are frozen before I1. I1 applies that frozen bundle verbatim; editing first and deriving the expected bundle from the resulting candidate is forbidden. The planning environment is Node `v24.15.0`; I0 must observe that exact version and record the resolved executable path, otherwise it stops before bundle generation and returns for a versioned planning update.

The phase path sets are exact:

| Phase | Changed paths owned by the phase |
|---|---|
| I0 activation | `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json`; `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json`; `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json` |
| I1 technical | exactly `.gitattributes`, `runtime.rs`, `store.rs`, `indices.rs` |
| I3 evidence | `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json`; `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md`; `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md`; `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md`; `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json`; `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json` |

RKP-2 parent handoff/review files and `rust-runtime-transition.md` are not part of this implementation candidate; any durable spec sync occurs only in a later accepted lifecycle projection. The expected-transition checkout must have exactly the I1 and I3 path delta above relative to `I0_SOURCE_HEAD`; no optional path exists.

Before I0 and again at I3, one task-local parser must extract the future candidate coordination set from four authorities: `task.json.meta.future_coordination_allowlist`, the PRD `Future candidate coordination allowlist`, this table's I3 row, and `implement.md` `Evidence and lifecycle files`. Each must contain exactly the same six repo-relative literal paths, with count `6`; a directory prefix, glob, shorthand expansion or optional path invalidates the plan/candidate. The parser source and SHA are frozen with the Node capture script at I0.

At I3:

- rerun a new control checkout of `I0_SOURCE_HEAD` and require signatures equal the stored I0 control records;
- rebuild the expected-transition lane from `I0_SOURCE_HEAD` plus the I0-frozen patch bundle and fixed coordination projection, then require it still equals stored `EXPECTED_I3_SIGNATURES`;
- require the inherited Part Owner candidate signature to equal both its I0 and expected-transition signatures;
- require each of the other three candidate signatures to equal its corresponding pre-I1 `EXPECTED_I3_SIGNATURES`, not its own newly captured value;
- require candidate technical and coordination paths to equal the fixed phase path sets;
- require the Node executable path, `process.version`, compiled focused-test bytes/SHA, capture-script SHA, synthetic-patch SHA, exit/count/title tuple and manifest to match their frozen values.

Any new or removed title, duplicate failure event, wrapper/cause drift, count drift, unexpected signature transition, unsupported signature value, path-set drift, Node-version drift, script/bundle hash drift or manifest drift blocks the candidate. Because a first thrown assertion can hide later statements, the implementation review must also combine these lane comparisons with section 5.3's exact six-function reconstruction and the exact seven-line `.gitattributes` diff; signatures alone are never a pass.

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
- four Node primary assertion signatures and their `3 + 1` cause classification;
- I0/control, expected-transition and candidate signature sets plus their exact lane comparisons;
- four former Rust failure titles and their green result;
- ignored-large-test count and proof it did not run;
- production-region equality result;
- Rust verifier source/SHA and five synthetic self-test results;
- Node executable path/version, focused-test bytes/SHA and failure-signature capture source/SHA used identically at I0 and I3;
- `I0_SOURCE_HEAD`, `I0_EXPECTED_PATCH.diff` bytes/SHA, exact phase path sets and expected-transition placeholder/template records frozen before I1;
- two-variant placeholder content-insensitivity proof for every newly projected evidence path;
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
