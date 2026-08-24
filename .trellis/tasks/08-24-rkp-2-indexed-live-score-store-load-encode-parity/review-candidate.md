# Review Candidate — RKP-2 Planning

## Recorded verdict

`PASS — P0/P1/P2=0/0/0` for exact technical planning head `625054ec78e6410e0fb6034ab0c8f60bbf110d08`.

The dedicated read-only auditor task `01a01e48-1934-77b0-821e-a8026cd9e5f7` recorded the final PASS after review cycles `6a349b6=0/5/1`, `f4ed2bc=0/1/0`, `135af27=0/0/1`, and `625054e=0/0/0`. This record does not start implementation, archive, push, run official qualification or create RKP-3.

## Bounded repair under rereview

1. The authority dependency graph now uses the complete consumer-to-dependency arrows, each labeled `depends on`, including Runtime/Session dependencies on Extension Protocol and the future Tauri-to-Session edge; Tauri remains out of RKP-2 implementation scope.
2. Atomic import has two explicit capacity phases. Foundation adds pathless workspace-internal `InternalCapacity`; the single allowlisted Contracts codec maps it to existing `bridge.internal`; Runtime capacity uses its private internal failure. The stable failure union remains 22.
3. Full export/encode/decode/encode round-trip is a test/differential acceptance proof, not a normal production publication prerequisite.
4. Empty-collection failure mapping is frozen per existing wire behavior: top-level measures/parts and notes use `invalid-value`; staves/voices and coverage/reference use `invalid-reference`.
5. The planning allowlist enumerates exactly 13 task files plus three Rust-parent files; no task-directory wildcard remains.
6. All slotmap evidence URLs are pinned to documentation version `1.1.1`.
7. Failure order is now codec/API/schema -> Foundation scratch capacity -> Foundation semantic -> Runtime store capacity/local checks -> created; the two reserve-fault matrices select exact existing `bridge.internal` and publish zero session/handle.

## Review focus

1. Planning base and accepted RKP-1 ancestry; sibling post-archive repair correctly blocks activation rather than planning.
2. One semantic truth/two representations and absence of retained ScoreDocument in the target Runtime.
3. Exact slotmap pin/features, typed-key privacy and arbitrary-iteration fence.
4. Document/entity global StableId uniqueness and strict separation from RuntimeHandle/MusicalLocation.
5. Complete scalar record/topology model, including non-entity PartMeasureContent.
6. Entity/owner/content/time/extension/reference indices and claimed complexity.
7. Exact Fraction/duration/time-range correctness without ticks/floats.
8. Two-phase Foundation-validation/Runtime-store pre-count and reserve, explicit internal-capacity mappings, followed by build/local checks/publication and zero-session rejection.
9. Deterministic full-validation order plus mapping into the unchanged 22 failures.
10. Canonical/lossless export, unknown extensions and index normalized parity.
11. Public `28/51/8/34/9`, two Node exports, TypeScript default and resource-cap freeze.
12. Literal 16-path planning allowlist, literal implementation allowlist, six reversible stages, protected paths and downstream RKP boundaries.
13. Stress evidence is a diagnostic liveness/linearity gate, not a weakened product performance budget.
14. Parent conflict integration rule preserves repair and RKP-2 child references.

## Evidence expected

- Trellis validations;
- JSON/JSONL parse and per-file unique paths;
- parent child occurrence exactly one;
- Markdown fence/diff check;
- protected production/test/config delta zero from `063b332d`;
- Rust and TypeScript gate outputs;
- explicit reproduction/attribution of any known RKP-1 post-archive baseline failures;
- docs-only changed-path list and clean worktree.
