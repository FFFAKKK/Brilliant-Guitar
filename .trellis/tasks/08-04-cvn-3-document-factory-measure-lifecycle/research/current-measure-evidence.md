# CVN-3 Current Factory / Measure Evidence

> Evidence date: 2026-08-04
> Worktree: `.worktrees/k1-6-core-kernel-integration-gate`
> Planning branch: `codex/cvn-3-document-factory-measure-lifecycle`
> Planning base: `d936d58195803ef938214948b21e89fe67939090` (`codex/cvn-1-command-transaction-registry-spine`)

## 1. Dependency decision

- CVN-1 is accepted and archived at `.trellis/tasks/archive/2026-08/08-04-cvn-1-command-transaction-registry-spine/`.
- The accepted CVN-1 runtime has one private execution assembly, one candidate/effect engine, one history owner, one replay path and one event path.
- Parent dependency graph permits CVN-3 immediately after CVN-1. CVN-2 additionally waits for GD-0 independent acceptance, so CVN-3 is the next dependency-satisfied child.
- CVN-3 remains Core-only. It consumes no Guitar contract and no official-module runtime.

## 2. Parent authority

The public and observable contract is already fixed by:

- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/feature-contract-matrix.md`
  - `CVN-FC-010`: strict unknown boundary and exact `64` / `1,048,576` input limits.
  - `CVN-FC-011`: committed/no-op/rejected/history/replay/event state rules.
  - `CVN-FC-020/021`: exact factory input and result unions.
  - `CVN-FC-030/031`: stable Measure anchor and move resolution.
  - `CVN-FC-041`: exactly four CVN-3 command IDs and targets.
  - `CVN-FC-050–053`: insert/remove/move/set-definition behavior.
  - `CVN-FC-100–102`: staged failure union, priority and privacy.
  - `CVN-FC-140/142`: minimum command and factory/structure acceptance sets.
- Parent `implement.md:123-139`: CVN-3 purpose, dependency, scope and exit gate.

Child planning may choose private file and effect names. It does not alter command IDs, targets, payloads, result discriminants, limits or state behavior.

## 3. Persisted model evidence

`src/core-kernel/domain/score-document.ts` currently defines:

- `ScoreDocument.measureDefinitions` as the global ordered Measure definition list (`:16-23`).
- `MeasureDefinition` as `{ id, meter, pickupDuration? }` (`:35-39`).
- each `Part.measureContents` as its Measure content list (`:41-47`).
- `PartMeasureContent` as `{ measureId, voices }` (`:65-68`).
- `Voice` as `{ id, defaultStaffId, sequence }` (`:70-74`).
- `MusicSequence` and nested Event/Note aggregates (`:76-100`).

No schema field is missing for CVN-3. `brilliant-score-1` remains sufficient; no migration or persisted version change is required.

## 4. Existing semantic and profile behavior

`src/core-kernel/validation/validate-score-semantics.ts` already provides the final Core checks CVN-3 needs:

- at least one Measure and Measure ID registration (`:94-105`);
- meter and pickup validity (`:107-145`);
- global ID uniqueness (`:54-68`);
- Voice/Event staff ownership (`:149-190`, `:207-222`);
- sequence start/end bounds against the owning Measure (`:224-294`);
- per-Part coverage duplicate/missing checks and nonempty Voices (`:333-374`);
- extension owner/payload preservation checks (`:381-434`);
- fixed whole-document validation order (`:437-461`).

`src/core-kernel/profiles/score-feature-profile.ts` keeps semantic validity separate from product-profile support. A valid multi-Part document, non-4/4 meter, pickup or incomplete sequence may return `unsupported` and still be created/committed (`:108-259`). CVN-3 must preserve that separation.

## 5. Accepted CVN-1 execution spine

### Catalog and contracts

- `src/core-kernel/commands/catalog.ts:1-26` contains the accepted six-command order.
- `src/core-kernel/commands/contracts.ts:15-109` owns stable targets, envelopes and failures.
- `src/core-kernel/commands/execution-assembly.ts:37-76` verifies a complete, unique, target-matching frozen default assembly.

### Decode and prepare

- `src/core-kernel/commands/strict-codec.ts:21-71` fixes outer-envelope failure priority and routes to one adapter.
- `src/core-kernel/commands/core-command-adapters.ts:40-61` defines adapter decode/prepare results.
- current exact-record and dense-array helpers are descriptor-first (`core-command-adapters.ts:63-127`) but carry no VNext graph depth/property budget.

### Effects and inverse

- `src/core-kernel/commands/effects.ts:15-41` currently has five private V1 effects.
- `applyCoreEffectSet` clones one candidate, derives an inverse against the evolving candidate, applies in order and reverses the inverse list (`effects.ts:274-307`).
- No whole-document effect exists. CVN-3 can extend the private union with narrow Measure structural effects.

### State/history/replay/event

- `src/core-kernel/commands/runtime.ts:185-263` decodes, prepares, applies, semantically validates and adopts one submit atomically.
- no-op preserves state (`runtime.ts:207-216`).
- undo/redo apply stored inverse/forward effects and revalidate (`runtime.ts:278-347`).
- `src/core-kernel/events/facts.ts:4-13` publishes the ordered addresses prepared by the command adapter rather than rediscovering mutations.
- `src/core-kernel/events/runtime.ts:34-81` emits one committed event plus a dirty transition when needed.

## 6. Registry, reports and public surface

- `src/core-kernel/registry/builtins.ts:22-29` has a title-key allowlist that must gain the four exact Measure IDs.
- Registry command descriptors are generated from the default execution assembly (`builtins.ts:147-163`), so the accepted Registry summary will intentionally grow from six to ten Core commands.
- `src/core-kernel/reports/strict-codec.ts:81-97,372-396` has a closed `CommandFailure` decoder. New `anchor-self-reference` and resource-limit failures require explicit decoding.
- `src/core-kernel/reports/adapters.ts:152-185` maps command failures to privacy-safe issues. Resource limit details need an allowlisted `{ limitKind, limit, actual }` mapping.
- `src/core-kernel/index.ts:17-100` is the public root. CVN-3 adds one runtime export, `createScoreDocument`, while factory and command types are type-only exports.

## 7. Existing regression fixtures affected by additive growth

- `test/core-kernel/fixtures/cvn-1-characterization.expected.json` freezes the accepted CVN-1 trace, including 48 runtime exports, six catalog entries and six Registry command descriptors.
- `test/core-kernel/fixtures/cvn-1-characterization.ts:611-649` currently collects the complete live export/catalog surface, so an additive CVN-3 feature would otherwise invalidate a behavior-preserving trace for an expected reason.
- The CVN-1 expected JSON remains immutable. The CVN-3 characterization step must project the live trace to the original 48-name/six-command allowlists, then separately assert the additive 49-name/ten-command CVN-3 surface.
- Accepted CVN-1 evidence before this child: 193 full tests, 19 command-internal tests and trace SHA-256 `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`.

## 8. Design gaps this child must close

1. There is no public deterministic document factory.
2. There are no Measure lifecycle commands.
3. The current private effect union has no synchronized global/per-Part structural effect.
4. The current V1 command decoder has no VNext depth/property resource accounting.
5. The semantic validator checks per-Part coverage but does not require `measureContents` order to match `measureDefinitions`; CVN-3 operations therefore need deterministic normalization plus exact inverse restoration for an already-valid shuffled document.
6. Registry title keys, report failure decoding and issue mapping are closed allowlists that must grow with the command contract.
7. Public API/catalog/Registry characterization must distinguish intentional additive growth from regression in the original six commands.

## 9. Fixed conclusions for the operator

- Use the accepted single `CommandBus.submit(unknown)` path for all four commands.
- Implement `createScoreDocument` as a pure function outside an active bus.
- Append exactly four IDs; preserve the first six entries and their behavior.
- Use stable IDs and `start | after-measure`; no index, tick, before-anchor, patch or whole-document write surface.
- Keep factory/command boundary capture private and bounded; accepted values are detached before typed decoding.
- Keep Measure structural effects private; history stores forward/inverse effects, not document snapshots.
- Normalize Part contents into global Measure order after a changed insert/remove/move and restore any pre-command order exactly on undo.
- Preserve Score/Part extension blocks byte-for-data/deep-value; Measure deletion does not edit them.
- Treat semantic-valid/profile-unsupported results as successful creation/commit.
- Record all new observable facts in tests before declaring an implementation review candidate.
