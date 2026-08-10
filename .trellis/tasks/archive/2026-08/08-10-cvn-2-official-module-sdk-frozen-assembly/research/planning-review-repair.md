# CVN-2 Planning Review Repair

## Inputs

- Initial reviewed candidate: `8757097fd6dd3e9464807b9ab091006285a19f2b`
- Initial review record commit: `31be407`
- Initial findings: P0/P1/P2=`0/2/1`
- Repair scope: planning artifacts only
- Lifecycle: `planning`; `task.py start` remains false
- Earlier re-review baseline: `83478fedb892b8bd048acc4f63145f3570872d8a`
- External targeted-audit baseline: `f6d4694d8eb325883be9abdb697d35086759ca16`
- Bounded hierarchy repair candidate: `69f7fadb691bfed833c0ed067ea56d530ab84b4b`
- Targeted re-review: P0/P1/P2=`0/0/0`; user activation pending

## Repair 1 — typed heterogeneous definitions

The contribution's nine fields remain unchanged. Its `commands` and `effects`
arrays now contain non-generic opaque handles rather than invariant generic
callback records.

Exact authoring sequence:

1. `defineDomainCommandV1<Command>` accepts one typed
   `DomainCommandDefinitionInputV1<Command>` containing exactly
   `descriptor/decode/prepare`.
2. `defineModuleEffectV1<Payload>` accepts one typed
   `ModuleEffectDefinitionInputV1<Payload>` containing exactly
   `descriptor/decode/transform`.
3. Each builder validates without invocation, clones/freezes its descriptor,
   installs the paired callbacks in a private definition `WeakMap`, and returns
   a non-generic handle with only `descriptor` enumerable.
4. An internal-only unique-symbol brand gives the handle nominal static shape;
   private `WeakMap` membership remains runtime authenticity authority.
5. Contribution and catalog construction accept only authentic handles. Copying
   a descriptor or brand is insufficient.
6. CVN-6 may hand a successful decode result only to the consumer from the same
   private binding. No public callback getter or structural constructor exists.

All V1 official modules and the composition root resolve one host-owned SDK
instance. A later separately packaged official module consumes that host SDK as
an external/peer boundary; bundling another copy intentionally produces a
handler mismatch before catalog publication. This is an ABI condition, while
package-host implementation remains outside CVN-2.

Definition-binding state and ready catalog state are distinct. A failed
definition attempt publishes neither handle nor binding. A failed catalog
compile publishes neither catalog handle nor catalog-state entry, but it leaves
preexisting authentic definition handles/bindings unchanged and reusable.

The SDK runtime allowlist therefore contains exactly eight names: the previous
six plus `defineDomainCommandV1` and `defineModuleEffectV1`. The SDK type
allowlist contains exactly thirty-four names: the previous thirty-one plus
`DomainCommandDecodeInputV1`, `DomainCommandDefinitionInputV1`, and
`ModuleEffectDefinitionInputV1`.

Required type proof uses the repository's actual strict configuration: two
different command types and two different effect payload types coexist in one
contribution without `any`, assertions, or bivariant methods; crossed pairs and
structural handles remain required `@ts-expect-error` cases.

A temporary design-shape probe using the repository's TypeScript 5.8 compiler,
`--strict`, and the exact repaired generic/opaque relations exited `0`: both
heterogeneous collections compiled, while the crossed command pair, structural
handle, and mismatched error constructor remained consumed
`@ts-expect-error` cases. The temporary file was removed immediately and no
workspace source/test file was created.

## Repair 2 — exact decoder invocation shell

`DomainCommandDecoderV1` now accepts only:

```typescript
interface DomainCommandDecodeInputV1 {
  readonly target: unknown;
  readonly payload: unknown;
}
```

CVN-6 later captures the envelope's own data values for target/payload, places
them in a fresh ordinary two-key object, and shallow-freezes that shell. It does
not pass command ID/version, the original envelope, prototype, or extra fields.
It does not traverse/freeze raw nested input before the trusted decoder. A
successful decoded command is then captured, cloned, deeply frozen, and passed
only to the paired preparer.

This fixes the ABI call value without implementing any CVN-6 behavior in CVN-2.

## Repair 3 — error generic/data coherence

`ModuleIssueInputV1` is parameterized by `ModuleId` and `Code`.
`ModuleKernelErrorBase<ModuleId, Code>` constrains `Code` to the same module
namespace and its protected constructor accepts only
`ModuleIssueInputV1<ModuleId, Code>`. A strict negative fixture requires a
compile-time error when subclass data claims another module or code namespace;
the runtime builder repeats safe-ID and prefix validation.

## Files and scope

No source/test/package/config file is added or modified by these planning
repairs. Repairs 1-3 kept the future implementation allowlist unchanged because
their builders/types fit the already planned SDK files. Repair 4 expands that
future allowlist only by one internal base addition, one current Core error-file
modification, and one current Core issue-test modification, as fixed below.

The following remain unchanged:

- CVN-FC ownership is exactly 110/111;
- contribution outer ABI is exactly nine fields;
- application-root runtime delta is zero;
- CVN-2 callback invocation count is zero;
- current Core command count is 25 and parent-final count is 28;
- CVN-6 runtime integration and all future ports remain separate gates.

## Repair 4 — accepted common error hierarchy

The external targeted audit found that Repair 3 fixed the module/code generic
relation but still declared `ModuleKernelErrorBase` as a direct `Error`
subclass. The bounded correction restores GD-0's accepted branch:

```text
Error
└─ KernelErrorBase<Code>
   ├─ existing private Core KernelError<CoreCode>
   └─ ModuleKernelErrorBase<ModuleId, Code>
```

Exact file decision:

- add `src/core-kernel/errors/kernel-error-base.ts` for the internal-only base;
- modify `src/core-kernel/errors/kernel-error.ts` only to derive its current
  private foundation from that base;
- keep `src/core-kernel/module-sdk/module-issues.ts` as the module issue builder
  and SDK-derived error owner;
- modify `test/core-kernel/kernel-issues.test.ts` for behavior-preservation
  regression, in addition to the planned SDK contract/hostile-input tests.

`KernelErrorBase<Code extends string>` owns only native Error initialization,
the readonly typed code, and the abstract common issue-data `toIssue()` shape.
The Core and module subclasses retain their own classification, validation,
clone/freeze, and return refinements. The SDK runtime/type counts remain `8/34`:
`ModuleKernelErrorBase` is exported, `KernelErrorBase` is internal, and the
application root adds zero runtime error keys.

The existing Core subclass removes its duplicate code field/assignment and
delegates code ownership to the base. The module subclass returns the same
stored deeply frozen issue on repeated `toIssue()` calls; input detachment and
recursive immutability, rather than per-call cloning, define its isolation.

The decisive matrix now requires prototype-chain proof, literal generic-code
assignment and mismatch rejection, constructor module/code mismatch rejection,
`error.code === issue.code`, constructor-input detachment, recursive freeze,
post-return mutation isolation, no Error fields in issue data, and unchanged
Core issue factory results.

## Verification history

The earlier Repair 1-3 candidate checks on 2026-08-10 produced:

- design allowlist parser: runtime `8`, type `34`;
- strict design-shape TypeScript probe: exit `0` with all required negative
  `@ts-expect-error` cases consumed;
- child Trellis context: `implement.jsonl 9`, `check.jsonl 11`, valid;
- parent Trellis context: `3/3`, valid;
- product Trellis context: `0/0`, valid;
- repository typecheck: pass;
- complete current Core regression: `315/315` pass;
- changed files outside `.trellis/**`: `0`;
- `git diff --check`: pass.

The Repair 4 planning-contract checks additionally produced:

- task JSON/JSONL parse: pass; planned production additions/modifications
  exactly `8/4`;
- design parser: SDK runtime/type allowlists exactly `8/34`, and the module
  declaration contains `extends KernelErrorBase<Code>`;
- child/parent/product Trellis contexts: `9/11`, `3/3`, `0/0`, valid;
- changed planning paths: `12`; source/test/package/config delta: `0`;
- accepted GD-0 archive and active integration-spec delta: `0`;
- `git diff --check`: pass.

Targeted re-review at `69f7fad` then reproduced six accepted ancestors, the
same JSON/JSONL/Trellis/export/file/delta checks, repository typecheck, build,
full `315/315`, GD-0 authority delta `0`, diff check, and clean pre-record
status. It found no remaining P0/P1/P2.

## Re-review checklist

The fresh planning re-review must verify:

1. all three initial findings are closed in PRD/design/runbook/test conditions;
2. the eight runtime and thirty-four type exports are necessary and sufficient;
3. the nine-field ABI and application-root boundary are unchanged;
4. no public `any`, cast helper, bivariant method, callback getter, or structural
   handle construction reintroduces the variance defect;
5. decoder shell/handoff rules are singular and agree with accepted GD-0;
6. error generic/data coherence has both positive and negative type fixtures;
7. the exact `Error -> KernelErrorBase -> ModuleKernelErrorBase` branch, common
   code ownership, SDK/root non-export boundary, and input/output isolation
   fixtures close the external P1;
8. Trellis/JSON/JSONL/Markdown/diff checks pass with zero production delta.

The hierarchy-focused re-review now reports P0/P1/P2=`0/0/0`. Implementation
remains inactive until the user reviews the result and explicitly activates the
task.
