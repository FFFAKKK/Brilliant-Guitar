# Snapshot and Events

> **Later-stage replanning boundary:** K1-1 exposes no snapshot, selector, or
> event API. K1-3 is blocked until the K1-2 transaction boundary is approved.

The future read/notification system must preserve these boundaries:

- no caller receives a mutable ScoreDocument or write-back copy;
- selectors are pure reads over `brilliant-score-1` and do not create a second score truth;
- events describe committed facts and are absent for failed/rolled-back commands;
- event payloads use stable IDs/version correlation and never expose internal deltas or mutable documents;
- handler failure is isolated and synchronous write reentrancy is forbidden;
- playback tick/cursor, layout coordinates, UI selection, and Guitar UI state remain external service events;
- Core preserves unknown ExtensionBlock data but does not interpret domain payloads in generic selectors.

The product-level replanning gate is `.trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-014-kernel-snapshot-events.md`. Concrete APIs and codes require K1-3 review.
