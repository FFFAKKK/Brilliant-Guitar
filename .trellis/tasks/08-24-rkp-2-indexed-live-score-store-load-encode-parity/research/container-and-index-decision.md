# Container and Index Decision

## Decision summary

| Concern | RKP-2 decision |
|---|---|
| Entity arenas | `slotmap` 1.1.1 standard `SlotMap` |
| Key typing | `new_key_type!`, one private type per record kind |
| Serialization | no slotmap serde feature; keys never serialized |
| Entity lookup | `HashMap<StableId, RuntimeEntityRef>`; iteration never observed |
| Topology/order | explicit Vec order graph preserving DTO arrays |
| Part/Measure content | typed HashMap key to non-entity content record |
| Voice time | sorted compact Vec of exact interval entries, binary search |
| Extension lookup | `(namespace, owner) -> ordered private handles` |
| References | target StableId -> canonical Core referrer addresses |
| Parity | independently rebuild derived indices over same records/topology and compare stable projection |

## Source evidence

Primary Rust documentation records that slotmap 1.1.1 provides versioned keys, average O(1) insert/delete/access, distinct key types through `new_key_type!`, and fallible `try_reserve`; it also states that SlotMap iteration order is arbitrary. That last property is treated as a design fence rather than ignored.

- https://docs.rs/crate/slotmap/latest
- https://docs.rs/slotmap/latest/slotmap/struct.SlotMap.html
- https://docs.rs/slotmap/latest/slotmap/macro.new_key_type.html
- https://docs.rs/crate/slotmap/latest/features

The project pins exactly 1.1.1. Its documented MSRV is below the project's 1.88.0. The permissive library license is compatible with later open-source distribution review; legal/NOTICE packaging remains a product release task.

## Why standard SlotMap

- stable typed keys survive internal value movement;
- generation invalidates a removed key;
- standard SlotMap avoids dense-value relocation concerns and requires no observed iteration;
- fallible reservation supports atomic private construction;
- its key representation stays private and feature configuration excludes serialization.

## Why explicit topology

Arena iteration is neither score order nor persistence order. The DTO already defines semantic sequence. Storing that sequence explicitly gives deterministic encode and stable future mutation anchors without sorting IDs or relying on allocation.

Primary scalar records plus topology are the accepted store state. Entity/ownership/time/extension/reference structures are derived accelerators and therefore independently rebuildable.

## Why sorted Vec for Voice time

A Voice is scoped to one PartMeasureContent. Its events are already sequential and non-overlapping after validation. One compact vector:

- builds in one pass;
- reserves exactly;
- produces deterministic cache-friendly traversal;
- supports lower-bound O(log n) and result scan O(k);
- updates only the affected Voice suffix in RKP-3;
- avoids per-entry tree allocation during atomic import.

The key is exact Fraction, not tick or floating point. Each entry stores start, end, semantic ordinal and EventHandle. Returned results are ordered by semantic ordinal for equal starts.

## HashMap determinism fence

HashMap is used for average-O(1) private lookup only. Rules:

1. no public value is formed by iterating a HashMap;
2. validation paths derive from DTO/topology traversal;
3. encode walks explicit vectors;
4. parity projections sort by stable semantic keys;
5. lookup tests vary ID insertion/hash layout and expect identical bytes/results.

## Identity decision

`StableId` stays persistence identity. Slotmap keys stay session identity. Exact Fraction stays musical location. Combining them was rejected because reload, compaction, stale generation, deterministic file bytes and plugin contracts have different lifetimes.

## Reference scope

Only Core-declared references enter RKP-2. Extension payload is bounded opaque JSON; string values are not guessed to be entity references. Protocol-declared references enter later with a versioned schema owner.

## Change trigger

Changing the container, slotmap version/features, time-index representation, identity split, reference scope or public-order fence requires a bounded planning rereview before implementation proceeds.
