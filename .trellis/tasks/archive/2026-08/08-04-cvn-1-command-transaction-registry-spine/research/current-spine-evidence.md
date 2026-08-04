# CVN-1 Current Spine Evidence

## 1. Inspection Record

- Date: 2026-08-04 (Asia/Shanghai).
- Worktree: `E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\k1-6-core-kernel-integration-gate`.
- Planning branch: `codex/cvn-1-command-transaction-registry-spine`.
- Baseline HEAD before task-file edits: `a8c7404cc34649aaa2c6ebfe8d93e46daf87dbf5`.
- CVN-0 acceptance: `cc9beee docs(core): accept CVN-0 guard consistency`.
- CVN-0 archive: `6cec36b chore(task): archive 07-30-cvn-0-public-unknown-guard-consistency`.
- Working tree was clean before branch/task creation.
- This inspection was planner-only. No production source, test implementation or live test command was executed. Historical counts below come from the accepted CVN-0 archive and require a fresh operator baseline before implementation.

## 2. Accepted Baseline Evidence

The archived CVN-0 `task.json` records:

- final independent re-review: passed 2026-08-04;
- focused tests: 19;
- related regression tests: 42;
- full tests: 188;
- public runtime exports: 48;
- final verdict: no reproducible P0/P1/P2.

The current branch is cleanly based on that archived result. The parent Core VNext dependency `CVN-0 -> CVN-1` is therefore satisfied.

## 3. Current Command Spine

### Public contracts and catalog

- `src/core-kernel/commands/contracts.ts:29-81` defines the six exact public envelopes.
- `src/core-kernel/commands/contracts.ts:83-159` defines the accepted result/failure/replay unions.
- `src/core-kernel/commands/catalog.ts:1-26` contains exactly six frozen command identity/target records.
- `test/core-kernel/public-api-boundary.test.ts:55-108` fixes the 48-name runtime export allowlist.
- `test/core-kernel/public-api-boundary.test.ts:110-190` excludes internal catalog, mutation, history, session, Registry builder and registration surfaces.

### Strict decoding

- `src/core-kernel/commands/strict-codec.ts:32-96` supplies descriptor-first exact records and dense-array copying.
- `src/core-kernel/commands/strict-codec.ts:340-380` fixes the observable outer failure order: envelope, version, ID, target kind and exact target.
- `src/core-kernel/commands/strict-codec.ts:382-478` is one closed switch for all six payload decoders.
- CVN-0 hardened shared public unknown predicates; CVN-1 must preserve that descriptor-first/no-throw boundary and avoid adding VNext input caps to V1 commands.

### Preparation and effects

- `src/core-kernel/commands/mutations.ts:18-44` defines five closed `CoreMutation` variants.
- `src/core-kernel/commands/mutations.ts:90-240` combines target resolution, no-op detection, forward construction and inverse construction in one six-command switch.
- `src/core-kernel/commands/mutations.ts:243-335` clones the full document inside `applyCoreMutation()` and applies exactly one mutation.
- Directly extending the existing `HistoryEntry` to arrays would call this full-document clone once per effect. The parent design instead requires one clone followed by ordered in-place candidate effects.

### Transaction/history runtime

- `src/core-kernel/commands/runtime.ts:12-22` directly imports Core decoder, mutation prepare/apply, Core semantic validation and Core profile classification.
- `src/core-kernel/commands/runtime.ts:17-38` stores one command, one forward mutation and one inverse mutation per history entry.
- `src/core-kernel/commands/runtime.ts:118-226` owns create/submit, version preflight, no-op, candidate validation, one history push and committed operation facts.
- `src/core-kernel/commands/runtime.ts:233-303` owns atomic undo/redo and invariant failure containment.
- `src/core-kernel/commands/replay.ts:8-44` already calls `createCommandRuntime()` and `submitCommand()`, providing a useful starting point for shared assembly binding.

### Session/read/event integration

- `src/core-kernel/commands/command-bus.ts:40-85` owns one `KernelSessionState` and delegates submit/undo/redo.
- `src/core-kernel/session/runtime.ts:74-146` preflights read/event candidates before returning an adopted state.
- `src/core-kernel/read/session-state.ts:12-18` defines content identity as the latest undo sequence or zero.
- `src/core-kernel/events/facts.ts:56-100` derives affected addresses through a Core-command switch and current/previous documents.
- `src/core-kernel/events/runtime.ts:31-82` builds public committed/dirty events and reserves event sequences before adoption.
- Moving canonical affected addresses into private prepared/history facts removes the generic event layer's dependency on the closed Core command union while preserving public event values.

## 4. Current Registry Spine

- `src/core-kernel/registry/runtime.ts` is approximately 940 lines.
- Lines 47-92 define normalized/candidate state plus Registry/Gateway private state.
- Lines 94 onward define both public classes, authorization and dispatch.
- Lines 549-613 validate Core command contributions against `CORE_COMMAND_DEFINITIONS`.
- Lines 616-692 validate selector bindings.
- Lines 695-755 validate registration entries and capabilities.
- Lines 798-814 construct frozen Registry state and summary.
- Lines 817-903 build the all-or-nothing candidate.
- Lines 920-938 decode the manifest and construct the public Registry.
- `src/core-kernel/registry/strict-codec.ts` already separates hostile manifest/selector decoding and is the natural retained normalization boundary.
- `src/core-kernel/registry/builtins.ts` already owns the static two-entry compiled table.

The split in `design.md` therefore follows existing responsibility seams rather than inventing new public concepts.

## 5. Existing Decisive Tests

### Commands and history

- `command-system.test.ts` covers public signatures, strict failures, replacement commit/no-op, insert/remove, semantic rollback, undo/redo, redo rules, alias isolation and replay.
- `command-internals.test.ts` covers exact catalog, hostile decode, resolver uniqueness, mutation round trips, runtime exception/overflow atomicity, history corruption/sequences, session/event preflight and unknown extensions.

### Read/events

- `event-system.test.ts` covers deterministic event order/facts, subscriber lifecycle/failures and reentrant writes.
- `dirty-checkpoint.test.ts` and `read-system.test.ts` cover checkpoint/content identity, immutable reads and selectors.

### Registry

- `registry-contracts.test.ts:74-205` fixes the two built-in entries and six command descriptors.
- `registry-gateway.test.ts:293-404` fixes summary order/deep freeze and representative dispatch parity.
- Later Registry tests cover authorization order, all selectors, command parity, undo/redo, subscriptions and exception containment.

### Cross-contract boundaries

- `core-kernel-integration.test.ts` covers one deterministic public write/read/event/history/replay flow.
- `core-kernel-integration-boundaries.test.ts` covers future schema, semantic/profile separation, failure atomicity, capability denial and privacy.
- `public-api-boundary.test.ts` and `forbidden-dependency-boundary.test.ts` protect root/private and platform dependency boundaries.

These tests are necessary but do not yet provide one checked-in before/after machine-readable trace. CVN1-R001 closes that evidence gap before refactor code.

## 6. Planning Decisions Derived from Evidence

| Evidence | Fixed CVN-1 decision |
|---|---|
| one accepted CommandBus/session owner already exists | preserve it; refactor underneath rather than add another bus |
| decoder/prepare/apply are closed switches | introduce frozen definitions and adapters before adding later commands |
| apply clones per mutation | introduce ordered nonempty sets and clone once per candidate |
| history owns single mutations | generalize privately to one forward/inverse set per semantic transaction |
| event facts switch on Core commands | store canonical affected addresses in prepared/history facts |
| replay already calls submit runtime | bind both to the same private default assembly, not a second replay engine |
| Registry runtime combines five concerns | split internal files while preserving public classes/factory/results |
| exact export and Registry tests exist | treat any root/summary drift as a blocking compatibility finding |
| GD-0 is not archived/accepted | use it as direction only; add no module public behavior in CVN-1 |

## 7. Remaining Evidence Owned by the Operator

The planner has not claimed the following as executed:

- fresh 188-or-later full test baseline on the new CVN-1 branch;
- characterization trace generation and repeatability;
- candidate clone-count proof;
- production implementation;
- focused/full post-refactor checks;
- independent technical acceptance.

Those items are ordered and gated in `implement.md`.
