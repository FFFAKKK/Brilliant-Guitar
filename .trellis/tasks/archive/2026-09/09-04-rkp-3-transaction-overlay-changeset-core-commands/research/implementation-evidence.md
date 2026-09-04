# RKP-3 Implementation Evidence

## Evidence boundary

This evidence qualifies the private RKP-3 transaction candidate only. It does
not claim owner acceptance, archive, RKP-4 readiness, official Qualification
V2, default-runtime cutover, plugin migration, support readiness, or push.

- Accepted RKP-2 base:
  `6d0956c970f4414cb61e0f3d7148672a6e635032`.
- Reviewed planning authority:
  `78660bb63e249f7bbfec848b9b19e16d7dc55c25`.
- Initial C9 technical source:
  `0861f40b90599aa48a9859d385590175f8af2bbd`.
- Post-C10 repair technical source:
  `3ca82f1fcf68070e6c775d0848839864dbc87c71`.
- Post-C10 repair technical source tree:
  `327ab84bb7c355e560c6cb4071d04a5e473e4b3a`.
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
| Rust 1.97.1 workspace test, all targets, locked | 137 passed, 1 ignored, 0 failed |
| Rust 1.97.1 workspace Clippy, `-D warnings` | pass |
| Rust 1.88.0 workspace check, all targets, locked | pass |
| TypeScript typecheck | pass |
| TypeScript build | pass |
| RKP-1 real Node bridge | 9/9 |
| RKP-1 workspace contracts | 6/6 |
| RKP-2 workspace plus native parity | 19/19 |
| RKP-3 workspace, native transaction, and oracle | 20/20 |
| Clean full suite | 631 discovered, 629 passed, 0 failed, 2 intentional skips, 84.852 s |

The two full-suite skips are the pre-existing GC-sensitive lane without its
explicit runner flag and the Stage-6 E2 stress journey requiring separate
authorization. Neither is an RKP-3 failure.

## Frozen bytes

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| source and staged native addon | 5,020,672 | `970d8987076786d50dfea6b5c4969ad3d16a5a043741eeba3bf1daa85da72002` |
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

## C10 direct implementation review and repair

C10 stayed inside the six frozen review topics and did not reopen the whole
project. It found one P2 defect in `KernelSession::submit_stage3`: dispatched
failures already returned attempted-work metrics, but failures from
`transaction.finish()` and `commit_stage3_transaction()` replaced that
evidence with `KernelStage3MetricsV1::default()`.

Repair commit `3ca82f1fcf68070e6c775d0848839864dbc87c71` exposes the prepared transaction's
detached attempt metrics, preserves them across both failure exits, and adds a
regression in which a batch temporarily removes all measures and then ends
without repairing the final invariant. The regression proves nonzero
`changeOps` and `changesetLogicalBytes`, unchanged document bytes, unchanged
version, and all four global-work counters at zero.

Post-repair results are Rust workspace `137 passed / 1 ignored / 0 failed`,
RKP-1 `9/9` plus `6/6`, RKP-2 `19/19`, RKP-3 `20/20`, and the clean full suite
`631 discovered / 629 passed / 0 failed / 2 intentional skips`. Direct
targeted rereview leaves P0/P1/P2 at `0/0/0`. The review was performed inline
under the active execution mode and is not mislabeled as a separate-session
independent review.

## Candidate-state assertions

- Exactly 36 tracked paths differ from reviewed planning, all in the literal
  C0-C9 allowlist.
- Protected inputs, frozen planning artifacts, oracle fixtures, and dependency
  manifests have zero unauthorized delta.
- `implementation_candidate_ready=true` records technical readiness only.
- `implementation_review` is technically passed after the bounded C10 repair.
- Owner acceptance, archive, RKP-4, qualification, cutover, and push remain
  pending or false.

## Owner acceptance and archive closeout — 2026-09-04

After the explicit next step was stated as accepting and archiving RKP-3 plus
synchronizing the parent, the owner replied `那继续吧`. This accepts audited
technical source `3ca82f1fcf68070e6c775d0848839864dbc87c71` and authorizes
only the native RKP-3 archive and parent lifecycle projection.

Archive-compatibility commit `560fd89d32026cdc41c3cf0df65285e99e015456`
adds exact active/archive root resolution and a 13-file task manifest. On that
clean commit, typecheck and build passed, the focused workspace contract passed
`7/7`, and the full suite passed `632 discovered / 630 passed / 0 failed / 2
intentional skips`. The archived authority root is
`.trellis/tasks/archive/2026-09/09-04-rkp-3-transaction-overlay-changeset-core-commands`.

RKP-4 planning, qualification, runtime cutover, and push remain unauthorized;
TypeScript remains the default runtime.
