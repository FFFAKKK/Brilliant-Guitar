# Root Cause and Counter Write Map

## Verdict

The independent root-cause audit found P0/P1/P2=`0/1/0`. The P1 is a planning/allowlist gap: current S6.2 cannot collect its required private Runtime evidence using only the three authorized TypeScript paths. It is not evidence that the production Store violates its complexity contract.

The first independent planning audit of candidate `df686882efa30f489da138d2730acbdd4fb9cd30` returned P0/P1/P2=`0/2/0`: planning authority was incorrectly mutable during implementation, and private libtest/worker/protocol choices were incomplete. This bounded repair closes those planning findings; targeted independent planning rereview remains pending.

## Source findings at `4a302bc9f9981940336fc97941b08e09bd0d1f67`

`Rkp2StoreMetrics` is declared in `crates/brilliant-kernel-runtime/src/indices.rs`. Existing checked write sites cover ten categories:

| Evidence category | Existing owner/write behavior |
| --- | --- |
| entities visited | Runtime import traversal increments with checked arithmetic |
| primary records | Store import counts typed SlotMap records |
| topology edges | Store topology construction counts canonical edges |
| reference edges | reference index construction increments per accepted Core edge |
| time entries | voice time-index construction increments per Event interval |
| index entries | derived index builders count their accepted entries |
| entity lookup | direct entity lookup increments its private counter |
| owner lookup | direct owner lookup increments its private counter |
| time comparisons | exact binary query increments comparisons |
| rebuild entries | `rebuild_indices_from_store` counts fresh derived entries |

Two fields have no non-zero write site: `full_document_materializations` and `canonical_encode_bytes`. Existing tests assert zero for both because ordinary import/index/query does not materialize or encode a whole document. S6.2 explicitly asks the evidence journey to export once and encode once, so those values belong to a local test record rather than persistent Store metrics.

`LiveScoreStore::verify_index_parity` is private and has no Node/DTO surface. Adding a public bridge only for measurement would expand product architecture. A `cfg(test)` libtest is the narrow owner.

## Exact write-map decision

The test seam copies/composes existing metrics after successful operations. It then sets exactly two local fields:

1. after one successful `export_document`, local `full_document_materializations=1`;
2. after one successful `canonical_score_bytes`, local `canonical_encode_bytes=encoded.len()`.

No interior mutable field, global accumulator or Store/Runtime mutation is introduced.

## Read-side lookup proof

The exact probe stable ID is `cvn7-e-00-0000-0-0`.

1. Construct `StableId::new("cvn7-e-00-0000-0-0")`, copy `entity_before=store.metrics`, call the real `store.lookup_entity(&stable_id)`, then copy `entity_after=store.metrics`. Require `RuntimeEntityRef::Event`, `entity_index_lookups` delta exactly `1`, and every other metrics delta `0`.
2. Create `owner_probe_metrics=Rkp2StoreMetrics::default()` and call `store.indices.lookup_owner(entity, &mut owner_probe_metrics)` directly. Require Voice owner `cvn7-v-00-0000-0`, `owner_index_lookups=1`, and every other field `0`.
3. Emit separate `entityProbe` and `ownerProbe` records. Do not call `LiveScoreStore::lookup_owner`; it performs another entity lookup and would confound the read proof. Neither probe is added to import/rebuild totals.
4. Report probe deltas separately; import and rebuild totals remain the frozen values.

## Classification guard

This task proves that the evidence path can observe the accepted algorithms. It does not establish an RKP-7 latency/RSS budget, run RKP-9 Qualification V2, or alter the prior conclusion about production complexity.
