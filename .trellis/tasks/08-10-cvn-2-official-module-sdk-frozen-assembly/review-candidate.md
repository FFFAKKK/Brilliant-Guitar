# CVN-2 Independent Planning Review

## Review target

- Candidate HEAD: `8757097fd6dd3e9464807b9ab091006285a19f2b`
- Detailed planning commit: `2941725`
- Unified planning base: `706802c`
- Scope reviewed: CVN-FC-110/111 planning contracts only
- Lifecycle during review: `planning`; `task.py start` not run
- Production/test delta owned by the reviewed candidate: zero

The review compared the child PRD, detailed design, operator runbook, context
manifests, accepted GD-0 contract, parent feature matrix, current strict
TypeScript configuration, and the live pre-CVN-2 Core surface. Temporary type
probes were created under the system temporary directory and removed after the
compiler result was captured; they did not modify the worktree.

## Initial verdict — RETURN FOR BOUNDED PLANNING REPAIR

Initial P0/P1/P2 = `0/2/1`.

### [P1] Heterogeneous typed command/effect collections collapse to `unknown`

`design.md` declares invariant callback pairs:

- `CompiledDomainCommandDefinitionV1<Command>` both produces `Command` from
  `decode` and consumes `Command` in `prepare`;
- `CompiledModuleEffectDefinitionV1<Payload>` both produces `Payload` from
  `decode` and consumes `Payload` in `transform`.

The containing contribution erases both parameters by using
`CompiledDomainCommandDefinitionV1[]` and
`CompiledModuleEffectDefinitionV1[]`. With this repository's `strict: true`
configuration, those defaults are `...<unknown>`. A definition specialized to
a real command or payload is therefore not assignable to the planned array.

A focused TypeScript 5.8 strict-mode probe reproduced `TS2322` for both
collections: the specialized `prepare`/`transform` callback cannot consume
`unknown`. The planned Stage 1 "callback signature assignability" check would
fail unless the operator introduced `any`, a cast, or an unsound bivariant
method. All three would defeat the promised typed authoring seam.

Required repair:

1. add typed command-definition and effect-definition builders;
2. make their returned compiled definition handles non-generic and opaque;
3. retain each generic decoder/consumer pair behind one private SDK binding;
4. require authentic handles in the contribution builder and catalog compiler;
5. add positive heterogeneous-collection and negative cross-pair type fixtures;
6. update the exact SDK runtime/type export allowlists and tests.

This repair does not add a tenth contribution field and does not move runtime
execution into CVN-2.

### [P1] The command decoder invocation value is not fixed

The accepted GD-0 contract requires the matched contribution to strictly decode
the full target and payload from `unknown`. The candidate freezes only
`DomainCommandDecoderV1<Command> = (input: unknown) => ...` and never states
whether CVN-6 passes the full envelope, only the payload, only the target, or a
fresh target/payload pair. The fixture and runbook likewise omit that call
shape.

That ambiguity sits in the ABI owned by CVN-2. Leaving it open would force the
CVN-6 operator to reinterpret a public callback signature and could make two
official modules expect incompatible values.

Required repair:

1. add one exact `DomainCommandDecodeInputV1` shell with only `target` and
   `payload` own data fields, both typed `unknown`;
2. state the exact capture, shell freeze, invocation, decoded-value cloning,
   and preparation handoff rules owned by later CVN-6;
3. add a compile-time signature fixture and a runtime no-invocation fixture;
4. export the input type from the SDK and no application-root runtime symbol.

### [P2] `ModuleKernelErrorBase` generics are not tied to constructor data

The planned class promises `toIssue()` values narrowed to generic `ModuleId`
and `Code`, but its protected constructor accepts non-generic
`ModuleIssueInputV1`. Strict TypeScript therefore accepts a subclass that
claims module/code `foo` while calling `super()` with validated module/code
`bar`; the returned static type can then contradict the stored frozen issue.

Required repair:

1. parameterize `ModuleIssueInputV1` by module ID and code;
2. constrain `Code` to the selected module namespace;
3. require the protected constructor to accept exactly those parameters;
4. add a negative `@ts-expect-error` fixture for cross-module construction.

## Preserved conclusions

The review found no defect in these already fixed boundaries:

- CVN-2 still owns only CVN-FC-110/111;
- the contribution outer ABI remains exactly nine fields;
- the application root adds type declarations only and zero runtime keys;
- catalog construction remains detached, startup-only, deterministic, and
  all-or-nothing;
- CVN-2 invokes zero module callbacks;
- CVN-6 runtime integration, future ports, hot plug, generic patch/path,
  mutable document access, and a second transaction owner remain excluded;
- the current Core catalog remains 25 commands while the parent-final target
  remains 28.

## Gate state

The candidate stays in `planning`. Production implementation remains inactive.
After the three bounded repairs, a fresh review must reproduce the type
fixtures, verify the exact export allowlists and nine-field ABI, and report
P0/P1/P2=`0/0/0` before the user activation decision.

## Re-review cycle

### Exact candidates

- Initial review finding record: `31be407f1dbd8c043a049435fde45625632d46e0`
- Bounded type/call-shape repair: `0c49750308673c30c85b918dbe6735e03591b23e`
- Re-review candidate after state-boundary clarification:
  `83478fedb892b8bd048acc4f63145f3570872d8a`

### Narrow re-review finding

The first pass over `0c49750` found one P2 and no P0/P1:
P0/P1/P2=`0/0/1`.

#### [P2] Definition bindings and published catalog state were conflated

The repaired plan introduced private definition-binding `WeakMap`s before
catalog compilation, but one old fixture sentence still required every failed
catalog to have "no private WeakMap state." It also left the same-SDK-instance
condition implicit and combined readable fake, unreadable fake, and
cross-instance failures into one non-exact outcome.

The clarification commit `83478fe` closes this by fixing four distinct rules:

1. failed definition construction publishes no definition handle/binding;
2. failed catalog construction publishes no catalog handle/catalog-state entry
   and leaves preexisting definition bindings unchanged;
3. all V1 official modules consume one host-owned SDK instance, while future
   package-host mechanics remain separately gated;
4. readable fake/cross-instance handles map to `registry.handler-mismatch` at
   command stage 5 or effect stage 7, whereas an unreadable nested fake maps to
   stage-1 `registry.invalid-contribution`.

### Closure of the three initial findings

| Initial finding | Re-review result |
|---|---|
| invariant generic command/effect records cannot enter heterogeneous arrays | closed: typed generic input builders return opaque non-generic handles; no public `any`, assertion helper, or bivariant method |
| decoder invocation value unspecified | closed: exact shallow-frozen `{ target: unknown, payload: unknown }` shell and same-binding handoff are fixed |
| error generic parameters not tied to constructor data | closed: generic issue input, module-qualified code constraint, and negative constructor fixture are fixed |

### Fresh verification at `83478fe`

- multi-module TypeScript 5.8 probe using the repository's strict flags: exit
  `0`; two command types and two effect payload types coexist, internal brands
  stay absent from the SDK entry, and all crossed/forged/mismatched negative
  cases remain required errors;
- SDK allowlist parser: runtime `8`, type `34`;
- contribution outer ABI: unchanged nine fields;
- child Trellis context: `implement.jsonl 9`, `check.jsonl 11`, valid;
- parent Trellis context: `3/3`, valid;
- product Trellis context: `0/0`, valid;
- repository typecheck: pass;
- complete current Core regression: `315/315` pass;
- `0c49750..83478fe` source/test/package/config delta: zero;
- final worktree before review-record edits: clean;
- `task.py start`: not run; production implementation authorization: false.

## Final planning-review verdict

**PASS. Final P0/P1/P2=`0/0/0`.**

The repaired candidate is detailed enough for operator activation without
choosing a new SDK type model, decoder call shape, handle authenticity rule,
failure mapping, file scope, or CVN-6 behavior. The task remains `planning` and
the only open activation condition is the user's review and explicit decision.
