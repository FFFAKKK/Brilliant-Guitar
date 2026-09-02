# RKP-2 Stage 6 Tracked-byte/EOL Prerequisite — Implementation Evidence

## Evidence status

- Date: `2026-09-02`
- Scope at this checkpoint: new I0 re-entry activation and immutable baseline only.
- Current result: `I0 PASS / I1 NOT STARTED`.
- Authorization remains limited to I0 through I3 candidate freeze. This file does not authorize acceptance, archive, integration, S6.2, S6.3, E3, qualification, runtime cutover, RKP-3 or push.
- The historical activation `13a3a6a923f6af6744ef4aa60291a622f3dff989`, stop `fa756bb3755ab4f9dcc8bc1b5e5ada571102927f`, old verifier, old expected signatures and old temporary lanes were not reused.

## I0 authority and activation

| Field | Frozen value |
|---|---|
| Repaired planning HEAD | `c0a1a950b0f73e6bd0b58c8850084b902f030b59` |
| Dedicated planning review | task `01a06202-d330-7212-be3e-40e9f64d8313`; `P0/P1/P2=0/0/0`; `PASS FOR NEW BOUNDED EOL PREREQUISITE RE-ENTRY AUTHORIZATION DECISION` |
| I0 source/activation HEAD | `7f071acd2c261c99cfdc0f55f1bdb0357d95ceb3` |
| I0 source tree | `f18e78367393e6e51564b6541ec41ca9e16f42f2` |
| Branch | `codex/rkp-2-stage-6-eol-portability-prerequisite` |
| Activation commit subject | `docs(rkp-2): reactivate EOL portability prerequisite` |
| Activation diff | exactly child `task.json`, RKP-2 parent `task.json`, Rust parent `task.json`; zero technical paths |

The source worktree was clean and staged-empty at the source HEAD. The blocked S6.2 E1 candidate `c3c4d198a33ec3a78d3fc3e33cdae30657d9b62b` is not an ancestor of this source, remains diagnostic/unaccepted, and is not an evidence source.

## Frozen tools and generated patch

All tools below were created afresh below the E-drive task root. Their bytes are frozen before I1.

| Tool | Bytes | SHA-256 |
|---|---:|---|
| `capture-node-signatures.mjs` | 5272 | `84cba4413b5fa965d237494e8bdddd372d72ec0bf448af5ce714f06ff001bd9b` |
| `capture-node-command.mjs` | 1845 | `6f220c96420db602091421527c49c1f06136252fe5ed3fc2a9015b40e462967e` |
| `project-expected.mjs` | 6800 | `e16b9552a7884f9eae70d61f23e84a57aaf8d794b8a167654c6bc0b62e49c6b7` |
| `coordination-set.mjs` | 2770 | `46b8051031537c4c4a306a7e30d680a9eec4ad9a584431bce8cbd2339b4253e6` |
| `rust-boundary-verifier.mjs` | 20667 | `11375eafa7b7c8ebcd46a9473a64543c990293f528cfab0c049984cd46b4a998` |
| `capture-eol-matrix.mjs` | 4929 | `e71d35488b4959c0d94b92bee3ac9e22265a3d35e571076e8d587a1eb60ed4cd` |

The deterministic technical patch was generated independently in both expected lanes from `I0_SOURCE_HEAD` by unique exact-text substitutions:

- paths: `.gitattributes`, `crates/brilliant-kernel-runtime/src/runtime.rs`, `crates/brilliant-kernel-runtime/src/store.rs`, `crates/brilliant-kernel-runtime/src/indices.rs`;
- byte length: `4890`;
- SHA-256: `d991d45ed00f42f31f7dada849bc5e7a114d04f6fb680cd6836f26df4718d209`;
- V1 and V2 patch bytes: identical;
- I1 rule: `git apply --check` and `git apply` must consume these exact frozen bytes; regeneration is forbidden.

## Node I0 control

| Field | Frozen value |
|---|---|
| Executable | `D:\nvm4w\nodejs\node.exe` |
| Version | `v24.15.0` |
| Programmatic options | `isolation: "none"`, `concurrency: 1` |
| Compiled focused test | `dist/test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.js` |
| Compiled bytes | `260445` |
| Compiled SHA-256 | `55351663172b27598b7314d45ebe7bd7b19d61a328d8f6b47b7ac6f0ce552961` |
| Focused result | exit `1`; `11 total / 7 pass / 4 fail / 0 skip` |
| Full result | exit `1`; `611 total / 605 pass / 4 fail / 2 skip` |
| Full manifest | `80` files; SHA-256 `1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1` |
| Full stderr | exactly `runner.test-failed` |

The active activation checkout and a fresh detached `core.autocrlf=true` control clone produced identical compiled bytes, focused tuple, titles, causes and canonical signatures. Their full semantic summaries also matched; stdout byte hashes differ only because reporter output contains lane-specific absolute paths.

### Frozen control signatures

Every record validated outer `ERR_TEST_FAILURE` / `testCodeFailure`, exactly one inner `AssertionError` / `ERR_ASSERTION` cause, no nested cause, and own `operator`, `actual`, `expected` and `generatedMessage` properties.

| Failure title | Operator | Generated | Message SHA-256 | Actual SHA-256 | Expected SHA-256 | Signature SHA-256 |
|---|---|---:|---|---|---|---|
| `implementation changes stay inside the literal RKP-2 allowlists` | `strictEqual` | false | `6d833362bfd8a1d0f329998402ed8ebbfe939117b1ccee7691584e0dfb9551a6` | `fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa` | `b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b` | `3aa8afdee5199c83ac42742a5e7220739ebbff0e753d0ed65ca46a247a4c43d4` |
| `part owner repair stays anchored to its accepted six-path wire contract` | `strictEqual` | true | `6235e4b0d84858292b8fb4dabd7035f557f52bdf7adeb8f204ab2feda3827196` | `c0a92a8b9ef22b97baae16f73131eb3043f5add3fd73be43bf2843025f93bb13` | `d0143410e5f4c6c173f6a7a96a0cd6f20168880c3954223f2e1200cfe2d70ac4` | `fec18396aeae94e664b8d09d64df10b9605ab43cc771432e33e4af64cb4e6a88` |
| `Stage 6 hostile and resource evidence consumes the existing private Rust seams` | `strictEqual` | false | `accfa4eeeea5969d1b9da20ab4e9628c3978c20a03c1c80c520dccf499887e14` | `fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa` | `b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b` | `8d70e2222134cf36c6c5541bb7612c0622b38705a90e29b56e1ff55644b1397f` |
| `Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts` | `deepStrictEqual` | true | `3c6b3bcfe3b974c085b2590c3cd5bcb8c2009682bceea1ac2157e43e6cd36b33` | `1af50bb3daf4ce99d2f547e50457ed063260ec14afa1fbabdc40caf6ba3684e7` | `2329fabf612884bb3f62d3284a4c0e06d7837a79a792a646937b2b642456e2cb` | `811643e3ea34bc37c1491ef8a365647373dd98196fb03d3d5ed1da70f08a76b7` |

The frozen `3 + 1` cause classification is: three path/projection failures introduced by the planning child plus one inherited Part Owner pre-/post-RKP-1A property-cap blob failure.

## Independent expected transition

Both expected lanes began as new `--no-local --no-checkout` clones detached at `I0_SOURCE_HEAD`. They received the frozen four-file technical patch and the exact six-path final coordination projection, then were committed only to make HEAD-based Workspace Law assertions observe the synthetic transition.

| Lane | Synthetic HEAD | Tree | Evidence placeholder bytes/SHA-256 |
|---|---|---|---|
| V1 | `bc4719860fd2bddff0100a01b4e57ec8d9c6e252` | `0a5f72774a32bf47a90476d0431d2596613dba52` | `27` / `7a081f772abce04a0ade659f67fbf80fb9708de15d7244ba32001e15c77d470f` |
| V2 | `dfe3aba299564747edc52a6ca7e40651691932bc` | `dc5014ce75d74c8095af0af7a268994383c38ebe` | `27` / `b45412daab8c5aacbde8cd16be506300db62de2e4bb2e4e459488740a4a2c585` |

`implementation-evidence.md` is the only newly projected evidence path. V1 and V2 are byte-distinct only at that path; all other nine projected files are byte-identical. The complete four-signature records are byte-identical after replacing only the lane-specific absolute compiled path, proving placeholder-content insensitivity before I1.

### Frozen expected signatures

| Failure title | Control relation | Message SHA-256 | Actual SHA-256 | Expected SHA-256 | Signature SHA-256 |
|---|---|---|---|---|---|
| `implementation changes stay inside the literal RKP-2 allowlists` | different | `a7514cff7586ae4ac34a78018c8d31ae9e781f1f2bdb7330bb1acd05b2605e3f` | `fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa` | `b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b` | `7282348f1e76677e166a7dca813fb61d548fd9223c03d27e98cc3fc292d9a05b` |
| `part owner repair stays anchored to its accepted six-path wire contract` | equal | `6235e4b0d84858292b8fb4dabd7035f557f52bdf7adeb8f204ab2feda3827196` | `c0a92a8b9ef22b97baae16f73131eb3043f5add3fd73be43bf2843025f93bb13` | `d0143410e5f4c6c173f6a7a96a0cd6f20168880c3954223f2e1200cfe2d70ac4` | `fec18396aeae94e664b8d09d64df10b9605ab43cc771432e33e4af64cb4e6a88` |
| `Stage 6 hostile and resource evidence consumes the existing private Rust seams` | different | `7f5c22754ff01225ca9f8f2c6ba1f181b11c017da8e85b8e8d5b2b343e8f1c04` | `fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa` | `b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b` | `df02b599773427fe5dc1ee2350912347f5bb9bbb47d282560d09695cb3f3a13b` |
| `Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts` | different | `0a5f5e9b915a1b69ee54558b6c68447d931e6437f573bc41c76d100069bf4df6` | `364c089df81a1d4de820c041e1c12517e7e9138c625ec4796c7483d08916c7e2` | `2329fabf612884bb3f62d3284a4c0e06d7837a79a792a646937b2b642456e2cb` | `73e2508a3826fc0d50f0971c48a01d720842e3b26cdc20ae7b69b23ad8095536` |

All expected records retain the same outer/inner cause structure, titles, `11/7/4/0` tuple, compiled bytes and Node version as control. I3 must compare the candidate to these pre-I1 values; it may not derive expected values from the candidate.

## Exact coordination projection

The mechanical parser returned count `6` and identical task-meta, PRD, design, implementation-plan and synthetic-actual sets:

1. `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json`
2. `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md`
3. `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md`
4. `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md`
5. `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json`
6. `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json`

## Rust RED and lexical verifier

The exact pre-fix command used Rust `1.97.1`, `--workspace --all-targets --locked`, an E-drive `CARGO_TARGET_DIR`, and E-drive `TEMP`/`TMP`. It exited `101`. The `brilliant-kernel-runtime` result was `13 passed / 4 failed / 1 ignored`; the only failures were:

1. `runtime::tests::runtime_owns_only_the_live_store_and_revision_zero`
2. `store::tests::every_typed_record_resolves_once_without_retaining_the_document_tree`
3. `indices::tests::indices_voice_lookup_then_binary_time_queries_are_exact_and_half_open`
4. `indices::tests::indices_rebuild_normalizes_without_handles_and_corruption_never_passes_parity`

`indices::tests::rkp2_stage_6_private_scale_evidence_v1` remained ignored and executed zero times. `indices::tests::indices_metrics_are_exact_and_linear_for_minimal_and_representative_stores` passed pre-fix; this is the corrected owner of the fifth normalization edit and its pre-fix pass does not prove bounded extraction.

The fresh Rust lexical verifier passed all five self-tests in both expected lanes:

1. accepts the exact permitted patch model;
2. rejects a top-level function after the terminal test module;
3. ignores braces in cooked/raw/byte strings, chars and nested comments; the fixture module close is line `13`;
4. rejects a hunk in the real unpermitted `indices_cover_entity_owner_content_extension_and_core_references` function;
5. rejects mutation of a preserved negative assertion.

Expected reconstructed records:

| Path | Base bytes/SHA-256 | Candidate bytes/SHA-256 | Hunks | Terminal module close |
|---|---|---|---:|---:|
| `runtime.rs` | `4956` / `117bd4f01e709d1b0aaad76ba626c4f0824113fd2cc3026627104a4cf2a55c80` | `4978` / `87daf31f00649214b7dbdc30fb1f7044aa4f9bcdb6da4d47b46d04765957bdf3` | 1 | 139 |
| `store.rs` | `70062` / `4c2644e9fd7dc1144b23ea0b7ce126f1ed28cea2b3748e7fdc7592a6186a269d` | `70084` / `d2bf97b30da40caa47f7a91c1e15419bd65f5a6a9105a98c1cf47c4277eaf0e6` | 1 | 1719 |
| `indices.rs` | `78829` / `20ef06be9016680e11184f85ca4b0cf86e331bf00fbe394378a5ed48266cc854` | `79739` / `689b3dad34cea56cb8e27fac36752b9ac938cb8f25c6a5f0f953d14f45bfd5c6` | 4 | 2178 |

## Pre-fix EOL diagnostic

At `I0_SOURCE_HEAD`, all seven governed paths reported `i/lf w/crlf attr/` in the active `core.autocrlf=true` worktree. This is the reproduced portability defect, not an accepted final state. I2 must prove `i/lf w/lf attr/text eol=lf`, raw byte equality and Git blob equality in fresh true/false clones.

## I0 exit gate

- PASS: fresh activation and control signatures agree.
- PASS: independent expected V1/V2 signatures agree despite byte-distinct placeholder contents.
- PASS: the expected patch is identical across lanes and frozen before I1.
- PASS: the six-path coordination projection agrees across all four authorities and synthetic actual diff.
- PASS: corrected lexical/reconstruction verifier self-tests are `5/5` in both lanes.
- PASS: Rust RED is exactly the four planned failures; ignored scale execution count is zero.
- PASS: E3 execution count remains zero and no S6.2 evidence artifact was created.
- Next gate: I1 may apply only the frozen patch and must commit only the four technical allowlist paths.

## Frozen programmatic Node signature capture source

The following is the complete source whose hash is frozen above.

```javascript
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { run } from "node:test";

const EXPECTED_FAILURE_TITLES = Object.freeze([
  "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
  "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
  "implementation changes stay inside the literal RKP-2 allowlists",
  "part owner repair stays anchored to its accepted six-path wire contract",
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function canonicalJson(value, seen = new Set()) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    assert.equal(Number.isFinite(value), true, "signature number must be finite");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  assert.equal(typeof value, "object", "signature value must be JSON data");
  assert.equal(seen.has(value), false, "signature value must be acyclic");
  seen.add(value);
  let encoded;
  if (Array.isArray(value)) {
    encoded = `[${value.map((entry) => canonicalJson(entry, seen)).join(",")}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    assert.equal(prototype === Object.prototype || prototype === null, true, "signature object must be plain");
    encoded = `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], seen)}`).join(",")}}`;
  }
  seen.delete(value);
  return encoded;
}

function hashText(value) {
  return sha256(Buffer.from(value, "utf8"));
}

function captureFailure(data) {
  const title = data?.name;
  assert.equal(typeof title, "string");
  const outer = data?.details?.error;
  assert.equal(typeof outer, "object");
  assert.notEqual(outer, null);
  assert.equal(outer.code, "ERR_TEST_FAILURE");
  assert.equal(outer.failureType, "testCodeFailure");
  assert.equal(Object.hasOwn(outer, "cause"), true);
  const inner = outer.cause;
  assert.equal(typeof inner, "object");
  assert.notEqual(inner, null);
  assert.equal(inner.name, "AssertionError");
  assert.equal(inner.code, "ERR_ASSERTION");
  assert.equal(Object.hasOwn(inner, "cause"), false);
  for (const field of ["operator", "actual", "expected", "generatedMessage"]) {
    assert.equal(Object.hasOwn(inner, field), true, `${title}: missing ${field}`);
  }
  assert.equal(typeof inner.operator, "string");
  assert.equal(typeof inner.generatedMessage, "boolean");
  assert.equal(typeof inner.message, "string");
  const record = {
    title,
    outerErrorCode: outer.code,
    outerFailureType: outer.failureType,
    errorName: inner.name,
    errorCode: inner.code,
    operator: inner.operator,
    generatedMessage: inner.generatedMessage,
    messageSha256: hashText(inner.message),
    actualSha256: hashText(canonicalJson(inner.actual)),
    expectedSha256: hashText(canonicalJson(inner.expected)),
  };
  return Object.freeze({ ...record, signatureSha256: hashText(canonicalJson(record)) });
}

async function main() {
  const compiledTestPath = resolve(process.argv[2] ?? "");
  const outputPath = resolve(process.argv[3] ?? "");
  assert.equal(process.version, "v24.15.0");
  const compiledBytes = readFileSync(compiledTestPath);
  const stream = run({ files: [compiledTestPath], isolation: "none", concurrency: 1 });
  const observed = [];
  let streamError;
  stream.on("test:pass", (data) => observed.push({ type: "pass", data }));
  stream.on("test:fail", (data) => observed.push({ type: "fail", data }));
  stream.on("test:cancel", (data) => observed.push({ type: "cancel", data }));
  stream.on("error", (error) => { streamError = error; });
  const ended = new Promise((accept) => stream.on("end", accept));
  stream.resume();
  await ended;
  assert.equal(streamError, undefined);
  const top = observed.filter(({ data }) => data?.nesting === 0 && typeof data?.name === "string");
  const failed = top.filter(({ type }) => type === "fail");
  const skipped = top.filter(({ type, data }) => type === "pass" && data?.skip !== undefined);
  const passed = top.filter(({ type, data }) => type === "pass" && data?.skip === undefined);
  assert.equal(top.filter(({ type }) => type === "cancel").length, 0);
  const titles = failed.map(({ data }) => data.name).sort();
  assert.deepEqual(titles, [...EXPECTED_FAILURE_TITLES].sort());
  assert.equal(new Set(titles).size, 4);
  const signatures = failed.map(({ data }) => captureFailure(data)).sort((left, right) => left.title.localeCompare(right.title, "en"));
  const result = {
    schemaVersion: 1,
    nodeExecutable: process.execPath,
    nodeVersion: process.version,
    isolation: "none",
    concurrency: 1,
    compiledTestPath,
    compiledTestByteLength: compiledBytes.length,
    compiledTestSha256: sha256(compiledBytes),
    exitCode: failed.length === 0 ? 0 : 1,
    counts: { total: top.length, pass: passed.length, fail: failed.length, skip: skipped.length },
    failureTitles: titles,
    signatures,
  };
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

await main();
```

## Frozen Rust lexical/reconstruction verifier source

The following is the complete source whose hash is frozen above.

```javascript
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PARITY_NAME = "source_shape_normalization_is_lf_crlf_invariant";
const FILES = Object.freeze([
  {
    path: "crates/brilliant-kernel-runtime/src/runtime.rs",
    marker: '#[cfg(test)]\nmod tests {',
    edits: [{
      functionName: "runtime_owns_only_the_live_store_and_revision_zero",
      oldText: 'let source = include_str!("runtime.rs");',
      newText: 'let source = include_str!("runtime.rs").replace("\\r\\n", "\\n");',
    }],
    preserved: ['assert!(!declaration.contains("ScoreDocumentV1"));'],
  },
  {
    path: "crates/brilliant-kernel-runtime/src/store.rs",
    marker: '#[cfg(test)]\npub(crate) mod tests {',
    edits: [{
      functionName: "every_typed_record_resolves_once_without_retaining_the_document_tree",
      oldText: 'let source = include_str!("store.rs");',
      newText: 'let source = include_str!("store.rs").replace("\\r\\n", "\\n");',
    }],
    preserved: ['assert!(!declaration.contains("ScoreDocumentV1"));'],
  },
  {
    path: "crates/brilliant-kernel-runtime/src/indices.rs",
    marker: '#[cfg(test)]\nmod tests {',
    edits: [
      {
        functionName: "indices_metrics_are_exact_and_linear_for_minimal_and_representative_stores",
        oldText: 'let metrics_source = include_str!("indices.rs")\n            .split("pub(crate) struct Rkp2StoreMetrics {")',
        newText: 'let metrics_source = include_str!("indices.rs").replace("\\r\\n", "\\n");\n        let metrics_source = metrics_source\n            .split("pub(crate) struct Rkp2StoreMetrics {")',
      },
      {
        functionName: "indices_voice_lookup_then_binary_time_queries_are_exact_and_half_open",
        oldText: 'let source = include_str!("store.rs");',
        newText: 'let source = include_str!("store.rs").replace("\\r\\n", "\\n");',
      },
      {
        functionName: "indices_rebuild_normalizes_without_handles_and_corruption_never_passes_parity",
        oldText: 'let source = include_str!("indices.rs");',
        newText: 'let source = include_str!("indices.rs").replace("\\r\\n", "\\n");',
      },
    ],
    preserved: [
      'assert!(!metrics_source.contains("full_document_lookup_scan"));',
      'assert!(!query.contains(".iter().find"));',
      'assert!(!query.contains("for "));',
      'assert!(!projection_declaration.contains(forbidden), "{forbidden}");',
    ],
  },
]);
const PARITY_TEST = `
    #[test]
    fn source_shape_normalization_is_lf_crlf_invariant() {
        let lf = "pub(crate) struct Rkp2StoreMetrics {\\n    entity_index_lookups: usize,\\n}\\n\\n";
        let crlf = lf.replace('\\n', "\\r\\n");
        let normalized_lf = lf.replace("\\r\\n", "\\n");
        let normalized_crlf = crlf.replace("\\r\\n", "\\n");
        assert_eq!(normalized_lf, normalized_crlf);

        for source in [&normalized_lf, &normalized_crlf] {
            let declaration = source
                .split("pub(crate) struct Rkp2StoreMetrics {")
                .nth(1)
                .expect("metrics declaration")
                .split("}\\n\\n")
                .next()
                .expect("metrics fields");
            assert_eq!(declaration, "\\n    entity_index_lookups: usize,");
        }
    }
`;
const decoder = new TextDecoder("utf-8", { fatal: true });

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function git(repo, args, encoding = null) {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${String(result.stderr)}`);
  return result.stdout;
}

function occurrences(bytes, text) {
  const needle = Buffer.from(text, "utf8");
  const result = [];
  for (let start = 0; ; ) {
    const offset = bytes.indexOf(needle, start);
    if (offset === -1) return result;
    result.push(offset);
    start = offset + 1;
  }
}

function scalarLength(first) {
  if (first < 0x80) return 1;
  if ((first & 0xe0) === 0xc0) return 2;
  if ((first & 0xf0) === 0xe0) return 3;
  if ((first & 0xf8) === 0xf0) return 4;
  return 0;
}

function charEnd(bytes, quote) {
  let cursor = quote + 1;
  if (cursor >= bytes.length || bytes[cursor] === 0x0a || bytes[cursor] === 0x0d) return null;
  if (bytes[cursor] === 0x5c) {
    cursor += 1;
    if (cursor >= bytes.length) return null;
    if (bytes[cursor] === 0x75 && bytes[cursor + 1] === 0x7b) {
      cursor += 2;
      while (cursor < bytes.length && bytes[cursor] !== 0x7d) cursor += 1;
      if (bytes[cursor] !== 0x7d) return null;
      cursor += 1;
    } else if (bytes[cursor] === 0x78) cursor += 3;
    else cursor += 1;
  } else {
    const length = scalarLength(bytes[cursor]);
    if (length === 0) return null;
    cursor += length;
  }
  return bytes[cursor] === 0x27 ? cursor : null;
}

function rawStart(bytes, offset, bytePrefix) {
  let cursor = offset + (bytePrefix ? 2 : 1);
  let hashes = 0;
  while (bytes[cursor] === 0x23) {
    hashes += 1;
    cursor += 1;
  }
  return bytes[cursor] === 0x22 ? { contentStart: cursor + 1, hashes } : null;
}

function isRawEnd(bytes, quote, hashes) {
  if (bytes[quote] !== 0x22) return false;
  for (let index = 1; index <= hashes; index += 1) if (bytes[quote + index] !== 0x23) return false;
  return true;
}

function scanRust(bytes, label) {
  decoder.decode(bytes);
  const code = new Uint8Array(bytes.length);
  let state = "code";
  let blockDepth = 0;
  let rawHashes = 0;
  let cursor = 0;
  while (cursor < bytes.length) {
    const byte = bytes[cursor];
    const next = bytes[cursor + 1];
    if (state === "line-comment") {
      if (byte === 0x0a) state = "code";
      cursor += 1;
      continue;
    }
    if (state === "block-comment") {
      if (byte === 0x2f && next === 0x2a) {
        blockDepth += 1;
        cursor += 2;
      } else if (byte === 0x2a && next === 0x2f) {
        blockDepth -= 1;
        cursor += 2;
        if (blockDepth === 0) state = "code";
      } else cursor += 1;
      continue;
    }
    if (state === "cooked-string" || state === "byte-string") {
      if (byte === 0x5c) cursor += 2;
      else if (byte === 0x22) {
        state = "code";
        cursor += 1;
      } else cursor += 1;
      continue;
    }
    if (state === "raw-string" || state === "byte-raw-string") {
      if (isRawEnd(bytes, cursor, rawHashes)) {
        cursor += 1 + rawHashes;
        state = "code";
      } else cursor += 1;
      continue;
    }
    assert.equal(state, "code", `${label}: unexpected scanner state ${state}`);
    if (byte === 0x2f && next === 0x2f) {
      state = "line-comment";
      cursor += 2;
      continue;
    }
    if (byte === 0x2f && next === 0x2a) {
      state = "block-comment";
      blockDepth = 1;
      cursor += 2;
      continue;
    }
    if (byte === 0x62 && next === 0x72) {
      const raw = rawStart(bytes, cursor, true);
      if (raw !== null) {
        state = "byte-raw-string";
        rawHashes = raw.hashes;
        cursor = raw.contentStart;
        continue;
      }
    }
    if (byte === 0x72) {
      const raw = rawStart(bytes, cursor, false);
      if (raw !== null) {
        state = "raw-string";
        rawHashes = raw.hashes;
        cursor = raw.contentStart;
        continue;
      }
    }
    if (byte === 0x62 && next === 0x22) {
      state = "byte-string";
      cursor += 2;
      continue;
    }
    if (byte === 0x22) {
      state = "cooked-string";
      cursor += 1;
      continue;
    }
    if (byte === 0x62 && next === 0x27) {
      const end = charEnd(bytes, cursor + 1);
      if (end !== null) {
        cursor = end + 1;
        continue;
      }
    }
    if (byte === 0x27) {
      const end = charEnd(bytes, cursor);
      if (end !== null) {
        cursor = end + 1;
        continue;
      }
    }
    code[cursor] = 1;
    cursor += 1;
  }
  if (state === "line-comment") state = "code";
  assert.equal(state, "code", `${label}: unterminated lexical state ${state}`);
  assert.equal(blockDepth, 0, `${label}: unterminated nested block comment`);
  return code;
}

function matchedBrace(bytes, code, opening, label) {
  assert.equal(bytes[opening], 0x7b, `${label}: opening brace byte`);
  assert.equal(code[opening], 1, `${label}: opening brace not code`);
  let depth = 0;
  for (let cursor = opening; cursor < bytes.length; cursor += 1) {
    if (code[cursor] !== 1) continue;
    if (bytes[cursor] === 0x7b) depth += 1;
    else if (bytes[cursor] === 0x7d) {
      depth -= 1;
      assert.equal(depth >= 0, true, `${label}: unmatched closing brace`);
      if (depth === 0) return cursor;
    }
  }
  throw new Error(`${label}: unmatched opening brace`);
}

function lineAt(bytes, offset) {
  let line = 1;
  for (let cursor = 0; cursor < offset; cursor += 1) if (bytes[cursor] === 0x0a) line += 1;
  return line;
}

function lineStart(bytes, offset) {
  const previous = bytes.lastIndexOf(0x0a, Math.max(0, offset - 1));
  return previous === -1 ? 0 : previous + 1;
}

function previousLineStart(bytes, offset) {
  const start = lineStart(bytes, offset);
  return start === 0 ? 0 : lineStart(bytes, start - 1);
}

function uniqueCodeToken(bytes, code, text, label) {
  const length = Buffer.byteLength(text);
  const matches = occurrences(bytes, text).filter((offset) => {
    for (let index = 0; index < length; index += 1) if (code[offset + index] !== 1) return false;
    return true;
  });
  assert.equal(matches.length, 1, `${label}: expected one code token ${text}, got ${matches.length}`);
  return matches[0];
}

function findFunction(bytes, code, name, label, includeTestAttribute = false) {
  const token = `fn ${name}`;
  const tokenOffset = uniqueCodeToken(bytes, code, token, label);
  let opening = tokenOffset + Buffer.byteLength(token);
  while (opening < bytes.length && !(bytes[opening] === 0x7b && code[opening] === 1)) opening += 1;
  assert.equal(opening < bytes.length, true, `${label}:${name}: opening missing`);
  const closing = matchedBrace(bytes, code, opening, `${label}:${name}`);
  let start = lineStart(bytes, tokenOffset);
  if (includeTestAttribute) {
    const attributeStart = previousLineStart(bytes, start);
    assert.equal(decoder.decode(bytes.subarray(attributeStart, start)).trim(), "#[test]", `${label}:${name}: attribute`);
    start = attributeStart;
  }
  return { name, tokenOffset, opening, closing, startLine: lineAt(bytes, start), endLine: lineAt(bytes, closing) };
}

function analyze(bytes, config, label, expectParity) {
  const code = scanRust(bytes, label);
  const markers = occurrences(bytes, config.marker);
  assert.equal(markers.length, 1, `${label}: marker count`);
  const marker = markers[0];
  assert.equal(code[marker], 1, `${label}: marker not code`);
  const opening = marker + Buffer.byteLength(config.marker) - 1;
  const moduleClosing = matchedBrace(bytes, code, opening, `${label}:test-module`);
  for (let cursor = moduleClosing + 1; cursor < bytes.length; cursor += 1) {
    assert.equal([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20].includes(bytes[cursor]), true, `${label}: non-whitespace suffix after terminal test module`);
  }
  const functions = new Map();
  for (const edit of config.edits) {
    const found = findFunction(bytes, code, edit.functionName, label);
    assert.equal(found.tokenOffset > marker && found.closing < moduleClosing, true, `${label}:${edit.functionName}: outside test module`);
    functions.set(edit.functionName, found);
  }
  const parityOccurrences = occurrences(bytes, `fn ${PARITY_NAME}`);
  assert.equal(parityOccurrences.length, expectParity ? 1 : 0, `${label}: parity count`);
  let parity;
  if (expectParity) {
    parity = findFunction(bytes, code, PARITY_NAME, label, true);
    assert.equal(parity.tokenOffset > marker && parity.closing < moduleClosing, true, `${label}: parity outside module`);
  }
  return { code, marker, moduleClosing, moduleClosingLine: lineAt(bytes, moduleClosing), functions, parity };
}

function replaceUnique(text, oldText, newText, label) {
  const first = text.indexOf(oldText);
  assert.notEqual(first, -1, `${label}: source missing`);
  assert.equal(text.indexOf(oldText, first + oldText.length), -1, `${label}: source duplicated`);
  return `${text.slice(0, first)}${newText}${text.slice(first + oldText.length)}`;
}

function project(base, config) {
  let text = decoder.decode(base);
  for (const edit of config.edits) text = replaceUnique(text, edit.oldText, edit.newText, `${config.path}:${edit.functionName}`);
  if (config.path.endsWith("indices.rs")) {
    assert.equal(text.endsWith("\n}\n"), true, `${config.path}: terminal bytes`);
    text = `${text.slice(0, -3)}${PARITY_TEST}}\n`;
  }
  return Buffer.from(text, "utf8");
}

function reconstruct(candidate, config) {
  let text = decoder.decode(candidate);
  if (config.path.endsWith("indices.rs")) text = replaceUnique(text, PARITY_TEST, "\n", `${config.path}:remove parity`);
  for (const edit of [...config.edits].reverse()) text = replaceUnique(text, edit.newText, edit.oldText, `${config.path}:${edit.functionName}:reverse`);
  return Buffer.from(text, "utf8");
}

function verifyPair(base, candidate, config, label) {
  const baseAnalysis = analyze(base, config, `${label}:base`, false);
  const candidateAnalysis = analyze(candidate, config, `${label}:candidate`, config.path.endsWith("indices.rs"));
  assert.deepEqual(candidate.subarray(0, candidateAnalysis.marker), base.subarray(0, baseAnalysis.marker), `${label}: product prefix differs`);
  for (const preserved of config.preserved) {
    assert.equal(occurrences(base, preserved).length, 1, `${label}: base preserved assertion count`);
    assert.equal(occurrences(candidate, preserved).length, 1, `${label}: preserved negative assertion changed`);
  }
  assert.deepEqual(candidate, project(base, config), `${label}: candidate differs from exact permitted patch model`);
  assert.deepEqual(reconstruct(candidate, config), base, `${label}: base reconstruction differs`);
  return { baseAnalysis, candidateAnalysis };
}

function parseDiff(text) {
  const byPath = new Map();
  let path;
  for (const line of text.split(/\r?\n/u)) {
    if (line.startsWith("+++ b/")) {
      path = line.slice(6);
      if (!byPath.has(path)) byPath.set(path, []);
      continue;
    }
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(line);
    if (match !== null) {
      assert.notEqual(path, undefined, "diff hunk before path");
      byPath.get(path).push({
        oldStart: Number(match[1]),
        oldCount: match[2] === undefined ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newCount: match[4] === undefined ? 1 : Number(match[4]),
      });
    }
  }
  return byPath;
}

const contains = (range, start, count) => count > 0 && start >= range.startLine && start + count - 1 <= range.endLine;

function validateHunks(config, pair, hunks, label) {
  const seen = new Map(config.edits.map((edit) => [edit.functionName, 0]));
  let parityCount = 0;
  for (const hunk of hunks) {
    if (hunk.oldCount === 0) {
      assert.equal(config.path.endsWith("indices.rs"), true, `${label}: insertion outside indices`);
      assert.equal(hunk.oldStart + 1, pair.baseAnalysis.moduleClosingLine, `${label}: insertion not immediately before module close`);
      assert.equal(hunk.newStart, pair.candidateAnalysis.parity.startLine, `${label}: parity start`);
      assert.equal(hunk.newStart + hunk.newCount - 1, pair.candidateAnalysis.parity.endLine, `${label}: parity range`);
      parityCount += 1;
      continue;
    }
    const matches = config.edits.filter((edit) => contains(pair.baseAnalysis.functions.get(edit.functionName), hunk.oldStart, hunk.oldCount) && contains(pair.candidateAnalysis.functions.get(edit.functionName), hunk.newStart, hunk.newCount));
    assert.equal(matches.length, 1, `${label}: hunk outside permitted function: ${JSON.stringify(hunk)}`);
    seen.set(matches[0].functionName, seen.get(matches[0].functionName) + 1);
  }
  for (const [name, count] of seen) assert.equal(count, 1, `${label}:${name}: hunk count`);
  assert.equal(parityCount, config.path.endsWith("indices.rs") ? 1 : 0, `${label}: parity hunk count`);
}

function revisionBytes(repo, revision, path) {
  return revision === "WORKTREE" ? readFileSync(resolve(repo, path)) : git(repo, ["cat-file", "blob", `${revision}:${path}`]);
}

function diffText(repo, base, revision) {
  const range = revision === "WORKTREE" ? [base] : [`${base}..${revision}`];
  return git(repo, ["diff", "--unified=0", "--no-ext-diff", ...range, "--", ...FILES.map(({ path }) => path)], "utf8");
}

function verifyRepository(repo, base, revision) {
  const byPath = parseDiff(diffText(repo, base, revision));
  const records = [];
  for (const config of FILES) {
    const baseBytes = revisionBytes(repo, base, config.path);
    const candidateBytes = revisionBytes(repo, revision, config.path);
    const pair = verifyPair(baseBytes, candidateBytes, config, config.path);
    const hunks = byPath.get(config.path) ?? [];
    validateHunks(config, pair, hunks, config.path);
    records.push({ path: config.path, baseByteLength: baseBytes.length, baseSha256: sha256(baseBytes), candidateByteLength: candidateBytes.length, candidateSha256: sha256(candidateBytes), hunkCount: hunks.length, testModuleClosingLine: pair.candidateAnalysis.moduleClosingLine });
  }
  assert.deepEqual([...byPath.keys()].sort(), FILES.map(({ path }) => path).sort());
  return records;
}

function reject(name, action, pattern) {
  assert.throws(action, pattern, `${name}: forbidden mutation accepted`);
  return { name, result: "pass" };
}

function selfTests(repo, base, revision) {
  const tests = [];
  const exactRecords = verifyRepository(repo, base, revision);
  tests.push({ name: "accept exact permitted patch model", result: "pass" });
  const indices = FILES[2];
  const indicesBase = revisionBytes(repo, base, indices.path);
  const indicesCandidate = project(indicesBase, indices);
  tests.push(reject("reject top-level function after terminal module", () => verifyPair(indicesBase, Buffer.concat([indicesCandidate, Buffer.from("\nfn forbidden_top_level() {}\n")]), indices, "top-level"), /non-whitespace suffix/u));
  const lexicalFixture = Buffer.from(`#[cfg(test)]
mod tests {
    fn lexical() {
        let _a = "}";
        let _b = b"{";
        let _c = r###"}{"###;
        let _d = br##"}{"##;
        let _e = '}';
        let _f = b'{';
        /* outer { /* nested } */ still } */
        // }
    }
}
`, "utf8");
  const lexical = analyze(lexicalFixture, { path: "lexical.rs", marker: '#[cfg(test)]\nmod tests {', edits: [], preserved: [] }, "lexical", false);
  assert.equal(lexical.moduleClosingLine, 13);
  tests.push({ name: "ignore braces in cooked raw byte strings chars and nested comments", result: "pass" });
  const pair = verifyPair(indicesBase, indicesCandidate, indices, "unrelated");
  const unrelated = findFunction(indicesBase, pair.baseAnalysis.code, "indices_cover_entity_owner_content_extension_and_core_references", "unrelated");
  tests.push(reject("reject hunk in real unpermitted indices test", () => validateHunks(indices, pair, [{ oldStart: unrelated.startLine, oldCount: 1, newStart: unrelated.startLine, newCount: 1 }], "unrelated"), /outside permitted function/u));
  const runtime = FILES[0];
  const runtimeBase = revisionBytes(repo, base, runtime.path);
  const runtimeCandidate = project(runtimeBase, runtime);
  const mutated = Buffer.from(replaceUnique(decoder.decode(runtimeCandidate), 'assert!(!declaration.contains("ScoreDocumentV1"));', 'assert!(declaration.contains("ScoreDocumentV1"));', "assertion"), "utf8");
  tests.push(reject("reject mutation of preserved negative assertion", () => verifyPair(runtimeBase, mutated, runtime, "assertion"), /preserved negative assertion changed/u));
  assert.equal(tests.length, 5);
  return { tests, exactRecords };
}

const command = process.argv[2];
const repo = resolve(process.argv[3] ?? "");
const base = process.argv[4];
const revision = process.argv[5] ?? "HEAD";
assert.notEqual(base, undefined, "base revision required");
let payload;
if (command === "verify") payload = { records: verifyRepository(repo, base, revision) };
else if (command === "self-test") payload = selfTests(repo, base, revision);
else throw new Error("usage: rust-boundary-verifier.mjs verify|self-test <repo> <base> [HEAD|WORKTREE]");
process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command, repo, base, revision, ...payload }, null, 2)}\n`);
```
