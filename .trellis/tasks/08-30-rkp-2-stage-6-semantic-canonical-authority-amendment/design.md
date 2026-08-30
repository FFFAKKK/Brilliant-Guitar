# Design — RKP-2 Stage 6 Semantic and Canonical Evidence Authority Amendment

## 1. Decision

The private scale-evidence seam owns an evidence assertion, not a score-format conversion. A TypeScript raw JSON score is permitted to be semantically equal to, but byte-distinct from, Rust Foundation canonical JSON. Foundation's `BTreeMap` remains the canonical payload-object order owner. No production codec, DTO, Runtime state, public Node surface, or fixture is changed.

The observed stress evidence is deterministic: both representations are `15_013_904` bytes; the first byte difference is zero-based offset `15_011_087` (one-based `15_011_088`) at `$.extensions[0].payload`, where TypeScript emits `marker` before `generatorVersion` and Rust canonical output emits `generatorVersion` before `marker`.

## 2. Future E1R2 data flow and exact call counts

Inside `indices.rs::collect_scale_evidence`, the future amendment is exactly:

```text
A  strict create request capture and existing prefix checks
B  decode_create_request(raw request) once -> decoded input DTO
C  existing Store build, probes, and parity checks unchanged
D  export_document once -> exported DTO
E  assert decoded input DTO == exported DTO
F  canonical_score_bytes(exported DTO) once -> primary canonical bytes
G  create in-memory request(primary bytes) then decode_create_request once -> verification DTO
H  assert decoded input DTO == verification DTO and exported DTO == verification DTO
I  canonical_score_bytes(verification DTO) once -> verification canonical bytes
J  assert primary canonical bytes == verification canonical bytes
K  emit the unchanged private evidence envelope using primary-byte length only
```

The internal total is therefore exactly **one export**, **two strict request decodes**, and **two Foundation canonical encodes**. Test setup that constructs a request is outside these counts.

`workloadElapsedMicros` may include verification and remains diagnostic. `fullDocumentMaterializations=1` derives only from D. `canonicalEncodeBytes` and `bytes.canonicalScoreBytes` derive only from F, so both remain `15_013_904`; I has no persistent or reported metric write.

## 3. Role matrix

| Value | Owner | Required comparison | Forbidden comparison |
| --- | --- | --- | --- |
| Raw TypeScript score JSON | existing fixture/worker input | semantic DTO equality after strict decode | equality with any Rust canonical bytes |
| Exported DTO | existing LiveScoreStore export | semantic equality with decoded input and verification DTO | a second Store export |
| Primary canonical bytes | Foundation encoder over exported DTO | equality with verification canonical bytes | comparison to raw input bytes |
| Verification DTO | Contracts decode of in-memory primary request | semantic equality with decoded input/exported DTO | persistent Store mutation or metrics write |
| Verification canonical bytes | Foundation encoder over verification DTO | equality with primary canonical bytes | new sentinel field or public output |

The frozen SHA values are diagnostic anchors for the two different roles, not an encoder test oracle: raw input SHA-256 is `5a8a318e58bc08a82a822c166ed11239ed4ed7b9ea45d50bb7dcb81d7c57f91e`; Rust canonical SHA-256 is `4d8597437cc8b07df6cfef9400086218636adb27257ad72d055e1e3a3deafff7`.

## 4. Sentinel and unchanged evidence contract

`roundTrip.semanticEqual` remains true only when the three DTO values are semantically equal. `roundTrip.canonicalBytesEqual` remains true only when the two Rust canonical vectors are equal. The private prefixes, exact compact JSON field order/schema, worker/process envelopes, output caps, cleanup, failure union, counts, metrics, probes, parity, and ordering fields are not extended or redefined.

The property-cap successor (`1_572_864`), native-wire-v1, `22` failures, `codec.property-limit` wire, request/response byte caps, and depth are accepted external authority. This task neither consumes nor rewrites them.

## 5. Regression shape

The future `indices.rs` test uses the existing small fixture and changes only one dual-key ExtensionBlock payload's **raw** key order. It proves:

1. raw input bytes differ from primary Foundation canonical bytes;
2. the raw and exported/verification DTOs remain semantically equal;
3. primary and verification canonical bytes are equal;
4. unknown-extension and existing ordering behavior remains preserved.

The existing canonical small fixture continues to prove the ordinary canonical input case. The ignored stress entry and its single fixture are not exercised or duplicated during E1R2.

## 6. Ownership and protected boundary

Future E1R2 technical ownership is literally two files:

1. `crates/brilliant-kernel-runtime/src/indices.rs` — private test seam and small regression.
2. `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` — mechanical two-path/call-count/lifecycle law.

All other technical paths are protected, including Foundation, Contracts, Core Types, TypeScript adapter, worker/process harness, fixture, Cargo manifests, public APIs, product Runtime code, and archived authorities. The original Stage 6 nine immutable planning files remain byte-identical; this successor task owns the amendment planning text.
