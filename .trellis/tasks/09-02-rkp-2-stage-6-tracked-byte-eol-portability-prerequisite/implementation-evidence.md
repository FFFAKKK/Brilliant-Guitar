# RKP-2 Stage 6 Tracked-byte and EOL Portability Prerequisite — Implementation Evidence

## Current evidence state

- Status: `I0 FRESH BASELINE FROZEN / I1 NOT STARTED`.
- Fresh `I0_SOURCE_HEAD`: `64bc508cd56bd0a250f890af186c097dc2b6880e`.
- Fresh source tree: `b767ce3b7016b8529326f94891ebd4aaa2373515`.
- Branch: `codex/rkp-2-stage-6-eol-evidence-repair`.
- Worktree: `.worktrees/rkp-2-stage-6-eol-portability-prerequisite`.
- `implementation-evidence.md` was absent and the four technical paths had zero delta at the source HEAD.
- This document is the later I0 evidence projection and is deliberately not part of `I0_SOURCE_HEAD`.
- Task remains `in_progress`; implementation candidate is not ready; S6.2/S6.3/E3 remain false/false/zero.

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
