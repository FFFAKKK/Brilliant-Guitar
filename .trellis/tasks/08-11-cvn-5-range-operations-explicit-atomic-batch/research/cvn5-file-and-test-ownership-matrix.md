# CVN-5 File and Test Ownership Matrix

## Planning candidate allowlist

Relative to `d521a618e42c01077e8545d1c87e9b36e14d4bdb`, this planning branch may change only:

- `.trellis/tasks/08-11-cvn-5-range-operations-explicit-atomic-batch/**`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/task.json`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/prd.md`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/design.md`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/implement.md`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/feature-contract-matrix.md`;
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/research/cvn-roadmap-and-stage-plan.md`;
- the Core Kernel backend index plus labeled CVN-5 planning projections in the six active content specs.

`src/**`, `test/**`, `package*.json`, `tsconfig.json`, the archived CVN-6 task directory and the post-Core task directory must have zero planning-branch delta.

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
- `src/core-kernel/registry/integrated-contracts.ts`, only to add the outer
  `command.batch-child-rejected` member to the existing integrated command
  failure union so a module child may retain an existing contribution/resource
  failure as its single nested leaf; no Registry assembly, inventory, gateway,
  contribution ABI or runtime behavior change is authorized. This owner passed
  the targeted implementation-base planning rereview recorded below.

Editing an allowlisted file is permitted only for the stated CVN-5 contract. Any additional production file or new effect category requires a planning repair and independent rereview before edit.

## Protected production paths

- `src/core-kernel/module-sdk/**`;
- `src/core-kernel/registry/domain-catalog.ts` and the CVN-2 compiler/catalog implementation;
- `src/core-kernel/domain/**`, including `ScoreRange`, addresses and pitch contracts;
- `src/core-kernel/read/**`;
- accepted CVN-6 Registry/inventory/availability contracts and
  `registry/gateway.ts` generic dispatch, except the exact CVN-5 integrated
  failure-union member above after its targeted rereview passes;
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

### Implementation-base full-suite amendment

The first CVN-5 full-suite run on the accepted CVN-6 implementation base exposed
four additional existing test/projection owners that were not visible during the
docs-only planning diff. They may change only after targeted independent planning
rereview of this amendment:

- `command-spine-characterization.test.ts`, only to assert that the historical
  CVN-1 projection explicitly removes the three declared CVN-5 command
  descriptors while leaving unrelated future descriptors visible;
- `fixtures/cvn-1-characterization.ts`, only to add the exact three CVN-5 command
  IDs to the historical post-CVN-1 Registry projection; the accepted golden JSON
  and SHA-256 remain unchanged;
- `core-kernel-integration.test.ts`, only to update the exact aggregate Registry
  contribution count from `31` to `34` after the three command descriptors;
- `registry-gateway.test.ts`, only to update the same exact aggregate contribution
  count from `31` to `34` without weakening ordering or dispatch assertions.

No edit is authorized for `core-only-regression.test.ts` or
`fixtures/cvn-1-characterization.expected.json`: the historical projection must
make those accepted CVN-1/CVN-6 traces pass byte-for-byte. The amendment does not
authorize any additional production file, runtime export, Registry behavior or
golden-baseline rewrite.

Targeted independent rereview passed on 2026-08-11 with P0/P1/P2=`0/0/0` after
the design authority and implementation-base supersession note were synchronized
to the exact ten-path list. The four amendment paths are therefore active within
the narrow purposes above.

### Integrated failure-union implementation-base amendment

The completed mixed Core/module implementation demonstrated one additional
production type owner that the docs-only baseline rescan missed:

- `src/core-kernel/registry/integrated-contracts.ts`.

`KernelCommandFailure` is the existing public result type of the integrated
command bus. CVN5-R051 requires the outer Core batch wrapper to contain either
an existing Core leaf or an existing module contribution/resource failure.
Keeping the file unchanged would make the accepted runtime result impossible to
represent without a cast or a false Core-only narrowing. The proposed edit is
limited to that one recursive-depth-one union member and reuses existing failure
types. It does not change the CVN-2 contribution ABI, catalog, availability,
gateway, runtime export keys, persistence or module callback contracts.

The source candidate and its tests remain uncommitted. The existing independent
reviewer passed this single-file amendment on 2026-08-11 with
P0/P1/P2=`0/0/0`; only the exact type purpose above is active.

All CVN-5 positive/negative real-Core TypeScript compile assertions belong in `cvn-5-public-contracts.test.ts`; this plan does not authorize an anonymous compile fixture. At the accepted-and-archived CVN-6 implementation baseline, the operator must rerun the exact affected-file inventory before the first source edit. Any additional existing test/projection path returns to planning review before edit. A rewrite that weakens an accepted assertion is outside scope.

## Mandatory zero-delta checks

At planning acceptance:

```powershell
git diff --name-only d521a618e42c01077e8545d1c87e9b36e14d4bdb -- src test package.json package-lock.json tsconfig.json
git diff --name-only d521a618e42c01077e8545d1c87e9b36e14d4bdb -- .trellis/tasks/archive/2026-08/08-11-cvn-6-module-runtime-validation-migration-integration
git diff --name-only d521a618e42c01077e8545d1c87e9b36e14d4bdb -- .trellis/tasks/08-11-post-core-official-plugin-product-roadmap
```

All three outputs are empty.
