# RKP-3 Implementation Evidence

## Evidence boundary

This evidence qualifies the private RKP-3 transaction candidate only. It does
not claim owner acceptance, archive, RKP-4 readiness, official Qualification
V2, default-runtime cutover, plugin migration, support readiness, or push.

- Accepted RKP-2 base:
  `6d0956c970f4414cb61e0f3d7148672a6e635032`.
- Reviewed planning authority:
  `78660bb63e249f7bbfec848b9b19e16d7dc55c25`.
- Technical source:
  `0861f40b90599aa48a9859d385590175f8af2bbd`.
- Technical source tree:
  `ba17b7de734885d73f6816743adc9a97bb3f7d00`.
- Final review candidate: the commit containing this evidence file.

## Delivered behavior

- Eleven ordered forward/inverse `ChangeSet` operations use stable logical
  addresses; physical SlotMap handles stay inside the commit plan.
- The overlay records local mutation intent, copies changed order collections
  only on first write, derives all store/index deltas before adoption, and
  discards the whole transaction on rejection.
- Checked revision, exact 28-command dispatch, later-child batch visibility,
  lowest failing child, range delete/transpose, and one atomic adoption are
  implemented.
- The private Node boundary exposes create/read/submit only. Submit returns no
  document; canonical state is obtained through the separate read call.
- Public TypeScript inventories remain `28/51/8/34/9`, and TypeScript remains
  the default runtime.

## Reproducible gates

| Gate | Result |
| --- | --- |
| Rust 1.97.1 format | pass |
| Rust 1.97.1 workspace check, all targets, locked | pass |
| Rust 1.97.1 workspace test, all targets, locked | 136 passed, 1 ignored, 0 failed |
| Rust 1.97.1 workspace Clippy, `-D warnings` | pass |
| Rust 1.88.0 workspace check, all targets, locked | pass |
| TypeScript typecheck | pass |
| TypeScript build | pass |
| RKP-1 real Node bridge | 9/9 |
| RKP-1 workspace contracts | 6/6 |
| RKP-2 workspace plus native parity | 19/19 |
| RKP-3 workspace, native transaction, and oracle | 20/20 |
| Clean full suite | 631 discovered, 629 passed, 0 failed, 2 intentional skips, 86.031 s |

The two full-suite skips are the pre-existing GC-sensitive lane without its
explicit runner flag and the Stage-6 E2 stress journey requiring separate
authorization. Neither is an RKP-3 failure.

## Frozen bytes

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| source and staged native addon | 5,020,672 | `0e7b561a5dd6a80cbc3ebd2cb434b9226a3ca0166067e908812b022291ce5371` |
| oracle manifest | 15,168 | `3814ed1da21f8de7135a71ab3e4b0a1ba888a76e6163ed1868756353005dabf7` |
| oracle scenarios | 1,307,605 | `9761691b07082f5434126f2048f91ad415f91418799ec6bf316c2ae4d2fb9cb2` |
| qualification contract | 2,982 | `7059cb088d064d4d4450bd23830ac6bce0259070d6e08ce54b5b3d4c4e0cde05` |

No generated addon, DLL, `target`, `dist`, or `node_modules` file is tracked.
The seven-crate graph and Cargo manifest/lock bytes equal the accepted base.

## Oracle projection

The strict existing 64-row corpus is parsed without schema expansion. RKP-3
selects exactly 28 accepted and 28 missing-target rows in catalog order plus
two stage-owned cross-cutting rows: atomic batch commit and batch-child
zero-delta rejection.

- Accepted rows equal native canonical document bytes at version 1.
- Rejected rows equal the expected failure, retain version 0, and preserve
  native state byte-for-byte.
- History, dirty state, events, replay, support, plugin, and migration fields
  are explicitly excluded from the RKP-3 claim.

## Locality counters

Both a local note edit and a one-event range transpose have identical counters
on 4- and 256-measure documents. Their first four global-work counters are
zero, and `entitiesVisited` is zero.

| Counter | Local edit | Range transpose |
| --- | ---: | ---: |
| `fullDocumentScans` | 0 | 0 |
| `fullDocumentClones` | 0 | 0 |
| `fullSemanticValidations` | 0 | 0 |
| `fullSnapshotMaterializations` | 0 | 0 |
| `entitiesVisited` | 0 | 0 |
| `entityIndexLookups` | 2 | 2 |
| `overlayRecords` | 1 | 1 |
| `changeOps` | 1 | 1 |
| `changesetLogicalBytes` | 300 | 300 |
| `affectedAddresses` | 1 | 1 |
| `ffiRequestBytes` | 199 | 423 |
| `ffiResponseBytes` | 532 | 532 |

All omitted locality counters are zero. These are deterministic structural
counters, not a claim that RKP-3 has completed official performance
qualification.

## Bounded stage review and repairs

The C9 operator review was intentionally stage-sized. It found and repaired:

1. an RKP-2 historical workspace assertion that incorrectly followed moving
   `HEAD` instead of its frozen technical/lifecycle anchors;
2. one forbidden broad Clippy allow, replaced by moving the test module after
   production items; and
3. the predecessor's exact explicit napi-macro count while preserving the
   runtime camelCase Stage-3 export.

Focused predecessor gates and the clean full suite passed after these repairs.
No remaining P0/P1/P2 blocker was found in this bounded review. This is not the
dedicated independent C10 review.

## Candidate-state assertions

- Exactly 36 tracked paths differ from reviewed planning, all in the literal
  C0-C9 allowlist.
- Protected inputs, frozen planning artifacts, oracle fixtures, and dependency
  manifests have zero unauthorized delta.
- `implementation_candidate_ready=true` records technical readiness only.
- `implementation_review`, acceptance, archive, RKP-4, qualification, cutover,
  and push remain pending or false.
