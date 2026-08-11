# CVN-5 File and Test Ownership Matrix

## Planning candidate allowlist

Relative to `1673d94c100186538d163d259ebb936e9ae00a38`, this planning branch may change only:

- `.trellis/tasks/08-11-cvn-5-range-operations-explicit-atomic-batch/**`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/task.json`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/prd.md`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/design.md`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/implement.md`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/feature-contract-matrix.md`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/research/cvn-roadmap-and-stage-plan.md`;
- the Core Kernel backend index plus labeled CVN-5 planning projections in the six active content specs.

`src/**`, `test/**`, `package*.json`, `tsconfig.json`, the CVN-6 task directory and the post-Core task directory must have zero planning-branch delta.

## Future production allowlist

The future operator may edit only these files after accepted/archived CVN-6 and explicit activation:

### Application root

- `src/core-kernel/index.ts`

### Commands

- `src/core-kernel/commands/contracts.ts`
- `src/core-kernel/commands/catalog.ts`
- `src/core-kernel/commands/core-command-adapters.ts`
- `src/core-kernel/commands/strict-codec.ts`
- `src/core-kernel/commands/execution-assembly.ts`
- `src/core-kernel/commands/effects.ts`
- `src/core-kernel/commands/runtime.ts`
- `src/core-kernel/commands/integrated-runtime.ts`
- `src/core-kernel/commands/command-bus.ts`
- `src/core-kernel/commands/replay.ts`
- new `src/core-kernel/commands/range-selection.ts`
- new `src/core-kernel/commands/range-command-adapters.ts`
- new `src/core-kernel/commands/batch-runtime.ts`

### Session, Registry and events

- `src/core-kernel/session/runtime.ts`
- `src/core-kernel/registry/builtins.ts`
- `src/core-kernel/events/facts.ts`
- `src/core-kernel/events/runtime.ts`

### Failure/report projection

- `src/core-kernel/reports/adapters.ts`
- `src/core-kernel/reports/strict-codec.ts`, only to extend the closed `CommandFailure` code table and exact structural decoder for the accepted CVN-5 failure union

Editing an allowlisted file is permitted only for the stated CVN-5 contract. Any additional production file or new effect category requires a planning repair and independent rereview before edit.

## Protected production paths

- `src/core-kernel/module-sdk/**`;
- `src/core-kernel/registry/domain-catalog.ts` and the CVN-2 compiler/catalog implementation;
- `src/core-kernel/domain/**`, including `ScoreRange`, addresses and pitch contracts;
- `src/core-kernel/read/**`;
- accepted CVN-6 Registry/inventory/availability contracts and `registry/gateway.ts` generic dispatch;
- `src/core-kernel/events/contracts.ts` and the existing integrated event type;
- `src/core-kernel/errors/kernel-error.ts` and all runtime error classes;
- `src/core-kernel/persistence/**` and all score codecs/schemas;
- existing score and extension migration implementations;
- Guitar Domain, official product services, host, UI and public Extension Host directories;
- `package*.json` and `tsconfig.json` unless a separately reviewed build-only need is proven.

## Future test allowlist

Under `test/core-kernel`:

- `cvn-5-public-contracts.test.ts`;
- `range-delete.test.ts`;
- `range-transpose-written-pitch.test.ts`;
- `batch-input-and-failure-attribution.test.ts`;
- `batch-core-atomicity.test.ts`;
- `batch-integrated-modules.test.ts`;
- `batch-history-replay-events.test.ts`;
- `batch-hostile-input-resource.test.ts`;
- `cvn-5-public-boundary.test.ts`;
- `cvn-5-core-only-regression.test.ts`;
- `fixtures/cvn-5-batch-score.ts`;
- `fixtures/cvn-5-batch-official-modules.ts`.

The only known existing test/projection files that may change are:

- `kernel-failure-adapters.test.ts`, to keep exhaustive `CommandFailure` adapter/strict-codec coverage after adding the bounded CVN-5 variants;
- `command-internals.test.ts`, to update the exact Core command and adapter allowlists from `25` to `28` without weakening any old assertion;
- `registry-contracts.test.ts`, to update the exact Core command contribution count from `25` to `28` without changing Registry semantics;
- `cvn-4-public-surface.test.ts`, to consume the updated accepted surface projection while retaining all CVN-4 assertions;
- `fixtures/cvn-4-surface.ts`, only if its current-surface collector needs the additive three-command projection;
- `fixtures/cvn-4-surface.expected.json`, only for the deterministic additive three-command projection produced by that collector.

All CVN-5 positive/negative real-Core TypeScript compile assertions belong in `cvn-5-public-contracts.test.ts`; this plan does not authorize an anonymous compile fixture. At the accepted-and-archived CVN-6 implementation baseline, the operator must rerun the exact affected-file inventory before the first source edit. Any additional existing test/projection path returns to planning review before edit. A rewrite that weakens an accepted assertion is outside scope.

## Mandatory zero-delta checks

At planning acceptance:

```powershell
git diff --name-only 1673d94c100186538d163d259ebb936e9ae00a38 -- src test package.json package-lock.json tsconfig.json
git diff --name-only 1673d94c100186538d163d259ebb936e9ae00a38 -- .trellis/tasks/08-11-cvn-6-module-runtime-validation-migration-integration
git diff --name-only 1673d94c100186538d163d259ebb936e9ae00a38 -- .trellis/tasks/08-11-post-core-official-plugin-product-roadmap
```

All three outputs are empty.
