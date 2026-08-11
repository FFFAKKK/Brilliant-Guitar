# CVN-5 Range Operations and Explicit Atomic Batch

## 1. Decision and lifecycle

CVN-5 is the final Core command-surface child. It adds two range commands and one explicit atomic batch command after CVN-6 has been independently accepted and archived.

- Planning base: `d521a618e42c01077e8545d1c87e9b36e14d4bdb`.
- Task status: `planning`.
- Production implementation authorization: `false`.
- Dependency gate: **satisfied** by accepted source `8da50f9`, acceptance record `160674d` and archive `a0c1d6a` on this branch.
- This synchronized docs-only candidate awaits targeted independent planning rereview and separate user activation; no CVN-5 source or test edit has started.
- Primary ownership: `CVN-FC-080`, `CVN-FC-081`, `CVN-FC-082`, `CVN-FC-090`, `CVN-FC-091`, `CVN-FC-092`, `CVN-FC-093`, `CVN-FC-100`, `CVN-FC-101`, `CVN-FC-102`.
- CVN-FC-141 is the CVN-7-owned acceptance consumer for the batch matrix, not a second implementation owner.

## 2. Product outcome

After acceptance, the kernel can:

1. delete an inclusive measure, Part-measure or Voice-event range using the existing stable score addresses;
2. transpose all selected written pitches atomically while preserving accepted pitch semantics;
3. submit up to 100 raw Core and, in an integrated runtime, official-module semantic commands as one atomic transaction;
4. produce one adoption, one history entry and one aggregate committed event for an effective batch;
5. undo, redo and replay that aggregate transaction through the same frozen assembly and accepted semantic pipeline;
6. reject any child or final-candidate failure without observable state drift.

## 3. Required public command contracts

### CVN5-R001 — Exact command catalog additions

Add exactly these Core commands, all targeting `document`:

- `core.range.delete`;
- `core.range.transpose-written-pitch`;
- `core.transaction.batch`.

No other Core command ID is added. After accepted CVN-6 plus CVN-5, the fixed Core catalog and Registry command-descriptor count are exactly `28`.

### CVN5-R002 — Payload contracts

The public data contracts are:

```ts
export interface DeleteRangePayloadV1 {
  readonly range: ScoreRange;
}

export interface TransposeRangePayloadV1 {
  readonly range: ScoreRange;
  readonly transposition: Transposition;
}

export interface BatchCommandPayloadV1 {
  readonly commands: readonly [unknown, ...unknown[]];
}
```

All three payloads use exact-shape, descriptor-first decoding. Extra fields, accessors, sparse arrays, invalid prototypes, cyclic aliases and coercion hooks are rejected through the accepted failure model.

### CVN5-R003 — Export invariants

- Application runtime exports remain exactly `51` after accepted CVN-6; CVN-5 adds only type exports and command descriptors.
- Module SDK remains exactly `8` runtime exports and `34` type exports.
- CVN-2's nine-field contribution ABI, catalog compiler and installed-only catalog semantics remain exact.
- No runtime error class is added at the application root.

## 4. Common range requirements

### CVN5-R010 — Reuse the accepted range union

CVN-5 consumes the existing three-discriminant `ScoreRange` without adding or changing persisted address shapes:

- global measure range;
- Part-owned measure-content range;
- Voice-owned event range.

Reverse endpoints normalize to score traversal order. Endpoint lookup is performed against the current isolated candidate for each command.

### CVN5-R011 — Deterministic failures

- absent endpoint: `command.range-endpoint-not-found`;
- endpoints resolving to different required owners: `command.range-owner-mismatch`;
- malformed, incomparable or otherwise invalid selection: `command.invalid-range`.

The failure contains only the allowlisted stable address and reason fields defined by `CVN-FC-100..102`; no candidate document, callback value, stack, payload or assembly identity is exposed.

### CVN5-R012 — Canonical traversal and affected addresses

Traversal is `Measure -> Part -> Voice -> Event -> Note`, with each collection using the accepted document order. Affected-address facts are the concatenation of the existing primitive command facts in normalized traversal and child order, deduplicated by the full stable address tuple while retaining the first occurrence. Only effective changes contribute affected addresses.

## 5. Range delete requirements

### CVN5-R020 — Measure range

An inclusive global measure range removes each selected measure and matching Part measure contents using the existing `remove-measure-bundle` effect. The command must not leave a document with zero measures; that final candidate is rejected as `semantic.measure-required` with no state change.

### CVN5-R021 — Part-measure range

For each selected Part measure content, delete every contained Voice event using the existing `remove-event` effect. Preserve the Part measure content, Voice objects, Voice starts and Staff objects. A selection containing zero events is a no-op.

### CVN5-R022 — Voice-event range

Delete every selected event, including the notes owned by those events, through ordered existing `remove-event` effects. A non-empty selection is effective.

## 6. Range transpose requirements

### CVN5-R030 — Written-pitch-only transform

Select notes in canonical range order, skip rests, and call the accepted `transposeWrittenPitch` domain function. Use only the existing `replace-written-pitch` effect. Do not rewrite enharmonic spelling policy, sounding descriptors, document structure or extension data.

### CVN5-R031 — No-op and failure

- zero transposition or a selection containing zero notes is a no-op;
- the first failing note in canonical traversal rejects the whole command as `command.range-transform-invalid`;
- the failure includes that exact note address and exactly one accepted `PitchTranspositionErrorCode`: `written-pitch-invalid`, `transposition-component-invalid`, `derived-pitch-alter-out-of-range`, or `derived-pitch-octave-out-of-range`;
- the existing `transposeWrittenPitch` signature and result type stay exact; an internal adapter may construct the accepted `WrittenPitch` value after success.

## 7. Atomic batch requirements

### CVN5-R040 — Accepted input

`core.transaction.batch` accepts only a dense, non-empty tuple of `1..100` raw semantic child envelopes. It does not accept pre-resolved commands, effects, snapshots, history records, catalogs, assemblies, buses or gateways. A child batch is forbidden.

- empty: `command.batch-empty`;
- 101 children: `command.resource-limit-exceeded` with `limitKind: "batch-children"`, `limit: 100`, `actual: 101` before child traversal;
- sparse or malformed commands array: `command.invalid-envelope`;
- nested batch: wrapped child failure with inner `command.batch-nested`.

Core-only assembly accepts only Core children. Integrated assembly accepts Core children, official-module children, or a mixture, all through the same frozen private assembly identity.

### CVN5-R041 — Capture budgets

For accepted child counts, strict capture applies a global maximum depth of `64` and a global maximum of `1,048,576` own properties across the captured batch input. Decoding invokes no getters, Proxy traps beyond the accepted primordial inspection chain, iterator, coercion or user method.

### CVN5-R042 — One-candidate sequential execution

Children are routed, decoded, prepared and applied in zero-based index order against one isolated candidate. A later child resolves anchors and targets against changes made by earlier children. Intermediate candidate semantic invalidity is permitted; the final candidate is validated exactly once.

Each child effect sequence is ordered. Inverses are derived from the value visible immediately before that effect, then stored in global reverse child/effect order.

### CVN5-R043 — Final semantic pipeline

After all child effects are applied:

1. run Core semantic validation once;
2. recompute CVN-6 compatibility and availability once;
3. run applicable module validators once in frozen catalog order;
4. build the Core feature profile once;
5. run module classifiers once in frozen catalog order;
6. build canonical assessments, issues, compatibility facts and affected addresses once;
7. invoke the existing CVN-1 adoption/history/dirty/event owner once.

Child index orders preparation, effects, affected facts and child failure attribution. It does **not** create per-child public assessments. The final public `ScoreSupportResult` / `KernelCommandAssessment` is produced once from the final candidate: Core first, then frozen module catalog order.

### CVN5-R044 — Effective no-op rule

- if every child has zero effective effects, the outer command is a no-op;
- if at least one effective effect occurred but later effects restore the original document, the batch still commits because the transaction had an effective semantic sequence;
- a no-op still completes the final semantic, compatibility, validation, profile and classification pipeline, but has zero state/history/event delta.

### CVN5-R045 — Resource aggregation

Existing inclusive transaction caps remain:

- effective effects: `131,072`;
- canonical affected addresses: `131,072`;
- compatibility facts: `131,072`;
- callback issues and aggregate module issues: the accepted CVN-6 caps.

An effects or affected-addresses overflow is attributed to the lowest child index whose contribution first crosses the cap and is returned inside one `command.batch-child-rejected` wrapper. Exact-limit cases pass.

### CVN5-R046 — Child ownership remains local

Every official-module child retains the accepted CVN-6 source identity and may route only its own contribution command and produce only its accepted owned effect definitions/namespaces. The batch coordinator never reassigns a child to another contribution, grants cross-contribution effect access, or merges callback ownership. Cross-module composition is represented only by multiple sequential children in the outer Core-owned batch.

## 8. Failure priority and attribution

### CVN5-R050 — Global ordering closure

The accepted priority is:

1. cached availability preflight;
2. outer envelope/version/command/target;
3. outer batch exact shape, density, non-empty/count and global capture budgets;
4. child route/decode/prepare/effect in increasing child index;
5. final Core semantic validation;
6. final compatibility/availability and module validation;
7. Core profile and module classification;
8. canonical facts and aggregate resource checks;
9. version/history/event capacity;
10. internal coordinator failure.

Stage 3 performs only outer validation and global capture-budget checks. Nested-batch detection is a per-child route failure in stage 4, so the lowest failing child index wins.

### CVN5-R051 — Wrapper ownership

`command.batch-child-rejected` contains a zero-based `failedCommandIndex` and one allowlisted inner `KernelCommandFailure`. The failure graph has at most one wrapper; `command.batch-child-rejected` is never an inner failure.

Wrapped failures own child decode/version/unknown ID/target/owner/anchor/prepare/effect errors, nested batch, and the child that first crosses cumulative effect/affected limits. Outer availability, outer decoding/count/capture, final-candidate semantic/module/profile/facts/capacity and coordinator failures remain top-level.

### CVN5-R052 — Rejection atomicity

Every rejection preserves document identity/value, version, undo history, redo history, checkpoint, dirty state, cached availability and event sequence exactly. Handler/preparer/validator/classifier and subscriber call counts follow the stage at which rejection occurs.

## 9. Commit, event, undo/redo, replay and gateway

### CVN5-R060 — Commit and event

An effective batch produces one version increment, one history entry, clears the prior redo branch once, and emits one aggregate `core.document.committed` event plus the existing optional dirty event. It emits no child committed event. The aggregate event identity is `commandId: "core.transaction.batch"`, `source: { kind: "core" }`, including when module children are present. An all-no-op batch retains redo exactly.

### CVN5-R061 — History and undo/redo

History stores a deeply frozen detached outer semantic envelope plus private effective child segments, sources, forward effects and inverses; it stores no document snapshot. Undo/redo use stored effects without calling child decoders or preparers, then rerun final semantic/compatibility/validation/profile/classification/fact stages once and retain the outer batch identity.

### CVN5-R062 — Replay

- `replayCoreCommands` replays Core-only batches;
- accepted CVN-6 `replayKernelCommands` replays integrated Core/module/mixed batches;
- replay reroutes semantic child envelopes through the current compatible frozen assembly; stored effects are not replay input;
- outer replay `failedCommandIndex` is the replay-envelope index; an inner batch failure retains its own `failedCommandIndex` for the batch child;
- using another authentic catalog is not itself a failure; current routing or compatibility differences may deterministically reject without introducing a persisted assembly handle or fingerprint.

### CVN5-R063 — Gateway

The batch uses the existing `command:execute` capability and existing gateway method. No capability kind, gateway method or public `submitBatch` API is added.

## 10. Scope exclusions

CVN-5 excludes:

- reopening or changing accepted/archived CVN-6 implementation, review, acceptance or archive records;
- CVN-7 qualification scale, release benchmark and final product gate beyond bounded functional regressions;
- Guitar Domain, Persistence, Layout, Renderer, Playback, Export, Desktop Shell, Workbench, Editor Session and Product `Application Assembly`;
- public Extension Host, public visual/functional plugin platform and dynamic discover/install/unload/replace/hot-reload lifecycle;
- a new persistence schema, file format, public patch protocol, new effect kind, new Module SDK ABI or recursive batch;
- changes to the CVN-2 compiler/catalog, `module-sdk/**`, extension migration, score codec or persisted domain schema.

## 11. Acceptance criteria

- [x] CVN-6 is independently accepted and archived before `task.py start` or any source/test edit.
- [x] The three exact command IDs compile and the Core catalog/Registry descriptors equal `28`.
- [x] Application runtime export count is `51`; Module SDK is `8/34`; CVN-2 ABI delta is zero.
- [x] All three range discriminants, reverse endpoints, missing endpoints, owner mismatch and invalid-range behavior are proven.
- [x] Range delete and transpose use only accepted primitive effects and satisfy exact no-op/failure/affected-address rules.
- [x] Batch strict capture proves 0/1/100/101, sparse, accessor, Proxy, cyclic, deep and property-budget cases without observable callback side effects.
- [x] Core-only, integrated Core-only, module-only and mixed batches share one-candidate atomic semantics.
- [x] Lowest-child failure attribution, one-wrapper graph, global failure priority and exact cap boundaries are proven.
- [x] Final validators/classifiers run once in frozen order; no per-child assessment reruns occur.
- [x] Effective batch, semantic cancellation, all-no-op, rejection, undo, redo and replay meet exact state/event/history counts.
- [x] Existing Core-only factories, 25 accepted commands, CVN-6 integrated runtime, CVN-2 SDK/catalog, GD-0 public contracts and post-Core boundaries regress unchanged.
- [x] File allowlist, protected paths, privacy, forbidden dependency and rollback checks pass.
- [x] Typecheck, build, focused tests and full regression pass.
- [x] Independent technical review reports P0/P1/P2=`0/0/0`; acceptance and archive are separate later actions.

## 12. User benefit

This stage gives editing tools a single stable Core primitive for large musical selections and multi-command gestures. A user action such as deleting a passage, transposing a region, or applying an official-module operation together with Core edits either completes as one undoable step or leaves the score untouched. Plugin authors keep the same frozen contribution ABI, while hosts receive deterministic history, replay and diagnostics without learning internal Registry or effect mechanics.
