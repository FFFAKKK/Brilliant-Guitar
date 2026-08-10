# CVN-2 Operator Runbook

> **Current lifecycle:** planning only. This runbook becomes executable only after planning review and an explicit user activation decision. Until then, do not run `task.py start` and do not edit production/test files.

## 1. Objective

Implement only `CVN-FC-110/111`: the separate official module SDK, strict static contribution definitions, and detached all-or-nothing frozen catalog. Finish with an independently reviewable candidate; do not continue into CVN-6 runtime integration.

## 2. Fixed working location

```text
Repository: E:\desktop\brilliant_ideas\brilliant_guitar
Worktree:   E:\desktop\brilliant_ideas\brilliant_guitar\.worktrees\cvn-2-official-module-sdk-frozen-assembly
Branch:     codex/cvn-2-official-module-sdk-frozen-assembly
Task:       .trellis/tasks/08-10-cvn-2-official-module-sdk-frozen-assembly
```

The operator works only in this worktree. It does not merge, reset, clean, rebase, or modify another CVN worktree.

## 3. Activation precondition

All of the following must be visible before implementation starts:

1. task status is `planning` and detailed planning is reviewed;
2. user explicitly authorizes implementation;
3. planning review has P0/P1/P2=`0/0/0` or an explicitly accepted bounded exception;
4. worktree status is clean;
5. `HEAD` contains the six accepted dependency commits listed in `task.json`;
6. no newer parent contract changes `CVN-FC-110/111` or the GD-0 fences.

Then, and only then:

```powershell
python .trellis/scripts/task.py start 08-10-cvn-2-official-module-sdk-frozen-assembly
python .trellis/scripts/task.py current
```

Expected: the current task is CVN-2 and its lifecycle is active/in-progress according to Trellis. If a different task is active, stop before editing.

## 4. Baseline verification before the first edit

Run from the fixed worktree:

```powershell
git status --short --branch
git rev-parse HEAD
git merge-base --is-ancestor b0272e2eabd0d222baea12cbaae3e08f9f61bfdd HEAD
git merge-base --is-ancestor 7f33e7d9ae1239e74a0d738431e7f682521c9264 HEAD
git merge-base --is-ancestor 7c4e852ba62bcf18716ac2b374a8cd549c456b5a HEAD
git merge-base --is-ancestor 253d19e5e9d6a3bfdfa0158833d59872e8be156c HEAD
git merge-base --is-ancestor 451627e605695c95ecdc85e32bd471fcc81885c4 HEAD
git merge-base --is-ancestor a2b9009e66200f72b4ccd340192a65f621df8bcd HEAD
python .trellis/scripts/task.py validate 08-10-cvn-2-official-module-sdk-frozen-assembly
npm.cmd run typecheck
npm.cmd test
```

Expected baseline: clean status, six ancestry commands exit `0`, Trellis passes, typecheck/build pass, and the pre-change full suite reports `315/315`.

Save the exact baseline for later scope checks:

```powershell
$env:CVN2_BASE = git rev-parse HEAD
```

## 5. Strict file allowlist

### 5.1 Production files that may be added

```text
src/core-kernel/registry/integrated-contracts.ts
src/core-kernel/module-sdk/contracts.ts
src/core-kernel/module-sdk/module-issues.ts
src/core-kernel/module-sdk/definitions.ts
src/core-kernel/module-sdk/index.ts
src/core-kernel/registry/domain-catalog-codec.ts
src/core-kernel/registry/domain-catalog.ts
```

### 5.2 Production files that may be modified

```text
src/core-kernel/index.ts
src/core-kernel/registry/contracts.ts
src/core-kernel/registry/strict-codec.ts
```

### 5.3 Test files that may be added

```text
test/core-kernel/module-sdk-contracts.test.ts
test/core-kernel/module-sdk-hostile-input.test.ts
test/core-kernel/module-catalog-assembly.test.ts
test/core-kernel/module-catalog-failures.test.ts
test/core-kernel/module-catalog-limits.test.ts
test/core-kernel/fixtures/synthetic-official-modules.ts
```

### 5.4 Existing tests that may be modified

```text
test/core-kernel/public-api-boundary.test.ts
test/core-kernel/forbidden-dependency-boundary.test.ts
test/core-kernel/registry-contracts.test.ts
```

### 5.5 Planning/spec/session files that may be modified

```text
.trellis/tasks/08-10-cvn-2-official-module-sdk-frozen-assembly/**
.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/task.json
.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/research/cvn-roadmap-and-stage-plan.md
.trellis/workspace/**/journal-*.md
```

Any required file outside this allowlist is a stop condition. Update planning and review the new scope before touching it.

## 6. Protected files and behavior

No CVN-2 edit is permitted in:

```text
src/core-kernel/commands/**
src/core-kernel/session/**
src/core-kernel/events/**
src/core-kernel/read/session-state.ts
src/core-kernel/registry/assembly.ts
src/core-kernel/registry/builtins.ts
src/core-kernel/registry/gateway.ts
src/core-kernel/registry/runtime.ts
src/core-kernel/domain/**
src/core-kernel/migration/**
src/core-kernel/reports/**
package.json
package-lock.json
tsconfig.json
```

The accepted GD-0 tagged fences, active combined fence, current twenty-five Core IDs, Core runtime export list, Core startup manifest, and final CVN-4 tests are equality baselines. The parent-owned final twenty-eight-command plan remains untouched and is not a current CVN-2 source fixture.

## 7. Implementation sequence

Each stage starts from a green previous stage, changes only its listed files, runs its focused tests plus typecheck, and records a small reviewable diff. Do not carry a known red focused test into the next stage.

### Stage 0 — Characterization hashes and baseline evidence

**Files:** none.

1. Run the accepted public boundary and Registry contract tests without editing them.
2. Record the current Core runtime export keys, Core manifest, Registry summary, and one unknown registration-ID result in the task session evidence.
3. Record/verify GD-0 fence hashes using the existing contract fixture; do not copy fences into production tests.
4. Save `CVN2_BASE` and the baseline outputs before creating any future-contract import or source-text expectation.

Focused commands:

```powershell
npm.cmd run build
node --test dist/test/core-kernel/public-api-boundary.test.js
node --test dist/test/core-kernel/registry-contracts.test.js
node .trellis/tasks/archive/2026-08/07-28-gd-0-guitar-domain-core-transaction-contract/contract-fixtures/verify-public-contracts.mjs
npx.cmd tsc -p .trellis/tasks/archive/2026-08/07-28-gd-0-guitar-domain-core-transaction-contract/contract-fixtures/tsconfig.real-core.json --noEmit
```

Stage exit: all baseline commands pass and the worktree is still clean. New type imports and SDK source-text checks begin only in Stage 1 together with their production declarations.

### Stage 1 — Shared data types and separate SDK entry

**Files:**

```text
A src/core-kernel/registry/integrated-contracts.ts
A src/core-kernel/module-sdk/contracts.ts
A src/core-kernel/module-sdk/index.ts
M src/core-kernel/index.ts
A test/core-kernel/module-sdk-contracts.test.ts
M test/core-kernel/public-api-boundary.test.ts
```

1. Add the opaque branded `KernelIntegratedCatalog`, exact GD-0 requirement, and module issue data interfaces.
2. Add every SDK data/callback type from the design allowlist with exact
   fields/discriminants, including the two-field `DomainCommandDecodeInputV1`,
   generic definition inputs, non-generic opaque definition handles, and
   generic-coupled module issue input.
3. Add the nine-key frozen limits object with exact literal values.
4. Root-export only the four shared types; SDK-export only the declared allowlist.
5. Lock the final eight-name runtime and thirty-four-name type allowlists in one
   source/type fixture while accepting only the Stage 1 runtime subset until
   later builders/compiler exist.
6. Test the decoder input's exact two-key static shape, limits
   key/value/freeze state, root runtime key equality, and absence of forbidden
   application-root exports.

Focused commands:

```powershell
npm.cmd run typecheck
npm.cmd run build
node --test dist/test/core-kernel/module-sdk-contracts.test.js
node --test dist/test/core-kernel/public-api-boundary.test.js
```

Stage exit: typecheck and both focused tests pass; `Object.keys(coreKernel)` is unchanged.

### Stage 2 — Module issue builder and error base

**Files:**

```text
A src/core-kernel/module-sdk/module-issues.ts
M src/core-kernel/module-sdk/index.ts
M test/core-kernel/module-sdk-contracts.test.ts
A test/core-kernel/module-sdk-hostile-input.test.ts
```

1. Capture exact input without getters and validate safe IDs, source parity, location, and JSON details.
2. Derive message key/severity exactly as `design.md` specifies.
3. Return only `created` or `invalid`, never a throw from the public builder.
4. Add protected `ModuleKernelErrorBase` whose generic module/code parameters
   are the constructor input's parameters and whose code is constrained to that
   module namespace.
5. Prove issue deep freeze, caller mutation isolation, typed subclass
   `toIssue()`, the required compile-time error for mismatched `super()` data,
   and absence of Error fields.
6. Cover invalid code namespace, overlength IDs, extra message/severity fields, bad source, bad locations/details, accessor, Proxy, sparse/cyclic data, and mutable built-in sabotage already covered by the shared strict-input prerequisite.

Focused commands:

```powershell
npm.cmd run typecheck
npm.cmd run build
node --test dist/test/core-kernel/module-sdk-contracts.test.js
node --test dist/test/core-kernel/module-sdk-hostile-input.test.js
```

Stage exit: all issue/error cases pass and no application-root runtime export is added.

### Stage 3 — Strict command, effect, contribution, and registration definition builders

**Files:**

```text
A src/core-kernel/module-sdk/definitions.ts
A src/core-kernel/registry/domain-catalog-codec.ts
M src/core-kernel/module-sdk/index.ts
M test/core-kernel/module-sdk-contracts.test.ts
M test/core-kernel/module-sdk-hostile-input.test.ts
A test/core-kernel/fixtures/synthetic-official-modules.ts
```

1. Implement descriptor-first exact readers for registration entry,
   contribution, command descriptor, requirement, and effect descriptor.
2. Implement `defineDomainCommandV1` and `defineModuleEffectV1`: validate the
   exact three-key typed inputs, clone/freeze the descriptor, create a frozen
   opaque handle with only `descriptor` enumerable, and publish the paired
   callbacks to the matching private `WeakMap` only after local success.
3. Implement internal definition-binding readers omitted from both public
   entries. They return state only for authentic same-SDK handles.
4. Implement contribution/registration builders that require authentic
   command/effect handles. Their public overloads are typed; implementation
   signatures inspect `unknown` and retain data-only invalid results for hostile
   JavaScript/casts. Hostile TypeScript cases use `Reflect.apply`; they do not
   weaken the public overloads.
5. Use accepted strict-input capture for every data-only subtree; inspect
   function slots separately. Reject extra/unexpected-symbol/accessor
   properties, invalid prototypes, sparse arrays, cyclic data, async/generator
   functions, class constructors, bound/native functions, and fake or copied-brand handles.
6. Normalize local arrays to canonical order; require version lists already
   valid and ascending. Clone/freeze data and outer arrays/records; never invoke
   a callback.
7. Implement the two exact synthetic fixtures by unwrapping the two typed
   definition builders before building their contributions; retain counters for
   all six callback categories.
8. In one unreachable strict type block, prove two command types and two effect
   payload types coexist without `any`/assertions/bivariant methods, while
   crossed decoder/consumer pairs, structural handles, and mismatched
   `ModuleKernelErrorBase` constructor data remain required
   `@ts-expect-error` cases.
9. Assert command/effect handle enumerable keys, contribution exact nine-field
   ABI, registration exact four-field shape, final builder export subset, and
   zero callback counts.

Focused commands:

```powershell
npm.cmd run typecheck
npm.cmd run build
node --test dist/test/core-kernel/module-sdk-contracts.test.js
node --test dist/test/core-kernel/module-sdk-hostile-input.test.js
```

Stage exit: the strict type fixture passes, heterogeneous typed definitions use
opaque handles without escape hatches, valid definitions are detached/frozen,
invalid definitions return only `invalid`, and fixture counters are zero.

### Stage 4 — Additive manifest ID and catalog compiler

**Files:**

```text
M src/core-kernel/registry/contracts.ts
M src/core-kernel/registry/strict-codec.ts
A src/core-kernel/registry/domain-catalog.ts
M src/core-kernel/module-sdk/index.ts
A test/core-kernel/module-catalog-assembly.test.ts
A test/core-kernel/module-catalog-failures.test.ts
M test/core-kernel/registry-contracts.test.ts
```

1. Preserve `CoreModuleRegistrationEntryId`; add separate official and combined aliases.
2. Decode exactly one new ID, `kernel.domain-commands.v1`; unknown IDs remain invalid.
3. Keep `createKernelRegistry()` untouched. It continues using only Core compiled entries.
4. Compile the full manifest: validate the exact two Core declarations through current Core candidate construction, then domain declarations through the new compiler.
5. Index static domain entries by composite owner/entry key; reject missing, duplicate selected-key, or owner-mismatched entries. Ignore unselected static entries so the manifest remains the selection authority.
6. Apply the eight-stage validation precedence and canonical scan order.
7. Build frozen normalized state, indexes, private assembly identity, frozen branded handle, and WeakMap publication as the final operations only.
8. Add only the compiler to the existing SDK builder surface; the final runtime
   export set is exactly eight names. Retain catalog and definition binding
   accessors in private modules.
9. Prove two separately compiled catalogs have unequal identity, reversed
   inputs normalize equally, input mutation is isolated, fake/copied-brand
   definition handles fail before publication, no method exists on the public
   catalog or definition handles, and every callback counter is zero.

Focused commands:

```powershell
npm.cmd run typecheck
npm.cmd run build
node --test dist/test/core-kernel/registry-contracts.test.js
node --test dist/test/core-kernel/module-catalog-assembly.test.js
node --test dist/test/core-kernel/module-catalog-failures.test.js
```

Stage exit: good/base/failure precedence cases pass; Core-only Registry characterization is equal.

### Stage 5 — Resource boundaries and failure privacy

**Files:**

```text
A test/core-kernel/module-catalog-limits.test.ts
M test/core-kernel/module-catalog-failures.test.ts
M test/core-kernel/module-sdk-hostile-input.test.ts
```

Add exact boundary and boundary+1 tests:

1. full manifest modules `64/65`;
2. domain contributions `256/257`;
3. commands `4096/4097`;
4. effects `4096/4097`;
5. namespaces `1024/1025`;
6. one requirement versions `256/257`.

Also assert the three CVN-6-owned constants are exactly `1024`, `4096`, and `131072` without invoking callbacks.

Every boundary+1 case verifies exact failure mapping, zero callback calls, no authentic catalog handle/private state, and a recursive privacy scan excluding functions, Error/stack/path data, payloads, and input object identity.

Focused commands:

```powershell
npm.cmd run typecheck
npm.cmd run build
node --test dist/test/core-kernel/module-catalog-limits.test.js
node --test dist/test/core-kernel/module-catalog-failures.test.js
node --test dist/test/core-kernel/module-sdk-hostile-input.test.js
```

Stage exit: all six enforced limits have exact edge proof; failure privacy passes.

### Stage 6 — Dependency, contract, and full-regression closure

**Files:** only narrow test or task-document corrections already in the allowlist.

1. Run the recursive forbidden-dependency test and inspect any failure before editing.
2. Run both GD-0 contract fixture layers.
3. Confirm no production/test file outside the allowlist changed.
4. Confirm protected files have zero diff from `CVN2_BASE`.
5. Run typecheck, build, and the entire suite.
6. Run Trellis validations and `git diff --check`.
7. Record exact counts/hashes/commands in the task review evidence.

Commands:

```powershell
npm.cmd run typecheck
npm.cmd run build
node --test dist/test/core-kernel/forbidden-dependency-boundary.test.js
node .trellis/tasks/archive/2026-08/07-28-gd-0-guitar-domain-core-transaction-contract/contract-fixtures/verify-public-contracts.mjs
npx.cmd tsc -p .trellis/tasks/archive/2026-08/07-28-gd-0-guitar-domain-core-transaction-contract/contract-fixtures/tsconfig.real-core.json --noEmit
npm.cmd test
python .trellis/scripts/task.py validate 08-10-cvn-2-official-module-sdk-frozen-assembly
python .trellis/scripts/task.py validate 07-29-core-vnext-product-ready-extensible-kernel-completion
python .trellis/scripts/task.py validate 06-29-commercial-guitar-tablature-product
git diff --check
```

Stage exit: all commands pass, no scope leak exists, and the candidate is ready for independent implementation review. Do not start CVN-6.

## 8. Mechanical scope checks

Use `CVN2_BASE` captured in Stage 0.

### 8.1 Changed-file allowlist

```powershell
git diff --name-only $env:CVN2_BASE...HEAD
git status --short
```

Compare every path manually against section 5. Untracked files count as changes.

### 8.2 Protected-source equality

```powershell
git diff --exit-code $env:CVN2_BASE -- src/core-kernel/commands src/core-kernel/session src/core-kernel/events src/core-kernel/read/session-state.ts src/core-kernel/registry/assembly.ts src/core-kernel/registry/builtins.ts src/core-kernel/registry/gateway.ts src/core-kernel/registry/runtime.ts src/core-kernel/domain src/core-kernel/migration src/core-kernel/reports package.json package-lock.json tsconfig.json
```

Expected: no diff.

### 8.3 Domain dependency scan

```powershell
rg -n "guitar|react|tauri|vexflow|node:fs|node:path|dynamic import|register\(|unregister\(|replaceContribution|hot reload" src/core-kernel/module-sdk src/core-kernel/registry/domain-catalog*.ts
```

Review matches in test descriptions/comments separately; production matches to forbidden dependencies or mutation APIs block the candidate.

## 9. Commit strategy

Use path-limited staging. Never stage unrelated workspace files. Each commit must end green for its focused tests.

Recommended commits:

1. `test(core): lock CVN-2 SDK and catalog boundaries`
2. `feat(core): add official module SDK data and issue contracts`
3. `feat(core): add strict official contribution definitions`
4. `feat(core): compile frozen official module catalogs`
5. `test(core): qualify CVN-2 failures limits and isolation`
6. `docs(trellis): record CVN-2 implementation candidate evidence`

Before each commit:

```powershell
git diff --check
git status --short
git diff --cached --name-only
```

After the final candidate commit, status must be clean. Do not push unless the user separately requests it.

## 10. Independent implementation review gate

The implementation reviewer receives:

- base and candidate commit hashes;
- exact changed-file list;
- this PRD/design/runbook;
- focused and full test results;
- GD-0 Layer A/Layer B results;
- root and SDK export allowlists;
- callback counter proof;
- cap boundary table;
- protected-source equality output;
- Trellis validation and clean-status evidence.

Review findings use P0/P1/P2. Any P0/P1 returns the candidate for bounded repair. A P2 is either repaired or explicitly accepted with recorded rationale. Task status is not marked accepted/archive until the review gate passes and task acceptance metadata is synchronized.

## 11. Rollback by stage

- **Stage 1:** remove shared/SDK contract additions and four root type exports.
- **Stage 2:** remove module issue/error implementation and its tests.
- **Stage 3:** remove all four definition/contribution/registration builders,
  their private binding state/readers, codec, and synthetic fixtures.
- **Stage 4:** remove compiler; revert the one registration-ID alias/decoder addition.
- **Stage 5:** remove cap/failure qualification tests only.
- **Final rollback:** return every allowlisted production/test file to `CVN2_BASE`; no persisted document migration is needed.

Rollback must be a reviewed Git revert or exact path restoration from the recorded base. Do not use broad reset/clean commands in a shared repository.

## 12. Immediate stop conditions

Stop the active implementation and return to planning if any of these appears:

1. a tenth outer ABI field is needed;
2. a callback must run during catalog compilation;
3. an integrated bus/Session/gateway/replay behavior is needed to test CVN-2;
4. a command/session/history/event/protected file must change;
5. a new Registry failure code seems necessary;
6. the application root needs a runtime SDK/compiler/error export;
7. a module needs mutable document, generic patch/path, whole-document replacement, or its own inverse;
8. a dynamic registration/install/unload/reload API is requested;
9. a Guitar-specific type/import/fixture enters Core;
10. a reserved future port is required for acceptance;
11. heterogeneous definitions require public `any`, a type assertion helper, or
    bivariant callback methods instead of the opaque typed builders;
12. CVN-6 would need any command decoder input other than the exact frozen
    `DomainCommandDecodeInputV1` target/payload shell;
13. GD-0 fence or one of the six accepted prerequisite commits no longer matches the reviewed baseline.

## 13. Definition of done

CVN-2 implementation is done only when:

- all `CVN2-AC011..020` checks are evidenced;
- exact SDK and root boundaries are proven;
- two neutral modules compile into one frozen catalog with zero callback calls;
- every construction failure is atomic, stable, and private;
- all enforced caps have boundary proof;
- Core-only behavior and protected source remain equal;
- full tests and Trellis gates pass;
- independent review passes;
- the final worktree is clean and the task remains separate from CVN-6.
