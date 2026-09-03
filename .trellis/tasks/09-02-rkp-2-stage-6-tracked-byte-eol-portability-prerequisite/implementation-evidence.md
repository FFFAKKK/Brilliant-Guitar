# RKP-2 Stage 6 Tracked-byte and EOL Portability Prerequisite — Implementation Evidence

## Current evidence state

- Status: `R-I2 REGRESSION COMPLETE / SIX-PATH EVIDENCE-FREEZE CANDIDATE`.
- Current R-A0 source HEAD/tree: `c3e90c6fcc3a624b8a7157bedea59d44f84c6c78` / `40d786f4717e27251ae76b2ae7f49e286337839a`.
- Current branch: `codex/rkp-2-stage-6-eol-audit-return-planning-repair`.
- Current worktree: `.worktrees/rkp-2-stage-6-eol-audit-return-planning-repair`.
- Narrow R-P0 planning audit passed at `957332a127c381847eb85e246e7f1e922dcbc7fd`, tree `54273dd6cb7fc9a2615db16c3afec86bf033c55b`, P0/P1/P2=`0/0/0`.
- Historical fresh I0/technical objects remain `64bc508c...` and `30d4acb0...`; the returned evidence candidate is `1f3f6061...`.
- Records preceding the final R-I0 section remain historical diagnostics; the final section is the current reconstructible evidence.
- Task remains `in_progress`; `planning_candidate_ready=true`, `implementation_candidate_ready=false`, and user authorization is limited to R-A0/R-I0/R-I1/R-I2 evidence re-entry. Production implementation authorization remains false.
- S6.2/S6.3/E3 remain false/false/zero. Acceptance, archive, integration, qualification, runtime cutover, RKP-3, and push remain unauthorized.
- Sole next gate after the evidence-freeze commit: `DEDICATED INDEPENDENT IMPLEMENTATION RE-AUDIT`.

## Future durable reconstruction capsule requirement

Before any future re-entry result in this file is treated as evidence, this already-authorized path must embed complete executable bytes—not excerpts or hashes only—for:

- `project-expected.mjs`;
- `coordination-set.mjs`;
- `capture-node-signatures.mjs`;
- `capture-node-command.mjs`;
- `capture-eol-matrix.mjs`;
- `rust-boundary-verifier.mjs`;
- every extraction, canonical-JSON, path-set, or comparison helper not wholly contained in those files;
- the complete binary-safe `I0_EXPECTED_PATCH.diff` payload in a lossless encoding.

Every source block must include filename, encoding, complete body, byte length, SHA-256, import ownership, and command role. A complete extraction manifest must enumerate each block exactly once. The patch record must include its decoded byte length and SHA-256. A future operator and reviewer extract the bytes verbatim to a new E-drive root, verify every length and hash before execution, and reject missing imports, snippets, shell-history reconstruction, deleted temporary files, or undeclared generated code.

Fresh control, expected V1, expected V2, historical technical, and candidate lanes must be rebuilt from pinned commits with these verified bytes. The unresolvable objects `4d0770e3...`, `b591edfa...`, and `3307cff2...` are failed historical lookup probes only and cannot satisfy any gate.

## Historical implementation evidence

## Independent-audit return being repaired

- Audited failed candidate: `65fef628850ec145efae635ad3cb4152860aab7e`.
- Dedicated audit task: `01a062bd-1736-7f71-bee9-c60ba0847467`.
- Verdict: `RETURN_FOR_FRESH_I0_REPLAY_AND_EVIDENCE_REPAIR`; P0/P1/P2=`0/2/1`.
- Closed in this replay: old evidence is not reused, the full-index patch is `4,892` bytes with SHA-256 `fb635082a2951b5e3d8b9352230bd462e0c08aa5b7326a93403537baf62b1b05`, and raw checkout/blob plus cleanup evidence will be published before I3.
- Stopped activation `93383e72e9559164f8f7620893956d112fafae9b` added JSON properties and caused six extra governance failures; it was stopped before evidence. The corrected activation `64bc508c...` restores the accepted JSON object shapes and the exact `11/7/4/0` baseline.

## I0 immutable patch and fresh construction

- Three independent lanes (`expected-v1`, `expected-v2`, `rehearsal`) each generated an identical full-index binary patch: `4,892` bytes, SHA-256 `fb635082a2951b5e3d8b9352230bd462e0c08aa5b7326a93403537baf62b1b05`.
- Rust verifier SHA-256: `f015e140cae529c95fb215acafbadd94836008708f63a0a0776f918434a496bd`; all three independent self-test runs passed `5/5`.
- Semantic rehearsal ran the four inherited failing tests plus the new LF/CRLF parity test; all five passed and the ignored scale test run count stayed zero.
- Expected V1 commit/tree: `4d0770e3ddeb6ca72fd45d20d5d28be78cf87c5a` / `d6f305952731e7118926772c7b7e72a4efd72414`.
- Expected V2 commit/tree: `b591edfa27c85a4b28bee9a126cb19495fb5ce03` / `233cdedbbb803363798035da5d66ffc013f6ce72`.
- V1/V2 failure signatures are byte-semantically equal: placeholder content does not determine the expected signature.

### Fresh tool manifest

```json
[
  {
    "Name": "capture-eol-matrix.mjs",
    "Bytes": 5053,
    "Sha256": "bbc8277152431e39d875c1ab95b76b912ff82b170a98995d11a809d927d69ce6"
  },
  {
    "Name": "capture-node-command.mjs",
    "Bytes": 1969,
    "Sha256": "a974da799365c1bf0ecc5f797268a7feb754da2af548b75847fc92462c1abac0"
  },
  {
    "Name": "capture-node-signatures.mjs",
    "Bytes": 5396,
    "Sha256": "63370486285c3c9dd9914f5c4c279f1123e85d701973233f329b7203da14fe27"
  },
  {
    "Name": "coordination-set.mjs",
    "Bytes": 2894,
    "Sha256": "c5a7b865ac85b2497dbd983b3624c4e1a3d6141075920d8a006d8d4132421da2"
  },
  {
    "Name": "project-expected.mjs",
    "Bytes": 6927,
    "Sha256": "12b2fbb1bae2b3d02bd774242007daa5916af9d860272ae4a24b69573709c9da"
  },
  {
    "Name": "rust-boundary-verifier.mjs",
    "Bytes": 20794,
    "Sha256": "f015e140cae529c95fb215acafbadd94836008708f63a0a0776f918434a496bd"
  }
]
```

### Pre-fix seven-path checkout diagnostic

```text
i/lf    w/crlf  attr/                 	crates/brilliant-kernel-runtime/src/indices.rs
i/lf    w/crlf  attr/                 	crates/brilliant-kernel-runtime/src/runtime.rs
i/lf    w/crlf  attr/                 	crates/brilliant-kernel-runtime/src/store.rs
i/lf    w/crlf  attr/                 	test/core-kernel/fixtures/cvn-7-qualification-score.ts
i/lf    w/crlf  attr/                 	test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1
i/lf    w/crlf  attr/                 	test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts
i/lf    w/crlf  attr/                 	test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts
```

## I0 Node baseline

- Node: `D:\nvm4w\nodejs\node.exe`, `v24.15.0`; programmatic runner `isolation: none`, `concurrency: 1`.
- Compiled focused test: `260,445` bytes, SHA-256 `55351663172b27598b7314d45ebe7bd7b19d61a328d8f6b47b7ac6f0ce552961`.
- Focused active/control: `11 total / 7 pass / 4 fail / 0 skip`; all four failures have outer `ERR_TEST_FAILURE/testCodeFailure` and exactly one inner `AssertionError/ERR_ASSERTION`.
- Full active/control: `611 total / 605 pass / 4 fail / 2 skip`; manifest `80` files, SHA-256 `1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1`.
- Cause classification: three new-child path/projection assertions plus one inherited Part Owner property-cap assertion; no product-behavior failure.

### I0 control signature record

```json
{
  "schemaVersion": 1,
  "nodeExecutable": "D:\\nvm4w\\nodejs\\node.exe",
  "nodeVersion": "v24.15.0",
  "isolation": "none",
  "concurrency": 1,
  "compiledTestPath": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\control-true\\dist\\test\\core-kernel\\rust-migration\\rkp-2-workspace-contracts.test.js",
  "compiledTestByteLength": 260445,
  "compiledTestSha256": "55351663172b27598b7314d45ebe7bd7b19d61a328d8f6b47b7ac6f0ce552961",
  "exitCode": 1,
  "counts": {
    "total": 11,
    "pass": 7,
    "fail": 4,
    "skip": 0
  },
  "failureTitles": [
    "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
    "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
    "implementation changes stay inside the literal RKP-2 allowlists",
    "part owner repair stays anchored to its accepted six-path wire contract"
  ],
  "signatures": [
    {
      "title": "implementation changes stay inside the literal RKP-2 allowlists",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": false,
      "messageSha256": "6d833362bfd8a1d0f329998402ed8ebbfe939117b1ccee7691584e0dfb9551a6",
      "actualSha256": "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa",
      "expectedSha256": "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
      "signatureSha256": "3aa8afdee5199c83ac42742a5e7220739ebbff0e753d0ed65ca46a247a4c43d4"
    },
    {
      "title": "part owner repair stays anchored to its accepted six-path wire contract",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": true,
      "messageSha256": "6235e4b0d84858292b8fb4dabd7035f557f52bdf7adeb8f204ab2feda3827196",
      "actualSha256": "c0a92a8b9ef22b97baae16f73131eb3043f5add3fd73be43bf2843025f93bb13",
      "expectedSha256": "d0143410e5f4c6c173f6a7a96a0cd6f20168880c3954223f2e1200cfe2d70ac4",
      "signatureSha256": "fec18396aeae94e664b8d09d64df10b9605ab43cc771432e33e4af64cb4e6a88"
    },
    {
      "title": "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": false,
      "messageSha256": "accfa4eeeea5969d1b9da20ab4e9628c3978c20a03c1c80c520dccf499887e14",
      "actualSha256": "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa",
      "expectedSha256": "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
      "signatureSha256": "8d70e2222134cf36c6c5541bb7612c0622b38705a90e29b56e1ff55644b1397f"
    },
    {
      "title": "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "deepStrictEqual",
      "generatedMessage": true,
      "messageSha256": "3c6b3bcfe3b974c085b2590c3cd5bcb8c2009682bceea1ac2157e43e6cd36b33",
      "actualSha256": "1af50bb3daf4ce99d2f547e50457ed063260ec14afa1fbabdc40caf6ba3684e7",
      "expectedSha256": "2329fabf612884bb3f62d3284a4c0e06d7837a79a792a646937b2b642456e2cb",
      "signatureSha256": "811643e3ea34bc37c1491ef8a365647373dd98196fb03d3d5ed1da70f08a76b7"
    }
  ]
}
```

### Pre-I1 expected V1 signature record

```json
{
  "schemaVersion": 1,
  "nodeExecutable": "D:\\nvm4w\\nodejs\\node.exe",
  "nodeVersion": "v24.15.0",
  "isolation": "none",
  "concurrency": 1,
  "compiledTestPath": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\expected-v1\\dist\\test\\core-kernel\\rust-migration\\rkp-2-workspace-contracts.test.js",
  "compiledTestByteLength": 260445,
  "compiledTestSha256": "55351663172b27598b7314d45ebe7bd7b19d61a328d8f6b47b7ac6f0ce552961",
  "exitCode": 1,
  "counts": {
    "total": 11,
    "pass": 7,
    "fail": 4,
    "skip": 0
  },
  "failureTitles": [
    "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
    "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
    "implementation changes stay inside the literal RKP-2 allowlists",
    "part owner repair stays anchored to its accepted six-path wire contract"
  ],
  "signatures": [
    {
      "title": "implementation changes stay inside the literal RKP-2 allowlists",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": false,
      "messageSha256": "a7514cff7586ae4ac34a78018c8d31ae9e781f1f2bdb7330bb1acd05b2605e3f",
      "actualSha256": "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa",
      "expectedSha256": "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
      "signatureSha256": "7282348f1e76677e166a7dca813fb61d548fd9223c03d27e98cc3fc292d9a05b"
    },
    {
      "title": "part owner repair stays anchored to its accepted six-path wire contract",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": true,
      "messageSha256": "6235e4b0d84858292b8fb4dabd7035f557f52bdf7adeb8f204ab2feda3827196",
      "actualSha256": "c0a92a8b9ef22b97baae16f73131eb3043f5add3fd73be43bf2843025f93bb13",
      "expectedSha256": "d0143410e5f4c6c173f6a7a96a0cd6f20168880c3954223f2e1200cfe2d70ac4",
      "signatureSha256": "fec18396aeae94e664b8d09d64df10b9605ab43cc771432e33e4af64cb4e6a88"
    },
    {
      "title": "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": false,
      "messageSha256": "7f5c22754ff01225ca9f8f2c6ba1f181b11c017da8e85b8e8d5b2b343e8f1c04",
      "actualSha256": "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa",
      "expectedSha256": "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
      "signatureSha256": "df02b599773427fe5dc1ee2350912347f5bb9bbb47d282560d09695cb3f3a13b"
    },
    {
      "title": "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "deepStrictEqual",
      "generatedMessage": true,
      "messageSha256": "0a5f5e9b915a1b69ee54558b6c68447d931e6437f573bc41c76d100069bf4df6",
      "actualSha256": "364c089df81a1d4de820c041e1c12517e7e9138c625ec4796c7483d08916c7e2",
      "expectedSha256": "2329fabf612884bb3f62d3284a4c0e06d7837a79a792a646937b2b642456e2cb",
      "signatureSha256": "73e2508a3826fc0d50f0971c48a01d720842e3b26cdc20ae7b69b23ad8095536"
    }
  ]
}
```

### Pre-I1 expected V2 signature record

```json
{
  "schemaVersion": 1,
  "nodeExecutable": "D:\\nvm4w\\nodejs\\node.exe",
  "nodeVersion": "v24.15.0",
  "isolation": "none",
  "concurrency": 1,
  "compiledTestPath": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\expected-v2\\dist\\test\\core-kernel\\rust-migration\\rkp-2-workspace-contracts.test.js",
  "compiledTestByteLength": 260445,
  "compiledTestSha256": "55351663172b27598b7314d45ebe7bd7b19d61a328d8f6b47b7ac6f0ce552961",
  "exitCode": 1,
  "counts": {
    "total": 11,
    "pass": 7,
    "fail": 4,
    "skip": 0
  },
  "failureTitles": [
    "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
    "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
    "implementation changes stay inside the literal RKP-2 allowlists",
    "part owner repair stays anchored to its accepted six-path wire contract"
  ],
  "signatures": [
    {
      "title": "implementation changes stay inside the literal RKP-2 allowlists",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": false,
      "messageSha256": "a7514cff7586ae4ac34a78018c8d31ae9e781f1f2bdb7330bb1acd05b2605e3f",
      "actualSha256": "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa",
      "expectedSha256": "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
      "signatureSha256": "7282348f1e76677e166a7dca813fb61d548fd9223c03d27e98cc3fc292d9a05b"
    },
    {
      "title": "part owner repair stays anchored to its accepted six-path wire contract",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": true,
      "messageSha256": "6235e4b0d84858292b8fb4dabd7035f557f52bdf7adeb8f204ab2feda3827196",
      "actualSha256": "c0a92a8b9ef22b97baae16f73131eb3043f5add3fd73be43bf2843025f93bb13",
      "expectedSha256": "d0143410e5f4c6c173f6a7a96a0cd6f20168880c3954223f2e1200cfe2d70ac4",
      "signatureSha256": "fec18396aeae94e664b8d09d64df10b9605ab43cc771432e33e4af64cb4e6a88"
    },
    {
      "title": "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": false,
      "messageSha256": "7f5c22754ff01225ca9f8f2c6ba1f181b11c017da8e85b8e8d5b2b343e8f1c04",
      "actualSha256": "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa",
      "expectedSha256": "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
      "signatureSha256": "df02b599773427fe5dc1ee2350912347f5bb9bbb47d282560d09695cb3f3a13b"
    },
    {
      "title": "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "deepStrictEqual",
      "generatedMessage": true,
      "messageSha256": "0a5f5e9b915a1b69ee54558b6c68447d931e6437f573bc41c76d100069bf4df6",
      "actualSha256": "364c089df81a1d4de820c041e1c12517e7e9138c625ec4796c7483d08916c7e2",
      "expectedSha256": "2329fabf612884bb3f62d3284a4c0e06d7837a79a792a646937b2b642456e2cb",
      "signatureSha256": "73e2508a3826fc0d50f0971c48a01d720842e3b26cdc20ae7b69b23ad8095536"
    }
  ]
}
```

### Expected signature relation

```json
{
  "sourceHead": "64bc508cd56bd0a250f890af186c097dc2b6880e",
  "lanes": [
    {
      "lane": "expected-v1",
      "variant": "V1",
      "head": "4d0770e3ddeb6ca72fd45d20d5d28be78cf87c5a",
      "tree": "d6f305952731e7118926772c7b7e72a4efd72414",
      "status": "clean"
    },
    {
      "lane": "expected-v2",
      "variant": "V2",
      "head": "b591edfa27c85a4b28bee9a126cb19495fb5ce03",
      "tree": "233cdedbbb803363798035da5d66ffc013f6ce72",
      "status": "clean"
    }
  ],
  "v1VsV2Signatures": "equal",
  "perTitleVsControl": [
    {
      "title": "implementation changes stay inside the literal RKP-2 allowlists",
      "expectedV1VsControl": "different"
    },
    {
      "title": "part owner repair stays anchored to its accepted six-path wire contract",
      "expectedV1VsControl": "equal"
    },
    {
      "title": "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
      "expectedV1VsControl": "different"
    },
    {
      "title": "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
      "expectedV1VsControl": "different"
    }
  ]
}
```

## I0 Rust RED and rehearsal

- Rust `1.97.1` workspace/all-targets/locked RED exited `101` with exactly four known source-shape failures; runtime crate summary was `13 passed / 4 failed / 1 ignored`.
- Exact failing tests: `runtime_owns_only_the_live_store_and_revision_zero`, `every_typed_record_resolves_once_without_retaining_the_document_tree`, `indices_voice_lookup_then_binary_time_queries_are_exact_and_half_open`, `indices_rebuild_normalizes_without_handles_and_corruption_never_passes_parity`.
- The fresh rehearsal of those four plus `source_shape_normalization_is_lf_crlf_invariant` passed `5/5`.

```json
[
  {
    "test": "runtime::tests::runtime_owns_only_the_live_store_and_revision_zero",
    "exit": 0,
    "result": "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 18 filtered out; finished in 0.00s"
  },
  {
    "test": "store::tests::every_typed_record_resolves_once_without_retaining_the_document_tree",
    "exit": 0,
    "result": "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 18 filtered out; finished in 0.00s"
  },
  {
    "test": "indices::tests::indices_voice_lookup_then_binary_time_queries_are_exact_and_half_open",
    "exit": 0,
    "result": "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 18 filtered out; finished in 0.00s"
  },
  {
    "test": "indices::tests::indices_rebuild_normalizes_without_handles_and_corruption_never_passes_parity",
    "exit": 0,
    "result": "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 18 filtered out; finished in 0.00s"
  },
  {
    "test": "indices::tests::source_shape_normalization_is_lf_crlf_invariant",
    "exit": 0,
    "result": "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 18 filtered out; finished in 0.00s"
  }
]
```

## Six-path coordination projection

The task meta, PRD, design and implementation plan expose the same six literal paths. Both expected commits contain exactly the four technical plus six coordination paths; the coordination-only diff from I0 is:

```json
{
  "count": 6,
  "taskSet": [
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md",
    ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json",
    ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json"
  ],
  "prdSet": [
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md",
    ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json",
    ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json"
  ],
  "designSet": [
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md",
    ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json",
    ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json"
  ],
  "implementSet": [
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md",
    ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json",
    ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json"
  ],
  "actualSet": [
    ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json",
    ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json"
  ]
}
```

## Frozen capture source

### `capture-node-signatures.mjs` — complete fresh source

```javascript
// Freshly materialized after I0_SOURCE_HEAD 64bc508cd56bd0a250f890af186c097dc2b6880e; prior artifacts are diagnostic only.
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

### `rust-boundary-verifier.mjs` — complete fresh source

```javascript
// Freshly materialized after I0_SOURCE_HEAD 64bc508cd56bd0a250f890af186c097dc2b6880e; prior artifacts are diagnostic only.
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
            assert_eq!(declaration, "\\n    entity_index_lookups: usize,\\n");
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

## I0 exit

- No technical file is changed in the active worktree at this evidence projection entry.
- E3 execution count remains `0`; no S6.2 evidence was generated or reused.
- Next gate: apply the frozen `fb635082...` patch verbatim in I1 and commit only the four technical allowlist paths.

## I1 technical result

- Technical commit: `30d4acb0e3ce29e849c2a89b2ac1225bb5dafe49`; tree `022f8b25e53ca68f33be08d0a2cedef65af2aa94`.
- Exact staged full-index patch remained `4,892` bytes, SHA-256 `fb635082a2951b5e3d8b9352230bd462e0c08aa5b7326a93403537baf62b1b05`, and was byte-equal to the I0 patch.
- Rust lexical/reconstruction verification passed for the three Rust blobs; all production prefixes and preserved negative assertions reconstruct exactly to I0.
- Five focused tests passed; the large ignored scale test execution count stayed `0`.

### I1 patch identity

```json
{
  "byteLength": 4892,
  "sha256": "fb635082a2951b5e3d8b9352230bd462e0c08aa5b7326a93403537baf62b1b05",
  "equalsFrozenPatch": true
}
```

### I1 lexical reconstruction

```json
{
  "schemaVersion": 1,
  "command": "verify",
  "repo": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.worktrees\\rkp-2-stage-6-eol-portability-prerequisite",
  "base": "64bc508cd56bd0a250f890af186c097dc2b6880e",
  "revision": "WORKTREE",
  "records": [
    {
      "path": "crates/brilliant-kernel-runtime/src/runtime.rs",
      "baseByteLength": 4956,
      "baseSha256": "117bd4f01e709d1b0aaad76ba626c4f0824113fd2cc3026627104a4cf2a55c80",
      "candidateByteLength": 4978,
      "candidateSha256": "87daf31f00649214b7dbdc30fb1f7044aa4f9bcdb6da4d47b46d04765957bdf3",
      "hunkCount": 1,
      "testModuleClosingLine": 139
    },
    {
      "path": "crates/brilliant-kernel-runtime/src/store.rs",
      "baseByteLength": 70062,
      "baseSha256": "4c2644e9fd7dc1144b23ea0b7ce126f1ed28cea2b3748e7fdc7592a6186a269d",
      "candidateByteLength": 70084,
      "candidateSha256": "d2bf97b30da40caa47f7a91c1e15419bd65f5a6a9105a98c1cf47c4277eaf0e6",
      "hunkCount": 1,
      "testModuleClosingLine": 1719
    },
    {
      "path": "crates/brilliant-kernel-runtime/src/indices.rs",
      "baseByteLength": 78829,
      "baseSha256": "20ef06be9016680e11184f85ca4b0cf86e331bf00fbe394378a5ed48266cc854",
      "candidateByteLength": 79741,
      "candidateSha256": "3e7a1c7f284df006181d49923c52191427c66d68b131df1f2190450523eb90b7",
      "hunkCount": 4,
      "testModuleClosingLine": 2178
    }
  ]
}
```

### I1 focused Rust

```json
[
  {
    "test": "runtime::tests::runtime_owns_only_the_live_store_and_revision_zero",
    "exit": 0,
    "result": "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 18 filtered out; finished in 0.00s"
  },
  {
    "test": "store::tests::every_typed_record_resolves_once_without_retaining_the_document_tree",
    "exit": 0,
    "result": "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 18 filtered out; finished in 0.00s"
  },
  {
    "test": "indices::tests::indices_voice_lookup_then_binary_time_queries_are_exact_and_half_open",
    "exit": 0,
    "result": "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 18 filtered out; finished in 0.00s"
  },
  {
    "test": "indices::tests::indices_rebuild_normalizes_without_handles_and_corruption_never_passes_parity",
    "exit": 0,
    "result": "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 18 filtered out; finished in 0.00s"
  },
  {
    "test": "indices::tests::source_shape_normalization_is_lf_crlf_invariant",
    "exit": 0,
    "result": "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 18 filtered out; finished in 0.00s"
  }
]
```

## I2 dual-checkout byte matrix

- Fresh checkouts: `i2-autocrlf-true` and `i2-autocrlf-false`, both detached at `30d4acb0...` and clean.
- Result: exactly `14` checkout records plus `7` Git-blob records; every checkout byte sequence equals the other checkout and its Git blob, with no CRLF pair.
- Every record reports `i/lf`, `w/lf`, and the exact path-specific `text eol=lf` attribute.
- Initial matrix tool V1 (`5,053` bytes, `bbc82771...`) correctly preserved raw bytes but failed before comparison because Git pads the attribute column. V2 trims only that presentation padding; raw byte, SHA and blob logic is unchanged. V1 source, failure and both hashes are retained.

### I2 matrix-tool bounded correction

```json
{
  "oldByteLength": 5053,
  "oldSha256": "bbc8277152431e39d875c1ab95b76b912ff82b170a98995d11a809d927d69ce6",
  "failure": "ls-files_attribute_column_padding_was_not_trimmed",
  "newByteLength": 5084,
  "newSha256": "0f1f400ff8d13557522203c947aaaf99e92490a2a07a8a6e9a0503f60facaf7c",
  "repair": "trim_only_attribute_column_padding_raw_byte_logic_unchanged"
}
```

### Complete 14-checkout + 7-blob record

```json
{
  "schemaVersion": 1,
  "nodeExecutable": "D:\\nvm4w\\nodejs\\node.exe",
  "nodeVersion": "v24.15.0",
  "base": "64bc508cd56bd0a250f890af186c097dc2b6880e",
  "head": "30d4acb0e3ce29e849c2a89b2ac1225bb5dafe49",
  "paths": [
    "crates/brilliant-kernel-runtime/src/runtime.rs",
    "crates/brilliant-kernel-runtime/src/store.rs",
    "crates/brilliant-kernel-runtime/src/indices.rs",
    "test/core-kernel/fixtures/cvn-7-qualification-score.ts",
    "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
    "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts",
    "test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1"
  ],
  "checkoutRecords": [
    {
      "checkout": "autocrlf-true",
      "path": "crates/brilliant-kernel-runtime/src/runtime.rs",
      "byteLength": 4978,
      "sha256": "87daf31f00649214b7dbdc30fb1f7044aa4f9bcdb6da4d47b46d04765957bdf3",
      "indexEol": "lf",
      "worktreeEol": "lf",
      "attribute": "text eol=lf"
    },
    {
      "checkout": "autocrlf-false",
      "path": "crates/brilliant-kernel-runtime/src/runtime.rs",
      "byteLength": 4978,
      "sha256": "87daf31f00649214b7dbdc30fb1f7044aa4f9bcdb6da4d47b46d04765957bdf3",
      "indexEol": "lf",
      "worktreeEol": "lf",
      "attribute": "text eol=lf"
    },
    {
      "checkout": "autocrlf-true",
      "path": "crates/brilliant-kernel-runtime/src/store.rs",
      "byteLength": 70084,
      "sha256": "d2bf97b30da40caa47f7a91c1e15419bd65f5a6a9105a98c1cf47c4277eaf0e6",
      "indexEol": "lf",
      "worktreeEol": "lf",
      "attribute": "text eol=lf"
    },
    {
      "checkout": "autocrlf-false",
      "path": "crates/brilliant-kernel-runtime/src/store.rs",
      "byteLength": 70084,
      "sha256": "d2bf97b30da40caa47f7a91c1e15419bd65f5a6a9105a98c1cf47c4277eaf0e6",
      "indexEol": "lf",
      "worktreeEol": "lf",
      "attribute": "text eol=lf"
    },
    {
      "checkout": "autocrlf-true",
      "path": "crates/brilliant-kernel-runtime/src/indices.rs",
      "byteLength": 79741,
      "sha256": "3e7a1c7f284df006181d49923c52191427c66d68b131df1f2190450523eb90b7",
      "indexEol": "lf",
      "worktreeEol": "lf",
      "attribute": "text eol=lf"
    },
    {
      "checkout": "autocrlf-false",
      "path": "crates/brilliant-kernel-runtime/src/indices.rs",
      "byteLength": 79741,
      "sha256": "3e7a1c7f284df006181d49923c52191427c66d68b131df1f2190450523eb90b7",
      "indexEol": "lf",
      "worktreeEol": "lf",
      "attribute": "text eol=lf"
    },
    {
      "checkout": "autocrlf-true",
      "path": "test/core-kernel/fixtures/cvn-7-qualification-score.ts",
      "byteLength": 10726,
      "sha256": "5edc34b540835b5edd888706a86df564c0afadc09189293d38d2c4a1b01c05cc",
      "indexEol": "lf",
      "worktreeEol": "lf",
      "attribute": "text eol=lf"
    },
    {
      "checkout": "autocrlf-false",
      "path": "test/core-kernel/fixtures/cvn-7-qualification-score.ts",
      "byteLength": 10726,
      "sha256": "5edc34b540835b5edd888706a86df564c0afadc09189293d38d2c4a1b01c05cc",
      "indexEol": "lf",
      "worktreeEol": "lf",
      "attribute": "text eol=lf"
    },
    {
      "checkout": "autocrlf-true",
      "path": "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
      "byteLength": 38440,
      "sha256": "ec0c59d6516b7635ff6bc595ca67aba0a588cf7a2dee328c9f825fbac8e6531f",
      "indexEol": "lf",
      "worktreeEol": "lf",
      "attribute": "text eol=lf"
    },
    {
      "checkout": "autocrlf-false",
      "path": "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
      "byteLength": 38440,
      "sha256": "ec0c59d6516b7635ff6bc595ca67aba0a588cf7a2dee328c9f825fbac8e6531f",
      "indexEol": "lf",
      "worktreeEol": "lf",
      "attribute": "text eol=lf"
    },
    {
      "checkout": "autocrlf-true",
      "path": "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts",
      "byteLength": 31924,
      "sha256": "72649e5990529b503de461a7daace037cd74199f57504a9b98e4037b928c88b2",
      "indexEol": "lf",
      "worktreeEol": "lf",
      "attribute": "text eol=lf"
    },
    {
      "checkout": "autocrlf-false",
      "path": "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts",
      "byteLength": 31924,
      "sha256": "72649e5990529b503de461a7daace037cd74199f57504a9b98e4037b928c88b2",
      "indexEol": "lf",
      "worktreeEol": "lf",
      "attribute": "text eol=lf"
    },
    {
      "checkout": "autocrlf-true",
      "path": "test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1",
      "byteLength": 15344,
      "sha256": "d0a8486b0cd7cc4e7c1a9c3131ff6ec3c1e79d37d7c54dd54fb03a77282b751f",
      "indexEol": "lf",
      "worktreeEol": "lf",
      "attribute": "text eol=lf"
    },
    {
      "checkout": "autocrlf-false",
      "path": "test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1",
      "byteLength": 15344,
      "sha256": "d0a8486b0cd7cc4e7c1a9c3131ff6ec3c1e79d37d7c54dd54fb03a77282b751f",
      "indexEol": "lf",
      "worktreeEol": "lf",
      "attribute": "text eol=lf"
    }
  ],
  "blobRecords": [
    {
      "path": "crates/brilliant-kernel-runtime/src/runtime.rs",
      "byteLength": 4978,
      "sha256": "87daf31f00649214b7dbdc30fb1f7044aa4f9bcdb6da4d47b46d04765957bdf3"
    },
    {
      "path": "crates/brilliant-kernel-runtime/src/store.rs",
      "byteLength": 70084,
      "sha256": "d2bf97b30da40caa47f7a91c1e15419bd65f5a6a9105a98c1cf47c4277eaf0e6"
    },
    {
      "path": "crates/brilliant-kernel-runtime/src/indices.rs",
      "byteLength": 79741,
      "sha256": "3e7a1c7f284df006181d49923c52191427c66d68b131df1f2190450523eb90b7"
    },
    {
      "path": "test/core-kernel/fixtures/cvn-7-qualification-score.ts",
      "byteLength": 10726,
      "sha256": "5edc34b540835b5edd888706a86df564c0afadc09189293d38d2c4a1b01c05cc"
    },
    {
      "path": "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
      "byteLength": 38440,
      "sha256": "ec0c59d6516b7635ff6bc595ca67aba0a588cf7a2dee328c9f825fbac8e6531f"
    },
    {
      "path": "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts",
      "byteLength": 31924,
      "sha256": "72649e5990529b503de461a7daace037cd74199f57504a9b98e4037b928c88b2"
    },
    {
      "path": "test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1",
      "byteLength": 15344,
      "sha256": "d0a8486b0cd7cc4e7c1a9c3131ff6ec3c1e79d37d7c54dd54fb03a77282b751f"
    }
  ],
  "clean": {
    "autocrlfTrue": true,
    "autocrlfFalse": true
  }
}
```

### Cargo gates

```json
[
  {
    "name": "fmt_1971",
    "command": "C:\\Users\\ATOM\\.cargo\\bin\\cargo.exe +1.97.1 fmt --all -- --check",
    "exit": 0,
    "log": "I2_CARGO_fmt_1971.txt"
  },
  {
    "name": "check_1971",
    "command": "C:\\Users\\ATOM\\.cargo\\bin\\cargo.exe +1.97.1 check --workspace --all-targets --locked",
    "exit": 0,
    "log": "I2_CARGO_check_1971.txt"
  },
  {
    "name": "test_1971",
    "command": "C:\\Users\\ATOM\\.cargo\\bin\\cargo.exe +1.97.1 test --workspace --all-targets --locked",
    "exit": 0,
    "log": "I2_CARGO_test_1971.txt"
  },
  {
    "name": "clippy_1971",
    "command": "C:\\Users\\ATOM\\.cargo\\bin\\cargo.exe +1.97.1 clippy --workspace --all-targets --locked -- -D warnings",
    "exit": 0,
    "log": "I2_CARGO_clippy_1971.txt"
  },
  {
    "name": "check_1880",
    "command": "C:\\Users\\ATOM\\.cargo\\bin\\cargo.exe +1.88.0 check --workspace --all-targets --locked",
    "exit": 0,
    "log": "I2_CARGO_check_1880.txt"
  }
]
```

All Cargo targets and TEMP/TMP directories were on `E:`. Rust 1.97.1 workspace tests passed with Runtime `18 passed / 0 failed / 1 ignored`; the ignored test is the isolated scale evidence worker and was not run.

## I3 provisional entry

- Trellis/JSON/fence/diff gates will be rerun after the six-path projection commit.
- `npm run typecheck` and `npm run build` passed before the provisional projection.
- This checkpoint intentionally does not claim final Node/candidate signature or cleanup results; those require a clean committed candidate and are appended only after observation.

## I3 clean candidate replay

- Provisional clean coordination commit: `ef67f4a5e5ea0c96d8a7b46001458c12bc135413`; tree `585afe41620fb3146c7461a11159044c6a193ae1`.
- Six-path parser passed against I0; exact candidate diff is four technical plus six coordination paths.
- Fresh I3 control remained at I0. Fresh I3 expected rebuild produced commit `3307cff24719f6538ad9fffc5630df31bd0b0038` and the same pre-I1 expected tree `d6f305952731e7118926772c7b7e72a4efd72414`.
- Control signatures equal I0; rebuilt expected signatures equal the pre-I1 V1 record; the candidate equals the predeclared expected record; Part Owner also equals I0.
- All three records preserve Node `v24.15.0`, `11/7/4/0`, the outer/inner cause contract, and compiled test `260,445` bytes / `55351663...`.
- Candidate full run is `611 total / 605 pass / 4 fail / 2 skip`; the 80-file manifest remains SHA-256 `1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1`.

### I3 lane identities

```json
{
  "controlHead": "64bc508cd56bd0a250f890af186c097dc2b6880e",
  "controlStatus": null,
  "expectedHead": "3307cff24719f6538ad9fffc5630df31bd0b0038",
  "expectedTree": "d6f305952731e7118926772c7b7e72a4efd72414",
  "expectedStatus": null
}
```

### I3 control signatures

```json
{
  "schemaVersion": 1,
  "nodeExecutable": "D:\\nvm4w\\nodejs\\node.exe",
  "nodeVersion": "v24.15.0",
  "isolation": "none",
  "concurrency": 1,
  "compiledTestPath": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\i3-control\\dist\\test\\core-kernel\\rust-migration\\rkp-2-workspace-contracts.test.js",
  "compiledTestByteLength": 260445,
  "compiledTestSha256": "55351663172b27598b7314d45ebe7bd7b19d61a328d8f6b47b7ac6f0ce552961",
  "exitCode": 1,
  "counts": {
    "total": 11,
    "pass": 7,
    "fail": 4,
    "skip": 0
  },
  "failureTitles": [
    "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
    "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
    "implementation changes stay inside the literal RKP-2 allowlists",
    "part owner repair stays anchored to its accepted six-path wire contract"
  ],
  "signatures": [
    {
      "title": "implementation changes stay inside the literal RKP-2 allowlists",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": false,
      "messageSha256": "6d833362bfd8a1d0f329998402ed8ebbfe939117b1ccee7691584e0dfb9551a6",
      "actualSha256": "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa",
      "expectedSha256": "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
      "signatureSha256": "3aa8afdee5199c83ac42742a5e7220739ebbff0e753d0ed65ca46a247a4c43d4"
    },
    {
      "title": "part owner repair stays anchored to its accepted six-path wire contract",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": true,
      "messageSha256": "6235e4b0d84858292b8fb4dabd7035f557f52bdf7adeb8f204ab2feda3827196",
      "actualSha256": "c0a92a8b9ef22b97baae16f73131eb3043f5add3fd73be43bf2843025f93bb13",
      "expectedSha256": "d0143410e5f4c6c173f6a7a96a0cd6f20168880c3954223f2e1200cfe2d70ac4",
      "signatureSha256": "fec18396aeae94e664b8d09d64df10b9605ab43cc771432e33e4af64cb4e6a88"
    },
    {
      "title": "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": false,
      "messageSha256": "accfa4eeeea5969d1b9da20ab4e9628c3978c20a03c1c80c520dccf499887e14",
      "actualSha256": "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa",
      "expectedSha256": "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
      "signatureSha256": "8d70e2222134cf36c6c5541bb7612c0622b38705a90e29b56e1ff55644b1397f"
    },
    {
      "title": "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "deepStrictEqual",
      "generatedMessage": true,
      "messageSha256": "3c6b3bcfe3b974c085b2590c3cd5bcb8c2009682bceea1ac2157e43e6cd36b33",
      "actualSha256": "1af50bb3daf4ce99d2f547e50457ed063260ec14afa1fbabdc40caf6ba3684e7",
      "expectedSha256": "2329fabf612884bb3f62d3284a4c0e06d7837a79a792a646937b2b642456e2cb",
      "signatureSha256": "811643e3ea34bc37c1491ef8a365647373dd98196fb03d3d5ed1da70f08a76b7"
    }
  ]
}
```

### I3 rebuilt expected signatures

```json
{
  "schemaVersion": 1,
  "nodeExecutable": "D:\\nvm4w\\nodejs\\node.exe",
  "nodeVersion": "v24.15.0",
  "isolation": "none",
  "concurrency": 1,
  "compiledTestPath": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\i3-expected\\dist\\test\\core-kernel\\rust-migration\\rkp-2-workspace-contracts.test.js",
  "compiledTestByteLength": 260445,
  "compiledTestSha256": "55351663172b27598b7314d45ebe7bd7b19d61a328d8f6b47b7ac6f0ce552961",
  "exitCode": 1,
  "counts": {
    "total": 11,
    "pass": 7,
    "fail": 4,
    "skip": 0
  },
  "failureTitles": [
    "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
    "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
    "implementation changes stay inside the literal RKP-2 allowlists",
    "part owner repair stays anchored to its accepted six-path wire contract"
  ],
  "signatures": [
    {
      "title": "implementation changes stay inside the literal RKP-2 allowlists",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": false,
      "messageSha256": "a7514cff7586ae4ac34a78018c8d31ae9e781f1f2bdb7330bb1acd05b2605e3f",
      "actualSha256": "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa",
      "expectedSha256": "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
      "signatureSha256": "7282348f1e76677e166a7dca813fb61d548fd9223c03d27e98cc3fc292d9a05b"
    },
    {
      "title": "part owner repair stays anchored to its accepted six-path wire contract",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": true,
      "messageSha256": "6235e4b0d84858292b8fb4dabd7035f557f52bdf7adeb8f204ab2feda3827196",
      "actualSha256": "c0a92a8b9ef22b97baae16f73131eb3043f5add3fd73be43bf2843025f93bb13",
      "expectedSha256": "d0143410e5f4c6c173f6a7a96a0cd6f20168880c3954223f2e1200cfe2d70ac4",
      "signatureSha256": "fec18396aeae94e664b8d09d64df10b9605ab43cc771432e33e4af64cb4e6a88"
    },
    {
      "title": "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": false,
      "messageSha256": "7f5c22754ff01225ca9f8f2c6ba1f181b11c017da8e85b8e8d5b2b343e8f1c04",
      "actualSha256": "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa",
      "expectedSha256": "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
      "signatureSha256": "df02b599773427fe5dc1ee2350912347f5bb9bbb47d282560d09695cb3f3a13b"
    },
    {
      "title": "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "deepStrictEqual",
      "generatedMessage": true,
      "messageSha256": "0a5f5e9b915a1b69ee54558b6c68447d931e6437f573bc41c76d100069bf4df6",
      "actualSha256": "364c089df81a1d4de820c041e1c12517e7e9138c625ec4796c7483d08916c7e2",
      "expectedSha256": "2329fabf612884bb3f62d3284a4c0e06d7837a79a792a646937b2b642456e2cb",
      "signatureSha256": "73e2508a3826fc0d50f0971c48a01d720842e3b26cdc20ae7b69b23ad8095536"
    }
  ]
}
```

### I3 candidate signatures

```json
{
  "schemaVersion": 1,
  "nodeExecutable": "D:\\nvm4w\\nodejs\\node.exe",
  "nodeVersion": "v24.15.0",
  "isolation": "none",
  "concurrency": 1,
  "compiledTestPath": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.worktrees\\rkp-2-stage-6-eol-portability-prerequisite\\dist\\test\\core-kernel\\rust-migration\\rkp-2-workspace-contracts.test.js",
  "compiledTestByteLength": 260445,
  "compiledTestSha256": "55351663172b27598b7314d45ebe7bd7b19d61a328d8f6b47b7ac6f0ce552961",
  "exitCode": 1,
  "counts": {
    "total": 11,
    "pass": 7,
    "fail": 4,
    "skip": 0
  },
  "failureTitles": [
    "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
    "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
    "implementation changes stay inside the literal RKP-2 allowlists",
    "part owner repair stays anchored to its accepted six-path wire contract"
  ],
  "signatures": [
    {
      "title": "implementation changes stay inside the literal RKP-2 allowlists",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": false,
      "messageSha256": "a7514cff7586ae4ac34a78018c8d31ae9e781f1f2bdb7330bb1acd05b2605e3f",
      "actualSha256": "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa",
      "expectedSha256": "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
      "signatureSha256": "7282348f1e76677e166a7dca813fb61d548fd9223c03d27e98cc3fc292d9a05b"
    },
    {
      "title": "part owner repair stays anchored to its accepted six-path wire contract",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": true,
      "messageSha256": "6235e4b0d84858292b8fb4dabd7035f557f52bdf7adeb8f204ab2feda3827196",
      "actualSha256": "c0a92a8b9ef22b97baae16f73131eb3043f5add3fd73be43bf2843025f93bb13",
      "expectedSha256": "d0143410e5f4c6c173f6a7a96a0cd6f20168880c3954223f2e1200cfe2d70ac4",
      "signatureSha256": "fec18396aeae94e664b8d09d64df10b9605ab43cc771432e33e4af64cb4e6a88"
    },
    {
      "title": "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "strictEqual",
      "generatedMessage": false,
      "messageSha256": "7f5c22754ff01225ca9f8f2c6ba1f181b11c017da8e85b8e8d5b2b343e8f1c04",
      "actualSha256": "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa",
      "expectedSha256": "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
      "signatureSha256": "df02b599773427fe5dc1ee2350912347f5bb9bbb47d282560d09695cb3f3a13b"
    },
    {
      "title": "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
      "outerErrorCode": "ERR_TEST_FAILURE",
      "outerFailureType": "testCodeFailure",
      "errorName": "AssertionError",
      "errorCode": "ERR_ASSERTION",
      "operator": "deepStrictEqual",
      "generatedMessage": true,
      "messageSha256": "0a5f5e9b915a1b69ee54558b6c68447d931e6437f573bc41c76d100069bf4df6",
      "actualSha256": "364c089df81a1d4de820c041e1c12517e7e9138c625ec4796c7483d08916c7e2",
      "expectedSha256": "2329fabf612884bb3f62d3284a4c0e06d7837a79a792a646937b2b642456e2cb",
      "signatureSha256": "73e2508a3826fc0d50f0971c48a01d720842e3b26cdc20ae7b69b23ad8095536"
    }
  ]
}
```

### I3 comparison

```json
{
  "checks": {
    "controlEqualsI0": true,
    "expectedEqualsPreI1": true,
    "candidateEqualsPreI1": true,
    "allCounts11_7_4_0": true,
    "allCompiledBytesFrozen": true,
    "partOwnerCandidateEqualsI0": true
  },
  "controlCounts": {
    "total": 11,
    "pass": 7,
    "fail": 4,
    "skip": 0
  },
  "expectedCounts": {
    "total": 11,
    "pass": 7,
    "fail": 4,
    "skip": 0
  },
  "candidateCounts": {
    "total": 11,
    "pass": 7,
    "fail": 4,
    "skip": 0
  }
}
```

### I3 full Node summary

```json
{
  "schemaVersion": 1,
  "nodeExecutable": "D:\\nvm4w\\nodejs\\node.exe",
  "nodeVersion": "v24.15.0",
  "runner": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.worktrees\\rkp-2-stage-6-eol-portability-prerequisite\\dist\\test\\test-infrastructure\\run-compiled-tests.js",
  "exitCode": 1,
  "signal": null,
  "manifest": {
    "kind": "full-test-manifest-v1",
    "fileCount": 80,
    "sha256": "1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1"
  },
  "counts": {
    "total": 611,
    "pass": 605,
    "fail": 4,
    "skip": 2
  },
  "stdoutByteLength": 98954,
  "stdoutSha256": "94365b92dad55683980d136e410feb3033ae984f7ca6da5ee5a00fb173fd7399",
  "stderrByteLength": 19,
  "stderrSha256": "7e9281f6bdb52397279dc8312141c9d6fb78a2bef7c3ae807f3b814544ffc9a7",
  "stderrTrimmed": "runner.test-failed"
}
```

### I3 coordination parser

```json
{
  "count": 6,
  "taskSet": [
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md",
    ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json",
    ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json"
  ],
  "prdSet": [
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md",
    ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json",
    ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json"
  ],
  "designSet": [
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md",
    ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json",
    ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json"
  ],
  "implementSet": [
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md",
    ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json",
    ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json"
  ],
  "actualSet": [
    ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json",
    ".trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md",
    ".trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json"
  ]
}
```

## Complete matrix verifier provenance

V1 is retained exactly as failed; V2 changes only presentation-column trimming. Both full sources follow.

### V1 source

```javascript
// Freshly materialized after I0_SOURCE_HEAD 64bc508cd56bd0a250f890af186c097dc2b6880e; prior artifacts are diagnostic only.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const paths = Object.freeze([
  "crates/brilliant-kernel-runtime/src/runtime.rs",
  "crates/brilliant-kernel-runtime/src/store.rs",
  "crates/brilliant-kernel-runtime/src/indices.rs",
  "test/core-kernel/fixtures/cvn-7-qualification-score.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1",
]);

assert.equal(new Set(paths).size, 7, "the governed path list must contain seven unique paths");
assert.equal(process.version, "v24.15.0");

const trueRepo = resolve(process.argv[2] ?? "");
const falseRepo = resolve(process.argv[3] ?? "");
const base = process.argv[4];
const head = process.argv[5];
const output = resolve(process.argv[6] ?? "");
assert.ok(base, "base revision required");
assert.ok(head, "candidate revision required");

function git(repo, args, encoding = "utf8") {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${String(result.stderr)}`);
  return result.stdout;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireClean(repo) {
  const status = git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]);
  assert.equal(status, "", `verification checkout is dirty: ${repo}`);
}

function exactAttributeDiff(repo) {
  const diff = git(repo, ["diff", "--unified=0", base, head, "--", ".gitattributes"]);
  const additions = diff
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
  const removals = diff
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("-") && !line.startsWith("---"));
  assert.deepEqual(additions, paths.map((path) => `${path} text eol=lf`));
  assert.deepEqual(removals, []);
}

function eolRecord(repo, path) {
  const outputText = git(repo, ["ls-files", "--eol", "--", path]).trimEnd();
  const match = /^i\/([^ ]+)\s+w\/([^ ]+)\s+attr\/(.+)\t(.+)$/u.exec(outputText);
  assert.ok(match, `unexpected ls-files --eol record for ${path}: ${outputText}`);
  assert.equal(match[1], "lf", `${path}: index EOL`);
  assert.equal(match[2], "lf", `${path}: worktree EOL`);
  assert.equal(match[3], "text eol=lf", `${path}: attribute`);
  assert.equal(match[4].replaceAll("\\", "/"), path, `${path}: reported path`);
  const attr = git(repo, ["check-attr", "text", "eol", "--", path])
    .trimEnd()
    .split(/\r?\n/u);
  assert.deepEqual(attr, [`${path}: text: set`, `${path}: eol: lf`]);
  return { indexEol: match[1], worktreeEol: match[2], attribute: match[3] };
}

function checkoutRecord(repo, checkout, path) {
  const bytes = readFileSync(resolve(repo, path));
  assert.equal(bytes.includes(Buffer.from([0x0d, 0x0a])), false, `${checkout}/${path}: CRLF remains`);
  return {
    checkout,
    path,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
    ...eolRecord(repo, path),
    bytes,
  };
}

requireClean(trueRepo);
requireClean(falseRepo);
assert.equal(git(trueRepo, ["rev-parse", "HEAD"]).trim(), head);
assert.equal(git(falseRepo, ["rev-parse", "HEAD"]).trim(), head);
exactAttributeDiff(trueRepo);
exactAttributeDiff(falseRepo);

const checkoutRecords = [];
const blobRecords = [];
for (const path of paths) {
  const trueRecord = checkoutRecord(trueRepo, "autocrlf-true", path);
  const falseRecord = checkoutRecord(falseRepo, "autocrlf-false", path);
  const blob = git(trueRepo, ["cat-file", "blob", `${head}:${path}`], null);
  assert.ok(Buffer.isBuffer(blob), `${path}: cat-file stdout must remain a Buffer`);
  assert.equal(trueRecord.bytes.equals(falseRecord.bytes), true, `${path}: checkout bytes differ`);
  assert.equal(trueRecord.bytes.equals(blob), true, `${path}: checkout bytes differ from Git blob`);
  checkoutRecords.push(
    Object.fromEntries(Object.entries(trueRecord).filter(([key]) => key !== "bytes")),
    Object.fromEntries(Object.entries(falseRecord).filter(([key]) => key !== "bytes")),
  );
  blobRecords.push({ path, byteLength: blob.byteLength, sha256: sha256(blob) });
}

assert.equal(checkoutRecords.length, 14);
assert.equal(blobRecords.length, 7);
requireClean(trueRepo);
requireClean(falseRepo);
const result = {
  schemaVersion: 1,
  nodeExecutable: process.execPath,
  nodeVersion: process.version,
  base,
  head,
  paths,
  checkoutRecords,
  blobRecords,
  clean: { autocrlfTrue: true, autocrlfFalse: true },
};
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
```

### V2 source

```javascript
// Freshly materialized after I0_SOURCE_HEAD 64bc508cd56bd0a250f890af186c097dc2b6880e; prior artifacts are diagnostic only.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const paths = Object.freeze([
  "crates/brilliant-kernel-runtime/src/runtime.rs",
  "crates/brilliant-kernel-runtime/src/store.rs",
  "crates/brilliant-kernel-runtime/src/indices.rs",
  "test/core-kernel/fixtures/cvn-7-qualification-score.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts",
  "test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1",
]);

assert.equal(new Set(paths).size, 7, "the governed path list must contain seven unique paths");
assert.equal(process.version, "v24.15.0");

const trueRepo = resolve(process.argv[2] ?? "");
const falseRepo = resolve(process.argv[3] ?? "");
const base = process.argv[4];
const head = process.argv[5];
const output = resolve(process.argv[6] ?? "");
assert.ok(base, "base revision required");
assert.ok(head, "candidate revision required");

function git(repo, args, encoding = "utf8") {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${String(result.stderr)}`);
  return result.stdout;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireClean(repo) {
  const status = git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]);
  assert.equal(status, "", `verification checkout is dirty: ${repo}`);
}

function exactAttributeDiff(repo) {
  const diff = git(repo, ["diff", "--unified=0", base, head, "--", ".gitattributes"]);
  const additions = diff
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
  const removals = diff
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("-") && !line.startsWith("---"));
  assert.deepEqual(additions, paths.map((path) => `${path} text eol=lf`));
  assert.deepEqual(removals, []);
}

function eolRecord(repo, path) {
  const outputText = git(repo, ["ls-files", "--eol", "--", path]).trimEnd();
  const match = /^i\/([^ ]+)\s+w\/([^ ]+)\s+attr\/(.+)\t(.+)$/u.exec(outputText);
  assert.ok(match, `unexpected ls-files --eol record for ${path}: ${outputText}`);
  assert.equal(match[1], "lf", `${path}: index EOL`);
  assert.equal(match[2], "lf", `${path}: worktree EOL`);
  const attribute = match[3].trimEnd();
  assert.equal(attribute, "text eol=lf", `${path}: attribute`);
  assert.equal(match[4].replaceAll("\\", "/"), path, `${path}: reported path`);
  const attr = git(repo, ["check-attr", "text", "eol", "--", path])
    .trimEnd()
    .split(/\r?\n/u);
  assert.deepEqual(attr, [`${path}: text: set`, `${path}: eol: lf`]);
  return { indexEol: match[1], worktreeEol: match[2], attribute };
}

function checkoutRecord(repo, checkout, path) {
  const bytes = readFileSync(resolve(repo, path));
  assert.equal(bytes.includes(Buffer.from([0x0d, 0x0a])), false, `${checkout}/${path}: CRLF remains`);
  return {
    checkout,
    path,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
    ...eolRecord(repo, path),
    bytes,
  };
}

requireClean(trueRepo);
requireClean(falseRepo);
assert.equal(git(trueRepo, ["rev-parse", "HEAD"]).trim(), head);
assert.equal(git(falseRepo, ["rev-parse", "HEAD"]).trim(), head);
exactAttributeDiff(trueRepo);
exactAttributeDiff(falseRepo);

const checkoutRecords = [];
const blobRecords = [];
for (const path of paths) {
  const trueRecord = checkoutRecord(trueRepo, "autocrlf-true", path);
  const falseRecord = checkoutRecord(falseRepo, "autocrlf-false", path);
  const blob = git(trueRepo, ["cat-file", "blob", `${head}:${path}`], null);
  assert.ok(Buffer.isBuffer(blob), `${path}: cat-file stdout must remain a Buffer`);
  assert.equal(trueRecord.bytes.equals(falseRecord.bytes), true, `${path}: checkout bytes differ`);
  assert.equal(trueRecord.bytes.equals(blob), true, `${path}: checkout bytes differ from Git blob`);
  checkoutRecords.push(
    Object.fromEntries(Object.entries(trueRecord).filter(([key]) => key !== "bytes")),
    Object.fromEntries(Object.entries(falseRecord).filter(([key]) => key !== "bytes")),
  );
  blobRecords.push({ path, byteLength: blob.byteLength, sha256: sha256(blob) });
}

assert.equal(checkoutRecords.length, 14);
assert.equal(blobRecords.length, 7);
requireClean(trueRepo);
requireClean(falseRepo);
const result = {
  schemaVersion: 1,
  nodeExecutable: process.execPath,
  nodeVersion: process.version,
  base,
  head,
  paths,
  checkoutRecords,
  blobRecords,
  clean: { autocrlfTrue: true, autocrlfFalse: true },
};
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
```

## Cleanup record

Before this final evidence freeze, all 19 fresh clone, Cargo target and TEMP paths were resolved under the dedicated E-drive root and verified absent after removal. Only the ignored tool/transcript directories were retained through the commit; the complete root is removed after the final post-commit replay.

```json
{
  "cleanupRoot": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh",
  "allResolvedUnderRoot": true,
  "cloneAndBuildTargetCount": 19,
  "records": [
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\cargo-target-i1-1971",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\cargo-target-i2-1880",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\cargo-target-i2-1971",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\temp-i1",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\temp-i2",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\temp-i3-node",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-93383e72",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\.scratch",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\cargo-target-i0-red",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\cargo-target-i0-rehearsal",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\control-true",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\expected-v1",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\expected-v2",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\i2-autocrlf-false",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\i2-autocrlf-true",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\i3-control",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\i3-expected",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\rehearsal",
      "existedBefore": true,
      "absentAfter": true
    },
    {
      "path": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\temp",
      "existedBefore": true,
      "absentAfter": true
    }
  ],
  "retainedUntilEvidenceCommit": [
    "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\tools",
    "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.tmp\\rkp2-eol-evidence-repair-fresh\\run-64bc508c\\transcripts"
  ],
  "finalAction": "remove_entire_cleanup_root_after_final_evidence_commit"
}
```

## Historical candidate boundary superseded by audit return

- At `36420de5...` and `1f3f6061...`, the operator classified the object as ready for dedicated implementation review.
- Dedicated audit task `01a06532-e9ab-7603-bddc-f9d55b3f5bb9` superseded that operator claim with `RETURN`, P0/P1/P2=`0/2/0`.
- `1f3f6061...` is therefore the exact returned historical candidate and the R-P0 planning base, not a current implementation-review candidate.
- The historical post-commit checks remain diagnostic. Missing complete expected/coordination builder bytes prevent independent expected-lane reconstruction.
- Current implementation authorization is false. Acceptance, archive, integration, successor S6.2, S6.3, E3, qualification, runtime cutover, RKP-3 and push remain false.

## Post-freeze native timing transparency addendum

- At clean candidate `36420de5...`, typecheck/build passed. The immediately following first full run was `611/604/5/2` because the pre-existing native ratio test measured duplicate adjacent ratios `3.471/1.709`, with the first value narrowly above its `3.25` noise guard. The four expected governance failures were unchanged.
- No code, threshold or contract was changed. An isolated run of that exact compiled test file passed `8/0/1`; a second isolated check also passed with unique ratios `2.111/2.059` and duplicate ratios `1.954/2.029`.
- A no-build full retry then restored the frozen `611/605/4/2` tuple and identical 80-file manifest. This is recorded as a transient measurement outlier, not silently discarded.

### First post-freeze full summary

```json
{
  "schemaVersion": 1,
  "nodeExecutable": "D:\\nvm4w\\nodejs\\node.exe",
  "nodeVersion": "v24.15.0",
  "runner": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.worktrees\\rkp-2-stage-6-eol-portability-prerequisite\\dist\\test\\test-infrastructure\\run-compiled-tests.js",
  "exitCode": 1,
  "signal": null,
  "manifest": {
    "kind": "full-test-manifest-v1",
    "fileCount": 80,
    "sha256": "1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1"
  },
  "counts": {
    "total": 611,
    "pass": 604,
    "fail": 5,
    "skip": 2
  },
  "stdoutByteLength": 99998,
  "stdoutSha256": "8450416c160c62212e6d8a589efa9e63cf7d8582c36fa2c48ce6e46f13baac49",
  "stderrByteLength": 19,
  "stderrSha256": "7e9281f6bdb52397279dc8312141c9d6fb78a2bef7c3ae807f3b814544ffc9a7",
  "stderrTrimmed": "runner.test-failed"
}
```

### Isolated recheck

```text
✔ raw addon exposes exactly two free functions and performs native create/read (3.0612ms)
﹣ wrapped handle GC runs one bounded FinalizationRegistry journey (0.1806ms) # SKIP
✔ private adapter returns detached deeply frozen data and an opaque handle (3.5513ms)
✔ raw rejection bytes preserve cap, UTF-8, shape and precedence with no handle (17.7506ms)
✔ real addon selects the same canonical structural winner for reversed keys (0.4888ms)
✔ real addon large unique and duplicate objects stay below the frozen near-quadratic ratio (465.5745ms)
ℹ unique medians_ms=11.306,23.871,49.149 adjacent_ratios=2.111,2.059 endpoint_ratio=4.347
ℹ duplicate medians_ms=4.095,8.004,16.238 adjacent_ratios=1.954,2.029 endpoint_ratio=3.965
✔ wrong kind and wrong tag fail stably without native detail leakage (0.232ms)
✔ descriptor-first capture rejects getter, hostile Proxy, sparse array and cycle before native (0.4517ms)
✔ adapter converts every residual native throw or malformed payload to bridge.internal (0.7774ms)
ℹ tests 9
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 625.2572
```

### Full retry summary

```json
{
  "schemaVersion": 1,
  "nodeExecutable": "D:\\nvm4w\\nodejs\\node.exe",
  "nodeVersion": "v24.15.0",
  "runner": "E:\\desktop\\brilliant_ideas\\brilliant_guitar\\.worktrees\\rkp-2-stage-6-eol-portability-prerequisite\\dist\\test\\test-infrastructure\\run-compiled-tests.js",
  "exitCode": 1,
  "signal": null,
  "manifest": {
    "kind": "full-test-manifest-v1",
    "fileCount": 80,
    "sha256": "1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1"
  },
  "counts": {
    "total": 611,
    "pass": 605,
    "fail": 4,
    "skip": 2
  },
  "stdoutByteLength": 98976,
  "stdoutSha256": "3d979629841204df196cba6aa64b62cd6f14262a174d3dc1068794946971d9ba",
  "stderrByteLength": 19,
  "stderrSha256": "7e9281f6bdb52397279dc8312141c9d6fb78a2bef7c3ae807f3b814544ffc9a7",
  "stderrTrimmed": "runner.test-failed"
}
```

## Historical R-P0 re-entry planning boundary

- Current branch/worktree: `codex/rkp-2-stage-6-eol-audit-return-planning-repair` / `.worktrees/rkp-2-stage-6-eol-audit-return-planning-repair`.
- This block records the superseded pre-authorization state; the final R-I0 section is authoritative for the current gate.
- At R-P0, the state was `DOCS-ONLY PLANNING CANDIDATE`; `implementation_candidate_ready=false`.
- The later user authorization is bounded to R-A0/R-I0/R-I1/R-I2 evidence re-entry; production implementation authorization remains false.
- The planning-audit gate passed at `957332a...`; it is no longer the live gate.
- Future evidence is valid only after the complete executable reconstruction capsule and lossless patch payload required at the top of this file are embedded, extracted, hash-verified, and replayed from fresh pinned-source lanes.
- No task start, acceptance, archive, integration, S6.2/S6.3/E3, qualification, runtime cutover, RKP-3, or push is authorized.

## R-I0 durable re-entry capsule and predeclared lanes

- R-A0 source HEAD/tree: `c3e90c6fcc3a624b8a7157bedea59d44f84c6c78` / `40d786f4717e27251ae76b2ae7f49e286337839a`.
- This section supersedes only the current-state claims above; older I0/I1/I2/I3 records remain historical diagnostics.
- R-I0 changes no technical file. Its candidate delta is constrained to the exact six coordination paths and its technical allowlist is empty.
- Every capsule entry below is complete, base64-encoded, independently length/hash checked, and owned only by Node built-ins or Git/TypeScript commands named in the source.

### R-I0 observed record

```json
{
  "kind": "rkp2-eol-reentry-r-i0-record-v1",
  "source": {
    "head": "c3e90c6fcc3a624b8a7157bedea59d44f84c6c78",
    "tree": "40d786f4717e27251ae76b2ae7f49e286337839a"
  },
  "protectedTechnical": {
    "head": "30d4acb0e3ce29e849c2a89b2ac1225bb5dafe49",
    "tree": "022f8b25e53ca68f33be08d0a2cedef65af2aa94"
  },
  "historicalPatchSource": "64bc508cd56bd0a250f890af186c097dc2b6880e",
  "control": {
    "head": "c3e90c6fcc3a624b8a7157bedea59d44f84c6c78",
    "tree": "40d786f4717e27251ae76b2ae7f49e286337839a"
  },
  "expectedV1": {
    "head": "ec26e0424301df58109445841e22b80cc24bd39b",
    "tree": "b8c5b825e5385a4819db24207208f50e79c9735f",
    "markerSha256": "41dfdf71b017b91a510facca221f9362a6201260d7ed6d1c20c3e0723a74656c"
  },
  "expectedV2": {
    "head": "3da64254f1ae368fa7a531fecb5f941ba88b54ed",
    "tree": "2b17d741fa19678f564432c446bf58ea5426dd3a",
    "markerSha256": "0615d6f86f1ed2f78270e18aae5be7172e75625c00c75c12353f3784e8881e74"
  },
  "expectedProjection": {
    "coordinationPathCount": 6,
    "technicalPathCount": 0,
    "v1V2BytesDistinct": true
  },
  "focusedNode": {
    "nodeExecutable": "D:\\nvm4w\\nodejs\\node.exe",
    "nodeVersion": "v24.15.0",
    "compiledTestByteLength": 260445,
    "compiledTestSha256": "55351663172b27598b7314d45ebe7bd7b19d61a328d8f6b47b7ac6f0ce552961",
    "counts": {
      "total": 11,
      "pass": 7,
      "fail": 4,
      "skip": 0
    },
    "controlResultSha256": "30797d3a3cc422921aa1e9a16140b133a8ba2553d2be30fdaba5714a315a6cbe",
    "expectedV1ResultSha256": "b1534e3fe5151b5518190560cb6e90818059786c3ba01b0dad876b3b6a3263d8",
    "expectedV2ResultSha256": "e25642ac57891d832d9741578bb922268775da198c6d7ca7e7ec9cd93d86dd54",
    "controlSignatures": [
      {
        "title": "implementation changes stay inside the literal RKP-2 allowlists",
        "signatureSha256": "7282348f1e76677e166a7dca813fb61d548fd9223c03d27e98cc3fc292d9a05b"
      },
      {
        "title": "part owner repair stays anchored to its accepted six-path wire contract",
        "signatureSha256": "fec18396aeae94e664b8d09d64df10b9605ab43cc771432e33e4af64cb4e6a88"
      },
      {
        "title": "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
        "signatureSha256": "df02b599773427fe5dc1ee2350912347f5bb9bbb47d282560d09695cb3f3a13b"
      },
      {
        "title": "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
        "signatureSha256": "73e2508a3826fc0d50f0971c48a01d720842e3b26cdc20ae7b69b23ad8095536"
      }
    ],
    "expectedV1Signatures": [
      {
        "title": "implementation changes stay inside the literal RKP-2 allowlists",
        "signatureSha256": "7282348f1e76677e166a7dca813fb61d548fd9223c03d27e98cc3fc292d9a05b"
      },
      {
        "title": "part owner repair stays anchored to its accepted six-path wire contract",
        "signatureSha256": "fec18396aeae94e664b8d09d64df10b9605ab43cc771432e33e4af64cb4e6a88"
      },
      {
        "title": "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
        "signatureSha256": "df02b599773427fe5dc1ee2350912347f5bb9bbb47d282560d09695cb3f3a13b"
      },
      {
        "title": "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
        "signatureSha256": "73e2508a3826fc0d50f0971c48a01d720842e3b26cdc20ae7b69b23ad8095536"
      }
    ],
    "expectedV2Signatures": [
      {
        "title": "implementation changes stay inside the literal RKP-2 allowlists",
        "signatureSha256": "7282348f1e76677e166a7dca813fb61d548fd9223c03d27e98cc3fc292d9a05b"
      },
      {
        "title": "part owner repair stays anchored to its accepted six-path wire contract",
        "signatureSha256": "fec18396aeae94e664b8d09d64df10b9605ab43cc771432e33e4af64cb4e6a88"
      },
      {
        "title": "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
        "signatureSha256": "df02b599773427fe5dc1ee2350912347f5bb9bbb47d282560d09695cb3f3a13b"
      },
      {
        "title": "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts",
        "signatureSha256": "73e2508a3826fc0d50f0971c48a01d720842e3b26cdc20ae7b69b23ad8095536"
      }
    ],
    "relationObservedBeforeCandidate": "V1 equals V2; all four signatures also equal control at the R-A0 source, so the future candidate comparison remains observational rather than presumed"
  },
  "fullNodeControl": {
    "manifestFileCount": 80,
    "manifestSha256": "1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1",
    "counts": {
      "total": 590,
      "pass": 582,
      "fail": 7,
      "skip": 1
    },
    "fileLevelMissingIgnoredNativeAddonFailures": 3,
    "governanceFailures": [
      "implementation changes stay inside the literal RKP-2 allowlists",
      "part owner repair stays anchored to its accepted six-path wire contract",
      "Stage 6 hostile and resource evidence consumes the existing private Rust seams",
      "Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts"
    ],
    "resultSha256": "89857f1099d37163ade8cc7cfd45d0e177f98ebb58214a47b41180ae8bc8e26d",
    "discardedDiagnostics": [
      "control-full.json",
      "control-full-2.json"
    ],
    "discardedReason": "capture tool had not changed cwd to the fresh control lane; fixed before control-full-final.json"
  },
  "eolMatrix": {
    "sourceHead": "c3e90c6fcc3a624b8a7157bedea59d44f84c6c78",
    "laneModes": [
      {
        "mode": "true",
        "status": "clean"
      },
      {
        "mode": "false",
        "status": "clean"
      }
    ],
    "records": [
      {
        "path": "crates/brilliant-kernel-runtime/src/runtime.rs",
        "bytes": 4978,
        "sha256": "87daf31f00649214b7dbdc30fb1f7044aa4f9bcdb6da4d47b46d04765957bdf3"
      },
      {
        "path": "crates/brilliant-kernel-runtime/src/store.rs",
        "bytes": 70084,
        "sha256": "d2bf97b30da40caa47f7a91c1e15419bd65f5a6a9105a98c1cf47c4277eaf0e6"
      },
      {
        "path": "crates/brilliant-kernel-runtime/src/indices.rs",
        "bytes": 79741,
        "sha256": "3e7a1c7f284df006181d49923c52191427c66d68b131df1f2190450523eb90b7"
      },
      {
        "path": "test/core-kernel/fixtures/cvn-7-qualification-score.ts",
        "bytes": 10726,
        "sha256": "5edc34b540835b5edd888706a86df564c0afadc09189293d38d2c4a1b01c05cc"
      },
      {
        "path": "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts",
        "bytes": 38440,
        "sha256": "ec0c59d6516b7635ff6bc595ca67aba0a588cf7a2dee328c9f825fbac8e6531f"
      },
      {
        "path": "test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts",
        "bytes": 31924,
        "sha256": "72649e5990529b503de461a7daace037cd74199f57504a9b98e4037b928c88b2"
      },
      {
        "path": "test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1",
        "bytes": 15344,
        "sha256": "d0a8486b0cd7cc4e7c1a9c3131ff6ec3c1e79d37d7c54dd54fb03a77282b751f"
      }
    ],
    "resultSha256": "91c366de5a7afcbb54222968f8cf2d60cbd86713ca7f9a814740bdb2679ddf07"
  },
  "historicalTechnicalReconstruction": {
    "source": "64bc508cd56bd0a250f890af186c097dc2b6880e",
    "technical": "30d4acb0e3ce29e849c2a89b2ac1225bb5dafe49",
    "technicalTree": "022f8b25e53ca68f33be08d0a2cedef65af2aa94",
    "pathProjectedReconstructedTree": "11e46d1e4e8327d6a2e9074ab5be492070139876",
    "exactFourBlobEquality": true,
    "verifierSelfTest": "5/5 pass",
    "fullTreeEqualityNotClaimed": "historical coordination deltas are intentionally outside the four-path reconstruction contract"
  },
  "windowsCheckoutCorrection": "fresh no-checkout clones required core.longpaths=true before checkout; each corrected lane was then clean"
}
```

### Extraction and replay contract

1. Decode `tools/extract-capsule.mjs` from its base64 payload into a fresh E-drive root and verify its manifest length/hash manually or with a standard SHA-256 tool.
2. Run `D:\nvm4w\nodejs\node.exe <fresh-root>\tools\extract-capsule.mjs <implementation-evidence.md> <second-fresh-root>`.
3. Reject unless all ten entries are present once and the extractor reports `entryCount: 10`, `status: verified`.
4. Run every reconstructed lane from its pinned commit. Do not use the old missing synthetic object IDs or any deleted temporary directory.

<!-- RKP2-REENTRY-CAPSULE-MANIFEST-BEGIN -->
```json
{
  "schemaVersion": 1,
  "sourceHead": "c3e90c6fcc3a624b8a7157bedea59d44f84c6c78",
  "sourceTree": "40d786f4717e27251ae76b2ae7f49e286337839a",
  "entryCount": 10,
  "entriesCanonicalSha256": "56d526bba862c646f9170bcbcfd88502d1a23385904b15e0e6918b893e6e91c3",
  "entries": [
    {
      "path": "tools/project-expected.mjs",
      "encoding": "base64",
      "byteLength": 4664,
      "sha256": "b63b2a84f66af13dcad657bf8cb49e156a44572c78b78848f36f62ddf7afdd6a",
      "importOwnership": [
        "node:assert/strict",
        "node:crypto",
        "node:child_process",
        "node:fs",
        "node:path"
      ],
      "commandRole": "Rebuild the binary patch from pinned objects and create one byte-distinct six-path expected projection commit."
    },
    {
      "path": "tools/coordination-set.mjs",
      "encoding": "base64",
      "byteLength": 3863,
      "sha256": "b99e3ebeb21f28ca5aa52885e09067fc52efd2046208d719c1756193b10d99da",
      "importOwnership": [
        "node:assert/strict",
        "node:child_process",
        "node:fs",
        "node:path"
      ],
      "commandRole": "Require task, PRD, design, implement, and actual source-to-candidate diff to equal the exact six-path coordination set."
    },
    {
      "path": "tools/capture-node-signatures.mjs",
      "encoding": "base64",
      "byteLength": 5272,
      "sha256": "84cba4413b5fa965d237494e8bdddd372d72ec0bf448af5ce714f06ff001bd9b",
      "importOwnership": [
        "node:assert/strict",
        "node:crypto",
        "node:fs",
        "node:path",
        "node:test"
      ],
      "commandRole": "Capture title-level outer and inner Node failure signatures with isolation none and concurrency one."
    },
    {
      "path": "tools/capture-node-command.mjs",
      "encoding": "base64",
      "byteLength": 1609,
      "sha256": "f96753131714879d5c44a206b46817217a30568ceb67cf629d31cf7fb4dc150c",
      "importOwnership": [
        "node:assert/strict",
        "node:child_process",
        "node:fs",
        "node:path"
      ],
      "commandRole": "Compile the focused governance test with the pinned TypeScript compiler, then invoke the signature capture tool."
    },
    {
      "path": "tools/compare-node-signatures.mjs",
      "encoding": "base64",
      "byteLength": 2745,
      "sha256": "b4e91c80a422cc5aefaf4592e0aa925a665d526644bbf54013449e29b3e4e34c",
      "importOwnership": [
        "node:assert/strict",
        "node:crypto",
        "node:fs",
        "node:path"
      ],
      "commandRole": "Require the two byte-distinct predeclared lanes to have identical signatures, record their per-title relation to control, and compare a later candidate without presuming its result."
    },
    {
      "path": "tools/capture-eol-matrix.mjs",
      "encoding": "base64",
      "byteLength": 3030,
      "sha256": "a7539f081d9c2db1593ebc29308be13ce7b8cb9bb53d0476f1eb7985192ec3c1",
      "importOwnership": [
        "node:assert/strict",
        "node:crypto",
        "node:child_process",
        "node:fs",
        "node:path"
      ],
      "commandRole": "Create fresh autocrlf true and false clones and compare all seven checkout byte streams with their Git blobs."
    },
    {
      "path": "tools/rust-boundary-verifier.mjs",
      "encoding": "base64",
      "byteLength": 5173,
      "sha256": "3e533d37c44da7d2047c7cadf1f356e6cfbfaec981c345a615658c0512a83340",
      "importOwnership": [
        "node:assert/strict",
        "node:crypto",
        "node:child_process",
        "node:fs",
        "node:path"
      ],
      "commandRole": "Self-test the lexical/path guard, verify the embedded four-path patch against pinned Git bytes, and reconstruct the historical technical blobs in a fresh lane."
    },
    {
      "path": "tools/extract-capsule.mjs",
      "encoding": "base64",
      "byteLength": 1914,
      "sha256": "199130650648081970d3edb62205b10c999b16de018e95acc422cb1e361537ff",
      "importOwnership": [
        "node:assert/strict",
        "node:crypto",
        "node:fs",
        "node:path"
      ],
      "commandRole": "Parse this manifest, decode every payload into a fresh root, and reject any length, SHA-256, duplicate-path, or path-escape mismatch."
    },
    {
      "path": "tools/capture-full-summary.mjs",
      "encoding": "base64",
      "byteLength": 2937,
      "sha256": "1e4f7fd820ece4459aad8626aa28de278700ce9e2887ea09ab4d6bcf650328ca",
      "importOwnership": [
        "node:assert/strict",
        "node:crypto",
        "node:fs",
        "node:path",
        "node:test"
      ],
      "commandRole": "Enumerate the complete compiled test manifest, change cwd to the lane, and capture programmatic per-file and final Node summaries."
    },
    {
      "path": "payload/I0_EXPECTED_PATCH.diff",
      "encoding": "base64",
      "byteLength": 4892,
      "sha256": "fb635082a2951b5e3d8b9352230bd462e0c08aa5b7326a93403537baf62b1b05",
      "importOwnership": [],
      "commandRole": "Apply the complete binary-safe, full-index, four-technical-path historical patch without textual reconstruction."
    }
  ]
}
```
<!-- RKP2-REENTRY-CAPSULE-MANIFEST-END -->

<!-- RKP2-REENTRY-CAPSULE-BEGIN tools/project-expected.mjs -->
aW1wb3J0IGFzc2VydCBmcm9tICJub2RlOmFzc2VydC9zdHJpY3QiOwppbXBvcnQgeyBjcmVhdGVI
YXNoIH0gZnJvbSAibm9kZTpjcnlwdG8iOwppbXBvcnQgeyBzcGF3blN5bmMgfSBmcm9tICJub2Rl
OmNoaWxkX3Byb2Nlc3MiOwppbXBvcnQgeyByZWFkRmlsZVN5bmMsIHdyaXRlRmlsZVN5bmMgfSBm
cm9tICJub2RlOmZzIjsKaW1wb3J0IHsgYmFzZW5hbWUsIHJlc29sdmUgfSBmcm9tICJub2RlOnBh
dGgiOwoKY29uc3QgVEVDSE5JQ0FMX1BBVEhTID0gT2JqZWN0LmZyZWV6ZShbCiAgIi5naXRhdHRy
aWJ1dGVzIiwKICAiY3JhdGVzL2JyaWxsaWFudC1rZXJuZWwtcnVudGltZS9zcmMvcnVudGltZS5y
cyIsCiAgImNyYXRlcy9icmlsbGlhbnQta2VybmVsLXJ1bnRpbWUvc3JjL3N0b3JlLnJzIiwKICAi
Y3JhdGVzL2JyaWxsaWFudC1rZXJuZWwtcnVudGltZS9zcmMvaW5kaWNlcy5ycyIsCl0pOwoKY29u
c3QgQ09PUkRJTkFUSU9OX1BBVEhTID0gT2JqZWN0LmZyZWV6ZShbCiAgIi50cmVsbGlzL3Rhc2tz
LzA5LTAyLXJrcC0yLXN0YWdlLTYtdHJhY2tlZC1ieXRlLWVvbC1wb3J0YWJpbGl0eS1wcmVyZXF1
aXNpdGUvdGFzay5qc29uIiwKICAiLnRyZWxsaXMvdGFza3MvMDktMDItcmtwLTItc3RhZ2UtNi10
cmFja2VkLWJ5dGUtZW9sLXBvcnRhYmlsaXR5LXByZXJlcXVpc2l0ZS9pbXBsZW1lbnRhdGlvbi1l
dmlkZW5jZS5tZCIsCiAgIi50cmVsbGlzL3Rhc2tzLzA5LTAyLXJrcC0yLXN0YWdlLTYtdHJhY2tl
ZC1ieXRlLWVvbC1wb3J0YWJpbGl0eS1wcmVyZXF1aXNpdGUvcmV2aWV3LWNhbmRpZGF0ZS5tZCIs
CiAgIi50cmVsbGlzL3Rhc2tzLzA5LTAyLXJrcC0yLXN0YWdlLTYtdHJhY2tlZC1ieXRlLWVvbC1w
b3J0YWJpbGl0eS1wcmVyZXF1aXNpdGUvb3BlcmF0b3ItaGFuZG9mZi5tZCIsCiAgIi50cmVsbGlz
L3Rhc2tzLzA4LTI0LXJrcC0yLWluZGV4ZWQtbGl2ZS1zY29yZS1zdG9yZS1sb2FkLWVuY29kZS1w
YXJpdHkvdGFzay5qc29uIiwKICAiLnRyZWxsaXMvdGFza3MvMDgtMTUtY29yZS1ydXN0LXJ1bnRp
bWUtcGVyZm9ybWFuY2UtcmVtZWRpYXRpb24vdGFzay5qc29uIiwKXSk7Cgpjb25zdCBzaGEyNTYg
PSAoYnl0ZXMpID0+IGNyZWF0ZUhhc2goInNoYTI1NiIpLnVwZGF0ZShieXRlcykuZGlnZXN0KCJo
ZXgiKTsKCmZ1bmN0aW9uIGdpdChyZXBvLCBhcmdzLCBiaW5hcnkgPSBmYWxzZSkgewogIGNvbnN0
IHJlc3VsdCA9IHNwYXduU3luYygiZ2l0IiwgWyItYyIsICJjb3JlLmxvbmdwYXRocz10cnVlIiwg
Ii1DIiwgcmVwbywgLi4uYXJnc10sIHsKICAgIGVuY29kaW5nOiBiaW5hcnkgPyBudWxsIDogInV0
ZjgiLAogICAgbWF4QnVmZmVyOiA2NCAqIDEwMjQgKiAxMDI0LAogIH0pOwogIGFzc2VydC5lcXVh
bChyZXN1bHQuc3RhdHVzLCAwLCBCdWZmZXIuZnJvbShyZXN1bHQuc3RkZXJyID8/ICIiKS50b1N0
cmluZygidXRmOCIpKTsKICByZXR1cm4gYmluYXJ5ID8gcmVzdWx0LnN0ZG91dCA6IHJlc3VsdC5z
dGRvdXQudHJpbSgpOwp9CgpmdW5jdGlvbiBzb3J0ZWRMaW5lcyh2YWx1ZSkgewogIHJldHVybiB2
YWx1ZS5zcGxpdCgvXHI/XG4vdSkubWFwKChsaW5lKSA9PiBsaW5lLnRyaW0oKSkuZmlsdGVyKEJv
b2xlYW4pLnNvcnQoKTsKfQoKZnVuY3Rpb24gbG9jYXRlQWN0aXZhdGlvblByb2plY3Rpb24oZG9j
dW1lbnQsIHBhdGgpIHsKICBpZiAocGF0aC5pbmNsdWRlcygiMDktMDItcmtwLTItc3RhZ2UtNiIp
KSByZXR1cm4gZG9jdW1lbnQubWV0YTsKICBpZiAocGF0aC5pbmNsdWRlcygiMDgtMjQtcmtwLTIi
KSkgcmV0dXJuIGRvY3VtZW50Lm1ldGEudHJhY2tlZF9ieXRlX2VvbF9wb3J0YWJpbGl0eV9wcmVy
ZXF1aXNpdGU7CiAgaWYgKHBhdGguaW5jbHVkZXMoIjA4LTE1LWNvcmUtcnVzdCIpKSByZXR1cm4g
ZG9jdW1lbnQubWV0YS5ya3AyX3RyYWNrZWRfYnl0ZV9lb2xfcG9ydGFiaWxpdHlfcHJlcmVxdWlz
aXRlOwogIGFzc2VydC5mYWlsKGB1bmtub3duIHRhc2sgcHJvamVjdGlvbjogJHtwYXRofWApOwp9
CgpmdW5jdGlvbiBidWlsZFBhdGNoKHJlcG8sIHNvdXJjZSwgdGVjaG5pY2FsLCBvdXRwdXRQYXRo
KSB7CiAgYXNzZXJ0LmVxdWFsKGdpdChyZXBvLCBbIm1lcmdlLWJhc2UiLCAiLS1pcy1hbmNlc3Rv
ciIsIHNvdXJjZSwgdGVjaG5pY2FsXSksICIiKTsKICBjb25zdCBjaGFuZ2VkID0gc29ydGVkTGlu
ZXMoZ2l0KHJlcG8sIFsKICAgICJkaWZmIiwgIi0tbmFtZS1vbmx5IiwgYCR7c291cmNlfS4uJHt0
ZWNobmljYWx9YCwgIi0tIiwgLi4uVEVDSE5JQ0FMX1BBVEhTLAogIF0pKTsKICBhc3NlcnQuZGVl
cEVxdWFsKGNoYW5nZWQsIFsuLi5URUNITklDQUxfUEFUSFNdLnNvcnQoKSk7CiAgY29uc3QgcGF0
Y2ggPSBnaXQocmVwbywgWwogICAgImRpZmYiLCAiLS1iaW5hcnkiLCAiLS1mdWxsLWluZGV4Iiwg
Ii0tbm8tZXh0LWRpZmYiLCAiLS1uby10ZXh0Y29udiIsCiAgICBgJHtzb3VyY2V9Li4ke3RlY2hu
aWNhbH1gLCAiLS0iLCAuLi5URUNITklDQUxfUEFUSFMsCiAgXSwgdHJ1ZSk7CiAgYXNzZXJ0Lm9r
KHBhdGNoLmxlbmd0aCA+IDApOwogIHdyaXRlRmlsZVN5bmMob3V0cHV0UGF0aCwgcGF0Y2gpOwog
IHJldHVybiB7CiAgICBraW5kOiAicmtwMi1lb2wtZXhwZWN0ZWQtcGF0Y2gtdjEiLAogICAgc291
cmNlLAogICAgdGVjaG5pY2FsLAogICAgcGF0aHM6IFRFQ0hOSUNBTF9QQVRIUywKICAgIGJ5dGVM
ZW5ndGg6IHBhdGNoLmxlbmd0aCwKICAgIHNoYTI1Njogc2hhMjU2KHBhdGNoKSwKICAgIG91dHB1
dFBhdGg6IHJlc29sdmUob3V0cHV0UGF0aCksCiAgfTsKfQoKZnVuY3Rpb24gcHJvamVjdEV4cGVj
dGVkKHJlcG8sIHZhcmlhbnQpIHsKICBhc3NlcnQub2sodmFyaWFudCA9PT0gIlYxIiB8fCB2YXJp
YW50ID09PSAiVjIiLCAidmFyaWFudCBtdXN0IGJlIFYxIG9yIFYyIik7CiAgYXNzZXJ0LmVxdWFs
KGdpdChyZXBvLCBbInN0YXR1cyIsICItLXBvcmNlbGFpbj12MSJdKSwgIiIsICJleHBlY3RlZCBs
YW5lIG11c3Qgc3RhcnQgY2xlYW4iKTsKICBjb25zdCBtYXJrZXIgPSB7CiAgICBzY2hlbWFWZXJz
aW9uOiAxLAogICAgdmFyaWFudCwKICAgIHBsYWNlaG9sZGVyU2hhMjU2OiBzaGEyNTYoQnVmZmVy
LmZyb20oYHJrcDItZW9sLXJlZW50cnktJHt2YXJpYW50fS1ieXRlLWRpc3RpbmN0YCwgInV0Zjgi
KSksCiAgICBldmlkZW5jZVJvbGU6ICJwcmVkZWNsYXJlZC1jb250ZW50LWluc2Vuc2l0aXZpdHkt
cHJvYmUiLAogIH07CgogIGZvciAoY29uc3QgcGF0aCBvZiBDT09SRElOQVRJT05fUEFUSFMpIHsK
ICAgIGNvbnN0IGFic29sdXRlID0gcmVzb2x2ZShyZXBvLCBwYXRoKTsKICAgIGlmIChwYXRoLmVu
ZHNXaXRoKCIuanNvbiIpKSB7CiAgICAgIGNvbnN0IGRvY3VtZW50ID0gSlNPTi5wYXJzZShyZWFk
RmlsZVN5bmMoYWJzb2x1dGUsICJ1dGY4IikpOwogICAgICBjb25zdCBwcm9qZWN0aW9uID0gbG9j
YXRlQWN0aXZhdGlvblByb2plY3Rpb24oZG9jdW1lbnQsIHBhdGgpOwogICAgICBhc3NlcnQuZXF1
YWwodHlwZW9mIHByb2plY3Rpb24sICJvYmplY3QiKTsKICAgICAgcHJvamVjdGlvbi5leHBlY3Rl
ZF9wcm9qZWN0aW9uID0gbWFya2VyOwogICAgICB3cml0ZUZpbGVTeW5jKGFic29sdXRlLCBgJHtK
U09OLnN0cmluZ2lmeShkb2N1bWVudCwgbnVsbCwgMil9XG5gLCAidXRmOCIpOwogICAgfSBlbHNl
IHsKICAgICAgY29uc3Qgb3JpZ2luYWwgPSByZWFkRmlsZVN5bmMoYWJzb2x1dGUsICJ1dGY4Iiku
cmVwbGFjZSgvXHMqJC91LCAiIik7CiAgICAgIHdyaXRlRmlsZVN5bmMoCiAgICAgICAgYWJzb2x1
dGUsCiAgICAgICAgYCR7b3JpZ2luYWx9XG5cbjwhLS0gUktQMi1SRUVOVFJZLUVYUEVDVEVELVBS
T0pFQ1RJT04gJHt2YXJpYW50fSAke21hcmtlci5wbGFjZWhvbGRlclNoYTI1Nn0gLS0+XG5gLAog
ICAgICAgICJ1dGY4IiwKICAgICAgKTsKICAgIH0KICB9CgogIGNvbnN0IGNoYW5nZWQgPSBzb3J0
ZWRMaW5lcyhnaXQocmVwbywgWyJkaWZmIiwgIi0tbmFtZS1vbmx5Il0pKTsKICBhc3NlcnQuZGVl
cEVxdWFsKGNoYW5nZWQsIFsuLi5DT09SRElOQVRJT05fUEFUSFNdLnNvcnQoKSk7CiAgcmV0dXJu
IHsKICAgIGtpbmQ6ICJya3AyLWVvbC1leHBlY3RlZC1wcm9qZWN0aW9uLXYxIiwKICAgIHZhcmlh
bnQsCiAgICBtYXJrZXIsCiAgICBwYXRoczogQ09PUkRJTkFUSU9OX1BBVEhTLAogIH07Cn0KCmNv
bnN0IFtjb21tYW5kLCByZXBvQXJnLCBmaXJzdEFyZywgc2Vjb25kQXJnLCB0aGlyZEFyZ10gPSBw
cm9jZXNzLmFyZ3Yuc2xpY2UoMik7CmNvbnN0IHJlcG8gPSByZXNvbHZlKHJlcG9BcmcgPz8gIiIp
OwpsZXQgcmVzdWx0OwppZiAoY29tbWFuZCA9PT0gInBhdGNoIikgewogIHJlc3VsdCA9IGJ1aWxk
UGF0Y2gocmVwbywgZmlyc3RBcmcsIHNlY29uZEFyZywgcmVzb2x2ZSh0aGlyZEFyZyA/PyAiIikp
Owp9IGVsc2UgaWYgKGNvbW1hbmQgPT09ICJwcm9qZWN0IikgewogIHJlc3VsdCA9IHByb2plY3RF
eHBlY3RlZChyZXBvLCBmaXJzdEFyZyk7Cn0gZWxzZSB7CiAgYXNzZXJ0LmZhaWwoYHVzYWdlOiAk
e2Jhc2VuYW1lKHByb2Nlc3MuYXJndlsxXSl9IHBhdGNoIDxyZXBvPiA8c291cmNlPiA8dGVjaG5p
Y2FsPiA8b3V0cHV0PiB8IHByb2plY3QgPHJlcG8+IFYxfFYyYCk7Cn0KcHJvY2Vzcy5zdGRvdXQu
d3JpdGUoYCR7SlNPTi5zdHJpbmdpZnkocmVzdWx0LCBudWxsLCAyKX1cbmApOwo=
<!-- RKP2-REENTRY-CAPSULE-END tools/project-expected.mjs -->

<!-- RKP2-REENTRY-CAPSULE-BEGIN tools/coordination-set.mjs -->
aW1wb3J0IGFzc2VydCBmcm9tICJub2RlOmFzc2VydC9zdHJpY3QiOwppbXBvcnQgeyBzcGF3blN5
bmMgfSBmcm9tICJub2RlOmNoaWxkX3Byb2Nlc3MiOwppbXBvcnQgeyByZWFkRmlsZVN5bmMsIHdy
aXRlRmlsZVN5bmMgfSBmcm9tICJub2RlOmZzIjsKaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gIm5v
ZGU6cGF0aCI7Cgpjb25zdCBFWFBFQ1RFRCA9IE9iamVjdC5mcmVlemUoWwogICIudHJlbGxpcy90
YXNrcy8wOS0wMi1ya3AtMi1zdGFnZS02LXRyYWNrZWQtYnl0ZS1lb2wtcG9ydGFiaWxpdHktcHJl
cmVxdWlzaXRlL3Rhc2suanNvbiIsCiAgIi50cmVsbGlzL3Rhc2tzLzA5LTAyLXJrcC0yLXN0YWdl
LTYtdHJhY2tlZC1ieXRlLWVvbC1wb3J0YWJpbGl0eS1wcmVyZXF1aXNpdGUvaW1wbGVtZW50YXRp
b24tZXZpZGVuY2UubWQiLAogICIudHJlbGxpcy90YXNrcy8wOS0wMi1ya3AtMi1zdGFnZS02LXRy
YWNrZWQtYnl0ZS1lb2wtcG9ydGFiaWxpdHktcHJlcmVxdWlzaXRlL3Jldmlldy1jYW5kaWRhdGUu
bWQiLAogICIudHJlbGxpcy90YXNrcy8wOS0wMi1ya3AtMi1zdGFnZS02LXRyYWNrZWQtYnl0ZS1l
b2wtcG9ydGFiaWxpdHktcHJlcmVxdWlzaXRlL29wZXJhdG9yLWhhbmRvZmYubWQiLAogICIudHJl
bGxpcy90YXNrcy8wOC0yNC1ya3AtMi1pbmRleGVkLWxpdmUtc2NvcmUtc3RvcmUtbG9hZC1lbmNv
ZGUtcGFyaXR5L3Rhc2suanNvbiIsCiAgIi50cmVsbGlzL3Rhc2tzLzA4LTE1LWNvcmUtcnVzdC1y
dW50aW1lLXBlcmZvcm1hbmNlLXJlbWVkaWF0aW9uL3Rhc2suanNvbiIsCl0pOwoKZnVuY3Rpb24g
Z2l0KHJlcG8sIGFyZ3MpIHsKICBjb25zdCByZXN1bHQgPSBzcGF3blN5bmMoImdpdCIsIFsiLWMi
LCAiY29yZS5sb25ncGF0aHM9dHJ1ZSIsICItQyIsIHJlcG8sIC4uLmFyZ3NdLCB7CiAgICBlbmNv
ZGluZzogInV0ZjgiLAogICAgbWF4QnVmZmVyOiAxNiAqIDEwMjQgKiAxMDI0LAogIH0pOwogIGFz
c2VydC5lcXVhbChyZXN1bHQuc3RhdHVzLCAwLCByZXN1bHQuc3RkZXJyKTsKICByZXR1cm4gcmVz
dWx0LnN0ZG91dC50cmltKCk7Cn0KCmZ1bmN0aW9uIGxpbmVzKHZhbHVlKSB7CiAgcmV0dXJuIHZh
bHVlLnNwbGl0KC9ccj9cbi91KS5tYXAoKGxpbmUpID0+IGxpbmUudHJpbSgpKS5maWx0ZXIoQm9v
bGVhbik7Cn0KCmZ1bmN0aW9uIHNlY3Rpb25QYXRocyh0ZXh0LCBzdGFydEhlYWRpbmcsIGVuZEhl
YWRpbmcpIHsKICBjb25zdCBzdGFydCA9IHRleHQuaW5kZXhPZihzdGFydEhlYWRpbmcpOwogIGFz
c2VydC5ub3RFcXVhbChzdGFydCwgLTEsIGBtaXNzaW5nIGhlYWRpbmc6ICR7c3RhcnRIZWFkaW5n
fWApOwogIGNvbnN0IGVuZCA9IGVuZEhlYWRpbmcgPT09IG51bGwgPyB0ZXh0Lmxlbmd0aCA6IHRl
eHQuaW5kZXhPZihlbmRIZWFkaW5nLCBzdGFydCArIHN0YXJ0SGVhZGluZy5sZW5ndGgpOwogIGFz
c2VydC5ub3RFcXVhbChlbmQsIC0xLCBgbWlzc2luZyBlbmQgaGVhZGluZzogJHtlbmRIZWFkaW5n
fWApOwogIHJldHVybiB0ZXh0LnNsaWNlKHN0YXJ0LCBlbmQpLnNwbGl0KC9ccj9cbi91KS5mbGF0
TWFwKChsaW5lKSA9PiB7CiAgICBjb25zdCBtYXRjaCA9IC9eXGQrXC5ccysoLis/KVxzKiQvdS5l
eGVjKGxpbmUpOwogICAgcmV0dXJuIG1hdGNoID09PSBudWxsID8gW10gOiBbbWF0Y2hbMV0ucmVw
bGFjZUFsbCgiYCIsICIiKV07CiAgfSk7Cn0KCmZ1bmN0aW9uIGVxdWFsU2V0KGFjdHVhbCwgbGFi
ZWwpIHsKICBhc3NlcnQuZXF1YWwobmV3IFNldChhY3R1YWwpLnNpemUsIGFjdHVhbC5sZW5ndGgs
IGAke2xhYmVsfSBjb250YWlucyBkdXBsaWNhdGVzYCk7CiAgYXNzZXJ0LmRlZXBFcXVhbChbLi4u
YWN0dWFsXS5zb3J0KCksIFsuLi5FWFBFQ1RFRF0uc29ydCgpLCBgJHtsYWJlbH0gZGlmZmVycyBm
cm9tIHRoZSBzaXgtcGF0aCBjb250cmFjdGApOwp9Cgpjb25zdCByZXBvID0gcmVzb2x2ZShwcm9j
ZXNzLmFyZ3ZbMl0gPz8gIiIpOwpjb25zdCBzb3VyY2UgPSBwcm9jZXNzLmFyZ3ZbM107CmNvbnN0
IGNhbmRpZGF0ZSA9IHByb2Nlc3MuYXJndls0XSA/PyAiSEVBRCI7CmNvbnN0IG91dHB1dFBhdGgg
PSBwcm9jZXNzLmFyZ3ZbNV0gPT09IHVuZGVmaW5lZCA/IG51bGwgOiByZXNvbHZlKHByb2Nlc3Mu
YXJndls1XSk7Cgpjb25zdCBjaGlsZFBhdGggPSBFWFBFQ1RFRFswXTsKY29uc3QgY2hpbGQgPSBK
U09OLnBhcnNlKHJlYWRGaWxlU3luYyhyZXNvbHZlKHJlcG8sIGNoaWxkUGF0aCksICJ1dGY4Iikp
Owpjb25zdCB0YXNrU2V0ID0gY2hpbGQubWV0YS5mdXR1cmVfY29vcmRpbmF0aW9uX2FsbG93bGlz
dDsKYXNzZXJ0LmRlZXBFcXVhbChjaGlsZC5tZXRhLmZ1dHVyZV90ZWNobmljYWxfYWxsb3dsaXN0
LCBbXSk7CmFzc2VydC5lcXVhbChjaGlsZC5tZXRhLmZ1dHVyZV90ZWNobmljYWxfYWxsb3dsaXN0
X2NvdW50LCAwKTsKYXNzZXJ0LmVxdWFsKGNoaWxkLm1ldGEuZnV0dXJlX2Nvb3JkaW5hdGlvbl9h
bGxvd2xpc3RfY291bnQsIDYpOwoKY29uc3QgcHJkID0gcmVhZEZpbGVTeW5jKHJlc29sdmUocmVw
bywgIi50cmVsbGlzL3Rhc2tzLzA5LTAyLXJrcC0yLXN0YWdlLTYtdHJhY2tlZC1ieXRlLWVvbC1w
b3J0YWJpbGl0eS1wcmVyZXF1aXNpdGUvcHJkLm1kIiksICJ1dGY4Iik7CmNvbnN0IGRlc2lnbiA9
IHJlYWRGaWxlU3luYyhyZXNvbHZlKHJlcG8sICIudHJlbGxpcy90YXNrcy8wOS0wMi1ya3AtMi1z
dGFnZS02LXRyYWNrZWQtYnl0ZS1lb2wtcG9ydGFiaWxpdHktcHJlcmVxdWlzaXRlL2Rlc2lnbi5t
ZCIpLCAidXRmOCIpOwpjb25zdCBpbXBsZW1lbnQgPSByZWFkRmlsZVN5bmMocmVzb2x2ZShyZXBv
LCAiLnRyZWxsaXMvdGFza3MvMDktMDItcmtwLTItc3RhZ2UtNi10cmFja2VkLWJ5dGUtZW9sLXBv
cnRhYmlsaXR5LXByZXJlcXVpc2l0ZS9pbXBsZW1lbnQubWQiKSwgInV0ZjgiKTsKCmNvbnN0IHBy
ZFNldCA9IHNlY3Rpb25QYXRocyhwcmQsICIjIyMgRnV0dXJlIHJlLWVudHJ5IGNvb3JkaW5hdGlv
biBhbGxvd2xpc3QiLCAiIyMjIFByb3RlY3RlZCB0ZWNobmljYWwgcGF0aHMiKTsKY29uc3QgZGVz
aWduU2V0ID0gc2VjdGlvblBhdGhzKGRlc2lnbiwgIiMjIyA0LjIgRnV0dXJlIHJlLWVudHJ5IGNv
b3JkaW5hdGlvbiBzZXQiLCAiIyMgNS4gRHVyYWJsZSByZWNvbnN0cnVjdGlvbiBjYXBzdWxlIik7
CmNvbnN0IGltcGxlbWVudFNldCA9IHNlY3Rpb25QYXRocyhpbXBsZW1lbnQsICJBZnRlciBhIHNl
cGFyYXRlbHkgYXV0aG9yaXplZCBSLUEwIiwgIkNvbXBsZXRlIHJlY29uc3RydWN0aW9uIHNvdXJj
ZXMiKTsKY29uc3QgYWN0dWFsU2V0ID0gbGluZXMoZ2l0KHJlcG8sIFsiZGlmZiIsICItLW5hbWUt
b25seSIsIGAke3NvdXJjZX0uLiR7Y2FuZGlkYXRlfWBdKSk7Cgpmb3IgKGNvbnN0IFtsYWJlbCwg
dmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHsgdGFza1NldCwgcHJkU2V0LCBkZXNpZ25TZXQsIGlt
cGxlbWVudFNldCwgYWN0dWFsU2V0IH0pKSB7CiAgZXF1YWxTZXQodmFsdWUsIGxhYmVsKTsKfQoK
Y29uc3QgcmVzdWx0ID0gewogIGtpbmQ6ICJya3AyLWVvbC1jb29yZGluYXRpb24tc2V0LXYxIiwK
ICBzb3VyY2UsCiAgY2FuZGlkYXRlLAogIGNvdW50OiBFWFBFQ1RFRC5sZW5ndGgsCiAgZXhwZWN0
ZWQ6IEVYUEVDVEVELAogIHRhc2tTZXQsCiAgcHJkU2V0LAogIGRlc2lnblNldCwKICBpbXBsZW1l
bnRTZXQsCiAgYWN0dWFsU2V0LAogIGZ1dHVyZVRlY2huaWNhbEFsbG93bGlzdENvdW50OiAwLAp9
Owpjb25zdCBlbmNvZGVkID0gYCR7SlNPTi5zdHJpbmdpZnkocmVzdWx0LCBudWxsLCAyKX1cbmA7
CmlmIChvdXRwdXRQYXRoICE9PSBudWxsKSB3cml0ZUZpbGVTeW5jKG91dHB1dFBhdGgsIGVuY29k
ZWQsICJ1dGY4Iik7CnByb2Nlc3Muc3Rkb3V0LndyaXRlKGVuY29kZWQpOwo=
<!-- RKP2-REENTRY-CAPSULE-END tools/coordination-set.mjs -->

<!-- RKP2-REENTRY-CAPSULE-BEGIN tools/capture-node-signatures.mjs -->
aW1wb3J0IGFzc2VydCBmcm9tICJub2RlOmFzc2VydC9zdHJpY3QiOwppbXBvcnQgeyBjcmVhdGVI
YXNoIH0gZnJvbSAibm9kZTpjcnlwdG8iOwppbXBvcnQgeyByZWFkRmlsZVN5bmMsIHdyaXRlRmls
ZVN5bmMgfSBmcm9tICJub2RlOmZzIjsKaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gIm5vZGU6cGF0
aCI7CmltcG9ydCB7IHJ1biB9IGZyb20gIm5vZGU6dGVzdCI7Cgpjb25zdCBFWFBFQ1RFRF9GQUlM
VVJFX1RJVExFUyA9IE9iamVjdC5mcmVlemUoWwogICJTdGFnZSA2IGhvc3RpbGUgYW5kIHJlc291
cmNlIGV2aWRlbmNlIGNvbnN1bWVzIHRoZSBleGlzdGluZyBwcml2YXRlIFJ1c3Qgc2VhbXMiLAog
ICJTdGFnZSA2IHNlbWFudGljIGNhbm9uaWNhbCBldmlkZW5jZSBjb3JyZWN0aW9uIGFuZCBFMiB3
b3JrZXIgc3RheSBpbnNpZGUgdGhlIGFjY2VwdGVkIGNvbnRyYWN0cyIsCiAgImltcGxlbWVudGF0
aW9uIGNoYW5nZXMgc3RheSBpbnNpZGUgdGhlIGxpdGVyYWwgUktQLTIgYWxsb3dsaXN0cyIsCiAg
InBhcnQgb3duZXIgcmVwYWlyIHN0YXlzIGFuY2hvcmVkIHRvIGl0cyBhY2NlcHRlZCBzaXgtcGF0
aCB3aXJlIGNvbnRyYWN0IiwKXSk7Cgpjb25zdCBzaGEyNTYgPSAoYnl0ZXMpID0+IGNyZWF0ZUhh
c2goInNoYTI1NiIpLnVwZGF0ZShieXRlcykuZGlnZXN0KCJoZXgiKTsKCmZ1bmN0aW9uIGNhbm9u
aWNhbEpzb24odmFsdWUsIHNlZW4gPSBuZXcgU2V0KCkpIHsKICBpZiAodmFsdWUgPT09IG51bGwp
IHJldHVybiAibnVsbCI7CiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gImJvb2xlYW4iKSByZXR1cm4g
dmFsdWUgPyAidHJ1ZSIgOiAiZmFsc2UiOwogIGlmICh0eXBlb2YgdmFsdWUgPT09ICJudW1iZXIi
KSB7CiAgICBhc3NlcnQuZXF1YWwoTnVtYmVyLmlzRmluaXRlKHZhbHVlKSwgdHJ1ZSwgInNpZ25h
dHVyZSBudW1iZXIgbXVzdCBiZSBmaW5pdGUiKTsKICAgIHJldHVybiBKU09OLnN0cmluZ2lmeSh2
YWx1ZSk7CiAgfQogIGlmICh0eXBlb2YgdmFsdWUgPT09ICJzdHJpbmciKSByZXR1cm4gSlNPTi5z
dHJpbmdpZnkodmFsdWUpOwogIGFzc2VydC5lcXVhbCh0eXBlb2YgdmFsdWUsICJvYmplY3QiLCAi
c2lnbmF0dXJlIHZhbHVlIG11c3QgYmUgSlNPTiBkYXRhIik7CiAgYXNzZXJ0LmVxdWFsKHNlZW4u
aGFzKHZhbHVlKSwgZmFsc2UsICJzaWduYXR1cmUgdmFsdWUgbXVzdCBiZSBhY3ljbGljIik7CiAg
c2Vlbi5hZGQodmFsdWUpOwogIGxldCBlbmNvZGVkOwogIGlmIChBcnJheS5pc0FycmF5KHZhbHVl
KSkgewogICAgZW5jb2RlZCA9IGBbJHt2YWx1ZS5tYXAoKGVudHJ5KSA9PiBjYW5vbmljYWxKc29u
KGVudHJ5LCBzZWVuKSkuam9pbigiLCIpfV1gOwogIH0gZWxzZSB7CiAgICBjb25zdCBwcm90b3R5
cGUgPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YodmFsdWUpOwogICAgYXNzZXJ0LmVxdWFsKHByb3Rv
dHlwZSA9PT0gT2JqZWN0LnByb3RvdHlwZSB8fCBwcm90b3R5cGUgPT09IG51bGwsIHRydWUsICJz
aWduYXR1cmUgb2JqZWN0IG11c3QgYmUgcGxhaW4iKTsKICAgIGVuY29kZWQgPSBgeyR7T2JqZWN0
LmtleXModmFsdWUpLnNvcnQoKS5tYXAoKGtleSkgPT4gYCR7SlNPTi5zdHJpbmdpZnkoa2V5KX06
JHtjYW5vbmljYWxKc29uKHZhbHVlW2tleV0sIHNlZW4pfWApLmpvaW4oIiwiKX19YDsKICB9CiAg
c2Vlbi5kZWxldGUodmFsdWUpOwogIHJldHVybiBlbmNvZGVkOwp9CgpmdW5jdGlvbiBoYXNoVGV4
dCh2YWx1ZSkgewogIHJldHVybiBzaGEyNTYoQnVmZmVyLmZyb20odmFsdWUsICJ1dGY4IikpOwp9
CgpmdW5jdGlvbiBjYXB0dXJlRmFpbHVyZShkYXRhKSB7CiAgY29uc3QgdGl0bGUgPSBkYXRhPy5u
YW1lOwogIGFzc2VydC5lcXVhbCh0eXBlb2YgdGl0bGUsICJzdHJpbmciKTsKICBjb25zdCBvdXRl
ciA9IGRhdGE/LmRldGFpbHM/LmVycm9yOwogIGFzc2VydC5lcXVhbCh0eXBlb2Ygb3V0ZXIsICJv
YmplY3QiKTsKICBhc3NlcnQubm90RXF1YWwob3V0ZXIsIG51bGwpOwogIGFzc2VydC5lcXVhbChv
dXRlci5jb2RlLCAiRVJSX1RFU1RfRkFJTFVSRSIpOwogIGFzc2VydC5lcXVhbChvdXRlci5mYWls
dXJlVHlwZSwgInRlc3RDb2RlRmFpbHVyZSIpOwogIGFzc2VydC5lcXVhbChPYmplY3QuaGFzT3du
KG91dGVyLCAiY2F1c2UiKSwgdHJ1ZSk7CiAgY29uc3QgaW5uZXIgPSBvdXRlci5jYXVzZTsKICBh
c3NlcnQuZXF1YWwodHlwZW9mIGlubmVyLCAib2JqZWN0Iik7CiAgYXNzZXJ0Lm5vdEVxdWFsKGlu
bmVyLCBudWxsKTsKICBhc3NlcnQuZXF1YWwoaW5uZXIubmFtZSwgIkFzc2VydGlvbkVycm9yIik7
CiAgYXNzZXJ0LmVxdWFsKGlubmVyLmNvZGUsICJFUlJfQVNTRVJUSU9OIik7CiAgYXNzZXJ0LmVx
dWFsKE9iamVjdC5oYXNPd24oaW5uZXIsICJjYXVzZSIpLCBmYWxzZSk7CiAgZm9yIChjb25zdCBm
aWVsZCBvZiBbIm9wZXJhdG9yIiwgImFjdHVhbCIsICJleHBlY3RlZCIsICJnZW5lcmF0ZWRNZXNz
YWdlIl0pIHsKICAgIGFzc2VydC5lcXVhbChPYmplY3QuaGFzT3duKGlubmVyLCBmaWVsZCksIHRy
dWUsIGAke3RpdGxlfTogbWlzc2luZyAke2ZpZWxkfWApOwogIH0KICBhc3NlcnQuZXF1YWwodHlw
ZW9mIGlubmVyLm9wZXJhdG9yLCAic3RyaW5nIik7CiAgYXNzZXJ0LmVxdWFsKHR5cGVvZiBpbm5l
ci5nZW5lcmF0ZWRNZXNzYWdlLCAiYm9vbGVhbiIpOwogIGFzc2VydC5lcXVhbCh0eXBlb2YgaW5u
ZXIubWVzc2FnZSwgInN0cmluZyIpOwogIGNvbnN0IHJlY29yZCA9IHsKICAgIHRpdGxlLAogICAg
b3V0ZXJFcnJvckNvZGU6IG91dGVyLmNvZGUsCiAgICBvdXRlckZhaWx1cmVUeXBlOiBvdXRlci5m
YWlsdXJlVHlwZSwKICAgIGVycm9yTmFtZTogaW5uZXIubmFtZSwKICAgIGVycm9yQ29kZTogaW5u
ZXIuY29kZSwKICAgIG9wZXJhdG9yOiBpbm5lci5vcGVyYXRvciwKICAgIGdlbmVyYXRlZE1lc3Nh
Z2U6IGlubmVyLmdlbmVyYXRlZE1lc3NhZ2UsCiAgICBtZXNzYWdlU2hhMjU2OiBoYXNoVGV4dChp
bm5lci5tZXNzYWdlKSwKICAgIGFjdHVhbFNoYTI1NjogaGFzaFRleHQoY2Fub25pY2FsSnNvbihp
bm5lci5hY3R1YWwpKSwKICAgIGV4cGVjdGVkU2hhMjU2OiBoYXNoVGV4dChjYW5vbmljYWxKc29u
KGlubmVyLmV4cGVjdGVkKSksCiAgfTsKICByZXR1cm4gT2JqZWN0LmZyZWV6ZSh7IC4uLnJlY29y
ZCwgc2lnbmF0dXJlU2hhMjU2OiBoYXNoVGV4dChjYW5vbmljYWxKc29uKHJlY29yZCkpIH0pOwp9
Cgphc3luYyBmdW5jdGlvbiBtYWluKCkgewogIGNvbnN0IGNvbXBpbGVkVGVzdFBhdGggPSByZXNv
bHZlKHByb2Nlc3MuYXJndlsyXSA/PyAiIik7CiAgY29uc3Qgb3V0cHV0UGF0aCA9IHJlc29sdmUo
cHJvY2Vzcy5hcmd2WzNdID8/ICIiKTsKICBhc3NlcnQuZXF1YWwocHJvY2Vzcy52ZXJzaW9uLCAi
djI0LjE1LjAiKTsKICBjb25zdCBjb21waWxlZEJ5dGVzID0gcmVhZEZpbGVTeW5jKGNvbXBpbGVk
VGVzdFBhdGgpOwogIGNvbnN0IHN0cmVhbSA9IHJ1bih7IGZpbGVzOiBbY29tcGlsZWRUZXN0UGF0
aF0sIGlzb2xhdGlvbjogIm5vbmUiLCBjb25jdXJyZW5jeTogMSB9KTsKICBjb25zdCBvYnNlcnZl
ZCA9IFtdOwogIGxldCBzdHJlYW1FcnJvcjsKICBzdHJlYW0ub24oInRlc3Q6cGFzcyIsIChkYXRh
KSA9PiBvYnNlcnZlZC5wdXNoKHsgdHlwZTogInBhc3MiLCBkYXRhIH0pKTsKICBzdHJlYW0ub24o
InRlc3Q6ZmFpbCIsIChkYXRhKSA9PiBvYnNlcnZlZC5wdXNoKHsgdHlwZTogImZhaWwiLCBkYXRh
IH0pKTsKICBzdHJlYW0ub24oInRlc3Q6Y2FuY2VsIiwgKGRhdGEpID0+IG9ic2VydmVkLnB1c2go
eyB0eXBlOiAiY2FuY2VsIiwgZGF0YSB9KSk7CiAgc3RyZWFtLm9uKCJlcnJvciIsIChlcnJvcikg
PT4geyBzdHJlYW1FcnJvciA9IGVycm9yOyB9KTsKICBjb25zdCBlbmRlZCA9IG5ldyBQcm9taXNl
KChhY2NlcHQpID0+IHN0cmVhbS5vbigiZW5kIiwgYWNjZXB0KSk7CiAgc3RyZWFtLnJlc3VtZSgp
OwogIGF3YWl0IGVuZGVkOwogIGFzc2VydC5lcXVhbChzdHJlYW1FcnJvciwgdW5kZWZpbmVkKTsK
ICBjb25zdCB0b3AgPSBvYnNlcnZlZC5maWx0ZXIoKHsgZGF0YSB9KSA9PiBkYXRhPy5uZXN0aW5n
ID09PSAwICYmIHR5cGVvZiBkYXRhPy5uYW1lID09PSAic3RyaW5nIik7CiAgY29uc3QgZmFpbGVk
ID0gdG9wLmZpbHRlcigoeyB0eXBlIH0pID0+IHR5cGUgPT09ICJmYWlsIik7CiAgY29uc3Qgc2tp
cHBlZCA9IHRvcC5maWx0ZXIoKHsgdHlwZSwgZGF0YSB9KSA9PiB0eXBlID09PSAicGFzcyIgJiYg
ZGF0YT8uc2tpcCAhPT0gdW5kZWZpbmVkKTsKICBjb25zdCBwYXNzZWQgPSB0b3AuZmlsdGVyKCh7
IHR5cGUsIGRhdGEgfSkgPT4gdHlwZSA9PT0gInBhc3MiICYmIGRhdGE/LnNraXAgPT09IHVuZGVm
aW5lZCk7CiAgYXNzZXJ0LmVxdWFsKHRvcC5maWx0ZXIoKHsgdHlwZSB9KSA9PiB0eXBlID09PSAi
Y2FuY2VsIikubGVuZ3RoLCAwKTsKICBjb25zdCB0aXRsZXMgPSBmYWlsZWQubWFwKCh7IGRhdGEg
fSkgPT4gZGF0YS5uYW1lKS5zb3J0KCk7CiAgYXNzZXJ0LmRlZXBFcXVhbCh0aXRsZXMsIFsuLi5F
WFBFQ1RFRF9GQUlMVVJFX1RJVExFU10uc29ydCgpKTsKICBhc3NlcnQuZXF1YWwobmV3IFNldCh0
aXRsZXMpLnNpemUsIDQpOwogIGNvbnN0IHNpZ25hdHVyZXMgPSBmYWlsZWQubWFwKCh7IGRhdGEg
fSkgPT4gY2FwdHVyZUZhaWx1cmUoZGF0YSkpLnNvcnQoKGxlZnQsIHJpZ2h0KSA9PiBsZWZ0LnRp
dGxlLmxvY2FsZUNvbXBhcmUocmlnaHQudGl0bGUsICJlbiIpKTsKICBjb25zdCByZXN1bHQgPSB7
CiAgICBzY2hlbWFWZXJzaW9uOiAxLAogICAgbm9kZUV4ZWN1dGFibGU6IHByb2Nlc3MuZXhlY1Bh
dGgsCiAgICBub2RlVmVyc2lvbjogcHJvY2Vzcy52ZXJzaW9uLAogICAgaXNvbGF0aW9uOiAibm9u
ZSIsCiAgICBjb25jdXJyZW5jeTogMSwKICAgIGNvbXBpbGVkVGVzdFBhdGgsCiAgICBjb21waWxl
ZFRlc3RCeXRlTGVuZ3RoOiBjb21waWxlZEJ5dGVzLmxlbmd0aCwKICAgIGNvbXBpbGVkVGVzdFNo
YTI1Njogc2hhMjU2KGNvbXBpbGVkQnl0ZXMpLAogICAgZXhpdENvZGU6IGZhaWxlZC5sZW5ndGgg
PT09IDAgPyAwIDogMSwKICAgIGNvdW50czogeyB0b3RhbDogdG9wLmxlbmd0aCwgcGFzczogcGFz
c2VkLmxlbmd0aCwgZmFpbDogZmFpbGVkLmxlbmd0aCwgc2tpcDogc2tpcHBlZC5sZW5ndGggfSwK
ICAgIGZhaWx1cmVUaXRsZXM6IHRpdGxlcywKICAgIHNpZ25hdHVyZXMsCiAgfTsKICB3cml0ZUZp
bGVTeW5jKG91dHB1dFBhdGgsIGAke0pTT04uc3RyaW5naWZ5KHJlc3VsdCwgbnVsbCwgMil9XG5g
LCAidXRmOCIpOwp9Cgphd2FpdCBtYWluKCk7Cg==
<!-- RKP2-REENTRY-CAPSULE-END tools/capture-node-signatures.mjs -->

<!-- RKP2-REENTRY-CAPSULE-BEGIN tools/capture-node-command.mjs -->
aW1wb3J0IGFzc2VydCBmcm9tICJub2RlOmFzc2VydC9zdHJpY3QiOwppbXBvcnQgeyBzcGF3blN5
bmMgfSBmcm9tICJub2RlOmNoaWxkX3Byb2Nlc3MiOwppbXBvcnQgeyByZWFkRmlsZVN5bmMgfSBm
cm9tICJub2RlOmZzIjsKaW1wb3J0IHsgam9pbiwgcmVzb2x2ZSB9IGZyb20gIm5vZGU6cGF0aCI7
CgpmdW5jdGlvbiBydW4oZXhlY3V0YWJsZSwgYXJncywgY3dkKSB7CiAgY29uc3QgcmVzdWx0ID0g
c3Bhd25TeW5jKGV4ZWN1dGFibGUsIGFyZ3MsIHsKICAgIGN3ZCwKICAgIGVuY29kaW5nOiAidXRm
OCIsCiAgICBtYXhCdWZmZXI6IDY0ICogMTAyNCAqIDEwMjQsCiAgfSk7CiAgYXNzZXJ0LmVxdWFs
KHJlc3VsdC5zdGF0dXMsIDAsIGAke2V4ZWN1dGFibGV9ICR7YXJncy5qb2luKCIgIil9XG4ke3Jl
c3VsdC5zdGRvdXR9XG4ke3Jlc3VsdC5zdGRlcnJ9YCk7CiAgcmV0dXJuIHsgc3Rkb3V0OiByZXN1
bHQuc3Rkb3V0LCBzdGRlcnI6IHJlc3VsdC5zdGRlcnIgfTsKfQoKY29uc3QgcmVwbyA9IHJlc29s
dmUocHJvY2Vzcy5hcmd2WzJdID8/ICIiKTsKY29uc3QgdG9vbFJvb3QgPSByZXNvbHZlKHByb2Nl
c3MuYXJndlszXSA/PyAiIik7CmNvbnN0IG5vZGVFeGVjdXRhYmxlID0gcmVzb2x2ZShwcm9jZXNz
LmFyZ3ZbNF0gPz8gcHJvY2Vzcy5leGVjUGF0aCk7CmNvbnN0IHRzY1NjcmlwdCA9IHJlc29sdmUo
cHJvY2Vzcy5hcmd2WzVdID8/ICIiKTsKY29uc3Qgb3V0cHV0UGF0aCA9IHJlc29sdmUocHJvY2Vz
cy5hcmd2WzZdID8/ICIiKTsKCmNvbnN0IHZlcnNpb24gPSBydW4obm9kZUV4ZWN1dGFibGUsIFsi
LS12ZXJzaW9uIl0sIHJlcG8pLnN0ZG91dC50cmltKCk7CmFzc2VydC5lcXVhbCh2ZXJzaW9uLCAi
djI0LjE1LjAiKTsKcnVuKG5vZGVFeGVjdXRhYmxlLCBbdHNjU2NyaXB0LCAiLXAiLCBqb2luKHJl
cG8sICJ0c2NvbmZpZy5qc29uIildLCByZXBvKTsKY29uc3QgY29tcGlsZWRUZXN0UGF0aCA9IGpv
aW4ocmVwbywgImRpc3QvdGVzdC9jb3JlLWtlcm5lbC9ydXN0LW1pZ3JhdGlvbi9ya3AtMi13b3Jr
c3BhY2UtY29udHJhY3RzLnRlc3QuanMiKTsKcnVuKG5vZGVFeGVjdXRhYmxlLCBbam9pbih0b29s
Um9vdCwgImNhcHR1cmUtbm9kZS1zaWduYXR1cmVzLm1qcyIpLCBjb21waWxlZFRlc3RQYXRoLCBv
dXRwdXRQYXRoXSwgcmVwbyk7CmNvbnN0IHJlc3VsdCA9IEpTT04ucGFyc2UocmVhZEZpbGVTeW5j
KG91dHB1dFBhdGgsICJ1dGY4IikpOwphc3NlcnQuZXF1YWwocmVzdWx0Lm5vZGVWZXJzaW9uLCAi
djI0LjE1LjAiKTsKYXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQuY291bnRzLCB7IHRvdGFsOiAxMSwg
cGFzczogNywgZmFpbDogNCwgc2tpcDogMCB9KTsKcHJvY2Vzcy5zdGRvdXQud3JpdGUoYCR7SlNP
Ti5zdHJpbmdpZnkoewogIGtpbmQ6ICJya3AyLWVvbC1ub2RlLWNvbW1hbmQtdjEiLAogIHJlcG8s
CiAgbm9kZUV4ZWN1dGFibGUsCiAgbm9kZVZlcnNpb246IHZlcnNpb24sCiAgdHNjU2NyaXB0LAog
IGNvbXBpbGVkVGVzdFBhdGgsCiAgcmVzdWx0UGF0aDogb3V0cHV0UGF0aCwKICBjb3VudHM6IHJl
c3VsdC5jb3VudHMsCiAgZmFpbHVyZVRpdGxlczogcmVzdWx0LmZhaWx1cmVUaXRsZXMsCn0sIG51
bGwsIDIpfVxuYCk7Cg==
<!-- RKP2-REENTRY-CAPSULE-END tools/capture-node-command.mjs -->

<!-- RKP2-REENTRY-CAPSULE-BEGIN tools/compare-node-signatures.mjs -->
aW1wb3J0IGFzc2VydCBmcm9tICJub2RlOmFzc2VydC9zdHJpY3QiOwppbXBvcnQgeyBjcmVhdGVI
YXNoIH0gZnJvbSAibm9kZTpjcnlwdG8iOwppbXBvcnQgeyByZWFkRmlsZVN5bmMsIHdyaXRlRmls
ZVN5bmMgfSBmcm9tICJub2RlOmZzIjsKaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gIm5vZGU6cGF0
aCI7Cgpjb25zdCBbY29udHJvbEFyZywgZXhwZWN0ZWRWMUFyZywgZXhwZWN0ZWRWMkFyZywgY2Fu
ZGlkYXRlQXJnLCBvdXRwdXRBcmddID0gcHJvY2Vzcy5hcmd2LnNsaWNlKDIpOwphc3NlcnQub2so
Y29udHJvbEFyZyAmJiBleHBlY3RlZFYxQXJnICYmIGV4cGVjdGVkVjJBcmcsICJ1c2FnZTogY29t
cGFyZS1ub2RlLXNpZ25hdHVyZXMubWpzIDxjb250cm9sPiA8ZXhwZWN0ZWQtdjE+IDxleHBlY3Rl
ZC12Mj4gW2NhbmRpZGF0ZXwtXSBbb3V0cHV0XSIpOwoKY29uc3Qgc2hhMjU2ID0gKGJ5dGVzKSA9
PiBjcmVhdGVIYXNoKCJzaGEyNTYiKS51cGRhdGUoYnl0ZXMpLmRpZ2VzdCgiaGV4Iik7CmNvbnN0
IGxvYWQgPSAocGF0aCkgPT4gewogIGNvbnN0IGFic29sdXRlID0gcmVzb2x2ZShwYXRoKTsKICBj
b25zdCBieXRlcyA9IHJlYWRGaWxlU3luYyhhYnNvbHV0ZSk7CiAgcmV0dXJuIHsgYWJzb2x1dGUs
IGJ5dGVzLCB2YWx1ZTogSlNPTi5wYXJzZShieXRlcy50b1N0cmluZygidXRmOCIpKSB9Owp9Owpj
b25zdCBwcm9qZWN0ID0gKHsgY291bnRzLCBmYWlsdXJlVGl0bGVzLCBzaWduYXR1cmVzIH0pID0+
ICh7IGNvdW50cywgZmFpbHVyZVRpdGxlcywgc2lnbmF0dXJlcyB9KTsKY29uc3QgYnlUaXRsZSA9
IChzaWduYXR1cmVzKSA9PiBPYmplY3QuZnJvbUVudHJpZXMoc2lnbmF0dXJlcy5tYXAoKHNpZ25h
dHVyZSkgPT4gW3NpZ25hdHVyZS50aXRsZSwgc2lnbmF0dXJlXSkpOwpjb25zdCBlcXVhbGl0eSA9
IChsZWZ0LCByaWdodCkgPT4gewogIGNvbnN0IGxlZnRCeVRpdGxlID0gYnlUaXRsZShsZWZ0LnNp
Z25hdHVyZXMpOwogIGNvbnN0IHJpZ2h0QnlUaXRsZSA9IGJ5VGl0bGUocmlnaHQuc2lnbmF0dXJl
cyk7CiAgYXNzZXJ0LmRlZXBFcXVhbChPYmplY3Qua2V5cyhsZWZ0QnlUaXRsZSkuc29ydCgpLCBP
YmplY3Qua2V5cyhyaWdodEJ5VGl0bGUpLnNvcnQoKSk7CiAgcmV0dXJuIE9iamVjdC5mcm9tRW50
cmllcyhPYmplY3Qua2V5cyhsZWZ0QnlUaXRsZSkuc29ydCgpLm1hcCgodGl0bGUpID0+IFt0aXRs
ZSwgewogICAgZXF1YWw6IEpTT04uc3RyaW5naWZ5KGxlZnRCeVRpdGxlW3RpdGxlXSkgPT09IEpT
T04uc3RyaW5naWZ5KHJpZ2h0QnlUaXRsZVt0aXRsZV0pLAogICAgbGVmdFNpZ25hdHVyZVNoYTI1
NjogbGVmdEJ5VGl0bGVbdGl0bGVdLnNpZ25hdHVyZVNoYTI1NiwKICAgIHJpZ2h0U2lnbmF0dXJl
U2hhMjU2OiByaWdodEJ5VGl0bGVbdGl0bGVdLnNpZ25hdHVyZVNoYTI1NiwKICB9XSkpOwp9OwoK
Y29uc3QgY29udHJvbCA9IGxvYWQoY29udHJvbEFyZyk7CmNvbnN0IGV4cGVjdGVkVjEgPSBsb2Fk
KGV4cGVjdGVkVjFBcmcpOwpjb25zdCBleHBlY3RlZFYyID0gbG9hZChleHBlY3RlZFYyQXJnKTsK
YXNzZXJ0LmRlZXBFcXVhbChwcm9qZWN0KGV4cGVjdGVkVjEudmFsdWUpLCBwcm9qZWN0KGV4cGVj
dGVkVjIudmFsdWUpLCAicHJlZGVjbGFyZWQgVjEvVjIgc2lnbmF0dXJlcyBkaWZmZXIiKTsKCmNv
bnN0IHJlc3VsdCA9IHsKICBraW5kOiAicmtwMi1lb2wtbm9kZS1zaWduYXR1cmUtY29tcGFyaXNv
bi12MSIsCiAgaW5wdXRzOiB7CiAgICBjb250cm9sOiB7IHBhdGg6IGNvbnRyb2wuYWJzb2x1dGUs
IGJ5dGVzOiBjb250cm9sLmJ5dGVzLmxlbmd0aCwgc2hhMjU2OiBzaGEyNTYoY29udHJvbC5ieXRl
cykgfSwKICAgIGV4cGVjdGVkVjE6IHsgcGF0aDogZXhwZWN0ZWRWMS5hYnNvbHV0ZSwgYnl0ZXM6
IGV4cGVjdGVkVjEuYnl0ZXMubGVuZ3RoLCBzaGEyNTY6IHNoYTI1NihleHBlY3RlZFYxLmJ5dGVz
KSB9LAogICAgZXhwZWN0ZWRWMjogeyBwYXRoOiBleHBlY3RlZFYyLmFic29sdXRlLCBieXRlczog
ZXhwZWN0ZWRWMi5ieXRlcy5sZW5ndGgsIHNoYTI1Njogc2hhMjU2KGV4cGVjdGVkVjIuYnl0ZXMp
IH0sCiAgfSwKICBleHBlY3RlZFYxRXF1YWxzRXhwZWN0ZWRWMjogdHJ1ZSwKICBleHBlY3RlZFYx
VmVyc3VzQ29udHJvbDogZXF1YWxpdHkoZXhwZWN0ZWRWMS52YWx1ZSwgY29udHJvbC52YWx1ZSks
CiAgY2FuZGlkYXRlOiBudWxsLAp9OwoKaWYgKGNhbmRpZGF0ZUFyZyAmJiBjYW5kaWRhdGVBcmcg
IT09ICItIikgewogIGNvbnN0IGNhbmRpZGF0ZSA9IGxvYWQoY2FuZGlkYXRlQXJnKTsKICByZXN1
bHQuaW5wdXRzLmNhbmRpZGF0ZSA9IHsgcGF0aDogY2FuZGlkYXRlLmFic29sdXRlLCBieXRlczog
Y2FuZGlkYXRlLmJ5dGVzLmxlbmd0aCwgc2hhMjU2OiBzaGEyNTYoY2FuZGlkYXRlLmJ5dGVzKSB9
OwogIHJlc3VsdC5jYW5kaWRhdGUgPSB7CiAgICBjb3VudHM6IGNhbmRpZGF0ZS52YWx1ZS5jb3Vu
dHMsCiAgICB2ZXJzdXNFeHBlY3RlZFYxOiBlcXVhbGl0eShjYW5kaWRhdGUudmFsdWUsIGV4cGVj
dGVkVjEudmFsdWUpLAogICAgdmVyc3VzQ29udHJvbDogZXF1YWxpdHkoY2FuZGlkYXRlLnZhbHVl
LCBjb250cm9sLnZhbHVlKSwKICB9Owp9Cgpjb25zdCBlbmNvZGVkID0gYCR7SlNPTi5zdHJpbmdp
ZnkocmVzdWx0LCBudWxsLCAyKX1cbmA7CmlmIChvdXRwdXRBcmcpIHdyaXRlRmlsZVN5bmMocmVz
b2x2ZShvdXRwdXRBcmcpLCBlbmNvZGVkLCAidXRmOCIpOwpwcm9jZXNzLnN0ZG91dC53cml0ZShl
bmNvZGVkKTsK
<!-- RKP2-REENTRY-CAPSULE-END tools/compare-node-signatures.mjs -->

<!-- RKP2-REENTRY-CAPSULE-BEGIN tools/capture-eol-matrix.mjs -->
aW1wb3J0IGFzc2VydCBmcm9tICJub2RlOmFzc2VydC9zdHJpY3QiOwppbXBvcnQgeyBjcmVhdGVI
YXNoIH0gZnJvbSAibm9kZTpjcnlwdG8iOwppbXBvcnQgeyBzcGF3blN5bmMgfSBmcm9tICJub2Rl
OmNoaWxkX3Byb2Nlc3MiOwppbXBvcnQgeyBleGlzdHNTeW5jLCBta2RpclN5bmMsIHJlYWRGaWxl
U3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gIm5vZGU6ZnMiOwppbXBvcnQgeyBqb2luLCByZXNv
bHZlIH0gZnJvbSAibm9kZTpwYXRoIjsKCmNvbnN0IFBBVEhTID0gT2JqZWN0LmZyZWV6ZShbCiAg
ImNyYXRlcy9icmlsbGlhbnQta2VybmVsLXJ1bnRpbWUvc3JjL3J1bnRpbWUucnMiLAogICJjcmF0
ZXMvYnJpbGxpYW50LWtlcm5lbC1ydW50aW1lL3NyYy9zdG9yZS5ycyIsCiAgImNyYXRlcy9icmls
bGlhbnQta2VybmVsLXJ1bnRpbWUvc3JjL2luZGljZXMucnMiLAogICJ0ZXN0L2NvcmUta2VybmVs
L2ZpeHR1cmVzL2N2bi03LXF1YWxpZmljYXRpb24tc2NvcmUudHMiLAogICJ0ZXN0L2NvcmUta2Vy
bmVsL3J1c3QtbWlncmF0aW9uL3JrcC0yLXNjYWxlLWV2aWRlbmNlLXdvcmtlci50cyIsCiAgInRl
c3QvY29yZS1rZXJuZWwvcnVzdC1taWdyYXRpb24vcmtwLTItc2NhbGUtZXZpZGVuY2Utd29ya2Vy
LnRlc3QudHMiLAogICJ0ZXN0L2NvcmUta2VybmVsL3J1c3QtbWlncmF0aW9uL3JrcC0yLXNjYWxl
LWV2aWRlbmNlLXByb2Nlc3MucHMxIiwKXSk7Cgpjb25zdCBzaGEyNTYgPSAoYnl0ZXMpID0+IGNy
ZWF0ZUhhc2goInNoYTI1NiIpLnVwZGF0ZShieXRlcykuZGlnZXN0KCJoZXgiKTsKCmZ1bmN0aW9u
IGludm9rZShhcmdzLCBiaW5hcnkgPSBmYWxzZSkgewogIGNvbnN0IHJlc3VsdCA9IHNwYXduU3lu
YygiZ2l0IiwgWyItYyIsICJjb3JlLmxvbmdwYXRocz10cnVlIiwgLi4uYXJnc10sIHsKICAgIGVu
Y29kaW5nOiBiaW5hcnkgPyBudWxsIDogInV0ZjgiLAogICAgbWF4QnVmZmVyOiA2NCAqIDEwMjQg
KiAxMDI0LAogIH0pOwogIGFzc2VydC5lcXVhbChyZXN1bHQuc3RhdHVzLCAwLCBCdWZmZXIuZnJv
bShyZXN1bHQuc3RkZXJyID8/ICIiKS50b1N0cmluZygidXRmOCIpKTsKICByZXR1cm4gYmluYXJ5
ID8gcmVzdWx0LnN0ZG91dCA6IHJlc3VsdC5zdGRvdXQudHJpbSgpOwp9Cgpjb25zdCBzb3VyY2VS
ZXBvID0gcmVzb2x2ZShwcm9jZXNzLmFyZ3ZbMl0gPz8gIiIpOwpjb25zdCBjb21taXQgPSBwcm9j
ZXNzLmFyZ3ZbM107CmNvbnN0IHJvb3QgPSByZXNvbHZlKHByb2Nlc3MuYXJndls0XSA/PyAiIik7
CmNvbnN0IG91dHB1dFBhdGggPSByZXNvbHZlKHByb2Nlc3MuYXJndls1XSA/PyAiIik7CmFzc2Vy
dC5lcXVhbChleGlzdHNTeW5jKHJvb3QpLCBmYWxzZSwgIm1hdHJpeCByb290IG11c3QgYmUgZnJl
c2giKTsKbWtkaXJTeW5jKHJvb3QsIHsgcmVjdXJzaXZlOiB0cnVlIH0pOwoKY29uc3QgbGFuZXMg
PSBbXTsKZm9yIChjb25zdCBtb2RlIG9mIFsidHJ1ZSIsICJmYWxzZSJdKSB7CiAgY29uc3QgbGFu
ZSA9IGpvaW4ocm9vdCwgYGF1dG9jcmxmLSR7bW9kZX1gKTsKICBpbnZva2UoWyJjbG9uZSIsICIt
LW5vLWxvY2FsIiwgIi0tbm8tY2hlY2tvdXQiLCBzb3VyY2VSZXBvLCBsYW5lXSk7CiAgaW52b2tl
KFsiLUMiLCBsYW5lLCAiY29uZmlnIiwgImNvcmUuYXV0b2NybGYiLCBtb2RlXSk7CiAgaW52b2tl
KFsiLUMiLCBsYW5lLCAiY2hlY2tvdXQiLCAiLS1kZXRhY2giLCBjb21taXRdKTsKICBhc3NlcnQu
ZXF1YWwoaW52b2tlKFsiLUMiLCBsYW5lLCAic3RhdHVzIiwgIi0tcG9yY2VsYWluPXYxIl0pLCAi
Iik7CiAgY29uc3QgcmVjb3JkcyA9IFtdOwogIGZvciAoY29uc3QgcGF0aCBvZiBQQVRIUykgewog
ICAgY29uc3QgY2hlY2tvdXRCeXRlcyA9IHJlYWRGaWxlU3luYyhqb2luKGxhbmUsIHBhdGgpKTsK
ICAgIGNvbnN0IG9iamVjdEJ5dGVzID0gaW52b2tlKFsiLUMiLCBsYW5lLCAic2hvdyIsIGAke2Nv
bW1pdH06JHtwYXRofWBdLCB0cnVlKTsKICAgIGFzc2VydC5kZWVwRXF1YWwoY2hlY2tvdXRCeXRl
cywgb2JqZWN0Qnl0ZXMsIGAke21vZGV9OiR7cGF0aH06IGNoZWNrb3V0IGJ5dGVzIGRpZmZlciBm
cm9tIEdpdCBibG9iYCk7CiAgICBhc3NlcnQuZXF1YWwoY2hlY2tvdXRCeXRlcy5pbmNsdWRlcyhC
dWZmZXIuZnJvbSgiXHJcbiIpKSwgZmFsc2UsIGAke21vZGV9OiR7cGF0aH06IENSTEYgcHJlc2Vu
dGApOwogICAgY29uc3QgYXR0cmlidXRlcyA9IGludm9rZShbIi1DIiwgbGFuZSwgImNoZWNrLWF0
dHIiLCAidGV4dCIsICJlb2wiLCAiLS0iLCBwYXRoXSk7CiAgICBhc3NlcnQubWF0Y2goYXR0cmli
dXRlcywgLzogdGV4dDogc2V0KD86XHI/XG4pLio6IGVvbDogbGYkL3UpOwogICAgcmVjb3Jkcy5w
dXNoKHsgcGF0aCwgYnl0ZXM6IGNoZWNrb3V0Qnl0ZXMubGVuZ3RoLCBzaGEyNTY6IHNoYTI1Nihj
aGVja291dEJ5dGVzKSwgYXR0cmlidXRlcyB9KTsKICB9CiAgbGFuZXMucHVzaCh7IG1vZGUsIGxh
bmUsIHN0YXR1czogImNsZWFuIiwgcmVjb3JkcyB9KTsKfQoKYXNzZXJ0LmRlZXBFcXVhbCgKICBs
YW5lc1swXS5yZWNvcmRzLm1hcCgoeyBwYXRoLCBieXRlcywgc2hhMjU2OiBoYXNoIH0pID0+ICh7
IHBhdGgsIGJ5dGVzLCBzaGEyNTY6IGhhc2ggfSkpLAogIGxhbmVzWzFdLnJlY29yZHMubWFwKCh7
IHBhdGgsIGJ5dGVzLCBzaGEyNTY6IGhhc2ggfSkgPT4gKHsgcGF0aCwgYnl0ZXMsIHNoYTI1Njog
aGFzaCB9KSksCik7CmNvbnN0IHJlc3VsdCA9IHsga2luZDogInJrcDItZW9sLWJ5dGUtbWF0cml4
LXYxIiwgY29tbWl0LCBwYXRoczogUEFUSFMsIGxhbmVzIH07CndyaXRlRmlsZVN5bmMob3V0cHV0
UGF0aCwgYCR7SlNPTi5zdHJpbmdpZnkocmVzdWx0LCBudWxsLCAyKX1cbmAsICJ1dGY4Iik7CnBy
b2Nlc3Muc3Rkb3V0LndyaXRlKGAke0pTT04uc3RyaW5naWZ5KHsga2luZDogcmVzdWx0LmtpbmQs
IGNvbW1pdCwgcGF0aENvdW50OiBQQVRIUy5sZW5ndGgsIGxhbmVzOiBsYW5lcy5tYXAoKHsgbW9k
ZSwgbGFuZSwgc3RhdHVzIH0pID0+ICh7IG1vZGUsIGxhbmUsIHN0YXR1cyB9KSkgfSwgbnVsbCwg
Mil9XG5gKTsK
<!-- RKP2-REENTRY-CAPSULE-END tools/capture-eol-matrix.mjs -->

<!-- RKP2-REENTRY-CAPSULE-BEGIN tools/rust-boundary-verifier.mjs -->
aW1wb3J0IGFzc2VydCBmcm9tICJub2RlOmFzc2VydC9zdHJpY3QiOwppbXBvcnQgeyBjcmVhdGVI
YXNoIH0gZnJvbSAibm9kZTpjcnlwdG8iOwppbXBvcnQgeyBzcGF3blN5bmMgfSBmcm9tICJub2Rl
OmNoaWxkX3Byb2Nlc3MiOwppbXBvcnQgeyBleGlzdHNTeW5jLCBta2RpclN5bmMsIHJlYWRGaWxl
U3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gIm5vZGU6ZnMiOwppbXBvcnQgeyBqb2luLCByZXNv
bHZlIH0gZnJvbSAibm9kZTpwYXRoIjsKCmNvbnN0IFBBVEhTID0gT2JqZWN0LmZyZWV6ZShbCiAg
Ii5naXRhdHRyaWJ1dGVzIiwKICAiY3JhdGVzL2JyaWxsaWFudC1rZXJuZWwtcnVudGltZS9zcmMv
cnVudGltZS5ycyIsCiAgImNyYXRlcy9icmlsbGlhbnQta2VybmVsLXJ1bnRpbWUvc3JjL3N0b3Jl
LnJzIiwKICAiY3JhdGVzL2JyaWxsaWFudC1rZXJuZWwtcnVudGltZS9zcmMvaW5kaWNlcy5ycyIs
Cl0pOwpjb25zdCBzaGEyNTYgPSAoYnl0ZXMpID0+IGNyZWF0ZUhhc2goInNoYTI1NiIpLnVwZGF0
ZShieXRlcykuZGlnZXN0KCJoZXgiKTsKCmZ1bmN0aW9uIGdpdChhcmdzLCBiaW5hcnkgPSBmYWxz
ZSkgewogIGNvbnN0IHJlc3VsdCA9IHNwYXduU3luYygiZ2l0IiwgWyItYyIsICJjb3JlLmxvbmdw
YXRocz10cnVlIiwgLi4uYXJnc10sIHsKICAgIGVuY29kaW5nOiBiaW5hcnkgPyBudWxsIDogInV0
ZjgiLAogICAgbWF4QnVmZmVyOiA2NCAqIDEwMjQgKiAxMDI0LAogIH0pOwogIGFzc2VydC5lcXVh
bChyZXN1bHQuc3RhdHVzLCAwLCBCdWZmZXIuZnJvbShyZXN1bHQuc3RkZXJyID8/ICIiKS50b1N0
cmluZygidXRmOCIpKTsKICByZXR1cm4gYmluYXJ5ID8gcmVzdWx0LnN0ZG91dCA6IHJlc3VsdC5z
dGRvdXQudHJpbSgpOwp9CgpmdW5jdGlvbiBwYXRjaFBhdGhzKGJ5dGVzKSB7CiAgY29uc3QgdGV4
dCA9IGJ5dGVzLnRvU3RyaW5nKCJ1dGY4Iik7CiAgY29uc3QgcGF0aHMgPSBbLi4udGV4dC5tYXRj
aEFsbCgvXmRpZmYgLS1naXQgYVwvKC4rPykgYlwvKC4rKSQvZ211KV0ubWFwKChtYXRjaCkgPT4g
ewogICAgYXNzZXJ0LmVxdWFsKG1hdGNoWzFdLCBtYXRjaFsyXSwgInJlbmFtZS1saWtlIHBhdGNo
IGhlYWRlciBmb3JiaWRkZW4iKTsKICAgIHJldHVybiBtYXRjaFsxXTsKICB9KTsKICBhc3NlcnQu
ZXF1YWwobmV3IFNldChwYXRocykuc2l6ZSwgcGF0aHMubGVuZ3RoLCAiZHVwbGljYXRlIHBhdGNo
IHBhdGgiKTsKICBhc3NlcnQuZGVlcEVxdWFsKFsuLi5wYXRoc10uc29ydCgpLCBbLi4uUEFUSFNd
LnNvcnQoKSwgInBhdGNoIHBhdGggc2V0IG1pc21hdGNoIik7CiAgcmV0dXJuIHBhdGhzOwp9Cgpm
dW5jdGlvbiBhc3NlcnRTaGEoYnl0ZXMsIGV4cGVjdGVkKSB7CiAgYXNzZXJ0LmVxdWFsKHNoYTI1
NihieXRlcyksIGV4cGVjdGVkLCAiU0hBLTI1NiBtaXNtYXRjaCIpOwp9CgpmdW5jdGlvbiBhc3Nl
cnRMZihieXRlcykgewogIGFzc2VydC5lcXVhbChieXRlcy5pbmNsdWRlcyhCdWZmZXIuZnJvbSgi
XHJcbiIpKSwgZmFsc2UsICJDUkxGIGJ5dGVzIGZvcmJpZGRlbiIpOwp9CgpmdW5jdGlvbiBzZWxm
VGVzdCgpIHsKICBsZXQgcGFzc2VkID0gMDsKICBjb25zdCBnb29kID0gQnVmZmVyLmZyb20oUEFU
SFMubWFwKChwYXRoKSA9PiBgZGlmZiAtLWdpdCBhLyR7cGF0aH0gYi8ke3BhdGh9XG5gKS5qb2lu
KCIiKSwgInV0ZjgiKTsKICBwYXRjaFBhdGhzKGdvb2QpOyBwYXNzZWQgKz0gMTsKICBhc3NlcnQu
dGhyb3dzKCgpID0+IHBhdGNoUGF0aHMoQnVmZmVyLmNvbmNhdChbZ29vZCwgQnVmZmVyLmZyb20o
YGRpZmYgLS1naXQgYS9leHRyYSBiL2V4dHJhXG5gKV0pKSk7IHBhc3NlZCArPSAxOwogIGFzc2Vy
dC50aHJvd3MoKCkgPT4gcGF0Y2hQYXRocyhCdWZmZXIuZnJvbShQQVRIUy5zbGljZSgwLCAzKS5t
YXAoKHBhdGgpID0+IGBkaWZmIC0tZ2l0IGEvJHtwYXRofSBiLyR7cGF0aH1cbmApLmpvaW4oIiIp
KSkpOyBwYXNzZWQgKz0gMTsKICBhc3NlcnQudGhyb3dzKCgpID0+IHBhdGNoUGF0aHMoQnVmZmVy
LmNvbmNhdChbZ29vZCwgQnVmZmVyLmZyb20oYGRpZmYgLS1naXQgYS8ke1BBVEhTWzBdfSBiLyR7
UEFUSFNbMF19XG5gKV0pKSk7IHBhc3NlZCArPSAxOwogIGFzc2VydC50aHJvd3MoKCkgPT4geyBh
c3NlcnRMZihCdWZmZXIuZnJvbSgiYVxyXG5iIikpOyBhc3NlcnRTaGEoQnVmZmVyLmZyb20oIngi
KSwgIm5vdC1hLWhhc2giKTsgfSk7IHBhc3NlZCArPSAxOwogIHJldHVybiB7IGtpbmQ6ICJya3Ay
LWVvbC1ydXN0LXZlcmlmaWVyLXNlbGYtdGVzdC12MSIsIHBhc3NlZCwgdG90YWw6IDUgfTsKfQoK
ZnVuY3Rpb24gdmVyaWZ5KHJlcG8sIHNvdXJjZSwgdGVjaG5pY2FsLCBwYXRjaFBhdGgsIHJvb3Qs
IG91dHB1dFBhdGgpIHsKICBjb25zdCBwYXRjaCA9IHJlYWRGaWxlU3luYyhwYXRjaFBhdGgpOwog
IHBhdGNoUGF0aHMocGF0Y2gpOwogIGNvbnN0IGV4cGVjdGVkUGF0Y2ggPSBnaXQoWwogICAgIi1D
IiwgcmVwbywgImRpZmYiLCAiLS1iaW5hcnkiLCAiLS1mdWxsLWluZGV4IiwgIi0tbm8tZXh0LWRp
ZmYiLCAiLS1uby10ZXh0Y29udiIsCiAgICBgJHtzb3VyY2V9Li4ke3RlY2huaWNhbH1gLCAiLS0i
LCAuLi5QQVRIUywKICBdLCB0cnVlKTsKICBhc3NlcnQuZGVlcEVxdWFsKHBhdGNoLCBleHBlY3Rl
ZFBhdGNoLCAiZW1iZWRkZWQgcGF0Y2ggZGlmZmVycyBmcm9tIHBpbm5lZCBHaXQgZGlmZiIpOwog
IGFzc2VydC5lcXVhbChleGlzdHNTeW5jKHJvb3QpLCBmYWxzZSwgInJlY29uc3RydWN0aW9uIHJv
b3QgbXVzdCBiZSBmcmVzaCIpOwogIG1rZGlyU3luYyhyb290LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9
KTsKICBjb25zdCBsYW5lID0gam9pbihyb290LCAiaGlzdG9yaWNhbC10ZWNobmljYWwiKTsKICBn
aXQoWyJjbG9uZSIsICItLW5vLWxvY2FsIiwgIi0tbm8tY2hlY2tvdXQiLCByZXBvLCBsYW5lXSk7
CiAgZ2l0KFsiLUMiLCBsYW5lLCAiY29uZmlnIiwgImNvcmUuYXV0b2NybGYiLCAiZmFsc2UiXSk7
CiAgZ2l0KFsiLUMiLCBsYW5lLCAiY2hlY2tvdXQiLCAiLS1kZXRhY2giLCBzb3VyY2VdKTsKICBh
c3NlcnQuZXF1YWwoZ2l0KFsiLUMiLCBsYW5lLCAic3RhdHVzIiwgIi0tcG9yY2VsYWluPXYxIl0p
LCAiIik7CiAgZ2l0KFsiLUMiLCBsYW5lLCAiYXBwbHkiLCAiLS1pbmRleCIsICItLXdoaXRlc3Bh
Y2U9bm93YXJuIiwgcmVzb2x2ZShwYXRjaFBhdGgpXSk7CiAgY29uc3QgY2hhbmdlZCA9IGdpdChb
Ii1DIiwgbGFuZSwgImRpZmYiLCAiLS1jYWNoZWQiLCAiLS1uYW1lLW9ubHkiXSkuc3BsaXQoL1xy
P1xuL3UpLmZpbHRlcihCb29sZWFuKTsKICBhc3NlcnQuZGVlcEVxdWFsKFsuLi5jaGFuZ2VkXS5z
b3J0KCksIFsuLi5QQVRIU10uc29ydCgpKTsKICBjb25zdCByZWNvcmRzID0gW107CiAgZm9yIChj
b25zdCBwYXRoIG9mIFBBVEhTKSB7CiAgICBjb25zdCBhY3R1YWwgPSByZWFkRmlsZVN5bmMoam9p
bihsYW5lLCBwYXRoKSk7CiAgICBjb25zdCBleHBlY3RlZCA9IGdpdChbIi1DIiwgbGFuZSwgInNo
b3ciLCBgJHt0ZWNobmljYWx9OiR7cGF0aH1gXSwgdHJ1ZSk7CiAgICBhc3NlcnQuZGVlcEVxdWFs
KGFjdHVhbCwgZXhwZWN0ZWQsIGAke3BhdGh9OiByZWNvbnN0cnVjdGVkIGJ5dGVzIGRpZmZlcmAp
OwogICAgYXNzZXJ0TGYoYWN0dWFsKTsKICAgIHJlY29yZHMucHVzaCh7IHBhdGgsIGJ5dGVzOiBh
Y3R1YWwubGVuZ3RoLCBzaGEyNTY6IHNoYTI1NihhY3R1YWwpIH0pOwogIH0KICBjb25zdCByZWNv
bnN0cnVjdGVkVHJlZSA9IGdpdChbIi1DIiwgbGFuZSwgIndyaXRlLXRyZWUiXSk7CiAgY29uc3Qg
dGVjaG5pY2FsVHJlZSA9IGdpdChbIi1DIiwgbGFuZSwgInNob3ciLCAiLXMiLCAiLS1mb3JtYXQ9
JVQiLCB0ZWNobmljYWxdKTsKICBjb25zdCByZXN1bHQgPSB7CiAgICBraW5kOiAicmtwMi1lb2wt
cnVzdC1yZWNvbnN0cnVjdGlvbi12MSIsCiAgICBzb3VyY2UsCiAgICB0ZWNobmljYWwsCiAgICBz
b3VyY2VUcmVlOiBnaXQoWyItQyIsIGxhbmUsICJzaG93IiwgIi1zIiwgIi0tZm9ybWF0PSVUIiwg
c291cmNlXSksCiAgICB0ZWNobmljYWxUcmVlLAogICAgcmVjb25zdHJ1Y3RlZFRyZWUsCiAgICB0
cmVlUmVsYXRpb246ICJub3RfY29tcGFyZWRfZnVsbF90cmVlc19zb3VyY2VfdG9fdGVjaG5pY2Fs
X2NvbnRhaW5zX2hpc3RvcmljYWxfY29vcmRpbmF0aW9uX2RlbHRhIiwKICAgIHBhdGNoOiB7IGJ5
dGVzOiBwYXRjaC5sZW5ndGgsIHNoYTI1Njogc2hhMjU2KHBhdGNoKSwgcGF0aHM6IFBBVEhTIH0s
CiAgICByZWNvcmRzLAogICAgc2VsZlRlc3Q6IHNlbGZUZXN0KCksCiAgICBsYW5lLAogIH07CiAg
d3JpdGVGaWxlU3luYyhvdXRwdXRQYXRoLCBgJHtKU09OLnN0cmluZ2lmeShyZXN1bHQsIG51bGws
IDIpfVxuYCwgInV0ZjgiKTsKICByZXR1cm4gcmVzdWx0Owp9Cgpjb25zdCBjb21tYW5kID0gcHJv
Y2Vzcy5hcmd2WzJdOwppZiAoY29tbWFuZCA9PT0gInNlbGYtdGVzdCIpIHsKICBwcm9jZXNzLnN0
ZG91dC53cml0ZShgJHtKU09OLnN0cmluZ2lmeShzZWxmVGVzdCgpLCBudWxsLCAyKX1cbmApOwp9
IGVsc2UgaWYgKGNvbW1hbmQgPT09ICJ2ZXJpZnkiKSB7CiAgY29uc3QgcmVzdWx0ID0gdmVyaWZ5
KAogICAgcmVzb2x2ZShwcm9jZXNzLmFyZ3ZbM10gPz8gIiIpLAogICAgcHJvY2Vzcy5hcmd2WzRd
LAogICAgcHJvY2Vzcy5hcmd2WzVdLAogICAgcmVzb2x2ZShwcm9jZXNzLmFyZ3ZbNl0gPz8gIiIp
LAogICAgcmVzb2x2ZShwcm9jZXNzLmFyZ3ZbN10gPz8gIiIpLAogICAgcmVzb2x2ZShwcm9jZXNz
LmFyZ3ZbOF0gPz8gIiIpLAogICk7CiAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoYCR7SlNPTi5zdHJp
bmdpZnkoeyBraW5kOiByZXN1bHQua2luZCwgc291cmNlOiByZXN1bHQuc291cmNlLCB0ZWNobmlj
YWw6IHJlc3VsdC50ZWNobmljYWwsIHRlY2huaWNhbFRyZWU6IHJlc3VsdC50ZWNobmljYWxUcmVl
LCByZWNvbnN0cnVjdGVkVHJlZTogcmVzdWx0LnJlY29uc3RydWN0ZWRUcmVlLCBwYXRjaDogcmVz
dWx0LnBhdGNoLCBzZWxmVGVzdDogcmVzdWx0LnNlbGZUZXN0LCBsYW5lOiByZXN1bHQubGFuZSB9
LCBudWxsLCAyKX1cbmApOwp9IGVsc2UgewogIGFzc2VydC5mYWlsKCJ1c2FnZTogcnVzdC1ib3Vu
ZGFyeS12ZXJpZmllci5tanMgc2VsZi10ZXN0IHwgdmVyaWZ5IDxyZXBvPiA8c291cmNlPiA8dGVj
aG5pY2FsPiA8cGF0Y2g+IDxmcmVzaC1yb290PiA8b3V0cHV0PiIpOwp9Cg==
<!-- RKP2-REENTRY-CAPSULE-END tools/rust-boundary-verifier.mjs -->

<!-- RKP2-REENTRY-CAPSULE-BEGIN tools/extract-capsule.mjs -->
aW1wb3J0IGFzc2VydCBmcm9tICJub2RlOmFzc2VydC9zdHJpY3QiOwppbXBvcnQgeyBjcmVhdGVI
YXNoIH0gZnJvbSAibm9kZTpjcnlwdG8iOwppbXBvcnQgeyBta2RpclN5bmMsIHJlYWRGaWxlU3lu
Yywgd3JpdGVGaWxlU3luYyB9IGZyb20gIm5vZGU6ZnMiOwppbXBvcnQgeyBkaXJuYW1lLCByZXNv
bHZlLCBzZXAgfSBmcm9tICJub2RlOnBhdGgiOwoKY29uc3QgZXZpZGVuY2VQYXRoID0gcmVzb2x2
ZShwcm9jZXNzLmFyZ3ZbMl0gPz8gIiIpOwpjb25zdCBvdXRwdXRSb290ID0gcmVzb2x2ZShwcm9j
ZXNzLmFyZ3ZbM10gPz8gIiIpOwpjb25zdCBzb3VyY2UgPSByZWFkRmlsZVN5bmMoZXZpZGVuY2VQ
YXRoLCAidXRmOCIpOwpjb25zdCBtYW5pZmVzdE1hdGNoID0gLzwhLS0gUktQMi1SRUVOVFJZLUNB
UFNVTEUtTUFOSUZFU1QtQkVHSU4gLS0+XHMqYGBganNvblxzKihbXHNcU10qPylccypgYGBccyo8
IS0tIFJLUDItUkVFTlRSWS1DQVBTVUxFLU1BTklGRVNULUVORCAtLT4vdS5leGVjKHNvdXJjZSk7
CmFzc2VydC5ub3RFcXVhbChtYW5pZmVzdE1hdGNoLCBudWxsLCAiY2Fwc3VsZSBtYW5pZmVzdCBt
aXNzaW5nIik7CmNvbnN0IG1hbmlmZXN0ID0gSlNPTi5wYXJzZShtYW5pZmVzdE1hdGNoWzFdKTsK
YXNzZXJ0LmVxdWFsKG1hbmlmZXN0LnNjaGVtYVZlcnNpb24sIDEpOwphc3NlcnQuZXF1YWwobmV3
IFNldChtYW5pZmVzdC5lbnRyaWVzLm1hcCgoeyBwYXRoIH0pID0+IHBhdGgpKS5zaXplLCBtYW5p
ZmVzdC5lbnRyaWVzLmxlbmd0aCk7Cm1rZGlyU3luYyhvdXRwdXRSb290LCB7IHJlY3Vyc2l2ZTog
dHJ1ZSB9KTsKCmZvciAoY29uc3QgZW50cnkgb2YgbWFuaWZlc3QuZW50cmllcykgewogIGFzc2Vy
dC5lcXVhbChlbnRyeS5lbmNvZGluZywgImJhc2U2NCIpOwogIGNvbnN0IGVzY2FwZWQgPSBlbnRy
eS5wYXRoLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXVxcXS9ndSwgIlxcJCYiKTsKICBjb25zdCBw
YXlsb2FkTWF0Y2ggPSBuZXcgUmVnRXhwKGA8IS0tIFJLUDItUkVFTlRSWS1DQVBTVUxFLUJFR0lO
ICR7ZXNjYXBlZH0gLS0+XFxzKihbQS1aYS16MC05Ky89XFxyXFxuXSs/KVxccyo8IS0tIFJLUDIt
UkVFTlRSWS1DQVBTVUxFLUVORCAke2VzY2FwZWR9IC0tPmAsICJ1IikuZXhlYyhzb3VyY2UpOwog
IGFzc2VydC5ub3RFcXVhbChwYXlsb2FkTWF0Y2gsIG51bGwsIGBwYXlsb2FkIG1pc3Npbmc6ICR7
ZW50cnkucGF0aH1gKTsKICBjb25zdCBieXRlcyA9IEJ1ZmZlci5mcm9tKHBheWxvYWRNYXRjaFsx
XS5yZXBsYWNlKC9ccy9ndSwgIiIpLCAiYmFzZTY0Iik7CiAgYXNzZXJ0LmVxdWFsKGJ5dGVzLmxl
bmd0aCwgZW50cnkuYnl0ZUxlbmd0aCwgYCR7ZW50cnkucGF0aH06IGJ5dGUgbGVuZ3RoIG1pc21h
dGNoYCk7CiAgYXNzZXJ0LmVxdWFsKGNyZWF0ZUhhc2goInNoYTI1NiIpLnVwZGF0ZShieXRlcyku
ZGlnZXN0KCJoZXgiKSwgZW50cnkuc2hhMjU2LCBgJHtlbnRyeS5wYXRofTogU0hBLTI1NiBtaXNt
YXRjaGApOwogIGNvbnN0IHRhcmdldCA9IHJlc29sdmUob3V0cHV0Um9vdCwgZW50cnkucGF0aCk7
CiAgYXNzZXJ0LmVxdWFsKHRhcmdldC5zdGFydHNXaXRoKGAke291dHB1dFJvb3R9JHtzZXB9YCks
IHRydWUsIGAke2VudHJ5LnBhdGh9OiBwYXRoIGVzY2FwZXMgb3V0cHV0IHJvb3RgKTsKICBta2Rp
clN5bmMoZGlybmFtZSh0YXJnZXQpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTsKICB3cml0ZUZpbGVT
eW5jKHRhcmdldCwgYnl0ZXMpOwp9Cgpwcm9jZXNzLnN0ZG91dC53cml0ZShgJHtKU09OLnN0cmlu
Z2lmeSh7IGtpbmQ6ICJya3AyLWVvbC1jYXBzdWxlLWV4dHJhY3Rpb24tdjEiLCBldmlkZW5jZVBh
dGgsIG91dHB1dFJvb3QsIGVudHJ5Q291bnQ6IG1hbmlmZXN0LmVudHJpZXMubGVuZ3RoLCBzdGF0
dXM6ICJ2ZXJpZmllZCIgfSwgbnVsbCwgMil9XG5gKTsK
<!-- RKP2-REENTRY-CAPSULE-END tools/extract-capsule.mjs -->

<!-- RKP2-REENTRY-CAPSULE-BEGIN tools/capture-full-summary.mjs -->
aW1wb3J0IGFzc2VydCBmcm9tICJub2RlOmFzc2VydC9zdHJpY3QiOwppbXBvcnQgeyBjcmVhdGVI
YXNoIH0gZnJvbSAibm9kZTpjcnlwdG8iOwppbXBvcnQgeyBsc3RhdFN5bmMsIHJlYWRkaXJTeW5j
LCB3cml0ZUZpbGVTeW5jIH0gZnJvbSAibm9kZTpmcyI7CmltcG9ydCB7IGpvaW4sIHJlbGF0aXZl
LCByZXNvbHZlIH0gZnJvbSAibm9kZTpwYXRoIjsKaW1wb3J0IHsgcnVuIH0gZnJvbSAibm9kZTp0
ZXN0IjsKCmNvbnN0IHJlcG8gPSByZXNvbHZlKHByb2Nlc3MuYXJndlsyXSA/PyAiIik7CmNvbnN0
IG91dHB1dFBhdGggPSByZXNvbHZlKHByb2Nlc3MuYXJndlszXSA/PyAiIik7CmFzc2VydC5lcXVh
bChwcm9jZXNzLnZlcnNpb24sICJ2MjQuMTUuMCIpOwpwcm9jZXNzLmNoZGlyKHJlcG8pOwpjb25z
dCByb290ID0gam9pbihyZXBvLCAiZGlzdC90ZXN0Iik7CmNvbnN0IGZpbGVzID0gW107CgpmdW5j
dGlvbiB2aXNpdChkaXJlY3RvcnkpIHsKICBmb3IgKGNvbnN0IGVudHJ5IG9mIHJlYWRkaXJTeW5j
KGRpcmVjdG9yeSwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pKSB7CiAgICBjb25zdCBhYnNvbHV0
ZSA9IGpvaW4oZGlyZWN0b3J5LCBlbnRyeS5uYW1lKTsKICAgIGNvbnN0IHN0YXRzID0gbHN0YXRT
eW5jKGFic29sdXRlKTsKICAgIGFzc2VydC5lcXVhbChzdGF0cy5pc1N5bWJvbGljTGluaygpLCBm
YWxzZSwgYHN5bWJvbGljIGVudHJ5IGZvcmJpZGRlbjogJHthYnNvbHV0ZX1gKTsKICAgIGlmIChz
dGF0cy5pc0RpcmVjdG9yeSgpKSB2aXNpdChhYnNvbHV0ZSk7CiAgICBlbHNlIGlmIChzdGF0cy5p
c0ZpbGUoKSAmJiBlbnRyeS5uYW1lLmVuZHNXaXRoKCIudGVzdC5qcyIpKSBmaWxlcy5wdXNoKGFi
c29sdXRlKTsKICB9Cn0KCnZpc2l0KHJvb3QpOwpmaWxlcy5zb3J0KChsZWZ0LCByaWdodCkgPT4g
bGVmdCA8IHJpZ2h0ID8gLTEgOiBsZWZ0ID4gcmlnaHQgPyAxIDogMCk7CmNvbnN0IHJlbGF0aXZl
RmlsZXMgPSBmaWxlcy5tYXAoKGZpbGUpID0+IHJlbGF0aXZlKHJvb3QsIGZpbGUpLnJlcGxhY2VB
bGwoIlxcIiwgIi8iKSk7CmNvbnN0IG1hbmlmZXN0U2hhMjU2ID0gY3JlYXRlSGFzaCgic2hhMjU2
IikudXBkYXRlKGAke3JlbGF0aXZlRmlsZXMuam9pbigiXG4iKX1cbmAsICJ1dGY4IikuZGlnZXN0
KCJoZXgiKTsKY29uc3Qgc3RyZWFtID0gcnVuKHsgZmlsZXMsIGNvbmN1cnJlbmN5OiB0cnVlIH0p
Owpjb25zdCBzdW1tYXJpZXMgPSBbXTsKY29uc3QgaGlzdG9ncmFtID0ge307CmNvbnN0IGZhaWx1
cmVzID0gW107CmxldCBzdHJlYW1FcnJvcjsKZm9yIChjb25zdCBldmVudCBvZiBbInRlc3Q6cGFz
cyIsICJ0ZXN0OmZhaWwiLCAidGVzdDpjYW5jZWwiLCAidGVzdDpza2lwIiwgInRlc3Q6dG9kbyJd
KSB7CiAgc3RyZWFtLm9uKGV2ZW50LCAoZGF0YSkgPT4gewogICAgY29uc3Qga2V5ID0gYCR7ZXZl
bnR9QCR7U3RyaW5nKGRhdGE/Lm5lc3RpbmcgPz8gInVua25vd24iKX1gOwogICAgaGlzdG9ncmFt
W2tleV0gPSAoaGlzdG9ncmFtW2tleV0gPz8gMCkgKyAxOwogIH0pOwp9CnN0cmVhbS5vbigidGVz
dDpmYWlsIiwgKGRhdGEpID0+IHsKICBjb25zdCBvdXRlciA9IGRhdGE/LmRldGFpbHM/LmVycm9y
OwogIGNvbnN0IGlubmVyID0gb3V0ZXI/LmNhdXNlOwogIGZhaWx1cmVzLnB1c2goewogICAgbmFt
ZTogZGF0YT8ubmFtZSA/PyBudWxsLAogICAgZmlsZTogZGF0YT8uZmlsZSA/PyBudWxsLAogICAg
bmVzdGluZzogZGF0YT8ubmVzdGluZyA/PyBudWxsLAogICAgb3V0ZXJOYW1lOiBvdXRlcj8ubmFt
ZSA/PyBudWxsLAogICAgb3V0ZXJDb2RlOiBvdXRlcj8uY29kZSA/PyBudWxsLAogICAgb3V0ZXJG
YWlsdXJlVHlwZTogb3V0ZXI/LmZhaWx1cmVUeXBlID8/IG51bGwsCiAgICBvdXRlck1lc3NhZ2U6
IG91dGVyPy5tZXNzYWdlID8/IG51bGwsCiAgICBpbm5lck5hbWU6IGlubmVyPy5uYW1lID8/IG51
bGwsCiAgICBpbm5lckNvZGU6IGlubmVyPy5jb2RlID8/IG51bGwsCiAgICBpbm5lck9wZXJhdG9y
OiBpbm5lcj8ub3BlcmF0b3IgPz8gbnVsbCwKICAgIGlubmVyTWVzc2FnZTogaW5uZXI/Lm1lc3Nh
Z2UgPz8gbnVsbCwKICB9KTsKfSk7CnN0cmVhbS5vbigidGVzdDpzdW1tYXJ5IiwgKGRhdGEpID0+
IHN1bW1hcmllcy5wdXNoKGRhdGEpKTsKc3RyZWFtLm9uKCJlcnJvciIsIChlcnJvcikgPT4geyBz
dHJlYW1FcnJvciA9IFN0cmluZyhlcnJvcj8uc3RhY2sgPz8gZXJyb3IpOyB9KTsKY29uc3QgZW5k
ZWQgPSBuZXcgUHJvbWlzZSgoYWNjZXB0KSA9PiBzdHJlYW0ub24oImVuZCIsIGFjY2VwdCkpOwpz
dHJlYW0ucmVzdW1lKCk7CmF3YWl0IGVuZGVkOwphc3NlcnQuZXF1YWwoc3RyZWFtRXJyb3IsIHVu
ZGVmaW5lZCwgc3RyZWFtRXJyb3IpOwpjb25zdCByZXN1bHQgPSB7CiAga2luZDogInJrcDItZW9s
LWZ1bGwtbm9kZS1zdW1tYXJ5LXYxIiwKICBub2RlRXhlY3V0YWJsZTogcHJvY2Vzcy5leGVjUGF0
aCwKICBub2RlVmVyc2lvbjogcHJvY2Vzcy52ZXJzaW9uLAogIG1hbmlmZXN0OiB7IGtpbmQ6ICJm
dWxsLXRlc3QtbWFuaWZlc3QtdjEiLCByb290OiAiZGlzdC90ZXN0IiwgZmlsZUNvdW50OiByZWxh
dGl2ZUZpbGVzLmxlbmd0aCwgc2hhMjU2OiBtYW5pZmVzdFNoYTI1NiwgZmlsZXM6IHJlbGF0aXZl
RmlsZXMgfSwKICBzdW1tYXJpZXMsCiAgaGlzdG9ncmFtLAogIGZhaWx1cmVzLAp9Owp3cml0ZUZp
bGVTeW5jKG91dHB1dFBhdGgsIGAke0pTT04uc3RyaW5naWZ5KHJlc3VsdCwgbnVsbCwgMil9XG5g
LCAidXRmOCIpOwpwcm9jZXNzLnN0ZG91dC53cml0ZShgJHtKU09OLnN0cmluZ2lmeSh7IGtpbmQ6
IHJlc3VsdC5raW5kLCBub2RlVmVyc2lvbjogcmVzdWx0Lm5vZGVWZXJzaW9uLCBtYW5pZmVzdDog
cmVzdWx0Lm1hbmlmZXN0LCBmaW5hbFN1bW1hcnk6IHN1bW1hcmllcy5hdCgtMSksIGhpc3RvZ3Jh
bSwgZmFpbHVyZXMgfSwgbnVsbCwgMil9XG5gKTsK
<!-- RKP2-REENTRY-CAPSULE-END tools/capture-full-summary.mjs -->

<!-- RKP2-REENTRY-CAPSULE-BEGIN payload/I0_EXPECTED_PATCH.diff -->
ZGlmZiAtLWdpdCBhLy5naXRhdHRyaWJ1dGVzIGIvLmdpdGF0dHJpYnV0ZXMKaW5kZXggZTU2OTkw
ZDc2ZDVjNTA5M2RjMzRiNWY2Y2I5NzMwN2YzN2YzZmM4Zi4uMWRmNjg0MDFlZjJlMjQxYzExMDA1
Y2NiYTc2ZTY0MTY3NWFmN2EwMiAxMDA2NDQKLS0tIGEvLmdpdGF0dHJpYnV0ZXMKKysrIGIvLmdp
dGF0dHJpYnV0ZXMKQEAgLTQsMyArNCwxMCBAQCB0ZXN0L2NvcmUta2VybmVsL2ZpeHR1cmVzL2N2
bi0zLXN1cmZhY2UuZXhwZWN0ZWQuanNvbiB0ZXh0IGVvbD1sZgogdGVzdC9jb3JlLWtlcm5lbC9y
dXN0LW1pZ3JhdGlvbi9maXh0dXJlcy9vcmFjbGUtbWFuaWZlc3QtdjEuanNvbiB0ZXh0IGVvbD1s
ZgogdGVzdC9jb3JlLWtlcm5lbC9ydXN0LW1pZ3JhdGlvbi9maXh0dXJlcy9vcmFjbGUtc2NlbmFy
aW9zLXYxLmpzb25sIHRleHQgZW9sPWxmCiB0ZXN0L2NvcmUta2VybmVsL3J1c3QtbWlncmF0aW9u
L2ZpeHR1cmVzL3F1YWxpZmljYXRpb24tdjItY29udHJhY3QuanNvbiB0ZXh0IGVvbD1sZgorY3Jh
dGVzL2JyaWxsaWFudC1rZXJuZWwtcnVudGltZS9zcmMvcnVudGltZS5ycyB0ZXh0IGVvbD1sZgor
Y3JhdGVzL2JyaWxsaWFudC1rZXJuZWwtcnVudGltZS9zcmMvc3RvcmUucnMgdGV4dCBlb2w9bGYK
K2NyYXRlcy9icmlsbGlhbnQta2VybmVsLXJ1bnRpbWUvc3JjL2luZGljZXMucnMgdGV4dCBlb2w9
bGYKK3Rlc3QvY29yZS1rZXJuZWwvZml4dHVyZXMvY3ZuLTctcXVhbGlmaWNhdGlvbi1zY29yZS50
cyB0ZXh0IGVvbD1sZgordGVzdC9jb3JlLWtlcm5lbC9ydXN0LW1pZ3JhdGlvbi9ya3AtMi1zY2Fs
ZS1ldmlkZW5jZS13b3JrZXIudHMgdGV4dCBlb2w9bGYKK3Rlc3QvY29yZS1rZXJuZWwvcnVzdC1t
aWdyYXRpb24vcmtwLTItc2NhbGUtZXZpZGVuY2Utd29ya2VyLnRlc3QudHMgdGV4dCBlb2w9bGYK
K3Rlc3QvY29yZS1rZXJuZWwvcnVzdC1taWdyYXRpb24vcmtwLTItc2NhbGUtZXZpZGVuY2UtcHJv
Y2Vzcy5wczEgdGV4dCBlb2w9bGYKZGlmZiAtLWdpdCBhL2NyYXRlcy9icmlsbGlhbnQta2VybmVs
LXJ1bnRpbWUvc3JjL2luZGljZXMucnMgYi9jcmF0ZXMvYnJpbGxpYW50LWtlcm5lbC1ydW50aW1l
L3NyYy9pbmRpY2VzLnJzCmluZGV4IGNhNmIyZDFhNWUxNzI0M2YzOTkwOGExMmZiZDhhNDQyNTI0
NTZlY2IuLjc3NGMzYjYxYTg5ZGM0ZWRkZWNjYmU3ODdkMmQwYWZiMWI2NTRlZWUgMTAwNjQ0Ci0t
LSBhL2NyYXRlcy9icmlsbGlhbnQta2VybmVsLXJ1bnRpbWUvc3JjL2luZGljZXMucnMKKysrIGIv
Y3JhdGVzL2JyaWxsaWFudC1rZXJuZWwtcnVudGltZS9zcmMvaW5kaWNlcy5ycwpAQCAtMjA1Miw3
ICsyMDUyLDggQEAgbW9kIHRlc3RzIHsKICAgICAgICAgYXNzZXJ0X2VxIShyZXByZXNlbnRhdGl2
ZS5tZXRyaWNzLnRpbWVfZW50cmllc19idWlsdCwgMik7CiAgICAgICAgIGFzc2VydF9lcSEocmVw
cmVzZW50YXRpdmUubWV0cmljcy5pbmRleF9lbnRyaWVzX2J1aWx0LCAzNik7CiAKLSAgICAgICAg
bGV0IG1ldHJpY3Nfc291cmNlID0gaW5jbHVkZV9zdHIhKCJpbmRpY2VzLnJzIikKKyAgICAgICAg
bGV0IG1ldHJpY3Nfc291cmNlID0gaW5jbHVkZV9zdHIhKCJpbmRpY2VzLnJzIikucmVwbGFjZSgi
XHJcbiIsICJcbiIpOworICAgICAgICBsZXQgbWV0cmljc19zb3VyY2UgPSBtZXRyaWNzX3NvdXJj
ZQogICAgICAgICAgICAgLnNwbGl0KCJwdWIoY3JhdGUpIHN0cnVjdCBSa3AyU3RvcmVNZXRyaWNz
IHsiKQogICAgICAgICAgICAgLm50aCgxKQogICAgICAgICAgICAgLmV4cGVjdCgibWV0cmljcyBk
ZWNsYXJhdGlvbiIpCkBAIC0yMTAwLDcgKzIxMDEsNyBAQCBtb2QgdGVzdHMgewogICAgICAgICAg
ICAgRXJyKFRpbWVJbmRleEZhaWx1cmU6Ok1pc3NpbmdWb2ljZSkKICAgICAgICAgKTsKIAotICAg
ICAgICBsZXQgc291cmNlID0gaW5jbHVkZV9zdHIhKCJzdG9yZS5ycyIpOworICAgICAgICBsZXQg
c291cmNlID0gaW5jbHVkZV9zdHIhKCJzdG9yZS5ycyIpLnJlcGxhY2UoIlxyXG4iLCAiXG4iKTsK
ICAgICAgICAgbGV0IHF1ZXJ5ID0gc291cmNlCiAgICAgICAgICAgICAuc3BsaXQoImltcGwgTGl2
ZVNjb3JlU3RvcmUgeyIpCiAgICAgICAgICAgICAubnRoKDEpCkBAIC0yMTMzLDcgKzIxMzQsNyBA
QCBtb2QgdGVzdHMgewogICAgICAgICAgICAgRXJyKEluZGV4QnVpbGRGYWlsdXJlOjpNaXNzaW5n
UmVjb3JkKQogICAgICAgICApOwogCi0gICAgICAgIGxldCBzb3VyY2UgPSBpbmNsdWRlX3N0ciEo
ImluZGljZXMucnMiKTsKKyAgICAgICAgbGV0IHNvdXJjZSA9IGluY2x1ZGVfc3RyISgiaW5kaWNl
cy5ycyIpLnJlcGxhY2UoIlxyXG4iLCAiXG4iKTsKICAgICAgICAgbGV0IHByb2plY3Rpb25fZGVj
bGFyYXRpb24gPSBzb3VyY2UKICAgICAgICAgICAgIC5zcGxpdCgicHViKGNyYXRlKSBzdHJ1Y3Qg
Tm9ybWFsaXplZEluZGV4UHJvamVjdGlvbiB7IikKICAgICAgICAgICAgIC5udGgoMSkKQEAgLTIx
NTUsNCArMjE1NiwyMyBAQCBtb2QgdGVzdHMgewogICAgICAgICAgICAgYXNzZXJ0ISghcHJvamVj
dGlvbl9kZWNsYXJhdGlvbi5jb250YWlucyhmb3JiaWRkZW4pLCAie2ZvcmJpZGRlbn0iKTsKICAg
ICAgICAgfQogICAgIH0KKyAgICAjW3Rlc3RdCisgICAgZm4gc291cmNlX3NoYXBlX25vcm1hbGl6
YXRpb25faXNfbGZfY3JsZl9pbnZhcmlhbnQoKSB7CisgICAgICAgIGxldCBsZiA9ICJwdWIoY3Jh
dGUpIHN0cnVjdCBSa3AyU3RvcmVNZXRyaWNzIHtcbiAgICBlbnRpdHlfaW5kZXhfbG9va3Vwczog
dXNpemUsXG59XG5cbiI7CisgICAgICAgIGxldCBjcmxmID0gbGYucmVwbGFjZSgnXG4nLCAiXHJc
biIpOworICAgICAgICBsZXQgbm9ybWFsaXplZF9sZiA9IGxmLnJlcGxhY2UoIlxyXG4iLCAiXG4i
KTsKKyAgICAgICAgbGV0IG5vcm1hbGl6ZWRfY3JsZiA9IGNybGYucmVwbGFjZSgiXHJcbiIsICJc
biIpOworICAgICAgICBhc3NlcnRfZXEhKG5vcm1hbGl6ZWRfbGYsIG5vcm1hbGl6ZWRfY3JsZik7
CisKKyAgICAgICAgZm9yIHNvdXJjZSBpbiBbJm5vcm1hbGl6ZWRfbGYsICZub3JtYWxpemVkX2Ny
bGZdIHsKKyAgICAgICAgICAgIGxldCBkZWNsYXJhdGlvbiA9IHNvdXJjZQorICAgICAgICAgICAg
ICAgIC5zcGxpdCgicHViKGNyYXRlKSBzdHJ1Y3QgUmtwMlN0b3JlTWV0cmljcyB7IikKKyAgICAg
ICAgICAgICAgICAubnRoKDEpCisgICAgICAgICAgICAgICAgLmV4cGVjdCgibWV0cmljcyBkZWNs
YXJhdGlvbiIpCisgICAgICAgICAgICAgICAgLnNwbGl0KCJ9XG5cbiIpCisgICAgICAgICAgICAg
ICAgLm5leHQoKQorICAgICAgICAgICAgICAgIC5leHBlY3QoIm1ldHJpY3MgZmllbGRzIik7Cisg
ICAgICAgICAgICBhc3NlcnRfZXEhKGRlY2xhcmF0aW9uLCAiXG4gICAgZW50aXR5X2luZGV4X2xv
b2t1cHM6IHVzaXplLFxuIik7CisgICAgICAgIH0KKyAgICB9CiB9CmRpZmYgLS1naXQgYS9jcmF0
ZXMvYnJpbGxpYW50LWtlcm5lbC1ydW50aW1lL3NyYy9ydW50aW1lLnJzIGIvY3JhdGVzL2JyaWxs
aWFudC1rZXJuZWwtcnVudGltZS9zcmMvcnVudGltZS5ycwppbmRleCA5OTUyZDY5OWI5ODIyZjIz
ZmVlZWJlOThhZWI0ZTEzYjExOTlkNGQxLi5kZWQ3ZDI1NmUwNzQ5NzFhMzNjZTQyNThhNzdhMzNk
YzU5MzNiZDY2IDEwMDY0NAotLS0gYS9jcmF0ZXMvYnJpbGxpYW50LWtlcm5lbC1ydW50aW1lL3Ny
Yy9ydW50aW1lLnJzCisrKyBiL2NyYXRlcy9icmlsbGlhbnQta2VybmVsLXJ1bnRpbWUvc3JjL3J1
bnRpbWUucnMKQEAgLTEwMCw3ICsxMDAsNyBAQCBtb2QgdGVzdHMgewogICAgICAgICBhc3NlcnRf
ZXEhKHJ1bnRpbWUuZG9jdW1lbnRfaWQoKS5hc19zdHIoKSwgInNjb3JlLXJvb3QiKTsKICAgICAg
ICAgYXNzZXJ0X2VxIShydW50aW1lLmRvY3VtZW50X3ZlcnNpb24oKSwgRG9jdW1lbnRWZXJzaW9u
VjE6OmluaXRpYWwoKSk7CiAKLSAgICAgICAgbGV0IHNvdXJjZSA9IGluY2x1ZGVfc3RyISgicnVu
dGltZS5ycyIpOworICAgICAgICBsZXQgc291cmNlID0gaW5jbHVkZV9zdHIhKCJydW50aW1lLnJz
IikucmVwbGFjZSgiXHJcbiIsICJcbiIpOwogICAgICAgICBsZXQgZGVjbGFyYXRpb24gPSBzb3Vy
Y2UKICAgICAgICAgICAgIC5zcGxpdCgicHViIHN0cnVjdCBLZXJuZWxSdW50aW1lIHsiKQogICAg
ICAgICAgICAgLm50aCgxKQpkaWZmIC0tZ2l0IGEvY3JhdGVzL2JyaWxsaWFudC1rZXJuZWwtcnVu
dGltZS9zcmMvc3RvcmUucnMgYi9jcmF0ZXMvYnJpbGxpYW50LWtlcm5lbC1ydW50aW1lL3NyYy9z
dG9yZS5ycwppbmRleCA5ZjJmNDBmMjlmOGU3YzQ1YWE5MGQ2ZmI0YTlkNDIwZWMzMGE5MTcxLi45
MzZiZjM4NjEwYzMwMzdiM2QxY2FkZTYxMjk2Y2ZkYWUzMzY5ZmI0IDEwMDY0NAotLS0gYS9jcmF0
ZXMvYnJpbGxpYW50LWtlcm5lbC1ydW50aW1lL3NyYy9zdG9yZS5ycworKysgYi9jcmF0ZXMvYnJp
bGxpYW50LWtlcm5lbC1ydW50aW1lL3NyYy9zdG9yZS5ycwpAQCAtMTYyNiw3ICsxNjI2LDcgQEAg
cHViKGNyYXRlKSBtb2QgdGVzdHMgewogICAgIGZuIGV2ZXJ5X3R5cGVkX3JlY29yZF9yZXNvbHZl
c19vbmNlX3dpdGhvdXRfcmV0YWluaW5nX3RoZV9kb2N1bWVudF90cmVlKCkgewogICAgICAgICBs
ZXQgbXV0IGRvY3VtZW50ID0gZml4dHVyZSgpOwogICAgICAgICBsZXQgc3RvcmUgPSBidWlsZF9s
aXZlX3Njb3JlX3N0b3JlKCZkb2N1bWVudCkuZXhwZWN0KCJzdG9yZSIpOwotICAgICAgICBsZXQg
c291cmNlID0gaW5jbHVkZV9zdHIhKCJzdG9yZS5ycyIpOworICAgICAgICBsZXQgc291cmNlID0g
aW5jbHVkZV9zdHIhKCJzdG9yZS5ycyIpLnJlcGxhY2UoIlxyXG4iLCAiXG4iKTsKICAgICAgICAg
bGV0IGRlY2xhcmF0aW9uID0gc291cmNlCiAgICAgICAgICAgICAuc3BsaXQoInB1YihjcmF0ZSkg
c3RydWN0IExpdmVTY29yZVN0b3JlIHsiKQogICAgICAgICAgICAgLm50aCgxKQo=
<!-- RKP2-REENTRY-CAPSULE-END payload/I0_EXPECTED_PATCH.diff -->

### R-I0 exit

- Durable capsule entry count: `10`; complete patch: `4,892` bytes, SHA-256 `fb635082a2951b5e3d8b9352230bd462e0c08aa5b7326a93403537baf62b1b05`.
- Fresh control and byte-distinct expected V1/V2 lanes are committed and clean; their focused signatures are recorded before any candidate exists.
- Next gate after committing this exact six-path R-I0 evidence candidate: `R-I1 INDEPENDENT FRESH RECONSTRUCTION AND CANDIDATE OBSERVATION`.
- No acceptance, archive, integration, S6.2/S6.3/E3, qualification, runtime cutover, RKP-3, or push is authorized.

## R-I1 independent reconstruction and R-I2 regression freeze

### Candidate and reconstructed lane identities

```json
{
  "kind": "rkp2-eol-reentry-r-i1-r-i2-record-v1",
  "rI0Candidate": {
    "head": "6933367a3e58bb6efd93057458b7f764b4450d51",
    "tree": "520ae62063346dc8c3bc1704797f4fcf5a26f88b",
    "parent": "c3e90c6fcc3a624b8a7157bedea59d44f84c6c78"
  },
  "control": {
    "head": "c3e90c6fcc3a624b8a7157bedea59d44f84c6c78",
    "tree": "40d786f4717e27251ae76b2ae7f49e286337839a",
    "clean": true
  },
  "rebuiltExpectedV1": {
    "disposableHead": "6d70e769b3ea80aed26ade6f150e18892ee0e291",
    "tree": "b8c5b825e5385a4819db24207208f50e79c9735f",
    "treeEqualsPredeclaredR_I0": true,
    "clean": true
  },
  "rebuiltExpectedV2": {
    "disposableHead": "8a18fc825b78a64dcbcc151b3c730ec98d0bb641",
    "tree": "2b17d741fa19678f564432c446bf58ea5426dd3a",
    "treeEqualsPredeclaredR_I0": true,
    "clean": true
  },
  "capsule": {
    "entryCount": 10,
    "bootstrapExtraction": "10/10 verified",
    "extractedHelperExtraction": "10/10 verified",
    "nodeCheck": "9/9 scripts pass"
  },
  "coordination": {
    "candidateResultSha256": "6eb9948ba90b1a0f5498e33259fc4ca3f746339d957708284e5a810565f5ef22",
    "expectedV1ResultSha256": "1b0ca23e49384f6338fad172db32f09a6ab8198e1e9d72e1bf6dad24fc2ba92b",
    "expectedV2ResultSha256": "0e850fb4710808c9a625c9e450657d6bb70350ed3bd530275de002a8ba631c31",
    "taskPrdDesignImplementExpectedActualExactSix": true,
    "technicalAllowlistCount": 0
  },
  "patchAndRustReconstruction": {
    "rebuiltPatchBytes": 4892,
    "rebuiltPatchSha256": "fb635082a2951b5e3d8b9352230bd462e0c08aa5b7326a93403537baf62b1b05",
    "rebuiltPatchEqualsEmbeddedBytes": true,
    "rustResultSha256": "11ac6ab25470ba1c93c7084cd5ec5f8803c23e56fc5ea50b292a9bf04dcbfe74",
    "technicalTree": "022f8b25e53ca68f33be08d0a2cedef65af2aa94",
    "pathProjectedReconstructedTree": "11e46d1e4e8327d6a2e9074ab5be492070139876",
    "exactFourBlobEquality": true,
    "selfTest": "5/5 pass"
  },
  "focusedNode": {
    "nodeVersion": "v24.15.0",
    "countsEach": "11 total / 7 pass / 4 fail / 0 skip",
    "controlResultSha256": "8fc53e7c97074d273a588dbad4c403ad5aa4b824f7f330382eee07da8cf84b2d",
    "expectedV1ResultSha256": "df1bb4f4f10fb57afe73da3fb391eb75b2d59ca424fee2db8a57a6b701adba0b",
    "expectedV2ResultSha256": "9b3f1bea7f57b70a38a3dd49915a155c07e597336d893687429f5946dbedf5b8",
    "candidateResultSha256": "e5c7f5208d7b2aee3b4ba420cd48ecede02d2807c530aebff969917f86567435",
    "comparisonResultSha256": "26967a611cce6ad9cb4159f61d8e6dd8856fefdebe2b8576966c804c745f956b",
    "expectedV1EqualsV2": true,
    "candidateEqualsExpectedV1ForAllFourTitleLevelSignatures": true,
    "candidateEqualsControlForAllFourTitleLevelSignatures": true
  },
  "fullNode": {
    "manifestFileCount": 80,
    "manifestSha256": "1a50fd28c630bb016ce30f7ca65ae940170705b2eed581e610282b81378a1cf1",
    "control": "590 total / 582 pass / 7 fail / 1 skip",
    "candidate": "590 total / 582 pass / 7 fail / 1 skip",
    "failureClassesEqual": true,
    "failureClassification": "three file-level missing ignored native-addon artifacts plus four frozen governance failures",
    "controlResultSha256": "5356a832da7a641b37a7f4978e6dadad78839d4c1310b5b80b0bbadd33658113",
    "candidateResultSha256": "f83eede54f559d2e7eaf2a045bfef11c6862301aa1427d29f51257cff9748603"
  },
  "candidateEolMatrix": {
    "resultSha256": "f2a016170645b6fcd24024776058096822484cbe2d74b53d9c35047418b70356",
    "autocrlfTrue": "7/7 clean checkout equals Git blob, LF only",
    "autocrlfFalse": "7/7 clean checkout equals Git blob, LF only",
    "laneRecordsEqual": true
  }
}
```

### R-I2 fresh regression commands and outcomes

```json
[
  {
    "command": "cargo +1.97.1 fmt --all -- --check",
    "exit": 0
  },
  {
    "command": "cargo +1.97.1 check --workspace --all-targets --locked",
    "exit": 0
  },
  {
    "command": "cargo +1.97.1 test --workspace --all-targets --locked",
    "exit": 0,
    "workspaceResult": "79 pass / 0 fail / 1 ignored",
    "runtimeResult": "18 pass / 0 fail / 1 ignored",
    "ignoredReason": "isolated Stage 6 evidence worker not executed"
  },
  {
    "command": "cargo +1.97.1 clippy --workspace --all-targets --locked -- -D warnings",
    "exit": 0
  },
  {
    "command": "cargo +1.88.0 check --workspace --all-targets --locked",
    "exit": 0
  },
  {
    "command": "npm.cmd run typecheck",
    "exit": 0
  },
  {
    "command": "npm.cmd run build",
    "exit": 0
  }
]
```

- All Cargo target and TEMP/TMP paths were under the fresh E-drive R-I1 root. The only Cargo diagnostic was the existing `panic setting is ignored for test profile` warning.
- Child/parents Trellis validation passed at `7/7`, `25/20`, and `18/19`.
- Three task JSON files parsed; six JSONL files / 96 rows parsed, each per-file path unique and present.
- The three changed Markdown files have balanced fences; `git diff --check` passed.
- The R-I0 candidate was clean; its range from R-A0 is exactly six coordination paths. Its four technical blobs equal `30d4acb0...`; four protected S6.2 paths have zero delta.
- E3 execution count is zero, TypeScript remains default, and all ten forbidden later-lifecycle flags remain false.

### R-I2 freeze boundary

- The commit containing this section is the evidence-freeze candidate; resolve its exact HEAD/tree from the clean branch after commit.
- `implementation_candidate_ready=true` only means ready for the dedicated independent implementation re-audit. It does not mean technical acceptance or lifecycle acceptance.
- After this evidence commit, remove only the explicitly named reproducible R-I0/R-I1 temporary roots; then require the task worktree to be clean and staged-empty.
- Sole next gate: `DEDICATED INDEPENDENT IMPLEMENTATION RE-AUDIT`.
- Acceptance, archive, integration, S6.2/S6.3/E3, qualification, runtime cutover, RKP-3, and push remain unauthorized.
