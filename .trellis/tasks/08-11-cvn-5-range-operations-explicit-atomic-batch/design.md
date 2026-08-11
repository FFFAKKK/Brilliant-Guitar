# CVN-5 Technical Design

## 1. Authority and non-authority

This document is a planning candidate for `CVN-FC-080..102`. It does not authorize implementation. Accepted Core V1/CVN-0..4 contracts and the eventual accepted CVN-6 runtime are inputs; this task does not redesign them.

Authority order for implementation is:

1. accepted active Core Kernel specs;
2. parent feature-contract matrix as clarified by this candidate;
3. this PRD and design after independent planning acceptance;
4. implementation plan and file/test matrix;
5. current source only as evidence of the accepted baseline.

If accepted CVN-6 differs from this planning base, the operator first rebases the task onto the CVN-6 acceptance/archive line and reruns a contract-delta audit. Any material API, failure, stage or file-ownership delta returns to planning review.

## 2. Boundary map

```text
public semantic envelope
        |
        v
accepted CVN-1 CommandBus / CVN-6 integrated runtime
        |
        +-- range adapter ------> existing primitive effects
        |
        +-- batch coordinator --> child route/prepare/apply on one candidate
                                      |
                                      v
                         final Core + CVN-6 semantic pipeline
                                      |
                                      v
                       existing CVN-1 adoption/history/event owner
```

- Range adapters own selection normalization and conversion to existing primitive effects.
- The batch coordinator owns only outer capture, sequential child coordination, aggregate caps/failure attribution and final adoption request.
- Existing command adapters and official-module handlers continue to own their child semantic operations.
- CVN-1 remains the sole document/version/history/checkpoint/dirty/event owner.
- CVN-6 remains the sole integrated catalog/inventory/assembly/availability/validator/classifier owner.
- Post-Core Product `Application Assembly` is unrelated to this private kernel execution assembly.

## 3. Public type surface

The only new public data types are the three payload interfaces in the PRD plus any named failure members already assigned by the parent matrix. No new public runtime function, class, Registry surface, capability or effect definition is introduced.

The three descriptors are added to the exact Core catalog and Registry built-ins. Their target is `document`, mutation is `write`, and capability is the existing `command:execute`.

Compile-time gates compare:

- application runtime names before/after CVN-5: exact equality at `51`;
- Module SDK runtime/type names: exact `8/34` equality;
- CVN-2 contribution keys: exact nine-field equality;
- Core command IDs: previous accepted 25 plus exactly the three CVN-5 IDs;
- Registry descriptors: one exact descriptor per Core command ID.

## 4. Range selection model

### 4.1 Resolver

Create one private range resolver in the command layer. It accepts an immutable current candidate and captured `ScoreRange`, resolves both endpoints, normalizes their order and returns a detached ordered selection. It must not mutate, call public snapshot APIs through aliases, or invent a fourth range kind.

The resolver's order is the accepted score order:

1. measure index;
2. Part index;
3. Voice index;
4. event index;
5. note index.

Its tests cross-check every returned stable address against the accepted `selectScoreRange` read behavior. A mismatch is a planning/implementation defect, not permission to change the public selector.

### 4.2 Owner rules

- measure ranges require both measure endpoints to resolve globally;
- Part-measure ranges require the same `partId` and both measure contents to exist;
- Voice-event ranges require the same `partId`, measure content and `voiceId`, and both events to exist in that Voice;
- a missing object is endpoint-not-found; a present endpoint under another required owner is owner-mismatch; malformed shape/order is invalid-range.

### 4.3 Effect expansion

Range commands expand to the existing private effect categories only:

| Range operation | Expansion |
|---|---|
| delete global measures | ordered `remove-measure-bundle` effects |
| delete Part-measure contents | ordered `remove-event` effects for every selected Voice event |
| delete Voice-event range | ordered `remove-event` effects |
| transpose notes | ordered `replace-written-pitch` effects |

The effect engine derives inverses from the candidate value immediately before each effect. Selection order is forward score order; inverses are stored in reverse effect order.

## 5. Batch input model

### 5.1 Outer strict capture

The outer command uses the existing primordial strict-capture utilities. Before reading children it validates:

1. outer semantic envelope exact shape/version/ID/target;
2. payload exact shape;
3. `commands` is a dense ordinary array;
4. count is non-zero and at most 100;
5. the globally captured graph stays within depth 64 and 1,048,576 own properties.

Count `101` is known without traversing child values and wins over child failures. Sparse arrays are rejected before index traversal. For counts `1..100`, children are captured as opaque raw semantic envelopes; their semantic fields are inspected only at their own stage.

### 5.2 Child input

At child index `i`, the coordinator invokes the current assembly route on the captured raw child. Nested `core.transaction.batch` is rejected before its payload decoder runs. A module child must resolve through the authentic accepted CVN-6 catalog/assembly. No child receives the coordinator, catalog, bus, gateway, candidate mutator or history owner.

## 6. Coordinator state machine

```text
availability-preflight
  -> outer-strict-capture
  -> clone-current-document-once
  -> for child i = 0..n-1
       route current assembly
       decode child target/payload
       prepare ordered forward effects
       enforce child contract + cumulative effect budget
       apply to same candidate, deriving inverses
       append effective segment + raw semantic envelope
  -> final Core semantic validation once
  -> CVN-6 compatibility/availability once
  -> applicable validators once in catalog order
  -> Core profile once
  -> classifiers once in catalog order
  -> canonical issues/facts/affected addresses once
  -> CVN-1 adoption once, or no-op return
```

The coordinator keeps private temporary state only:

```ts
interface BatchEffectiveSegment {
  readonly childIndex: number;
  readonly source: KernelCommandIdentity["source"];
  readonly envelope: CapturedSemanticCommandEnvelope;
  readonly forwardEffects: readonly OwnedKernelEffect[];
  readonly inverseEffects: readonly OwnedKernelEffect[];
  readonly affectedAddresses: readonly StableScoreAddress[];
}
```

This is illustrative private shape, not a public or persisted contract. The implementation reuses accepted CVN-6 owned effect definitions and must not widen them.

## 7. Intermediate versus final validation

Child effect application performs effect-local contract and address checks but deliberately defers whole-document semantic validation. This permits sequences such as remove-then-recreate that are invalid between children but valid at the outer commit boundary.

After the last child, one final pass runs. This resolves the parent wording ambiguity:

- child index orders child work and attribution;
- the final public assessment is not a list of per-child assessments;
- Core assessment is produced once, then module assessment contributions are produced once in frozen catalog order;
- validators and classifiers never rerun for each child.

If final validation rejects, every temporary candidate/effect/issue object is discarded and the active session remains byte-for-byte observationally equal.

## 8. Failure model

### 8.1 Outer failures

Outer failures are availability, outer envelope/version/ID/target, outer exact shape/count/capture, final Core or module semantics, final profile/classification/facts, adoption capacity and internal coordinator errors.

### 8.2 Child wrapper

The only wrapper is:

```ts
{
  readonly code: "command.batch-child-rejected";
  readonly failedCommandIndex: number;
  readonly failure: Exclude<KernelCommandFailure,
    { readonly code: "command.batch-child-rejected" }>;
}
```

The concrete source type may express the exclusion differently, but runtime recursion is forbidden and public decode rejects a nested wrapper. Child failures include route/decode/version/ID/target/owner/anchor/preparer/effect-contract/nested-batch and cumulative effects/affected overflow.

### 8.3 Priority

Cached read-only/incompatible availability runs before any input reflection. Outer shape/count/capture runs before child traversal. For child-local errors, the lowest index reached by normal sequential execution wins. Nested detection is child-local, not a global pre-scan. Final-candidate failures occur only after every child effect sequence has applied successfully.

### 8.4 Privacy

Public failures may expose only stable code, child index, allowed limit data, allowed range address and pitch reason fields, and accepted module/contribution identifiers where already required. They exclude payloads, effects, candidate documents, callback results, stack/error text, private assembly identity, capability tokens and mutable aliases.

## 9. Caps and canonical aggregation

- Batch children: inclusive `100`.
- Effects: inclusive `131072` across effective child segments.
- Affected addresses: inclusive `131072` after stable full-tuple deduplication.
- Compatibility facts and module issues: accepted CVN-6 limits and ordering.
- Capture depth/properties: `64` / `1048576` globally for the outer captured input.

Affected addresses are concatenated by child index, then primitive effect fact order. Deduplication retains the first complete stable tuple. Compatibility facts and final assessment retain accepted CVN-6 canonical order and are not prefixed by child index.

## 10. Commit and history representation

The batch submits one adoption request to the accepted session owner. An effective batch increments version once, clears redo as one operation, creates one history entry and emits one aggregate committed event plus optional dirty event.

The history entry stores:

- a detached frozen copy of the outer semantic envelope;
- private effective child segments in original order;
- forward effects in child/effect order;
- inverses in global reverse child/effect order;
- aggregate affected addresses and outer Core identity.

It stores no before/after document snapshot, bus, catalog, assembly identity, callback or provider reference.

Undo/redo use stored owned effects and do not rerun child decoding or preparation. They do rerun the final semantic/CVN-6 pipeline once before adoption, preserving the outer command identity in events.

## 11. Replay model

Replay takes the stored/public semantic envelope, not the history effects. The batch coordinator reroutes each child through the replay assembly. Core-only replay rejects module children through existing route failure. Integrated replay supports mixed children when the current accepted catalog/inventory is compatible.

Replay failure nesting is two-dimensional but not recursive:

- replay result `failedCommandIndex`: outer envelope index in the replay list;
- `command.batch-child-rejected.failedCommandIndex`: child index within that one batch.

No persisted assembly fingerprint is introduced. A legitimate new assembly is evaluated by current route and compatibility rules.

## 12. Gateway and event model

The gateway invokes the outer descriptor with existing `command:execute`. Child capability checks occur through existing child routing; there is no capability union or batch bypass. The event source is always Core for the outer batch. Child module sources remain private history/effect ownership metadata and do not produce child committed events.

Subscriber exceptions remain isolated after commit. They cannot roll back the already adopted transaction or cause a second event.

## 13. File ownership

Planning-only files are listed in the task metadata. Future implementation may modify only the allowlist in `research/cvn5-file-and-test-ownership-matrix.md`. Key fences:

- no `module-sdk/**` changes;
- no CVN-2 catalog compiler or `registry/domain-catalog.ts` changes;
- no persisted codec/schema or migration changes;
- no product/Guitar/UI/service code;
- no accepted CVN-6 contract redesign;
- any additional production file returns to planning review before edit.

## 14. Compatibility and rollback

Core-only construction remains valid and unchanged. Integrated construction continues to bind one authentic catalog and known-requirement inventory. The new command descriptors are additive and deterministic; old semantic envelopes retain behavior.

Rollback is commit-bounded:

1. remove CVN-5 descriptors and public types;
2. remove range adapters and batch coordinator;
3. remove CVN-5 tests/spec projections;
4. rerun the accepted CVN-6 full suite and export/catalog characterization.

Rollback must not modify accepted CVN-6, CVN-2, persisted schemas or post-Core plans.

## 15. Rejected alternatives

- **Public patch/effect API:** leaks internal mutation ownership and freezes implementation details.
- **Per-child transaction commit:** breaks atomicity, undo and one-event semantics.
- **Validate after every child:** prevents legitimate intermediate states and contradicts the accepted batch contract.
- **Snapshot-based history:** duplicates document state and bypasses existing effect ownership.
- **Recursive batches:** complicates limits, failure graphs and replay without a V1 need.
- **New batch capability:** duplicates `command:execute` without an authorization distinction.
- **Changing `ScoreRange`:** would widen persisted/public address semantics outside CVN-5.
