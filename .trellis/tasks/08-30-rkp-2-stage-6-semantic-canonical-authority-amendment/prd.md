# RKP-2 Stage 6 Semantic and Canonical Evidence Authority Amendment

## Goal

Freeze the bounded successor authority that corrects one private Stage 6 evidence assertion: a TypeScript-originated raw score JSON byte sequence is not the same authority as a Rust Foundation canonical encoding. The successor changes no product behavior. It only plans a future `cfg(test)` seam amendment so the evidence proof requires semantic equality at the raw/canonical boundary and byte equality only between two Rust canonical encodes.

## Requirements

1. Preserve the accepted RKP-1A public JSON-property authority without reopening it: property cap `1_572_864`, `native-wire-v1`, all `22` stable failures, and the `codec.property-limit` frozen input `limit=1_572_864`, `actual=1_572_865` remain inputs only.
2. Remove the invalid requirement that raw TypeScript input score bytes equal Rust canonical score bytes.
3. The future private seam must call `LiveScoreStore::export_document` exactly once.
4. It must call Foundation `canonical_score_bytes` exactly once for that exported DTO; this is the **primary canonical encoding**.
5. It must construct an in-memory create request from those primary bytes and call Contracts `decode_create_request` exactly once for verification, in addition to the original request decode.
6. It must call Foundation `canonical_score_bytes` exactly once for the verification DTO, then require the primary and verification canonical bytes to be equal.
7. Semantic equality must be asserted as `decoded input == exported DTO == verification-decoded DTO`; it is never replaced by raw-byte equality.
8. In the sentinel, `roundTrip.semanticEqual` means semantic DTO equality only. `roundTrip.canonicalBytesEqual` means primary Rust canonical bytes equal verification Rust canonical bytes only; it never compares either value to raw TypeScript input bytes.
9. The two frozen SHA-256 values are diagnostic role anchors only: raw input `5a8a318e58bc08a82a822c166ed11239ed4ed7b9ea45d50bb7dcb81d7c57f91e` and Rust canonical export `4d8597437cc8b07df6cfef9400086218636adb27257ad72d055e1e3a3deafff7`. This task adds no SHA product logic, Cargo dependency, public protocol field, or worker sentinel field.
10. `bytes.canonicalScoreBytes` and `metrics.canonicalEncodeBytes` remain the primary canonical length only (`15_013_904`). The verification encoding is test-local and must not alter persistent Store metrics. `fullDocumentMaterializations` remains `1` from the sole export.
11. Counts, index/query metrics, entity and owner probes, parity, ordering, private prefix/schema, worker/process caps, and the existing failure-code union remain unchanged.
12. Add one future small noncanonical raw-order regression in `indices.rs`: semantic DTOs agree, raw input differs from primary Rust canonical bytes, and primary canonical bytes equal verification canonical bytes. It changes only a two-key ExtensionBlock payload key order; it does not create a second stress fixture or file.
13. Keep the existing canonical small fixture and the ignored stress entry intact. The stress worker remains future E2 work and is not started by this task.
14. The future technical allowlist is exactly `crates/brilliant-kernel-runtime/src/indices.rs` and `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`. Foundation, Contracts, Core Types, TypeScript adapter, worker/process harness, fixture, Cargo, public API, Runtime product state, and all Stage 6 production stages are protected.
15. A successful independent audit of the future E1R2 candidate does not authorize E2. E2 requires a separate explicit user authorization.

## Acceptance Criteria

- [ ] The planning candidate has exactly twelve new task artifacts and only the three permitted parent task projections, for an exact fifteen-path docs/governance diff from `d14d73117e03822a52fd19c55f3024cb2b73ef45`.
- [ ] The task is `planning`, has not run `task.py start`, has no production authorization, and declares E1R2/E2/E3/S6.2/S6.3 false.
- [ ] PRD, design, implementation plan, JSONL, matrices, and parent projections agree that raw input and canonical bytes have distinct roles.
- [ ] The future E1R2 call-count contract is exactly one export, two request decodes, and two Rust canonical encodes inside `collect_scale_evidence`.
- [ ] The original Stage 6 nine immutable authority blobs and the archived RKP-1A/closeout registries remain hash-identical and all protected technical paths are byte-zero.
- [ ] Trellis, JSON/JSONL, parent-child, fence, diff, literal-path, and planning self-audit gates pass; the final review state is `READY FOR INDEPENDENT PLANNING REVIEW`.

## Non-goals

- No product codec, score-model, Foundation, Contracts, Runtime, Node, fixture, Cargo, or TypeScript adapter change.
- No new worker, process harness, sentinel schema, public export, failure code, default-runtime switch, qualification claim, RKP-3, archive, integration, or push.
- No E1R2 implementation, E2, E3, or S6.2/S6.3 execution in this planning task.
