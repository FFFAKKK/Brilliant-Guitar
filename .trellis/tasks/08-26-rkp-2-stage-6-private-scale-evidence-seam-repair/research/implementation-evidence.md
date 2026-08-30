# RKP-2 Stage 6 Private Scale Evidence — E3 Candidate Freeze

## Evidence boundary

This document freezes the separately authorized E3 fresh run. It is test-infrastructure evidence for the private Rust `LiveScoreStore` scale path. It is not a product benchmark, RKP-7 budget result, RKP-9 qualification result, default-runtime cutover, RKP-2 S6.2 execution, or acceptance/archive record.

- Fresh-run source HEAD: `4ad23773e9c9e1081667a4eccb84cc464b85bc89`.
- Source tree: `9dbcef77fbcc258e4fe96fdfb2b28839f095d610`.
- E2 request/output reuse: `false`.
- Fixture owner: `test/core-kernel/fixtures/cvn-7-qualification-score.ts#createStressCvn7Score`.
- Temporary request location: a new worker-owned leaf below an E:-resident `TEMP`/`TMP` root.
- Worker cleanup result: request, redirects, ownership marker and worker-owned leaf removed; no handed-off request residue was retained.

## Toolchain and host context

| Item | Exact value |
| --- | --- |
| Cargo | `cargo 1.97.1 (c980f4866 2026-06-30)` |
| Rust | `rustc 1.97.1 (8bab26f4f 2026-07-14)` |
| Node | `v24.15.0` |
| npm | `11.12.1` |
| PowerShell | `7.6.4` |
| OS | `Microsoft Windows 10.0.26200`, x64 process on x64 OS |
| Cargo executable | `C:\Users\ATOM\.cargo\bin\cargo.exe` |
| Build/output volume | E: worktree; C: was not used as the Cargo target or E3 TEMP root |

## Frozen technical-input manifest

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `crates/brilliant-kernel-runtime/src/indices.rs` | 78,829 | `20ef06be9016680e11184f85ca4b0cf86e331bf00fbe394378a5ed48266cc854` |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts` | 39,183 | `c32d2d8954b4a7c1a7462f8defeac31030b758b37ac082d105b8b6d9a2a5d08d` |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts` | 32,512 | `89638a846810be3c121577e9c1741a4e2540b9d1f84762b06fb7739b9e30dadc` |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1` | 15,645 | `ac2333142829cda998a5e4bea996128e080cb5d3ca4cdc6c317b3967d6835571` |
| `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` | 88,013 | `22a0c8ca248ee62add6e52925d934203ca58549e805918e9de27ce1564e69668` |
| `test/core-kernel/fixtures/cvn-7-qualification-score.ts` | 11,107 | `87190d565f4de96c8c3ce2be3863de1ba6304eabc3517fea3c35785931e77b3b` |

## Exact successful process protocol

- Protocol bytes, excluding a line terminator: `1,525`.
- Protocol SHA-256: `64e09779ea34bd04d504d515eb7c391f7db35a0a23a3c366fb2ffb5aa71c2862`.

```text
BRILLIANT_RKP2_SCALE_PROCESS_V1:{"schemaVersion":1,"status":"ok","evidence":{"schemaVersion":1,"status":"ok","fixtureId":"cvn7-stress-v1","counts":{"measures":400,"parts":16,"staves":16,"measureContents":6400,"voices":12800,"events":102400,"notes":51200,"extensions":18,"partOwnedExtensions":16,"unknownExtensions":1},"bytes":{"canonicalScoreBytes":15013904,"createRequestBytes":15013932},"metrics":{"entitiesVisited":166833,"records":{"measures":400,"parts":16,"staves":16,"voices":12800,"events":102400,"notes":51200,"extensions":18},"topologyEdgesVisited":173250,"referenceEdgesBuilt":19216,"timeEntriesBuilt":102400,"entityIndexLookups":0,"ownerIndexLookups":0,"timeIndexComparisons":0,"indexEntriesBuilt":474517,"indexRebuildEntries":474517,"fullDocumentMaterializations":1,"canonicalEncodeBytes":15013904},"entityProbe":{"stableId":"cvn7-e-00-0000-0-0","entityKind":"event","entityIndexLookupsDelta":1,"otherCounterDelta":0},"ownerProbe":{"entityKind":"event","ownerKind":"voice","ownerStableId":"cvn7-v-00-0000-0","ownerIndexLookupsDelta":1,"otherCounterDelta":0},"parity":{"normalizedProjectionEqual":true,"indexEntryCountEqual":true},"roundTrip":{"semanticEqual":true,"canonicalBytesEqual":true},"ordering":{"topologyCanonical":true,"extensionsPreserved":true},"workloadElapsedMicros":12964590},"process":{"exitCode":0,"timedOut":false,"peakWorkingSetBytes":821886976,"stdoutBytes":1438,"stderrBytes":0,"terminationStatus":"not-required","reapStatus":"succeeded","cleanupStatus":"succeeded"},"partialEvidence":false}
```

## Decisive result

- Fixed input: `400` measures, `16` parts, `12,800` voices, `102,400` events, `51,200` notes and `18` extension blocks.
- Exact entity probe: one indexed lookup of `cvn7-e-00-0000-0-0`; other counter delta `0`.
- Exact owner probe: one indexed owner lookup to Voice `cvn7-v-00-0000-0`; other counter delta `0`.
- Import/rebuild index entries: `474,517 / 474,517`.
- Normalized projection and entry-count parity: `true / true`.
- Semantic and Rust-canonical round trip: `true / true`.
- Topology order and extension preservation: `true / true`.
- Rust workload elapsed: `12,964,590 us`.
- End-to-end worker elapsed: `14,077,309 us`.
- Peak working set: `821,886,976` bytes (`783.8125 MiB`).
- Process: exit `0`, no timeout, no termination request, reap succeeded, cleanup succeeded, `partialEvidence=false`.

## Candidate and next gate

E3 changes no technical file. The child remains `in_progress`; RKP-2 remains paused before S6.2, TypeScript remains the default runtime, and S6.2/S6.3 remain false. This evidence makes the bounded repair candidate ready only for a dedicated independent implementation review. Acceptance, archive, integration, qualification, cutover, push and RKP-3 remain separate later gates.
