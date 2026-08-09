# Current Core Constraints for GD-0

> Read-only research captured on 2026-07-28 from planning base `064dc2bffe26022bc58f0690986b09a0c6a257aa`.

## Qualification Baseline

- Pure Core Kernel V1 is closed.
- Qualification is archived at `.trellis/tasks/archive/2026-07/07-26-core-kernel-v1-qualification-gate/`.
- Qualification result: 169/169 tests, 25 covered contract groups, zero coverage gaps, zero reproducible bugs, one nonblocking P3 guard-contract gap.
- Accepted follow-up for public `unknown` guards: descriptor-first, no-getter, no-throw.

## Existing Command and History Shape

Evidence:

- `src/core-kernel/commands/mutations.ts`
- `src/core-kernel/commands/runtime.ts`
- `src/core-kernel/commands/strict-codec.ts`

Findings:

- `CoreMutation` is a private closed union for metadata replacement, `WrittenPitch` replacement, `NoteValue` replacement, event insertion, and event removal.
- `prepareCommandMutation()` returns one forward and one inverse mutation.
- `HistoryEntry` stores one `CoreCommandEnvelope`, one forward mutation, and one inverse mutation.
- `submitCommand()` decodes only the six Core commands, applies one mutation to a candidate, runs Core validation, and commits one history entry.
- Undo and redo apply exactly one inverse/forward mutation and rerun Core semantic/profile validation.

GD-0 implication: an atomic Core-plus-Guitar edit cannot be represented by the current single-mutation history contract. The design needs a private atomic effect set or equivalent domain-neutral transaction plan. Existing Core commands should become one-effect transactions without changing their external behavior.

## Existing Session, Dirty, and Event Shape

Evidence:

- `src/core-kernel/session/runtime.ts`
- `src/core-kernel/events/contracts.ts`
- `src/core-kernel/events/facts.ts`

Findings:

- One session owns command state, read state, dirty/checkpoint state, and event sequencing.
- Only committed transitions derive checkpoint/dirty/event changes.
- `KernelEvent.commandId` is typed as `CoreCommandId`.
- Affected-entity derivation switches over the closed set of Core command IDs.

GD-0 implication: installed domain commands require a stable domain-neutral command identity and deterministic affected-entity facts, but must continue through the same post-commit event sequence. A second domain event bus would violate the approved product direction.

## Existing Registry and Gateway Shape

Evidence:

- `src/core-kernel/registry/contracts.ts`
- `src/core-kernel/registry/builtins.ts`
- `src/core-kernel/registry/runtime.ts`

Findings:

- Registration entry IDs are closed to `core.commands.v1` and `core.selectors.v1`.
- Compiled contributions already exist as an internal startup pattern, but only for fixed Core built-ins.
- The public registry factory installs fixed built-ins.
- `KernelModuleGateway.submit(input)` decodes through `decodeCoreCommand` before resolving a compiled Core command contribution.

GD-0 implication: Guitar commands cannot be added solely inside the Guitar package under current public contracts. Core V1.1 needs an explicit additive, domain-neutral, startup-frozen contribution seam. It must not become general runtime registration or arbitrary plugin execution.

## Existing Domain and Extension Boundaries

Evidence:

- `src/core-kernel/domain/extensions.ts`
- `src/core-kernel/domain/pitch.ts`
- `.trellis/tasks/06-29-commercial-guitar-tablature-product/design.md`
- `.trellis/tasks/06-29-commercial-guitar-tablature-product/implement.md`
- `.trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-005-guitar-techniques.md`

Findings:

- Core persists Part-owned extension blocks and preserves unknown extension payloads.
- Product planning requires tuning, note placement, and techniques to live in a Part-owned `GuitarExtension`, never in Core `Note`, `Event`, or metadata.
- `SPEC-005` remains blocked until a dedicated Guitar Domain task defines namespace, payloads, IDs, references, and validation.
- Public `isWrittenPitch`, `isTransposition`, and `isJsonValue` behavior is not yet specified and covered as uniformly descriptor-first/no-getter/no-throw.

GD-0 implication: the transaction seam needs a domain-neutral extension-owned effect while keeping extension schema and semantic knowledge outside Core. The public hostile-input guard contract is a prerequisite, not an unrelated cleanup.

## Contract Gaps GD-0 Must Resolve

1. How callers submit Core and installed domain commands through the public API.
2. How a frozen contribution supplies strict decoding, target/ownership resolution, deterministic effects, validation, support classification, failures, and affected entities without Core importing Guitar.
3. How private multi-effect forward/inverse state is represented and guarded against partial application.
4. How undo/redo/replay bind the same contribution/validation semantics after startup.
5. How domain failures and unsupported results fit the accepted Core result/report model.
6. How events identify non-Core commands without exposing internal contribution objects.
7. How a known Guitar extension behaves when its contribution is absent.

## Existing Result, Report, and Error Shape

Evidence:

- `src/core-kernel/commands/contracts.ts`
- `src/core-kernel/profiles/score-feature-profile.ts`
- `src/core-kernel/reports/contracts.ts`
- `src/core-kernel/errors/kernel-error.ts`
- `src/core-kernel/errors/classification.ts`

Findings:

- Committed/no-op `CommandResult` carries one Core-only `ScoreSupportResult`; rejected results carry the closed `CommandFailure` union.
- Semantic rejection currently embeds `SemanticDiagnostic[]` directly in `command.semantic-invalid`.
- `KernelIssue` already models immutable, privacy-safe issue data with a Core or module source, but `KernelIssueCode` is a closed Core-owned union and `messageKey` is fixed to `core.${code}`.
- The object-oriented error hierarchy uses a private abstract `KernelError` with operation, migration, module, and report subclasses, then converts errors to deeply frozen `KernelIssue` data. Public APIs return data rather than throwing error instances.
- Module errors currently expose only the generic `module.internal-error`; there is no domain-semantic or domain-unsupported public issue contract.

GD-0 implication: placing every future `guitar.*` code into the Core-owned union would couple the kernel to domain policy. The modular result design should keep the object-oriented construction/classification machinery behind the boundary while returning detached, namespaced issue/support data. It must also preserve a Core-only typed result surface for existing consumers even though integrated and Core-only buses share the same `submit(unknown)` method shape.

## Existing Validation Lifecycle

Evidence:

- `src/core-kernel/commands/runtime.ts`
- `src/core-kernel/validation/validate-score-semantics.ts`
- `src/core-kernel/profiles/score-feature-profile.ts`

Findings:

- Runtime creation clones the initial document and runs Core semantic validation once.
- Submit applies a prepared mutation to a candidate, runs Core semantic validation, then commits and classifies Core feature support.
- No-op skips semantic validation and classifies the unchanged current document.
- Undo and redo apply the history mutation, rerun Core semantic validation, then commit and classify support.
- Replay uses the same submit runtime, so its validation behavior follows live submit.
- Core support classification itself reruns Core semantic validation before checking the product profile.
- No installed-domain validation lifecycle exists yet.

GD-0 implication: the integrated lifecycle must define domain validation for initial construction, submit, no-op classification, undo, redo, and replay. Core semantics must run first because domain validators rely on a structurally and semantically coherent score. GD0-D003 resolved the former choice: every installed, schema-compatible domain validator runs for every candidate; trigger-selected validation is rejected for this contract.

## Existing Event Identity and Fact Derivation

Evidence:

- `src/core-kernel/events/contracts.ts`
- `src/core-kernel/events/facts.ts`
- `src/core-kernel/events/runtime.ts`
- `src/core-kernel/session/runtime.ts`

Findings:

- Each committed submit/undo/redo creates one `core.document.committed` event and, when dirty state changes, one following `core.session.dirty-state-changed` event.
- Event sequences are reserved before the session state becomes visible; overflow or fact-derivation failure rejects the whole integration and restores the previous session state.
- `commandId` is currently the closed `CoreCommandId` union.
- `deriveAffectedEntities()` switches on every Core command and inspects the private effective mutation for remove/undo facts.
- Affected entities are ordered, deduplicated `ScoreAddress` values. The current address model can identify document, measure, part, staff, voice, event, and note, but not an extension payload path.
- Events are deeply frozen before publication, and rejected/no-op operations publish no committed event.

GD-0 implication: a Guitar command requires a domain-neutral command identity and contribution-provided affected facts. A single atomic transaction naturally maps to one committed fact whose address set can include both the affected `note` and owning `part`; emitting separate Core and Guitar commit events would suggest two commits and complicate sequence/rollback semantics.

## Existing Unknown-Extension and Missing-Module Behavior

Evidence:

- `src/core-kernel/domain/extensions.ts`
- `src/core-kernel/codec/decode-score-document.ts`
- `src/core-kernel/validation/validate-score-semantics.ts`
- `src/core-kernel/registry/runtime.ts`
- `.trellis/spec/core-kernel/backend/snapshot-events.md`

Findings:

- `ExtensionBlock` is a generic namespace/schemaVersion/owner/JSON payload envelope.
- Core decoding and semantics validate generic shape, namespace syntax, positive schema version, owner existence, owner/namespace uniqueness, and JSON payload validity; Core does not interpret domain payloads.
- Snapshots, commands, history, replay, and codec round-trip preserve unknown extension JSON.
- The current registry can report an absent module/contribution, but CommandBus creation is not bound to extension namespace requirements.
- Current Core V1 intentionally allows Core commands while preserving unknown extensions; treating every unknown namespace as write-blocking would weaken accepted compatibility behavior.

GD-0 implication: the product must distinguish an arbitrary opaque extension from a known official extension whose validator is required for safe writes. That distinction should come from immutable composition metadata rather than a Guitar import in Core. When a required known contribution is absent, the product choice is whether to open in degraded read-only mode, allow unvalidated Core writes, or reject opening entirely.

## Non-Solutions

- Adding Guitar-specific cases to Core mutations or Core command unions.
- Exposing JSON Patch, JSON paths, whole-document replacement, or mutable documents.
- Creating a Guitar-only `CommandBus`, history, replay log, dirty state, or event sequence.
- Runtime register/unregister or arbitrary handler callbacks.
- Replaying internal mutations instead of accepted semantic commands.
